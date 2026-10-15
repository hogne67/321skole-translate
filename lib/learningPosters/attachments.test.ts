import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import type { Firestore } from "firebase-admin/firestore";
import { digest, sourceDigest, type PosterAccount } from "./server";
import { setLessonPosterAttachment } from "./attachments.server";
import { currentPosterAttachments } from "./attachmentsPolicy.server";
import { browserSourceFingerprint, readPosterAttachments } from "./attachments";
import type { LearningPoster, PosterPlan } from "./model";
import { assignmentToLesson } from "../../app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { assignmentSnapshotToLesson } from "../submissions/readers";

const text = "Jeg drikker vann.";
const plan: PosterPlan = { title: "Vann", goal: "Lese ord om drikke.", focus: "", level: "A1", language: "nb", kind: "keywords", purpose: "before", includeExplanations: false,
  items: [{ label: "Vann", caption: text, explanation: "", quote: text, visualPrompt: "Et glass vann." }] };
function fixture() {
  const records = new Map<string, Record<string, unknown>>();
  const doc = (path: string) => ({ path, get: async () => ({ data: () => records.get(path) }) });
  const db = { collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }),
    runTransaction: async <T>(work: (tx: unknown) => Promise<T>) => {
      const writes: (() => void)[] = [];
      const result = await work({ get: async (ref: { path: string }) => ({ data: () => records.get(ref.path) }),
        update: (ref: { path: string }, data: Record<string, unknown>) => writes.push(() => records.set(ref.path, { ...records.get(ref.path), ...data })) });
      writes.forEach(write => write()); return result;
    },
  } as unknown as Firestore;
  const poster: LearningPoster = { id: "poster", ownerId: "fred", source: { lessonId: "lesson", title: "Drikke", text, hash: sourceDigest(text) }, plan, reviewedHash: digest(plan),
    images: [{ path: "learning-posters/fred/poster/image.webp", url: "https://example.test/image" }] };
  records.set("lessons/lesson", { ownerId: "fred", sourceText: text, tasks: [{ answer: "PRIVATE ANSWER" }] });
  records.set("learningPosters/poster", { ...poster });
  const uploads: { path: string; buffer: Buffer; url: string }[] = [];
  const deps = { saveSnapshot: async (path: string, buffer: Buffer) => {
    const url = `https://firebasestorage.googleapis.com/v0/b/fixture/o/${encodeURIComponent(path)}?alt=media&token=fixture-token`;
    uploads.push({ path, buffer, url }); return url;
  } };
  const account = { uid: "fred", db, storage: { bucket: () => ({ file: () => ({ download: async () => [await sharp({ create: { width: 512, height: 512, channels: 3, background: "#93c5fd" } }).webp().toBuffer()] }) }) } } as unknown as PosterAccount;
  const enable = () => setLessonPosterAttachment(account, { lessonId: "lesson", posterId: "poster", enabled: true }, "nb", deps);
  return { account, records, poster, deps, uploads, enable };
}

test("attachments are off by default; enabling stores an independent full-size image and preserves the lesson and answers", async () => {
  const f = fixture();
  assert.deepEqual(currentPosterAttachments(f.records.get("lessons/lesson")!), []);
  const result = await f.enable();
  assert.equal(result.length, 1); assert.equal(result[0].sourceHash, sourceDigest(text));
  assert.equal(result[0].purpose, "before"); assert.equal(f.uploads.length, 1);
  assert.ok(f.uploads[0].path.startsWith("learning-posters/fred/poster/attachments/"));
  const metadata = await sharp(f.uploads[0].buffer).metadata();
  assert.equal(metadata.width, 1920); assert.equal(metadata.height, 1440); assert.equal(metadata.format, "webp");
  assert.equal(f.records.get("lessons/lesson")?.sourceText, text);
  assert.deepEqual(f.records.get("lessons/lesson")?.tasks, [{ answer: "PRIVATE ANSWER" }]);
  assert.equal(f.records.size, 2); // No usage documents or extra lesson/poster copies.
});

