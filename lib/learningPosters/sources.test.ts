import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { listPosterLessons, readSavedPosterLesson } from "./sources.server";
import { filterPosterLessons } from "./sources";
import { POSTER_LANGUAGES, posterLanguageCode, posterLanguageLabel, posterLevelLabel } from "./presentation";
import { readSource, savePoster, type PosterAccount } from "./server";

function fixture() {
  const records = new Map<string, Record<string, unknown>>();
  const reads: string[] = []; const projections: string[][] = [];
  const snapshot = (path: string, fields?: string[]) => ({ id: path.split("/").at(-1)!, data: () => {
    const data = records.get(path);
    return !data || !fields ? data : Object.fromEntries(Object.entries(data).filter(([key]) => fields.includes(key)));
  } });
  const doc = (path: string) => ({ path, id: path.split("/").at(-1), get: async () => { reads.push(path); return snapshot(path); },
    set: async (data: Record<string, unknown>) => { records.set(path, { ...records.get(path), ...data }); } });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`), where: (field: string, op: string, value: string) => {
      assert.equal(op, "==");
      return { select: (...fields: string[]) => { projections.push(fields); return { get: async () => ({
        docs: [...records].filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value).map(([path]) => snapshot(path, fields)),
      }) }; } };
    } }),
    getAll: async (...args: ({ path: string } | { fieldMask: string[] })[]) => {
      const mask = args.at(-1) as { fieldMask: string[] }; projections.push(mask.fieldMask);
      return args.slice(0, -1).map(ref => { const path = (ref as { path: string }).path; reads.push(path); return snapshot(path, mask.fieldMask); });
    },
  } as unknown as Firestore;
  return { db, records, reads, projections };
}

test("language names and level labels remain readable without changing stored lesson codes", () => {
  for (const value of ["no", "nb-NO", "Norsk (bokmål)"]) assert.equal(posterLanguageCode(value), "nb");
  assert.equal(posterLanguageCode("pt_br"), "pt-BR");
  assert.equal(posterLanguageLabel("nb", "nb"), "Norsk bokmål");
  assert.equal(posterLanguageLabel("en", "nb"), "Engelsk");
  assert.equal(posterLanguageLabel("en", "pt"), "Inglês");
  assert.equal(posterLanguageLabel("Norsk (bokmål)", "en"), "Norwegian Bokmål");
  assert.ok(POSTER_LANGUAGES.includes("nn")); assert.ok(POSTER_LANGUAGES.includes("pt"));
  assert.equal(posterLevelLabel("A1_START"), "A1 start");
  const lesson = { id: "legacy", title: "Familie", level: "A1_START", language: "no", origin: "own" as const, addedAt: 0 };
  assert.equal(filterPosterLessons([lesson], "A1 start norsk", "nb")[0], lesson);
  assert.equal(lesson.language, "no"); assert.equal(lesson.level, "A1_START");
});

test("all own lessons and saved library references are listed, newest addition first, without answer data", async () => {
  const f = fixture();
  for (let i = 0; i < 180; i++) f.records.set(`lessons/own-${i}`, { ownerId: "fred", title: `Tekst ${i}`, sourceText: "En tekst.", createdAt: i + 1, level: "A2", language: "nb" });
  f.records.set("lessons/recent", { ownerId: "fred", title: "Ny egen tekst", sourceText: "Ny tekst.", createdAt: Timestamp.fromMillis(300) });
  f.records.set("lessons/old-edited", { ownerId: "fred", title: "Gammel redigert", sourceText: "Gammel tekst.", createdAt: 1, updatedAt: 99999 });
  f.records.set("lessons/deleted", { ownerId: "fred", sourceText: "Slettet", deletedAt: true });
  f.records.set("lessons/other", { ownerId: "admin", sourceText: "Privat" });
  f.records.set("lessons/no-text", { ownerId: "fred", title: "Ingen lesetekst" });
  f.records.set("lessons/legacy-no-date", { ownerId: "fred", title: "Uten dato", text: "Eldre tekst." });
  f.records.set("published_lessons/library", { ownerId: "someone", title: "Ny nedlasting av gammel tekst", sourceText: "Bibliotektekst.", createdAt: 2, isActive: true,
    level: "B1", language: "en", tasks: [{ answer: "never return this" }] });
  f.records.set("practiceSubmissions/fred_library", { uid: "fred", publishedLessonId: "library", kind: "practice", createdAt: 400, answers: { answer: "never read this" } });
  f.records.set("submissions/fred_library", { uid: "fred", lessonId: "library", source: "library", createdAt: 400 });
  f.records.set("practiceSubmissions/other", { uid: "admin", publishedLessonId: "other-library", createdAt: 500 });
  const list = await listPosterLessons(f.db, "fred");
  assert.equal(list.length, 184);
  assert.equal(list[0].id, "saved:practice:fred_library"); assert.equal(list[0].addedAt, 400);
  assert.equal(list[1].id, "recent");
  assert.equal(list.at(-1)?.id, "legacy-no-date");
  assert.ok(!list.some(item => ["deleted", "other", "no-text"].includes(item.id)));
  assert.equal(list.filter(item => item.origin === "library").length, 1);
  assert.ok(list.findIndex(item => item.id === "old-edited") > list.findIndex(item => item.id === "own-179"));
  assert.ok(!JSON.stringify(list).includes("never"));
  assert.ok(f.projections.every(fields => !fields.includes("answers") && !fields.includes("tasks")));
  assert.deepEqual(filterPosterLessons(list, "ny nedlasting B1 engelsk", "nb").map(item => item.id), ["saved:practice:fred_library"]);
  assert.equal(filterPosterLessons(list, "Tekst 179", "nb")[0]?.id, "own-179");
});

test("download date wins over an original creation date; archived and inactive sources are excluded", async () => {
  const f = fixture();
  f.records.set("lessons/copy", { ownerId: "fred", source: "library", sourceText: "Kopi", createdAt: 1, copiedAt: 500 });
  f.records.set("lessons/new", { ownerId: "fred", sourceText: "Ny", createdAt: 400 });
  for (const id of ["active", "inactive", "deleted", "archived", "space"]) {
    f.records.set(`practiceSubmissions/${id}`, { uid: "fred", publishedLessonId: id, createdAt: 600, ...(id === "archived" ? { archived: true } : {}), ...(id === "space" ? { spaceId: "room" } : {}) });
    f.records.set(`published_lessons/${id}`, { sourceText: "Tekst", isActive: id !== "inactive", ...(id === "deleted" ? { deletedAt: true } : {}) });
  }
  const list = await listPosterLessons(f.db, "fred");
  assert.deepEqual(list.map(item => item.id), ["saved:practice:active", "copy", "new"]);
  assert.equal(list.find(item => item.id === "copy")?.origin, "library");
});

test("only reading texts are offered from own and saved content, and excluded types cannot be loaded directly", async () => {
  const f = fixture();
  const excluded = [{ lessonType: "image_writing" }, { texttype: "Skriveoppgave med bilde" }, { type: "writingActivity" },
    { contentType: "quiz" }, { source: "321quiz-library" }, { lessonType: "math_arithmetic" }, { mathType: "fractions" },
    { meta: ["geometry"] }, { source: "tools-podcast-workshop" }, { lessonType: "reading_test" }];
  for (const [index, metadata] of excluded.entries()) {
    const id = `excluded-${index}`;
    f.records.set(`lessons/${id}`, { ownerId: "fred", sourceText: "Oppgavetekst.", ...metadata });
    f.records.set(`published_lessons/${id}`, { isActive: true, sourceText: "Oppgavetekst.", ...metadata });
    f.records.set(`practiceSubmissions/${id}`, { uid: "fred", publishedLessonId: id });
    await assert.rejects(readSource(f.db, "fred", { lessonId: id }), /invalid_source/);
    await assert.rejects(readSource(f.db, "fred", { lessonId: `saved:practice:${id}` }), /invalid_source/);
  }
  f.records.set("lessons/reading", { ownerId: "fred", title: "Quiz og matematikk", sourceText: "Vi snakker om quiz og matematikk.", lessonType: "reading", tasks: [{ type: "writing" }] });
  f.records.set("published_lessons/reading", { isActive: true, sourceText: "En vanlig lesetekst.", textType: "Hverdagsfortelling" });
  f.records.set("practiceSubmissions/reading", { uid: "fred", publishedLessonId: "reading" });
  assert.deepEqual((await listPosterLessons(f.db, "fred")).map(item => item.id).sort(), ["reading", "saved:practice:reading"]);
});

test("saved library text is loaded through the authenticated account's reference; poster ownership stays with that account", async () => {
  const f = fixture();
  f.records.set("practiceSubmissions/fred_saved", { uid: "fred", publishedLessonId: "published", sourceText: "A forged snapshot", answers: { answer: "A private answer" } });
  f.records.set("published_lessons/published", { ownerId: "author", title: "Fra biblioteket", sourceText: "Jeg drikker vann.", status: "published" });
  const source = await readSource(f.db, "fred", { lessonId: "saved:practice:fred_saved" });
  assert.equal(source.text, "Jeg drikker vann.");
  assert.equal(source.lessonId, "saved:practice:fred_saved");
  const poster = await savePoster({ uid: "fred", db: f.db } as PosterAccount, { source, plan: { title: "Drikke", goal: "Lese ord om drikke.", focus: "", level: "A1", language: "nb", kind: "keywords", purpose: "during",
    items: [{ label: "Vann", caption: "Jeg drikker vann.", explanation: "", quote: source.text, visualPrompt: "Et glass vann." }] } });
  assert.equal(poster.ownerId, "fred");
  assert.equal(f.records.get("published_lessons/published")?.ownerId, "author");
  f.records.delete("practiceSubmissions/fred_saved");
  await assert.rejects(readSource(f.db, "fred", { lessonId: source.lessonId }), /source_not_found/);
});

test("another account's saved reference, forged private source and invalid selectors grant no access", async () => {
  const f = fixture();
  f.records.set("practiceSubmissions/other_saved", { uid: "admin", publishedLessonId: "private" });
  f.records.set("published_lessons/private", { ownerId: "admin", sourceText: "Private", isActive: false });
  await assert.rejects(readSavedPosterLesson(f.db, "fred", "saved:practice:other_saved"), /source_not_found/);
  assert.ok(!f.reads.includes("published_lessons/private"));
  f.records.set("practiceSubmissions/forged", { uid: "fred", publishedLessonId: "private" });
  await assert.rejects(readSavedPosterLesson(f.db, "fred", "saved:practice:forged"), /source_not_found/);
  await assert.rejects(readSavedPosterLesson(f.db, "fred", "saved:practice:../private"), /invalid_input/);
  f.records.set("submissions/legacy", { uid: "fred", publishedLessonId: "public", source: "library", createdAt: 1 });
  f.records.set("published_lessons/public", { sourceText: "Public text", status: "unlisted" });
  assert.equal((await readSavedPosterLesson(f.db, "fred", "saved:legacy:legacy")).sourceText, "Public text");
  f.records.set("practiceSubmissions/feide:fred_public", { uid: "fred", publishedLessonId: "public" });
  assert.equal((await readSavedPosterLesson(f.db, "fred", "saved:practice:feide:fred_public")).sourceText, "Public text");
});
