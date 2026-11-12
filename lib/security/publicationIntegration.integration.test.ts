import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, mock, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { NextRequest } from "next/server";
import OpenAI from "openai";

const project = "demo-publication-integration";
const app = initializeApp({ projectId: project });
const db = getFirestore(app);
let env: RulesTestEnvironment;
let aiCalls = 0;
const oldKey = process.env.OPENAI_API_KEY;
const req = (uid: string, body: unknown) => new NextRequest("http://localhost/synthetic", { method: "POST", headers: { authorization: `Bearer ${uid}`, "content-type": "application/json" }, body: JSON.stringify(body) });
const lesson = (ownerId: string) => ({ ownerId, status: "draft", title: "Synthetic", textType: "story", sourceText: "Synthetic teaching text.", tasks: [{ id: "q", type: "open", prompt: "Synthetic question" }] });
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  process.env.OPENAI_API_KEY = "isolated-test-no-network";
  env = await initializeTestEnvironment({ projectId: project, firestore: { host: "127.0.0.1", port: 8080, rules: await readFile("firestore.rules", "utf8") } });
  await env.clearFirestore();
  for (const [uid, role] of Object.entries({ teacher: "teacher", other: "teacher", pupil: "student", admin: "admin", parent: "parent" })) await db.doc(`users/${uid}`).set({ role, plan: "plus" });
  await db.doc("spaces/room").set({ ownerId: "teacher", isOpen: true });
  await db.doc("spaces/family").set({ ownerId: "parent", kind: "family", isOpen: true });
  await db.doc("spaceMembers/room_pupil").set({ uid: "pupil", spaceId: "room", participantId: "pupil", role: "student", status: "active", active: true });
  mock.method(getAuth(app), "verifyIdToken", async (uid: string) => ({ uid, auth_time: Math.floor(Date.now() / 1000), email_verified: true, firebase: { sign_in_provider: "password" } }));
  mock.method(OpenAI.Responses.prototype, "create", async () => { aiCalls++; return { output_text: "Synthetic feedback" }; });
});
after(async () => { mock.restoreAll(); if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; await env?.cleanup(); await deleteApp(app); });

test("publishing rejects foreign and ownerless drafts without creating a copy", async () => {
  const { POST } = await import("../../app/api/publish/route");
  for (const [id, data] of Object.entries({ foreign: lesson("other"), ownerless: { title: "Synthetic", textType: "story" } })) {
    await db.doc(`lessons/${id}`).set(data);
    assert.equal((await POST(req("teacher", { id, visibility: "public" }))).status, 403);
  }
  assert.equal((await db.collection("published_lessons").get()).size, 0);
});

test("editable draft pointers cannot overwrite a foreign copy or another draft's copy", async () => {
  const { POST } = await import("../../app/api/publish/route");
  for (const ownerId of ["other", "teacher"]) {
    const before = { ...lesson(ownerId), lessonId: "unrelated", isActive: true, visibility: "private" };
    await db.doc("published_lessons/protected").set(before);
    await db.doc("lessons/forged").set({ ...lesson("teacher"), activePublishedId: "protected" });
    assert.equal((await POST(req("teacher", { id: "forged", visibility: "public" }))).status, 403);
    assert.deepEqual((await db.doc("published_lessons/protected").get()).data(), before);
    assert.equal((await db.doc("lessons/forged").get()).get("status"), "draft");
  }
});

test("ordinary owner publish and unpublish work and preserve ownership", async () => {
  const { POST: publish } = await import("../../app/api/publish/route");
  const { POST: unpublish } = await import("../../app/api/unpublish/route");
  await db.doc("lessons/ordinary").set(lesson("teacher"));
  const response = await publish(req("teacher", { id: "ordinary", visibility: "unlisted" }));
  assert.equal(response.status, 200);
  const { publishedId } = await response.json();
  assert.equal((await unpublish(req("teacher", { id: publishedId }))).status, 200);
  const data = (await db.doc(`published_lessons/${publishedId}`).get()).data();
  assert.equal(data?.ownerId, "teacher"); assert.equal(data?.lessonId, "ordinary"); assert.equal(data?.isActive, false);
  assert.equal((await db.doc("lessons/ordinary").get()).get("status"), "draft");
});

test("unpublish cannot take over a foreign copy, forge its binding or create missing documents", async () => {
  const { POST } = await import("../../app/api/unpublish/route");
  const before = { ...lesson("other"), lessonId: "foreign", isActive: true, visibility: "public" };
  await db.doc("published_lessons/foreign").set(before);
  assert.equal((await POST(req("teacher", { id: "foreign", draftId: "ordinary" }))).status, 403);
  assert.deepEqual((await db.doc("published_lessons/foreign").get()).data(), before);
  assert.equal((await POST(req("teacher", { id: "does-not-exist" }))).status, 404);
  assert.equal((await db.doc("published_lessons/does-not-exist").get()).exists, false);
});

