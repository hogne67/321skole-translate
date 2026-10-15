import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import type { Firestore } from "firebase-admin/firestore";
import { digest, sourceDigest, type PosterAccount } from "./server";
import { applyLessonPosterCover, coverRevision, previewLessonPosterCover, renderPosterCover } from "./cover.server";
import type { LearningPoster, PosterPlan } from "./model";

const sourceText = "Jeg drikker vann.";
const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff"];
const plan: PosterPlan = { title: "PRIVATE TITLE", goal: "PRIVATE GOAL", focus: "", level: "A1", language: "nb", kind: "keywords", purpose: "before", includeExplanations: false,
  items: colors.map((_, index) => ({ label: `PRIVATE LABEL ${index}`, caption: sourceText, explanation: "", quote: sourceText, visualPrompt: "Et glass vann." })) };
const solid = (color: string) => sharp({ create: { width: 512, height: 512, channels: 3, background: color } }).png().toBuffer();
async function fixture() {
  const images = await Promise.all(colors.map(solid));
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
  const poster: LearningPoster = { id: "poster", ownerId: "fred", source: { lessonId: "lesson", title: "Drikke", text: sourceText, hash: sourceDigest(sourceText) }, plan, reviewedHash: digest(plan),
    images: images.map((_, index) => ({ path: `learning-posters/fred/poster/${index}.webp`, url: `https://example.test/${index}` })) };
  records.set("lessons/lesson", { ownerId: "fred", sourceText, coverImageUrl: "old-cover", tasks: [{ answer: "PRIVATE ANSWER" }], learningPosterAttachments: ["untouched-attachment"] });
  records.set("learningPosters/poster", { ...poster });
  const uploads: { path: string; buffer: Buffer }[] = [];
  const deps = { saveCover: async (path: string, buffer: Buffer) => { uploads.push({ path, buffer }); return `https://example.test/${path}`; } };
  const account = { uid: "fred", db, storage: { bucket: () => ({ file: (path: string) => ({ download: async () => [images[Number(path.split("/").at(-1)!.split(".")[0])]] }) }) } } as unknown as PosterAccount;
  const input = { lessonId: "lesson", posterId: "poster", selection: "all" as const };
  const apply = () => applyLessonPosterCover(account, { ...input, revision: coverRevision(poster) }, deps);
  return { account, input, records, poster, deps, uploads, apply, images };
}
async function pixel(buffer: Buffer, left: number, top: number) {
  return [...await sharp(buffer).extract({ left, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer()];
}
function near(actual: number[], expected: number[]) { actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 12, `${actual} ≠ ${expected}`)); }

test("six original illustrations compose into a text-free 1920×1080 cover in order", async () => {
  const f = await fixture(); const buffer = await renderPosterCover(f.images, "all");
  const meta = await sharp(buffer).metadata(); assert.equal(meta.width, 1920); assert.equal(meta.height, 1080);
  const expected = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255]];
  for (let i = 0; i < 6; i++) near(await pixel(buffer, [328, 960, 1592][i % 3], i < 3 ? 276 : 804), expected[i]);
  // Original poster title/labels/branding never enter the raster composition.
  near(await pixel(buffer, 960, 10), [255, 255, 255]);
});
test("single motif preserves the entire illustration including edges instead of cropping to 16:9", async () => {
  const square = await sharp(await solid("#0000ff")).composite([{ input: await sharp({ create: { width: 40, height: 512, channels: 3, background: "#ff0000" } }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
  const buffer = await renderPosterCover([square], 0);
  near(await pixel(buffer, 450, 540), [255, 0, 0]); near(await pixel(buffer, 1460, 540), [0, 0, 255]);
  near(await pixel(buffer, 10, 540), [255, 255, 255]);
});
test("preview is read-only; applying uses the preview version and updates both cover fields without AI or usage documents", async () => {
  const f = await fixture(); const preview = await previewLessonPosterCover(f.account, f.input);
  assert.equal(f.records.get("lessons/lesson")!.coverImageUrl, "old-cover"); assert.equal(f.uploads.length, 0);
  const cover = await applyLessonPosterCover(f.account, { ...f.input, revision: preview.revision }, f.deps);
  const lesson = f.records.get("lessons/lesson")!;
  assert.equal(cover.coverImageFormat, "16:9"); assert.equal(lesson.coverImageUrl, cover.coverImageUrl); assert.equal(lesson.imageUrl, cover.coverImageUrl);
  assert.deepEqual(lesson.tasks, [{ answer: "PRIVATE ANSWER" }]); assert.deepEqual(lesson.learningPosterAttachments, ["untouched-attachment"]);
  assert.equal(lesson.ownerId, "fred"); assert.equal(f.records.size, 2);
  assert.ok(f.uploads[0].path.startsWith("learning-posters/fred/poster/covers/"));
  assert.deepEqual(f.uploads[0].buffer, preview.buffer);
});
test("foreign, unrelated, unreviewed, incomplete, stale and foreign-storage posters cannot become covers", async () => {
  const changes = [{ ownerId: "admin" }, { reviewedHash: null }, { images: [] }, { source: { ...(await fixture()).poster.source, lessonId: "other" } },
    { source: { ...(await fixture()).poster.source, hash: sourceDigest("new source") } },
    { images: (await fixture()).poster.images.map(image => ({ ...image, path: image.path.replace("/fred/", "/admin/") })) }];
  for (const change of changes) {
    const f = await fixture(); f.records.set("learningPosters/poster", { ...f.poster, ...change });
    await assert.rejects(f.apply()); assert.equal(f.uploads.length, 0); assert.equal(f.records.get("lessons/lesson")!.coverImageUrl, "old-cover");
  }
  const f = await fixture(); f.records.set("lessons/lesson", { ownerId: "admin", sourceText });
  await assert.rejects(f.apply(), /source_not_found/); assert.equal(f.uploads.length, 0);
});
test("changing plan or image version after preview requires a new preview", async () => {
  for (const imageChanged of [true, false]) {
    const f = await fixture();
    const next = imageChanged ? { ...f.poster, images: f.poster.images.map(image => ({ ...image, url: `${image.url}?new` })) } : { ...f.poster, plan: { ...plan, title: "New title" } };
    next.reviewedHash = digest(next.plan); f.records.set("learningPosters/poster", next);
    await assert.rejects(f.apply(), /cover_changed/); assert.equal(f.uploads.length, 0);
  }
});
test("source, ownership and image races during preparation cannot overwrite the existing cover", async () => {
  for (const change of ["source", "owner", "images"]) {
    const f = await fixture();
    const deps = { saveCover: async (path: string, buffer: Buffer) => {
      const url = await f.deps.saveCover(path, buffer);
      if (change === "images") f.records.set("learningPosters/poster", { ...f.poster, images: [...f.poster.images].reverse() });
      else f.records.set("lessons/lesson", { ...f.records.get("lessons/lesson"), ...(change === "owner" ? { ownerId: "admin" } : { sourceText: "Changed source" }) });
      return url;
    } };
    await assert.rejects(applyLessonPosterCover(f.account, { ...f.input, revision: coverRevision(f.poster) }, deps));
    assert.equal(f.records.get("lessons/lesson")!.coverImageUrl, "old-cover");
  }
});
test("invalid motif indices and document paths are rejected", async () => {
  const f = await fixture();
  for (const selection of [-1, 6, 1.5, Number.NaN]) await assert.rejects(previewLessonPosterCover(f.account, { ...f.input, selection }), /invalid_input/);
  await assert.rejects(previewLessonPosterCover(f.account, { ...f.input, posterId: "../admin" }), /invalid_input/);
});
