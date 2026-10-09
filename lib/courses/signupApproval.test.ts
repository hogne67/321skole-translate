import assert from "node:assert/strict";
import { test } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { approveCourseSignup } from "./signupApproval";
import { courseConfirmationEmail, sendCourseConfirmation } from "./confirmationEmail";
import { isCourseParticipantPath } from "./participantPaths";
import { registerCourseSignup } from "./registerSignup";
import { saveCourseParticipants } from "./saveParticipants";
import { occupiedPlaces, registrationModeForCourse, CourseFullError } from "./registration";
import { courseRequestReceiptEmail } from "./confirmationEmail";

// A serial transaction store exercises concurrent calls and committed request state.
function store(initial: Record<string, Record<string, unknown>>) {
  const docs = new Map(Object.entries(initial));
  type Ref = { path: string; id: string };
  const snapshot = (ref: Ref) => ({ id: ref.id, ref, exists: docs.has(ref.path), data: () => docs.get(ref.path) });
  let sequence = 0;
  const collection = (path: string) => ({
    path,
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
            if (writes.length) throw new Error("Firestore requires all reads before writes");
            if (target.id) return snapshot(target);
            const matches = [...docs.keys()].filter((path) => path.startsWith(`${target.path}/`) && path.split("/").length === target.path.split("/").length + 1 && (!target.field || docs.get(path)?.[target.field!] === target.value)).map((path) => snapshot(ref(path)));
            return { docs: matches, empty: !matches.length };
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

const publicCourse = { title: "Free webinar", status: "published", pricingMode: "free", registrationMode: "automatic", maxParticipants: 1 };
const signup = { name: "Participant", email: "participant@example.com", phone: "", message: "", locale: "nb" };
const participantsIn = (state: ReturnType<typeof store>) => [...state.docs.entries()].filter(([path]) => path.startsWith("courses/course/participants/")).map(([, data]) => data);

test("only one concurrent automatic signup can take the last place", async () => {
  const state = store({ "courses/course": publicCourse });
  const results = await Promise.allSettled([
    registerCourseSignup(state.db, "course", signup),
    registerCourseSignup(state.db, "course", { ...signup, email: "second@example.com" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof CourseFullError);
  assert.equal(occupiedPlaces(participantsIn(state)), 1);
  assert.equal([...state.docs.keys()].filter((path) => path.includes("/signupRequests/")).length, 1);
  assert.ok(state.docs.get("courses/course")?.enrollmentChangedAt);
});

test("repeated submissions reuse registration even when the course is now full", async () => {
  const state = store({ "courses/course": publicCourse });
  const results = await Promise.all([1, 2, 3].map(() => registerCourseSignup(state.db, "course", signup)));
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(new Set(results.map((r) => r.requestId)).size, 1);
  assert.equal(occupiedPlaces(participantsIn(state)), 1);
});

test("manual requests do not take a seat and get a receipt rather than a participant link", async () => {
  const state = store({ "courses/course": { ...publicCourse, registrationMode: "approval" } });
  const result = await registerCourseSignup(state.db, "course", signup);
  assert.equal(result.accepted, false);
  assert.equal(occupiedPlaces(participantsIn(state)), 0);
  let calls = 0;
  const args = { db: state.db, courseId: "course", requestId: result.requestId, origin: "https://321school.com", locale: "nb", kind: "receipt" as const, once: true, send: async () => { calls++; return { ok: true as const }; } };
  assert.equal(await sendCourseConfirmation(args), "sent");
  assert.equal(await sendCourseConfirmation(args), "sent");
  assert.equal(calls, 1);
  assert.equal(state.docs.get(`courses/course/signupRequests/${result.requestId}`)?.status, "new");
  const receipt = courseRequestReceiptEmail({ email: signup.email, courseTitle: "<script>title</script>", locale: "nb" });
  assert.ok(!receipt.html.includes("/student/"));
  assert.ok(!receipt.html.includes("<script>"));
});

test("automatic signup survives email failure and duplicate submissions do not send again", async () => {
  const state = store({ "courses/course": publicCourse });
  const result = await registerCourseSignup(state.db, "course", signup);
  const args = { db: state.db, courseId: "course", requestId: result.requestId, origin: "https://321school.com", locale: "nb", once: true };
  assert.equal(await sendCourseConfirmation({ ...args, send: async () => ({ ok: false, reason: "send_failed" }) }), "failed");
  assert.equal((await registerCourseSignup(state.db, "course", signup)).created, false);
  assert.equal(occupiedPlaces(participantsIn(state)), 1);
  assert.equal(await sendCourseConfirmation({ ...args, send: async () => ({ ok: true }) }), "sent");
  let sentAgain = false;
  await sendCourseConfirmation({ ...args, send: async () => { sentAgain = true; return { ok: true }; } });
  assert.equal(sentAgain, false);
});

test("approval and automatic signup compete for the same last place", async () => {
  const state = store({ "courses/course": publicCourse, [requestPath]: initial[requestPath] });
  const results = await Promise.allSettled([
    approveCourseSignup(state.db, "course", "request", identity),
    registerCourseSignup(state.db, "course", { ...signup, email: "second@example.com" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(occupiedPlaces(participantsIn(state)), 1);
});

test("cancellation releases a place; reactivation cannot overbook", async () => {
  const state = store({ "courses/course": publicCourse });
  await saveCourseParticipants(state.db, "course", [{ name: "First", email: "first@example.com", status: "enrolled" }]);
  const path = [...state.docs.keys()].find((p) => p.includes("/participants/"))!;
  const id = path.split("/").at(-1)!;
  await saveCourseParticipants(state.db, "course", [{ name: "First", email: "first@example.com", status: "cancelled" }], id);
  assert.equal(occupiedPlaces(participantsIn(state)), 0);
  await registerCourseSignup(state.db, "course", signup);
  await assert.rejects(saveCourseParticipants(state.db, "course", [{ name: "First", email: "first@example.com", status: "active" }], id), CourseFullError);
  assert.equal(state.docs.get(path)?.status, "cancelled");
});

test("manual imports are atomic and cannot overbook or duplicate an existing email", async () => {
  const state = store({ "courses/course": publicCourse });
  await assert.rejects(saveCourseParticipants(state.db, "course", [
    { email: "one@example.com", status: "enrolled" }, { email: "two@example.com", status: "enrolled" },
  ]), CourseFullError);
  assert.equal(participantsIn(state).length, 0);
  await saveCourseParticipants(state.db, "course", [{ email: "one@example.com", status: "enrolled" }]);
  const duplicate = await saveCourseParticipants(state.db, "course", [{ email: "ONE@example.com", status: "enrolled" }]);
  assert.equal(duplicate.createdCount, 0);
  assert.equal(participantsIn(state).length, 1);
});

test("zero means unlimited and paid courses cannot use automatic free enrollment", async () => {
  const state = store({ "courses/course": { ...publicCourse, maxParticipants: 0 } });
  await Promise.all([1, 2, 3].map((i) => registerCourseSignup(state.db, "course", { ...signup, email: `person${i}@example.com` })));
  assert.equal(occupiedPlaces(participantsIn(state)), 3);
  assert.equal(registrationModeForCourse({ ...publicCourse, pricingMode: "paid" }), "approval");
  assert.equal(registrationModeForCourse({ ...publicCourse, sales: { priceAmountOre: 100 } }), "approval");
  assert.equal(registrationModeForCourse({ pricingMode: "free" }), "approval");
});

test("automatic signup reuses legacy participant without overwriting payment or progress", async () => {
  const participant = { email: signup.email, status: "active", orderId: "legacy", progress: 75 };
  const state = store({ "courses/course": publicCourse, "courses/course/participants/legacy": participant });
  const result = await registerCourseSignup(state.db, "course", signup);
  assert.equal(state.docs.get(`courses/course/signupRequests/${result.requestId}`)?.participantId, "legacy");
  assert.deepEqual(state.docs.get("courses/course/participants/legacy"), participant);
  assert.equal(occupiedPlaces(participantsIn(state)), 1);
});

test("unpublished courses reject signups without writing a request", async () => {
  const state = store({ "courses/course": { ...publicCourse, status: "draft" } });
  await assert.rejects(registerCourseSignup(state.db, "course", signup));
  assert.equal(state.docs.size, 1);
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
