import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import type { Firestore } from "firebase-admin/firestore";
import { digest, type PosterAccount } from "./server";
import type { LearningPoster, PosterPlan } from "./model";
import { listFinishedPosters, listLinkedPosters, posterThumbnail } from "./content.server";
import { posterContentItem } from "./content";

const plan: PosterPlan = { title: "Vi drikker", goal: "Lese ord om drikke.", focus: "", level: "A1_START", language: "nb", kind: "keywords", purpose: "before", includeExplanations: false,
  items: ["Vann", "Melk"].map(label => ({ label, caption: `Jeg drikker ${label.toLowerCase()}.`, explanation: "", quote: "", visualPrompt: `Et glass ${label.toLowerCase()}.` })) };
function poster(id: string, lessonId: string | null = null): LearningPoster {
  return { id, ownerId: "fred", plan, reviewedHash: digest(plan), source: { lessonId, title: "Kildeteksten", text: "PRIVATE SOURCE TEXT", hash: "source-hash" },
    images: plan.items.map((_, i) => ({ path: `learning-posters/fred/${id}/${i}.webp`, url: `https://example.test/${i}` })) };
}
function fixture() {
  const records = new Map<string, Record<string, unknown>>(); const projections: string[][] = []; const reads: string[] = [];
  const db = { collection: (name: string) => ({
    doc: (id: string) => ({ get: async () => { reads.push(`${name}/${id}`); return { data: () => records.get(`${name}/${id}`) }; } }),
    where: (field: string, op: string, value: string) => {
      assert.equal(field, "ownerId"); assert.equal(op, "=="); assert.equal(value, "fred");
      const selectedQuery = { select: (...fields: string[]) => { projections.push(fields); return { get: async () => ({
        // Deliberately return another owner too, to test the defensive account check.
        docs: [...records].filter(([path]) => path.startsWith(`${name}/`)).map(([path, value]) => ({ id: path.split("/").at(-1)!, data: () => {
          const selected: Record<string, unknown> = {};
          for (const field of fields) {
            const [head, tail] = field.split(".");
            if (tail) { const nested = value[head] as Record<string, unknown> | undefined;
              selected[head] = { ...(selected[head] as object), ...(nested?.[tail] !== undefined ? { [tail]: nested[tail] } : {}) }; }
            else if (value[field] !== undefined) selected[field] = value[field];
          }
          return selected;
        } })),
      }) }; } };
      return { ...selectedQuery, where: (field: string, op: string, value: string) => {
        assert.equal(field, "source.lessonId"); assert.equal(op, "=="); assert.ok(value); return selectedQuery;
      } };
    },
  }) } as unknown as Firestore;
  let downloads = 0;
  const account = { db, uid: "fred", storage: { bucket: () => ({ file: () => ({ download: async () => {
    downloads++; return [await sharp({ create: { width: 512, height: 512, channels: 3, background: "#93c5fd" } }).webp().toBuffer()];
  } }) }) } } as unknown as PosterAccount;
  return { records, projections, reads, account, downloads: () => downloads };
}

test("My Content contains only the account's approved, complete posters, newest first, and sends summaries only", async () => {
  const f = fixture();
  f.records.set("learningPosters/old", { ...poster("old"), createdAt: 100 });
  f.records.set("learningPosters/new", { ...poster("new", "own"), updatedAt: { seconds: 2 } });
  f.records.set("lessons/own", { ownerId: "fred" });
  f.records.set("learningPosters/other", { ...poster("other"), ownerId: "admin" });
  f.records.set("learningPosters/draft", { ...poster("draft"), reviewedHash: null });
  f.records.set("learningPosters/pending", { ...poster("pending"), images: [] });
  f.records.set("learningPosters/partial", { ...poster("partial"), images: poster("partial").images.slice(0, 1) });
  f.records.set("learningPosters/changed", { ...poster("changed"), plan: { ...plan, title: "Edited without review" } });
  f.records.set("learningPosters/deleted", { ...poster("deleted"), deletedAt: 1 });
  const list = await listFinishedPosters(f.account, "nb");
  assert.deepEqual(list.map(item => item.id), ["new", "old"]);
  assert.equal(list[0].sourceHref, "/nb/producer/own"); assert.equal(list[1].sourceHref, null);
  assert.ok(!JSON.stringify(list).includes("PRIVATE SOURCE TEXT")); assert.ok(!JSON.stringify(list).includes("visualPrompt"));
  assert.ok(f.projections.every(fields => !fields.includes("source") && !fields.includes("source.text")));
  assert.ok(!f.reads.some(path => path.includes("other")));
});

