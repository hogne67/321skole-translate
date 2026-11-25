import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NextRequest } from "next/server";

const projectId = "demo-space-sharing";
const app = initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` });
const db = getFirestore(app);

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8198", "Isolated local emulator required");
  mock.method(getAuth(app), "verifyIdToken", async (uid: string) => ({
    uid,
    email_verified: true,
    firebase: { sign_in_provider: "password" },
  }));
  for (const role of ["teacher", "parent"]) {
    await db.doc(`users/${role}`).set({ role, plan: "plus" });
    await db.doc(`lessons/${role}-source`).set({ ownerId: role, title: "Synthetic lesson", sourceText: "Synthetic text", tasks: [] });
  }
  await db.doc("writingActivities/teacher-source").set({ ownerUid: "teacher", title: "Synthetic writing" });
});

after(async () => {
  mock.restoreAll();
  await db.terminate();
  await deleteApp(app);
});

function request(role: string, body: object) {
  return new NextRequest("http://localhost/api/synthetic-assign", {
    method: "POST", headers: { Authorization: `Bearer ${role}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

for (const mode of ["teacher", "parent", "writing"] as const) {
  test(`${mode} sharing respects room availability`, async () => {
    const role = mode === "parent" ? "parent" : "teacher";
    const collection = mode === "writing" ? "writingActivities" : "lessons";
    async function assign(spaceId: string) {
      if (mode === "writing") {
        const { POST } = await import("../app/api/teacher/writing-activities/[activityId]/assign-space/route");
        return POST(request(role, { spaceId }), { params: Promise.resolve({ activityId: "teacher-source" }) });
      }
      const { POST } = mode === "parent"
        ? await import("../app/api/parent/spaces/[spaceId]/assign/route")
        : await import("../app/api/teacher/spaces/[spaceId]/assign/route");
      return POST(request(role, { sourceType: "myContent", sourceId: `${role}-source`, audioReadingEnabled: true, audioReadingRequired: false }), {
        params: Promise.resolve({ spaceId }),
      });
    }

    for (const [state, flags] of Object.entries({
      private: { isOpen: false }, archived: { isOpen: true, archived: true },
      deleted: { isOpen: true, deletedAt: new Date() }, inactive: { isOpen: true, status: "inactive" },
      closed: { isOpen: false, status: "closed" },
      unknown: {}, open: { isOpen: true },
    })) {
      const spaceId = `${mode}-${state}`;
      const room = db.doc(`spaces/${spaceId}`);
      await room.set({ ownerId: role, kind: mode === "parent" ? "family" : "class", title: "Synthetic room", ...flags });
      const response = await assign(spaceId);
      const allowed = state === "open" || (mode === "parent" && (state === "private" || state === "unknown"));
      assert.equal(response.status, allowed ? 200 : 409, await response.text());
      const assignments = await room.collection(collection).get();
      assert.equal(assignments.size, allowed ? 1 : 0);
      const data = (await room.get()).data()!;
      assert.equal(Boolean(data.activeLessonId || data.activeWritingActivityId), allowed);
      if (allowed && mode !== "writing") {
        assert.equal(assignments.docs[0].data().audioReadingEnabled, true);
        assert.equal(assignments.docs[0].data().audioReadingRequired, false);
      }
    }
  });
}

test("a parent can create a private room and assign an activity on the first visit", async () => {
  const { POST: create } = await import("../app/api/parent/spaces/create/route");
  const { POST: assign } = await import("../app/api/parent/spaces/[spaceId]/assign/route");
  const spaceId = "4f37c3f2-3fbb-49e9-a074-60ba688676e4";
  const creation = { roomId: spaceId, title: "Family reading" };

  const results = await Promise.all([create(request("parent", creation)), create(request("parent", creation))]);
  for (const response of results) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { spaceId });
  }
  assert.equal((await db.doc(`spaces/${spaceId}`).get()).get("isOpen"), false);
  assert.equal((await db.doc(`spaceMembers/${spaceId}_parent`).get()).get("status"), "active");

  const assigned = await assign(request("parent", { sourceId: "parent-source" }), { params: Promise.resolve({ spaceId }) });
  assert.equal(assigned.status, 200, await assigned.text());
  assert.equal((await db.collection(`spaces/${spaceId}/lessons`).get()).size, 1);
  assert.equal((await db.doc(`spaces/${spaceId}`).get()).get("isOpen"), false);
});
