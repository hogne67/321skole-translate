import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { cert, initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { executeCreateLesson } from "./createLesson";

test("real Firestore transaction creates exactly one draft across concurrent retries and rejects conflicts", { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST!, /^(localhost|127\.0\.0\.1):\d+$/);
  const projectId = "demo-321school-create";
  const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const app = initializeApp({ projectId, credential: cert({ projectId, clientEmail: "emulator@example.invalid", privateKey }) }, randomUUID());
  const db = getFirestore(app); const uid = randomUUID(); const key = randomUUID();
  try {
    await db.collection("users").doc(uid).set({ role: "teacher" });
    const auth = { uid, scope: "lessons:create" }; const args = { idempotencyKey: key, lesson: { title: "Transaction draft", sourceText: "Text", tasks: [{ type: "open", prompt: "Explain" }] } };
    const results = await Promise.all(Array.from({ length: 5 }, () => executeCreateLesson(auth, args, "https://staging.example", db)));
    assert.ok(results.every(result => result.lessonId === results[0].lessonId));
    const lessons = await db.collection("lessons").where("ownerId", "==", uid).get();
    assert.equal(lessons.size, 1); assert.equal(lessons.docs[0].data().status, "draft");
    assert.deepEqual(await executeCreateLesson(auth, args, "https://staging.example", db), results[0]);
    await assert.rejects(executeCreateLesson(auth, { ...args, lesson: { ...args.lesson, sourceText: "Changed" } }, "https://staging.example", db), /different lesson content/);
    assert.equal((await db.collection("lessons").where("ownerId", "==", uid).get()).size, 1);
    await db.collection("users").doc(uid).update({ disabled: true });
    await assert.rejects(executeCreateLesson(auth, args, "https://staging.example", db), /not allowed/);
  } finally { await deleteApp(app); }
});
