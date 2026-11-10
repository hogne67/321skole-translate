import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, mock, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { NextRequest } from "next/server";
import OpenAI from "openai";

const projectId = "demo-writing-ai-local";
const app = initializeApp({ projectId });
const db = getFirestore(app);
let env: RulesTestEnvironment;

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188");
  assert.equal(process.env.OPENAI_API_KEY, "isolated-test-no-network");
  env = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 8188, rules: await readFile("firestore.rules", "utf8") } });
  await env.clearFirestore();
  await db.doc("users/teacher").set({ role: "teacher", plan: "plus" });
  await db.doc("users/pupil").set({ role: "student" });
  await db.doc("users/admin").set({ role: "admin" });
  await db.doc("users/schooladmin").set({ role: "teacher", schoolId: "schoolA", schoolRole: "school_admin", schoolStatus: "active" });
  await db.doc("spaces/room").set({ ownerId: "teacher", title: "Synthetic room", schoolId: "schoolA", isOpen: true, writingAiDisabled: true });
  await db.doc("spaceMembers/room_pupil").set({ spaceId: "room", uid: "pupil", participantId: "pupil", role: "student", active: true, archived: false, status: "active" });
  await db.doc("spaces/room/writingActivities/writing").set({ ownerUid: "teacher", title: "Synthetic writing" });
  await db.doc("spaces/room/writingActivities/writing/submissions/room_writing_pupil").set({ uid: "pupil", studentUid: "pupil", participantId: "pupil", spaceId: "room", activityId: "writing", status: "submitted" });
  mock.method(getAuth(app), "verifyIdToken", async (token: string) => ({ uid: token }));
});
after(async () => { mock.restoreAll(); await env?.cleanup(); await deleteApp(app); });

function request(uid: string, body: unknown) {
  return new Request("http://localhost/api/synthetic", { method: "POST", headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("only platform admin can change writing AI policy; teacher can still edit a room", async () => {
  const owner = doc(env.authenticatedContext("teacher").firestore(), "spaces/room");
  const admin = doc(env.authenticatedContext("admin").firestore(), "spaces/room");
  const schooladmin = doc(env.authenticatedContext("schooladmin").firestore(), "spaces/room");
  const pupil = doc(env.authenticatedContext("pupil").firestore(), "spaces/room");
  await assertFails(updateDoc(owner, { writingAiDisabled: false }));
  await assertFails(updateDoc(schooladmin, { writingAiDisabled: false }));
  await assertFails(updateDoc(pupil, { writingAiDisabled: false }));
  await assertSucceeds(updateDoc(owner, { title: "Edited synthetic room" }));
  await assertSucceeds(updateDoc(admin, { writingAiDisabled: false }));
  await assertSucceeds(updateDoc(admin, { writingAiDisabled: true }));
});

test("manual teacher feedback remains readable to the pupil while writing AI is disabled", async () => {
  const path = "spaces/room/writingActivities/writing/submissions/room_writing_pupil";
  await assertSucceeds(updateDoc(doc(env.authenticatedContext("teacher").firestore(), path), {
    status: "reviewed", teacherFeedback: { text: "Synthetic manual feedback" },
  }));
  const pupilView = await assertSucceeds(getDoc(doc(env.authenticatedContext("pupil").firestore(), path)));
  assert.equal(pupilView.get("teacherFeedback.text"), "Synthetic manual feedback");
});

test("teacher suggestions, pupil support and print images stop before any AI call", async () => {
  const responses = mock.method(OpenAI.Responses.prototype, "create", async () => { throw new Error("Text provider must not be called"); });
  const images = mock.method(OpenAI.Images.prototype, "generate", async () => { throw new Error("Image provider must not be called"); });
  try {
    const teacher = await import("../../app/api/teacher/spaces/[spaceId]/writing-activities/[activityId]/submissions/[subId]/section-feedback-suggestions/route");
    const pupil = await import("../../app/api/spaces/[spaceId]/writing-activities/[activityId]/ai-support/route");
    const image = await import("../../app/api/images/generate/route");
    const results = [
      await teacher.POST(request("teacher", { phase: "final" }), { params: Promise.resolve({ spaceId: "room", activityId: "writing", subId: "room_writing_pupil" }) }),
      await pupil.POST(request("pupil", { sectionId: "synthetic", sectionText: "Synthetic text" }), { params: Promise.resolve({ spaceId: "room", activityId: "writing" }) }),
      await image.POST(new NextRequest("http://localhost/api/images/generate", { method: "POST", headers: { Authorization: "Bearer pupil", "Content-Type": "application/json" }, body: JSON.stringify({ context: "student_writing_print", spaceId: "room", activityId: "writing", submissionId: "room_writing_pupil", lessonId: "writing-room-writing", promptMode: "custom", customPrompt: "Synthetic triangle" }) })),
    ];
    for (const result of results) {
      assert.equal(result.status, 403, await result.clone().text());
      assert.equal((await result.json()).code, "writing_ai_disabled");
    }
    assert.equal(responses.mock.callCount(), 0);
    assert.equal(images.mock.callCount(), 0);
  } finally {
    responses.mock.restore();
    images.mock.restore();
  }
});
