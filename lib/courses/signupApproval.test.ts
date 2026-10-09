import assert from "node:assert/strict";
import { test } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { approveCourseSignup } from "./signupApproval";
import { courseConfirmationEmail, sendCourseConfirmation } from "./confirmationEmail";
import { isCourseParticipantPath } from "./participantPaths";

// A serial transaction store exercises concurrent calls and committed request state.
function store(initial: Record<string, Record<string, unknown>>) {
  const docs = new Map(Object.entries(initial));
  type Ref = { path: string; id: string };
  const snapshot = (ref: Ref) => ({ id: ref.id, ref, exists: docs.has(ref.path), data: () => docs.get(ref.path) });
  let sequence = 0;
  const collection = (path: string) => ({
    doc: (id = `generated-${++sequence}`) => ref(`${path}/${id}`),
    where: (field: string, operator: string, value: unknown) => ({ path, field, operator, value }),
  });
  const ref = (path: string) => ({ path, id: path.split("/").at(-1)!, collection: (name: string) => collection(`${path}/${name}`), get: async () => snapshot(ref(path)) });
  let queue = Promise.resolve();
  const db = {
    collection,
    runTransaction: <T,>(fn: (tx: unknown) => Promise<T>) => {
      const run = queue.then(async () => {
        const writes: Array<() => void> = [];
        const tx = {
          get: async (target: Ref & { field?: string; value?: unknown }) => {
            if (!target.field) return snapshot(target);
            return { docs: [...docs.keys()].filter((path) => path.startsWith(`${target.path}/`) && path.split("/").length === target.path.split("/").length + 1 && docs.get(path)?.[target.field!] === target.value).map((path) => snapshot(ref(path))) };
          },
          set: (target: Ref, data: Record<string, unknown>, options?: { merge: boolean }) => writes.push(() => docs.set(target.path, options?.merge ? { ...docs.get(target.path), ...data } : data)),
          update: (target: Ref, data: Record<string, unknown>) => writes.push(() => docs.set(target.path, { ...docs.get(target.path), ...data })),
        };
        const result = await fn(tx);
        writes.forEach((write) => write());
        return result;
      });
      queue = run.then(() => {}, () => {});
      return run;
    },
    batch: () => {
      const writes: Array<() => void> = [];
      return {
        update: (target: Ref, data: Record<string, unknown>) => writes.push(() => docs.set(target.path, { ...docs.get(target.path), ...data })),
        set: (target: Ref, data: Record<string, unknown>) => writes.push(() => docs.set(target.path, data)),
        commit: async () => writes.forEach((write) => write()),
      };
    },
  } as unknown as Firestore;
  return { db, docs };
}

const requestPath = "courses/course/signupRequests/request";
const initial = { "courses/course": { title: "Webinar" }, [requestPath]: { name: "Participant", email: "participant@example.com", status: "new" } };
const identity = { participantUid: "participant-uid", roleSnapshot: "teacher" };

test("three approvals, including concurrent clicks, create only one participant", async () => {
  const state = store(initial);
  const results = await Promise.all([1, 2, 3].map(() => approveCourseSignup(state.db, "course", "request", identity)));
  assert.equal(new Set(results.map((result) => result.participantId)).size, 1);
  assert.equal(results.filter((result) => !result.alreadyAccepted).length, 1);
  assert.equal([...state.docs.keys()].filter((path) => path.startsWith("courses/course/participants/")).length, 1);
  assert.equal(state.docs.get(requestPath)?.status, "accepted");
});

test("legacy approved requests reuse a participant without overwriting progress or payment", async () => {
  const participant = { email: "participant@example.com", status: "active", progress: 75, orderId: "paid-order" };
  const state = store({ ...initial, [requestPath]: { ...initial[requestPath], status: "accepted" }, "courses/course/participants/legacy": participant });
  const result = await approveCourseSignup(state.db, "course", "request", identity);
  assert.equal(result.participantId, "legacy");
  assert.equal(result.alreadyAccepted, true);
  assert.deepEqual(state.docs.get("courses/course/participants/legacy"), participant);
});

test("different requests with the same email reuse the registration", async () => {
  const state = store({ ...initial, "courses/course/signupRequests/second": initial[requestPath] });
  const first = await approveCourseSignup(state.db, "course", "request", identity);
  const second = await approveCourseSignup(state.db, "course", "second", identity);
  assert.equal(first.participantId, second.participantId);
});

test("an email failure keeps the approval and can be retried independently", async () => {
  const state = store(initial);
  await approveCourseSignup(state.db, "course", "request", identity);
  const args = { db: state.db, courseId: "course", requestId: "request", origin: "https://321school.com", locale: "nb" };
  assert.equal(await sendCourseConfirmation({ ...args, send: async () => ({ ok: false, reason: "email_not_configured" }) }), "failed");
  assert.equal(state.docs.get(requestPath)?.status, "accepted");
  assert.equal(state.docs.get(requestPath)?.confirmationEmailStatus, "failed");
  assert.equal(await sendCourseConfirmation({ ...args, send: async () => ({ ok: true }) }), "sent");
  assert.equal([...state.docs.keys()].filter((path) => path.startsWith("courses/course/participants/")).length, 1);
});

test("simultaneous confirmation clicks send only one email", async () => {
  const state = store({ ...initial, [requestPath]: { ...initial[requestPath], status: "accepted" } });
  let calls = 0;
  const args = { db: state.db, courseId: "course", requestId: "request", origin: "https://321school.com", locale: "nb", send: async () => { calls++; return { ok: true as const }; } };
  await Promise.all([sendCourseConfirmation(args), sendCourseConfirmation(args)]);
  assert.equal(calls, 1);
});

test("confirmation escapes supplied text and links to the participant room", () => {
  const email = courseConfirmationEmail({ email: "participant@example.com", courseTitle: '<script>alert("x")</script>', courseId: "course", origin: "https://321school.com", locale: "nb" });
  assert.ok(!email.html.includes("<script>"));
  assert.ok(email.html.includes("https://321school.com/nb/login?next="));
  assert.ok(decodeURIComponent(email.html).includes("/nb/student/courses/course"));
  assert.ok(email.html.includes("participant@example.com"));
  assert.ok(!email.html.includes("/teacher/"));
});

test("participant return paths work across roles without allowing external destinations", () => {
  assert.equal(isCourseParticipantPath("/nb/student/courses/course-id", "nb"), true);
  assert.equal(isCourseParticipantPath("/en/student/courses/course/sessions/1", "en"), true);
  assert.equal(isCourseParticipantPath("//external.example/nb/student/courses/course", "nb"), false);
  assert.equal(isCourseParticipantPath("/nb/student/courses/../teacher", "nb"), false);
  assert.equal(isCourseParticipantPath("/en/student/courses/course", "nb"), false);
});
