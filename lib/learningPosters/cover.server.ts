import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { FieldValue } from "firebase-admin/firestore";
import { PosterError, type LearningPoster } from "./model";
import { assertSourceAccess, digest, ownedPoster, readSource, sourceDigest, type PosterAccount } from "./server";
import { isFinishedPoster, posterImageData } from "./content.server";
import type { AppliedPosterCover, PosterCoverSelection } from "./cover";

export function coverRevision(poster: LearningPoster): string {
  return digest({ plan: poster.plan, images: poster.images, sourceHash: poster.source.hash, reviewedHash: poster.reviewedHash });
}
export function validateCoverSelection(value: unknown, count: number): asserts value is PosterCoverSelection {
  if (value !== "all" && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= count)) throw new PosterError("invalid_input");
}
// Compose only the original raster illustrations: no poster text, labels or branding.
export async function renderPosterCover(images: Buffer[], selection: PosterCoverSelection): Promise<Buffer> {
  if (images.length < 1 || images.length > 6) throw new PosterError("images_required");
  validateCoverSelection(selection, images.length);
  const chosen = selection === "all" ? images : [images[selection]];
  const width = 1920, height = 1080, gap = 24;
  const columns = chosen.length === 4 ? 2 : Math.min(chosen.length, 3);
  const rows = Math.ceil(chosen.length / columns);
  const cellWidth = Math.floor((width - gap * (columns + 1)) / columns);
  const cellHeight = Math.floor((height - gap * (rows + 1)) / rows);
  const layers = await Promise.all(chosen.map(async (buffer, index) => {
    const row = Math.floor(index / columns), column = index % columns;
    const rowCount = Math.min(columns, chosen.length - row * columns);
    const rowWidth = rowCount * cellWidth + (rowCount - 1) * gap;
    return { input: await sharp(buffer).rotate().resize(cellWidth, cellHeight, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toBuffer(),
      left: Math.floor((width - rowWidth) / 2) + column * (cellWidth + gap), top: gap + row * (cellHeight + gap) };
  }));
  return sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).composite(layers).webp({ quality: 92 }).toBuffer();
}
type CoverInput = { lessonId: string; posterId: string; selection: PosterCoverSelection };
async function checkedPoster(account: PosterAccount, input: CoverInput) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(input.lessonId) || !/^[A-Za-z0-9_-]{1,200}$/.test(input.posterId)) throw new PosterError("invalid_input");
  const source = await readSource(account.db, account.uid, { lessonId: input.lessonId });
  const poster = await ownedPoster(account, input.posterId);
  if (poster.source.lessonId !== input.lessonId) throw new PosterError("invalid_source");
  if (!isFinishedPoster(poster)) throw new PosterError("review_required");
  if (poster.source.hash !== source.hash) throw new PosterError("source_changed", 409);
  validateCoverSelection(input.selection, poster.images.length);
  return poster;
}
async function render(account: PosterAccount, poster: LearningPoster, selection: PosterCoverSelection) {
  const images = await posterImageData(account, poster);
  return renderPosterCover(images.map(data => Buffer.from(data.slice(data.indexOf(",") + 1), "base64")), selection);
}
export async function previewLessonPosterCover(account: PosterAccount, input: CoverInput) {
  const poster = await checkedPoster(account, input);
  return { buffer: await render(account, poster, input.selection), revision: coverRevision(poster) };
}
type CoverDependencies = { saveCover: (path: string, buffer: Buffer) => Promise<string> };
export async function applyLessonPosterCover(account: PosterAccount, input: CoverInput & { revision: string }, dependencies?: CoverDependencies): Promise<AppliedPosterCover> {
  if (!/^[a-f0-9]{64}$/.test(input.revision)) throw new PosterError("invalid_input");
  const poster = await checkedPoster(account, input);
  if (coverRevision(poster) !== input.revision) throw new PosterError("cover_changed", 409);
  const buffer = await render(account, poster, input.selection);
  const path = `learning-posters/${account.uid}/${poster.id}/covers/${randomUUID()}.webp`;
  let coverImageUrl: string;
  if (dependencies) coverImageUrl = await dependencies.saveCover(path, buffer);
  else {
    const bucket = account.storage.bucket(process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    const token = randomUUID();
    await bucket.file(path).save(buffer, { resumable: false, contentType: "image/webp", metadata: { metadata: { ownerId: account.uid, firebaseStorageDownloadTokens: token } } });
    coverImageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  }
  const cover: AppliedPosterCover = { coverImageUrl, coverImageFormat: "16:9", coverImageSource: "ai", coverImageCredit: "321school · AI", aiCoverPrompt: "" };
  const lessonRef = account.db.collection("lessons").doc(input.lessonId);
  await account.db.runTransaction(async tx => {
    const lesson = (await tx.get(lessonRef)).data();
    assertSourceAccess(lesson, account.uid);
    const latest = (await tx.get(account.db.collection("learningPosters").doc(input.posterId))).data();
    if (!latest || latest.ownerId !== account.uid || latest.source?.lessonId !== input.lessonId || !isFinishedPoster(latest)) throw new PosterError("review_required", 409);
    if (sourceDigest(typeof lesson!.sourceText === "string" ? lesson!.sourceText : String(lesson!.text || "")) !== poster.source.hash || latest.source?.hash !== poster.source.hash) throw new PosterError("source_changed", 409);
    if (coverRevision(latest as LearningPoster) !== input.revision) throw new PosterError("cover_changed", 409);
    tx.update(lessonRef, { ...cover, imageUrl: coverImageUrl, updatedAt: FieldValue.serverTimestamp() });
  });
  return cover;
}