test("quiz sharing rejects forged pointers and creates an unlisted copy from an own private quiz", async () => {
  const { POST } = await import("../../app/api/quiz/share/route");
  await db.doc("lessons/quiz-forged").set({ ...lesson("teacher"), lessonType: "quiz", activePublishedId: "foreign" });
  assert.equal((await POST(req("teacher", { lessonId: "quiz-forged" }))).status, 403);
  await db.doc("lessons/quiz-own").set({ ...lesson("teacher"), lessonType: "quiz", activePublishedId: "quiz-private" });
  await db.doc("published_lessons/quiz-private").set({ ...lesson("teacher"), lessonId: "quiz-own", isActive: true, visibility: "private" });
  const response = await POST(req("teacher", { lessonId: "quiz-own" })); assert.equal(response.status, 200);
  const { publishedId } = await response.json(); assert.notEqual(publishedId, "quiz-private");
  assert.equal((await db.doc(`published_lessons/${publishedId}`).get()).get("visibility"), "unlisted");
  assert.equal((await db.doc("published_lessons/quiz-private").get()).get("visibility"), "private");
});

test("public metadata hides private copies and retains direct unlisted links", async () => {
  const { getPublishedLessonByEitherIdOrField: load } = await import("../publishedLessons.server");
  await db.doc("published_lessons/meta-private").set({ ...lesson("other"), isActive: true, visibility: "private" });
  await db.doc("published_lessons/meta-unlisted").set({ ...lesson("other"), isActive: true, visibility: "unlisted", lessonId: "hidden-source" });
  assert.equal(await load("meta-private"), null);
  assert.equal((await load("meta-unlisted"))?.visibility, "unlisted");
  assert.equal(await load("hidden-source"), null);
});

test("teacher and parent assignment paths reject foreign private sources and preserve ordinary copies", async () => {
  const { POST: teacherAssign } = await import("../../app/api/teacher/spaces/[spaceId]/assign/route");
  const { POST: parentAssign } = await import("../../app/api/parent/spaces/[spaceId]/assign/route");
  await db.doc("published_lessons/foreign-private").set({ ...lesson("other"), isActive: true, visibility: "private" });
  assert.equal((await teacherAssign(req("teacher", { sourceType: "library", sourceId: "foreign-private" }), { params: Promise.resolve({ spaceId: "room" }) })).status, 403);
  assert.equal((await parentAssign(req("parent", { sourceType: "library", sourceId: "foreign-private" }), { params: Promise.resolve({ spaceId: "family" }) })).status, 404);
  await db.doc("lessons/parent-own").set(lesson("parent"));
  const response = await parentAssign(req("parent", { sourceId: "parent-own" }), { params: Promise.resolve({ spaceId: "family" }) });
  assert.equal(response.status, 200, await response.clone().text());
  await db.doc("lessons/teacher-own").set(lesson("teacher"));
  const teacherResponse = await teacherAssign(req("teacher", { sourceType: "myContent", sourceId: "teacher-own" }), { params: Promise.resolve({ spaceId: "room" }) });
  assert.equal(teacherResponse.status, 200, await teacherResponse.clone().text());
});

test("forged assignment fallback cannot send another owner's private source to AI", async () => {
  const { POST: feedback } = await import("../../app/api/teacher/ai-feedback/route");
  const { POST: podcast } = await import("../../app/api/spaces/[spaceId]/lessons/[assignmentId]/podcast-ai-support/route");
  await db.doc("spaces/room/lessons/fallback").set({ sourceType: "library", sourceId: "foreign-private" });
  await db.doc("spaces/room/lessons/fallback/submissions/pupil").set({ uid: "pupil", participantId: "pupil", studentUid: "pupil", spaceId: "room", assignmentId: "fallback", answers: { q: "Synthetic answer" } });
  const before = aiCalls;
  const response = await feedback(req("teacher", { spaceId: "room", assignmentId: "fallback", subId: "pupil" }));
  assert.equal(response.status, 403, await response.clone().text());
  const podcastResponse = await podcast(req("pupil", { sectionId: "one" }), { params: Promise.resolve({ spaceId: "room", assignmentId: "fallback" }) });
  assert.equal(podcastResponse.status, 403, await podcastResponse.clone().text());
  assert.equal(aiCalls, before);
});

test("an already copied ordinary Space assignment does not require access to its source", async () => {
  const { POST } = await import("../../app/api/teacher/ai-feedback/route");
  await db.doc("spaces/room/lessons/copied").set({ ...lesson("teacher"), sourceType: "library", sourceId: "foreign-private" });
  await db.doc("spaces/room/lessons/copied/submissions/pupil").set({ uid: "pupil", participantId: "pupil", studentUid: "pupil", spaceId: "room", assignmentId: "copied", answers: { q: "Synthetic answer" } });
  const response = await POST(req("teacher", { spaceId: "room", assignmentId: "copied", subId: "pupil" }));
  assert.equal(response.status, 200, await response.clone().text());
});