test("foreign, unrelated, unreviewed, incomplete and stale posters cannot become student attachments", async () => {
  for (const change of [
    { ownerId: "admin" }, { source: { ...fixture().poster.source, lessonId: "other" } }, { reviewedHash: null }, { images: [] },
    { source: { ...fixture().poster.source, hash: sourceDigest("Changed source") } },
  ]) {
    const f = fixture(); f.records.set("learningPosters/poster", { ...f.poster, ...change });
    await assert.rejects(f.enable()); assert.equal(f.uploads.length, 0);
    assert.equal(f.records.get("lessons/lesson")?.learningPosterAttachments, undefined);
  }
  const f = fixture(); f.records.set("lessons/lesson", { ownerId: "admin", sourceText: text });
  await assert.rejects(f.enable(), /source_not_found/); assert.equal(f.uploads.length, 0);
});

test("editing a poster keeps previously shared snapshots stable until the teacher explicitly updates the attachment", async () => {
  const f = fixture(); const [original] = await f.enable();
  const publishedCopy = { sourceText: text, learningPosterAttachments: [original] };
  const nextPlan = { ...plan, title: "Et glass vann" };
  f.records.set("learningPosters/poster", { ...f.poster, plan: nextPlan, reviewedHash: digest(nextPlan) });
  assert.equal(currentPosterAttachments(f.records.get("lessons/lesson")!)[0].imageUrl, original.imageUrl);
  const [updated] = await f.enable();
  assert.equal(updated.title, nextPlan.title); assert.notEqual(updated.imageUrl, original.imageUrl);
  assert.equal(currentPosterAttachments(publishedCopy)[0].imageUrl, original.imageUrl);
  assert.equal(readPosterAttachments(f.records.get("lessons/lesson")?.learningPosterAttachments).length, 1);
});

test("a stale attachment is hidden and can still be removed, while a previously shared source snapshot stays intact", async () => {
  const f = fixture(); const attachments = await f.enable();
  const publishedCopy = { sourceText: text, learningPosterAttachments: attachments };
  f.records.set("lessons/lesson", { ...f.records.get("lessons/lesson"), sourceText: "Jeg drikker melk." });
  assert.deepEqual(currentPosterAttachments(f.records.get("lessons/lesson")!), []);
  assert.equal(currentPosterAttachments(publishedCopy).length, 1);
  f.records.delete("learningPosters/poster");
  assert.deepEqual(await setLessonPosterAttachment(f.account, { lessonId: "lesson", posterId: "poster", enabled: false }, "nb", f.deps), []);
});

test("source and plan races during image preparation cannot commit an obsolete attachment", async () => {
  for (const changePlan of [false, true]) {
    const f = fixture();
    const deps = { saveSnapshot: async (path: string, buffer: Buffer) => {
      const url = await f.deps.saveSnapshot(path, buffer);
      if (changePlan) f.records.set("learningPosters/poster", { ...f.poster, plan: { ...plan, title: "New plan" } });
      else f.records.set("lessons/lesson", { ...f.records.get("lessons/lesson"), sourceText: "A new source." });
      return url;
    } };
    await assert.rejects(setLessonPosterAttachment(f.account, { lessonId: "lesson", posterId: "poster", enabled: true }, "nb", deps));
    assert.equal(f.records.get("lessons/lesson")?.learningPosterAttachments, undefined);
  }
});

test("publication and assignment filtering keeps only valid attachments for the current normalized source", async () => {
  const f = fixture(); const attachments = await f.enable();
  const lesson = { sourceText: "Jeg\n drikker vann.", learningPosterAttachments: attachments };
  assert.equal(currentPosterAttachments(lesson).length, 1);
  assert.deepEqual(assignmentToLesson({ ...lesson }).learningPosterAttachments, attachments);
  assert.deepEqual(assignmentSnapshotToLesson({ ...lesson }).learningPosterAttachments, attachments);
  assert.deepEqual(currentPosterAttachments({ ...lesson, sourceText: "An edited source." }), []);
  for (const imageUrl of ["javascript:alert(1)", "https://example.test/image", "https://firebasestorage.googleapis.com/v0/b/test/o/other-file?alt=media&token=x"]) {
    assert.deepEqual(readPosterAttachments([{ ...attachments[0], imageUrl }]), []);
  }
  assert.equal(readPosterAttachments([attachments[0], attachments[0]]).length, 1);
});

test("browser source checking agrees with the server for whitespace and composed Unicode", async () => {
  for (const source of [text, "Jeg\n drikker vann.", "Blå kjole.", "Bla\u030a kjole."]) assert.equal(await browserSourceFingerprint(source), sourceDigest(source));
  assert.equal(await browserSourceFingerprint("Blå kjole."), await browserSourceFingerprint("Bla\u030a kjole."));
});
