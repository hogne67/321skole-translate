import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { PosterError } from "./model";
import type { PosterLessonChoice } from "./sources";

type Data = Record<string, unknown>;
const fields = ["ownerId", "title", "sourceText", "text", "level", "language", "createdAt", "downloadedAt", "copiedAt", "importedAt", "savedAt", "updatedAt", "source", "deletedAt", "archived",
  "type", "lessonType", "textType", "texttype", "contentType", "taskType", "mathType", "meta"];
const savedFields = ["uid", "publishedLessonId", "lessonId", "kind", "source", "createdAt", "downloadedAt", "copiedAt", "importedAt", "savedAt", "updatedAt", "deletedAt", "archived", "studentArchived", "spaceId"];
const collections = { practice: "practiceSubmissions", legacy: "submissions" } as const;
const idPattern = /^[A-Za-z0-9_-]{1,200}$/;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

// Use content metadata, never words in the title or reading text.
export function isPosterReadingLesson(data: Data): boolean {
  if (text(data.mathType)) return false;
  const signals = [data.type, data.lessonType, data.textType, data.texttype, data.contentType, data.taskType, data.source,
    ...(Array.isArray(data.meta) ? data.meta : [])].map(value => text(value).toLowerCase().replace(/[\s-]+/g, "_"));
  const excluded = new Set(["writing", "writingactivity", "writing_activity", "writing_task", "image_writing", "image_writing_task",
    "skriveoppgave", "skriveoppgave_med_bilde", "tarefa_de_escrita_com_imagem", "quiz", "live_quiz", "321quiz_library",
    "podcast_workshop", "reading_test", "math", "math_worksheet", "geometry", "geometry_worksheet", "arithmetic", "arithmetic_worksheet",
    "algebra", "fractions", "fraction_worksheet", "percent", "percentage", "percentage_worksheet", "equations", "equations_worksheet",
    "measurement", "measurement_worksheet", "comparison", "comparison_worksheet"]);
  return !signals.some(value => excluded.has(value) || /^(math_|producer_image_writing|tools_quiz|tools_podcast_workshop)/.test(value));
}

function millis(value: unknown): number {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  if (value && typeof value === "object") {
    if ("toMillis" in value && typeof value.toMillis === "function") return millis(value.toMillis());
    if ("seconds" in value && typeof value.seconds === "number") return value.seconds * 1000;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return millis(new Date(value));
  return 0;
}
function addedAt(data: Data) {
  return Math.max(...[data.createdAt, data.downloadedAt, data.copiedAt, data.importedAt].map(millis))
    || millis(data.savedAt) || millis(data.updatedAt);
}
function savedPublishedId(data: Data | undefined, uid: string, kind: keyof typeof collections): string | null {
  if (!data || data.uid !== uid || data.deletedAt || data.archived || data.studentArchived || data.spaceId) return null;
  if (kind === "legacy" && data.kind !== "practice" && data.source !== "library") return null;
  const id = text(data.publishedLessonId) || text(data.lessonId);
  return idPattern.test(id) ? id : null;
}
// Mirrors the published_lessons read rule. A saved reference alone cannot grant access.
function readablePublished(data: Data | undefined): data is Data {
  return !!data && !data.deletedAt && (data.isActive === true || data.status === "published" || data.status === "unlisted" || data.published === true);
}
function choice(id: string, data: Data, origin: PosterLessonChoice["origin"], date: number): PosterLessonChoice | null {
  if (data.deletedAt || data.archived || !isPosterReadingLesson(data) || !(text(data.sourceText) || text(data.text))) return null;
  return { id, title: text(data.title), level: text(data.level) || "A1", language: text(data.language) || "nb", addedAt: date, origin };
}

export async function readSavedPosterLesson(db: Firestore, uid: string, selector: string): Promise<Data> {
  const match = selector.match(/^saved:(practice|legacy):([^/\r\n]{1,1500})$/);
  if (!match) throw new PosterError("invalid_input");
  if ([".", ".."].includes(match[2])) throw new PosterError("invalid_input");
  const kind = match[1] as keyof typeof collections;
  const saved = (await db.collection(collections[kind]).doc(match[2]).get()).data();
  const publishedId = savedPublishedId(saved, uid, kind);
  if (!publishedId) throw new PosterError("source_not_found", 404);
  const published = (await db.collection("published_lessons").doc(publishedId).get()).data();
  if (!readablePublished(published)) throw new PosterError("source_not_found", 404);
  return published;
}

export async function listPosterLessons(db: Firestore, uid: string): Promise<PosterLessonChoice[]> {
  // No arbitrary item cap or timestamp orderBy: legacy records without dates remain findable.
  // Only metadata/text are read; student answers and tasks are never fetched.
  const [own, practice, legacy] = await Promise.all([
    db.collection("lessons").where("ownerId", "==", uid).select(...fields).get(),
    db.collection(collections.practice).where("uid", "==", uid).select(...savedFields).get(),
    db.collection(collections.legacy).where("uid", "==", uid).select(...savedFields).get(),
  ]);
  const result: PosterLessonChoice[] = [];
  for (const doc of own.docs) {
    const data = doc.data();
    if (data.ownerId !== uid) continue;
    const origin = data.source === "library" || data.source === "321quiz-library" ? "library" : "own";
    const item = choice(doc.id, data, origin, addedAt(data));
    if (item) result.push(item);
  }
  const saved = new Map<string, { selector: string; date: number }>();
  for (const [kind, snapshot] of [["practice", practice], ["legacy", legacy]] as const) {
    for (const doc of snapshot.docs) {
      const data = doc.data(); const id = savedPublishedId(data, uid, kind);
      if (!id) continue;
      const old = saved.get(id);
      // Both save paths may point to the same library text; show it just once.
      saved.set(id, { selector: old?.selector || `saved:${kind}:${doc.id}`, date: Math.max(old?.date || 0, addedAt(data)) });
    }
  }
  const ids = [...saved.keys()];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const docs = await db.getAll(...ids.slice(offset, offset + 50).map(id => db.collection("published_lessons").doc(id)),
      { fieldMask: [...fields, "isActive", "status", "published"] });
    for (const doc of docs) {
      const data = doc.data(); const entry = saved.get(doc.id)!;
      if (!readablePublished(data)) continue;
      const item = choice(entry.selector, data, "library", entry.date);
      if (item) result.push(item);
    }
  }
  return result.sort((a, b) => b.addedAt - a.addedAt || a.id.localeCompare(b.id));
}
