import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { createLessonForUser, type LessonAuthContext } from "./createLessonForUser";
import { LessonError } from "../validation";

const context = (uid = "alice", provider = "password"): LessonAuthContext => ({
  uid, firebase: { identities: {}, sign_in_provider: provider },
});
const input = { title: "Title", sourceText: "A  text.", tasks: [{ id: "a", type: "truefalse", prompt: "True?", correctAnswer: true }] };

function fakeDb(profile: Record<string, unknown> | null = { role: "teacher", plan: "free" }) {
  const writes: Record<string, unknown>[] = [];
  const reads: string[] = [];
  const db = { collection: (name: string) => ({ doc: (id?: string) => {
    if (name === "users") return { get: async () => {
      reads.push(id!);
      return { exists: !!profile, data: () => profile ?? undefined };
    } };
    assert.equal(name, "lessons");
    assert.equal(id, undefined, "caller must not select document ID");
    return { id: "new-id", create: async (data: Record<string, unknown>) => { writes.push(data); } };
  } }) } as unknown as Firestore;
  return { db, writes, reads };
}

test("creation derives owner from trusted context and writes one complete draft", async () => {
  const store = fakeDb();
  assert.deepEqual(await createLessonForUser(context(), input, store.db), { id: "new-id" });
  assert.deepEqual(store.reads, ["alice"]);
  assert.equal(store.writes.length, 1);
  const draft = store.writes[0];
  assert.equal(draft.ownerId, "alice");
  assert.equal(draft.status, "draft");
  assert.equal(draft.activePublishedId, null);
  assert.equal(draft.deletedAt, null);
  assert.ok(draft.createdAt);
  assert.ok(draft.updatedAt);
  assert.equal(draft.source, "producer-texts-new");
});

test("authorization denies missing identity, anonymous, missing/disabled profile and unsupported access", async () => {
  for (const [auth, profile, status] of [
    [context(""), { role: "teacher" }, 401], [context("alice", "anonymous"), { role: "teacher" }, 401],
    [context(), null, 403], [context(), { role: "teacher", disabled: true }, 403],
    [context(), { role: "unknown" }, 403], [context(), { role: "student", studentAccessMode: "space_only" }, 403],
  ] as const) {
    const store = fakeDb(profile);
    await assert.rejects(createLessonForUser(auth, input, store.db),
      (error: unknown) => error instanceof LessonError && error.status === status);
    assert.deepEqual(store.writes, []);
  }
});

test("existing supported roles can save without consuming or rechecking generation usage", async () => {
  for (const role of ["teacher", "creator", "student", "parent", "admin"]) {
    const store = fakeDb({ role, plan: "free" });
    await createLessonForUser(context("bob"), input, store.db);
    assert.equal(store.writes[0].ownerId, "bob");
  }
});

test("owner/status injection and invalid tasks never write", async () => {
  for (const body of [{ ...input, ownerId: "bob" }, { ...input, status: "published" }, { ...input, tasks: [{}] }]) {
    const store = fakeDb();
    await assert.rejects(createLessonForUser(context(), body, store.db), LessonError);
    assert.equal(store.writes.length, 0);
  }
});

test("existing fact-check hash is computed on normalized text", async () => {
  const store = fakeDb();
  await createLessonForUser(context(), { ...input, aiQuality: { factChecked: true } }, store.db);
  const quality = store.writes[0].aiQuality as Record<string, unknown>;
  assert.equal(quality.checkedTextHash, createHash("sha256").update("A text.").digest("hex"));
  assert.ok(quality.checkedAt);
});