test("saved library links resolve the authenticated reference; unavailable or foreign sources do not expose a link", async () => {
  const f = fixture();
  f.records.set("learningPosters/library", { ...poster("library", "saved:practice:fred_library") });
  f.records.set("practiceSubmissions/fred_library", { uid: "fred", publishedLessonId: "published" });
  f.records.set("published_lessons/published", { isActive: true, title: "Fra biblioteket" });
  f.records.set("learningPosters/foreign", { ...poster("foreign", "foreign") });
  f.records.set("lessons/foreign", { ownerId: "admin" });
  f.records.set("learningPosters/removed", { ...poster("removed", "removed") });
  f.records.set("lessons/removed", { ownerId: "fred", deletedAt: 1 });
  f.records.set("learningPosters/private", { ...poster("private", "saved:practice:other_reference") });
  f.records.set("practiceSubmissions/other_reference", { uid: "admin", publishedLessonId: "private" });
  const list = await listFinishedPosters(f.account, "en");
  assert.equal(list.find(item => item.id === "library")?.sourceHref, "/en/student/lesson/published");
  for (const id of ["foreign", "removed", "private"]) assert.equal(list.find(item => item.id === id)?.sourceHref, null);
  assert.ok(!f.reads.includes("published_lessons/private"));
});

test("thumbnails render a small poster without quota writes or AI calls, including existing posters without new fields", async () => {
  const f = fixture();
  const thumbnail = await posterThumbnail(f.account, poster("old"), "nb");
  const metadata = await sharp(thumbnail).metadata();
  assert.equal(metadata.format, "webp"); assert.equal(metadata.width, 480); assert.equal(metadata.height, 360);
  assert.equal(f.downloads(), 2);
  // This fixture has no usage-write or provider capabilities: previewing needs neither.
  assert.deepEqual([...f.records.keys()], []);
});

test("foreign posters, incomplete posters and forged storage paths cannot be thumbnailed", async () => {
  const f = fixture();
  await assert.rejects(posterThumbnail(f.account, { ...poster("other"), ownerId: "admin" }, "nb"), /poster_not_found/);
  await assert.rejects(posterThumbnail(f.account, { ...poster("draft"), reviewedHash: null }, "nb"), /review_required/);
  const forged = poster("forged"); forged.images = forged.images.map(image => ({ ...image, path: image.path.replace("/fred/", "/admin/") }));
  await assert.rejects(posterThumbnail(f.account, forged, "nb"), /forbidden/);
  assert.equal(f.downloads(), 0);
});

test("poster feed items use their own content type and link to the saved poster", () => {
  const item = posterContentItem({ id: "poster-id", title: plan.title, level: plan.level, language: plan.language, updatedAt: 2000, sourceTitle: "Drikke", sourceHref: null }, "nb");
  assert.equal(item.type, "learningPoster"); assert.equal(item.href, "/nb/producer/learning-posters?posterId=poster-id");
  assert.equal(item.updatedAt?.getTime(), 2000); assert.ok(item.meta?.includes("A1 start")); assert.ok(item.meta?.includes("Norsk bokmål"));
});

test("lesson overview includes ready posters and drafts for the same source and account, without the old 100-item cap", async () => {
  const f = fixture();
  f.records.set("lessons/own", { ownerId: "fred", sourceText: "PRIVATE SOURCE TEXT", tasks: [{ answer: "DO NOT SEND ANSWERS" }] });
  for (let i = 0; i < 130; i++) f.records.set(`learningPosters/ready-${i}`, { ...poster(`ready-${i}`, "own"), updatedAt: i + 1 });
  f.records.set("learningPosters/draft", { ...poster("draft", "own"), reviewedHash: null, images: [], updatedAt: 200 });
  f.records.set("learningPosters/other-source", { ...poster("other-source", "elsewhere") });
  f.records.set("learningPosters/manual", { ...poster("manual") });
  f.records.set("learningPosters/other-owner", { ...poster("other-owner", "own"), ownerId: "admin" });
  f.records.set("learningPosters/deleted", { ...poster("deleted", "own"), deletedAt: 1 });
  const list = await listLinkedPosters(f.account, "own");
  assert.equal(list.length, 131); assert.equal(list[0].id, "draft"); assert.equal(list[0].ready, false);
  assert.equal(list[1].id, "ready-129"); assert.equal(list[1].ready, true);
  assert.equal(list[1].sourceText, "PRIVATE SOURCE TEXT");
  assert.equal(list[1].sourceHash, "source-hash");
  assert.deepEqual(list[1].imageLabels, ["Vann", "Melk"]);
  assert.ok(!JSON.stringify(list).includes("DO NOT SEND ANSWERS")); assert.ok(!JSON.stringify(list).includes("visualPrompt"));
});

test("a lesson must belong to the authenticated account before its linked poster list can be queried", async () => {
  const f = fixture(); f.records.set("lessons/private", { ownerId: "admin", sourceText: "Private text" });
  await assert.rejects(listLinkedPosters(f.account, "private"), /source_not_found/);
  await assert.rejects(listLinkedPosters(f.account, "../private"), /invalid_input/);
  assert.equal(f.projections.length, 0);
});
