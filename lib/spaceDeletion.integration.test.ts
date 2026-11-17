import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, mock, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteField } from "firebase/firestore";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/teacher/spaces/[spaceId]/deletion/route";
import { isSpaceOpenForSharing } from "./spaceSharing";

const projectId = "demo-space-deletion";
const app = initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` });
const db = getFirestore(app);
let env: RulesTestEnvironment;

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8198", "Isolated local emulator required");
  env = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 8198, rules: await readFile("firestore.rules", "utf8") } });
  await env.clearFirestore();
  mock.method(getAuth(app), "verifyIdToken", async (uid: string) => ({ uid }));
  for (const [uid, role] of Object.entries({ owner: "teacher", other: "teacher", admin: "admin", pupil: "student" })) {
    await db.doc(`users/${uid}`).set({ role });
  }
});

after(async () => {
  mock.restoreAll();
  await env?.cleanup();
  await db.terminate();
  await deleteApp(app);
});

async function room(id: string) {
  const ref = db.doc(`spaces/${id}`);
  await ref.set({ ownerId: "owner", ownerUid: "owner", title: "Synthetic room", isOpen: true, code: `ROOM${id.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 12)}` });
  return ref;
}

async function call(spaceId: string, uid = "owner", action?: string) {
  return (action ? POST : GET)(new Request("http://localhost/api/synthetic-deletion", {
    method: action ? "POST" : "GET", headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" },
    ...(action ? { body: JSON.stringify({ action }) } : {}),
  }), { params: Promise.resolve({ spaceId }) });
}

test("unused rooms can be deleted and restored without losing room code or prepared lessons", async () => {
  const ref = await room("unused");
  await db.doc("spaceMembers/unused_owner").set({ spaceId: "unused", uid: "owner", role: "teacher", status: "active" });
  await ref.collection("lessons").doc("prepared").set({ title: "Prepared lesson" });
  const original = (await ref.get()).data()!;
  assert.deepEqual(await (await call("unused")).json(), { deleted: false, canDelete: true, blockedBy: null });
  assert.equal((await call("unused", "owner", "delete")).status, 200);
  const deleted = (await ref.get()).data()!;
  assert.ok(deleted.deletedAt);
  assert.equal(deleted.deletedByUid, "owner");
  assert.equal(deleted.isOpen, false);
  assert.equal(isSpaceOpenForSharing(deleted), false);
  assert.equal((await call("unused", "owner", "delete")).status, 200);
  assert.equal((await call("unused", "owner", "restore")).status, 200);
  assert.equal((await call("unused", "owner", "restore")).status, 200);
  const restored = (await ref.get()).data()!;
  assert.equal(restored.deletedAt, undefined);
  assert.equal(restored.deletedByUid, undefined);
  assert.equal(restored.isOpenBeforeDeletion, undefined);
  assert.equal(restored.isOpen, original.isOpen);
  assert.equal(restored.code, original.code);
  assert.equal((await ref.collection("lessons").doc("prepared").get()).get("title"), "Prepared lesson");
});

test("other memberships prevent deletion, including archived pupils and pending unlinked roster rows", async () => {
  for (const [id, member] of Object.entries({
    active: { uid: "pupil", role: "student", status: "active" },
    archived: { uid: "pupil", role: "student", status: "removed", active: false, archived: true },
    roster: { role: "student", teacherManaged: true, participantId: "pupil" },
    colleague: { uid: "other", role: "co_teacher", status: "active" },
  })) {
    const spaceId = `members-${id}`;
    const ref = await room(spaceId);
    await db.doc(`spaceMembers/${spaceId}_record`).set({ spaceId, ...member });
    assert.equal((await (await call(spaceId)).json()).blockedBy, "members");
    const response = await call(spaceId, "owner", "delete");
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "members");
    assert.equal((await ref.get()).get("deletedAt"), undefined);
  }
});

test("a member added after opening the confirmation blocks the final deletion", async () => {
  const ref = await room("new-member");
  assert.equal((await (await call("new-member")).json()).canDelete, true);
  await db.doc("spaceMembers/new-member_pupil").set({ spaceId: "new-member", uid: "pupil", role: "student", status: "active" });
  assert.equal((await call("new-member", "owner", "delete")).status, 409);
  assert.equal((await ref.get()).get("deletedAt"), undefined);
});

test("answers prevent deletion even when membership or assignment parent documents no longer exist", async () => {
  const cases = [
    ["lesson", (id: string) => `spaces/${id}/lessons/missing-parent/submissions/pupil`],
    ["writing", (id: string) => `spaces/${id}/writingActivities/missing-parent/submissions/pupil`],
    ["legacy", (id: string) => `spaces/${id}/assignments/missing-parent/submissions/pupil`],
    ["index", (id: string) => `spaceSubmissions/${id}`],
    ["global", (id: string) => `submissions/${id}`],
    ["board", (id: string) => `spaces/${id}/boardResponses/pupil`],
  ] as const;
  for (const [label, path] of cases) {
    const id = `answers-${label}`;
    const ref = await room(id);
    await db.doc(path(id)).set({ spaceId: id, text: "Synthetic answer" });
    const response = await call(id, "owner", "delete");
    assert.equal(response.status, 409, await response.clone().text());
    assert.equal((await response.json()).error, "submissions");
    assert.equal((await ref.get()).get("deletedAt"), undefined);
    assert.equal((await db.doc(path(id)).get()).get("text"), "Synthetic answer");
  }
});

test("only the owner can delete or restore; other teachers, administrators and revoked owner memberships cannot", async () => {
  await room("access");
  for (const uid of ["other", "admin", "pupil"]) {
    assert.equal((await call("access", uid)).status, 403);
    assert.equal((await call("access", uid, "delete")).status, 403);
    assert.equal((await call("access", uid, "restore")).status, 403);
  }
  await db.doc("spaceMembers/access_owner").set({ spaceId: "access", uid: "owner", role: "teacher", status: "removed" });
  assert.equal((await call("access", "owner", "delete")).status, 403);
  assert.equal((await call("missing")).status, 404);
  assert.equal((await call("access", "owner", "invalid")).status, 400);
});

test("deleted room codes cannot be used to join", async () => {
  const ref = await room("join");
  assert.equal((await call("join", "owner", "delete")).status, 200);
  const { POST: join } = await import("../app/api/spaces/join/route");
  const response = await join(new NextRequest("http://localhost/api/spaces/join", {
    method: "POST", headers: { Authorization: "Bearer pupil", "Content-Type": "application/json" },
    body: JSON.stringify({ code: (await ref.get()).get("code"), studentCode: "ABCDE" }),
  }));
  assert.equal((await response.json()).error, "room_unavailable");
  assert.equal((await db.doc("spaceMembers/join_pupil").get()).exists, false);
});

test("database rules require the controlled API and prevent reopening deleted rooms directly", async () => {
  const ref = await room("rules");
  const client = env.authenticatedContext("owner").firestore();
  const own = doc(client, ref.path);
  await assertSucceeds(updateDoc(own, { title: "Synthetic renamed room" }));
  await assertFails(updateDoc(own, { deletedAt: new Date(), isOpen: false }));
  await assertFails(setDoc(doc(client, "spaces/forged-deleted"), { ownerId: "owner", title: "Synthetic", isOpen: false, deletedAt: new Date() }));
  assert.equal((await call("rules", "owner", "delete")).status, 200);
  await assertSucceeds(getDoc(own));
  await assertFails(updateDoc(own, { deletedAt: deleteField(), isOpen: true }));
  await assertFails(updateDoc(own, { isOpen: true }));
  assert.equal((await call("rules", "owner", "restore")).status, 200);
  await assertSucceeds(updateDoc(own, { title: "Synthetic restored room" }));
});
