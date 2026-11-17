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
  mock.method(getAuth(app), "verifyIdToken", async (uid: string) => ({ uid }));
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
  test(`${mode} sharing rejects unavailable rooms without creating assignments, and accepts an open room`, async () => {
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
      closed: { isOpen: false }, archived: { isOpen: true, archived: true },
      deleted: { isOpen: true, deletedAt: new Date() }, inactive: { isOpen: true, status: "inactive" },
      unknown: {}, open: { isOpen: true },
    })) {
      const spaceId = `${mode}-${state}`;
      const room = db.doc(`spaces/${spaceId}`);
      await room.set({ ownerId: role, kind: mode === "parent" ? "family" : "class", title: "Synthetic room", ...flags });
      const response = await assign(spaceId);
      assert.equal(response.status, state === "open" ? 200 : 409, await response.text());
      const assignments = await room.collection(collection).get();
      assert.equal(assignments.size, state === "open" ? 1 : 0);
      const data = (await room.get()).data()!;
      assert.equal(Boolean(data.activeLessonId || data.activeWritingActivityId), state === "open");
      if (state === "open" && mode !== "writing") {
        assert.equal(assignments.docs[0].data().audioReadingEnabled, true);
        assert.equal(assignments.docs[0].data().audioReadingRequired, false);
      }
    }
  });
}
