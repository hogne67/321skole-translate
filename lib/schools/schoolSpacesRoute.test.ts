import assert from "node:assert/strict";
import { after, beforeEach, mock, test } from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { GET } from "../../app/api/admin/schools/[schoolId]/spaces/route";

// The route sees only synthetic in-memory documents; no cloud calls occur.
const app = initializeApp({ projectId: "school-spaces-route-local" });
const auth = getAuth(app);
const db = getFirestore(app);
const records = new Map<string, Record<string, unknown>>();
const context = { params: Promise.resolve({ schoolId: "school" }) };

function snapshot(path: string) {
  return { id: path.split("/").at(-1)!, exists: records.has(path),
    data: () => records.get(path), get: (key: string) => records.get(path)?.[key] };
}
function collection(path: string) {
  return {
    doc: (id: string) => ({ get: async () => snapshot(`${path}/${id}`) }),
    where: (field: string, op: string, schoolId: string) => {
      assert.equal(path, "spaces"); assert.equal(field, "schoolId"); assert.equal(op, "==");
      let count = 0; let after = "";
      const query = {
        orderBy: () => query,
        limit: (value: number) => { count = value; return query; },
        startAfter: (cursor: { id: string }) => { after = cursor.id; return query; },
        select: (...fields: string[]) => { assert.equal(fields.includes("secretStudentData"), false); return query; },
        get: async () => {
          const docs = [...records.keys()].filter((key) => key.startsWith("spaces/")
            && records.get(key)?.schoolId === schoolId && key.split("/")[1] > after)
            .sort().slice(0, count).map(snapshot);
          return { docs, size: docs.length };
        },
      };
      return query;
    },
  };
}
function request(token = "admin", after?: string) {
  const url = new URL("https://example.test/api/admin/schools/school/spaces");
  if (after) url.searchParams.set("after", after);
  return new Request(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

beforeEach(() => {
  mock.restoreAll(); records.clear();
  records.set("users/admin", { role: "admin", adminLevel: "superadmin" });
  records.set("users/teacher", { role: "teacher", schoolId: "school", schoolRole: "school_teacher" });
  records.set("users/schooladmin", { role: "teacher", schoolId: "school", schoolRole: "school_admin" });
  records.set("schools/school", { name: "Synthetic school" });
  records.set("spaces/another-room", { schoolId: "other", title: "Other school", secretStudentData: "private" });
  for (let i = 0; i < 55; i++) {
    records.set(`spaces/room-${String(i).padStart(2, "0")}`, {
      schoolId: "school", title: `Room ${i}`, ownerId: "teacher", isOpen: true,
      ...(i === 1 ? { ownerUid: "different-owner" } : {}),
      writingAiDisabled: i === 0, secretStudentData: "private",
    });
  }
  mock.method(auth, "verifyIdToken", async (token: string) => {
    if (token === "invalid") throw new Error("Invalid token");
    return { uid: token };
  });
  mock.method(db, "doc", (path: string) => ({ get: async () => snapshot(path) }));
  mock.method(db, "collection", collection);
});
after(() => { mock.restoreAll(); return deleteApp(app); });

test("only a platform administrator can list school-linked rooms", async () => {
  assert.equal((await GET(request(""), context)).status, 401);
  assert.equal((await GET(request("invalid"), context)).status, 401);
  assert.equal((await GET(request("teacher"), context)).status, 403);
  assert.equal((await GET(request("schooladmin"), context)).status, 403);
  records.set("users/admin", { role: "admin", adminLevel: "moderator" });
  assert.equal((await GET(request(), context)).status, 403);
  records.set("users/admin", { role: "admin", adminLevel: "superadmin", disabled: true });
  assert.equal((await GET(request(), context)).status, 403);
});

test("pagination stays within school and returns no student content", async () => {
  const first = await GET(request(), context);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "private, no-store");
  const page1 = await first.json();
  assert.equal(page1.rooms.length, 50);
  assert.equal(page1.rooms[0].writingAiDisabled, true);
  assert.equal(page1.rooms[1].ownerUid, "");
  assert.equal(page1.nextCursor, "room-49");
  assert.equal(JSON.stringify(page1).includes("secretStudentData"), false);
  const page2 = await (await GET(request("admin", page1.nextCursor), context)).json();
  assert.equal(page2.rooms.length, 5);
  assert.equal(page2.nextCursor, null);
  assert.equal([...page1.rooms, ...page2.rooms].some((room) => room.id === "another-room"), false);
  assert.equal((await GET(request("admin", "another-room"), context)).status, 400);
});
