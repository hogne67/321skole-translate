import "server-only";
import sharp from "sharp";
import { normalizePlan, PosterError, type LearningPoster } from "./model";
import { digest, readSource, type PosterAccount } from "./server";
import { resolveSavedPosterLesson } from "./sources.server";
import { renderPosterPng } from "./render.server";
import type { LinkedPosterSummary, PosterContentSummary } from "./content";

function dateMillis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value === "object" && "seconds" in value && typeof value.seconds === "number") return value.seconds * 1000;
  const date = value instanceof Date ? value : typeof value === "number" || typeof value === "string" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.getTime() : 0;
}
export function isFinishedPoster(data: Record<string, unknown>): boolean {
  try {
    const plan = normalizePlan(data.plan);
    return !data.deletedAt && data.reviewedHash === digest(data.plan) && Array.isArray(data.images)
      && data.images.length === plan.items.length && data.images.every(image => image && typeof image.path === "string" && image.path && typeof image.url === "string" && image.url);
  } catch { return false; }
}
async function sourceHref(account: PosterAccount, lessonId: unknown, locale: string): Promise<string | null> {
  if (typeof lessonId !== "string" || !lessonId) return null;
  try {
    if (lessonId.startsWith("saved:")) {
      const source = await resolveSavedPosterLesson(account.db, account.uid, lessonId);
      return `/${locale}/student/lesson/${encodeURIComponent(source.publishedId)}`;
    }
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(lessonId)) return null;
    const source = (await account.db.collection("lessons").doc(lessonId).get()).data();
    return source?.ownerId === account.uid && !source.deletedAt ? `/${locale}/producer/${encodeURIComponent(lessonId)}` : null;
  } catch { return null; }
}
export async function listFinishedPosters(account: PosterAccount, locale: string): Promise<PosterContentSummary[]> {
  const snapshot = await account.db.collection("learningPosters").where("ownerId", "==", account.uid)
    .select("ownerId", "plan", "images", "reviewedHash", "source.lessonId", "source.title", "createdAt", "updatedAt", "deletedAt").get();
  const links = new Map<string, Promise<string | null>>();
  const summaries = await Promise.all(snapshot.docs.map(async doc => {
    const data = doc.data();
    if (data.ownerId !== account.uid || !isFinishedPoster(data)) return null;
    const plan = normalizePlan(data.plan);
    const lessonId = typeof data.source?.lessonId === "string" ? data.source.lessonId : "";
    if (!links.has(lessonId)) links.set(lessonId, sourceHref(account, lessonId, locale));
    return { id: doc.id, title: plan.title, level: plan.level, language: plan.language,
      updatedAt: dateMillis(data.updatedAt) || dateMillis(data.createdAt),
      sourceTitle: typeof data.source?.title === "string" ? data.source.title : "",
      sourceHref: await links.get(lessonId)! };
  }));
  return summaries.filter((item): item is PosterContentSummary => item !== null).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}
export async function listLinkedPosters(account: PosterAccount, lessonId: string): Promise<LinkedPosterSummary[]> {
  // Verify the source account before listing any linked metadata, including draft posters.
  await readSource(account.db, account.uid, { lessonId });
  const snapshot = await account.db.collection("learningPosters").where("ownerId", "==", account.uid)
    .where("source.lessonId", "==", lessonId).select("ownerId", "source.lessonId", "source.text", "source.hash", "plan", "images", "reviewedHash", "updatedAt", "createdAt", "deletedAt").get();
  const result: LinkedPosterSummary[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.ownerId !== account.uid || data.source?.lessonId !== lessonId || data.deletedAt) continue;
    try {
      const plan = normalizePlan(data.plan);
      result.push({ id: doc.id, title: plan.title, level: plan.level, language: plan.language,
        updatedAt: dateMillis(data.updatedAt) || dateMillis(data.createdAt),
        sourceText: typeof data.source?.text === "string" ? data.source.text : "", sourceHash: typeof data.source?.hash === "string" ? data.source.hash : "", ready: isFinishedPoster(data), revision: digest(data.plan), purpose: plan.purpose, imageLabels: plan.items.map(item => item.label) });
    } catch { /* Skip malformed records without hiding other posters for the lesson. */ }
  }
  return result.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}
export async function posterImageData(account: PosterAccount, poster: LearningPoster): Promise<string[]> {
  const bucket = account.storage.bucket(process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  return Promise.all(poster.images.map(async image => {
    if (!image.path.startsWith(`learning-posters/${account.uid}/${poster.id}/`)) throw new PosterError("forbidden", 403);
    const [buffer] = await bucket.file(image.path).download();
    // librsvg does not reliably decode embedded WebP on all server platforms.
    const png = await sharp(buffer).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  }));
}
export async function posterThumbnail(account: PosterAccount, poster: LearningPoster, locale: string) {
  if (poster.ownerId !== account.uid) throw new PosterError("poster_not_found", 404);
  if (!isFinishedPoster(poster)) throw new PosterError("review_required");
  const images = await posterImageData(account, poster);
  return sharp(await renderPosterPng(poster.plan, images, false, locale)).resize(480, 360).webp({ quality: 75 }).toBuffer();
}
