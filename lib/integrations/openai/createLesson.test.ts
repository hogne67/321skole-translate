import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { executeCreateLesson } from "./createLesson";
import { IntegrationError } from "./config";
import { LessonError } from "../../lessons/validation";

const identity = { uid: "alice", scope: "lessons:create" };
const input = { idempotencyKey: "save-request-123456", lesson: { title: " Draft ", sourceText: "Some text", language: "nb", level: "A2", tasks: [
  { type: "truefalse", prompt: "True?", correctAnswer: true },
  { type: "mcq", prompt: "Choose", options: ["a", "b"], correctAnswer: "a" },
  { type: "open", prompt: "Explain", answerSpace: "long" },
] } };
// Transaction fake serializes commits and stages writes, allowing retry/concurrency/rollback checks.
function store() {
  const documents = new Map<string, Record<string, unknown>>([["users/alice", { role: "teacher" }], ["users/bob", { role: "teacher" }]]);
  let next = 0; let queue = Promise.resolve();
  const snapshot = (path: string) => ({ exists: documents.has(path), data: () => documents.get(path) });
  const db = { collection: (name: string) => ({ doc: (id = `new-${++next}`) => ({ path: `${name}/${id}`, id, get: async () => snapshot(`${name}/${id}`) }) }),
    runTransaction: (work: (transaction: unknown) => Promise<unknown>) => {
      const job = queue.then(async () => { const pending = new Map<string, Record<string, unknown>>();
        const result = await work({ get: async (ref: { path: string }) => snapshot(ref.path), create: (ref: { path: string }, data: Record<string, unknown>) => { assert.ok(!documents.has(ref.path)); pending.set(ref.path, data); } });
        for (const [path, data] of pending) documents.set(path, data); return result;
      }); queue = job.then(() => {}, () => {}); return job;
    },
  } as unknown as Firestore;
  return { db, documents, lessons: () => [...documents.entries()].filter(([path]) => path.startsWith("lessons/")) };
}
test("tool uses shared normalization, trusted owner, draft and safe existing editor URL", async () => {
  const s = store(); const result = await executeCreateLesson(identity, input, "https://staging.example", s.db);
  assert.equal(result.title, "Draft"); assert.equal(result.status, "draft"); assert.equal(result.editorUrl, `https://staging.example/nb/producer/${result.lessonId}`);
  const lesson = s.lessons()[0][1]; assert.equal(lesson.ownerId, "alice"); assert.equal(lesson.status, "draft");
  assert.deepEqual((lesson.tasks as { type: string }[]).map(t => t.type), ["truefalse", "mcq", "open"]);
});
test("concurrent and later retries create one draft even with omitted task IDs", async () => {
  const s = store(); const results = await Promise.all(Array.from({ length: 6 }, () => executeCreateLesson(identity, input, "https://staging.example", s.db)));
  assert.ok(results.every(r => r.lessonId === results[0].lessonId)); assert.equal(s.lessons().length, 1);
  assert.deepEqual(await executeCreateLesson(identity, input, "https://staging.example", s.db), results[0]);
  await assert.rejects(executeCreateLesson(identity, { ...input, lesson: { ...input.lesson, title: "Different" } }, "https://staging.example", s.db), /different lesson content/);
  assert.equal(s.lessons().length, 1);
  await executeCreateLesson({ uid: "bob", scope: identity.scope }, input, "https://staging.example", s.db);
  assert.equal(s.lessons().length, 2); assert.equal(s.lessons()[1][1].ownerId, "bob");
});
test("unauthenticated and wrong-scope calls never reach storage", async () => {
  for (const auth of [{ uid: "", scope: identity.scope }, { uid: "alice", scope: "lessons:read" }]) {
    await assert.rejects(executeCreateLesson(auth, input, "https://staging.example"), IntegrationError);
  }
});
test("owner/status/image injection, invalid lesson/tasks/key and disabled profile never write", async () => {
  const s = store();
  for (const body of [{ ...input, ownerId: "bob" }, { ...input, idempotencyKey: "short" },
    ...[{ ownerId: "bob" }, { status: "published" }, { imageUrl: "https://example.com/x" }, { title: " " }, { tasks: [{}] }].map(fields => ({ ...input, lesson: { ...input.lesson, ...fields } }))]) {
    await assert.rejects(executeCreateLesson(identity, body, "https://staging.example", s.db), LessonError);
  }
  s.documents.set("users/alice", { role: "teacher", disabled: true });
  await assert.rejects(executeCreateLesson(identity, input, "https://staging.example", s.db), LessonError);
  assert.equal(s.lessons().length, 0);
});
