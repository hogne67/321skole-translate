import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, mock, test } from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";

const projectId = "demo-publish-visibility";
const app = initializeApp({ projectId });
const db = getFirestore(app);
let env: RulesTestEnvironment;
let publish: typeof import("../../app/api/publish/route").POST;

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  env = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 8080, rules: await readFile("firestore.rules", "utf8") },
  });
  await env.clearFirestore();
  await db.doc("users/teacher").set({ role: "teacher", plan: "plus" });
  await db.doc("lessons/synthetic").set({ ownerId: "teacher", title: "Synthetic lesson", textType: "story", status: "draft" });
  mock.method(getAuth(app), "verifyIdToken", async () => ({ uid: "teacher", auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: "password" }, email_verified: true }));
  ({ POST: publish } = await import("../../app/api/publish/route"));
});
after(async () => { mock.restoreAll(); await env?.cleanup(); await deleteApp(app); });

function request(body: unknown): Request {
  return new Request("http://localhost/api/publish", {
    method: "POST",
    headers: { Authorization: "Bearer synthetic", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("missing and invalid visibility do not publish a draft", async () => {
  for (const body of [
    { id: "synthetic" },
    { id: "synthetic", visibility: null },
    { id: "synthetic", visibility: "PUBLIC" },
  ]) {
    const response = await publish(request(body));
    assert.equal(response.status, 400);
  }
  assert.equal((await db.collection("published_lessons").get()).size, 0);
  assert.equal((await db.doc("lessons/synthetic").get()).get("status"), "draft");
});

test("explicit private, unlisted and public choices retain their intended visibility", async () => {
  for (const [visibility, inLibrary] of [["private", false], ["unlisted", false], ["public", true]] as const) {
    await db.doc("lessons/synthetic").update({ visibility: "private", publishVisibility: "private", publish: { visibility: "private", state: "draft" } });
    const response = await publish(request({ id: "synthetic", visibility }));
    assert.equal(response.status, 200, await response.clone().text());
    const id = (await response.json()).publishedId as string;
    const published = (await db.doc(`published_lessons/${id}`).get()).data();
    assert.equal(published?.visibility, visibility);
    assert.equal(published?.publishVisibility, visibility);
    assert.equal(published?.publish?.visibility, visibility);
    assert.equal(published?.showInLibrary, inLibrary);
  }
  assert.equal((await db.collection("published_lessons").get()).size, 1);
});

test("new quiz share does not inherit private visibility from its draft", async () => {
  await db.doc("lessons/synthetic-quiz").set({ ownerId: "teacher", lessonType: "quiz", visibility: "private", publishVisibility: "private", publish: { visibility: "private" } });
  const { POST: shareQuiz } = await import("../../app/api/quiz/share/route");
  const response = await shareQuiz(request({ lessonId: "synthetic-quiz" }));
  assert.equal(response.status, 200);
  const id = (await response.json()).publishedId as string;
  const published = (await db.doc(`published_lessons/${id}`).get()).data();
  assert.equal(published?.visibility, "unlisted");
  assert.equal(published?.publishVisibility, "unlisted");
  assert.equal(published?.publish?.visibility, "unlisted");
  assert.equal(published?.showInLibrary, false);
});
