import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { FieldValue } from "firebase-admin/firestore";
import { PosterError } from "./model";
import { assertSourceAccess, digest, ownedPoster, readSource, sourceDigest, type PosterAccount } from "./server";
import { isFinishedPoster, posterImageData } from "./content.server";
import { readPosterAttachments, type PosterAttachment } from "./attachments";
import { renderPosterPng } from "./render.server";

type SnapshotDependencies = { saveSnapshot: (path: string, buffer: Buffer) => Promise<string> };
function snapshotDependencies(account: PosterAccount): SnapshotDependencies {
  const bucket = account.storage.bucket(process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  return { saveSnapshot: async (path, buffer) => {
    const token = randomUUID();
    await bucket.file(path).save(buffer, { resumable: false, contentType: "image/webp", metadata: { metadata: { ownerId: account.uid, firebaseStorageDownloadTokens: token } } });
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  } };
}
export async function setLessonPosterAttachment(account: PosterAccount, input: { lessonId: string; posterId: string; enabled: boolean }, locale: string, dependencies?: SnapshotDependencies) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(input.lessonId) || !/^[A-Za-z0-9_-]{1,200}$/.test(input.posterId)) throw new PosterError("invalid_input");
  const source = await readSource(account.db, account.uid, { lessonId: input.lessonId });
  const lessonRef = account.db.collection("lessons").doc(input.lessonId);
  let attachment: PosterAttachment | null = null;
  if (input.enabled) {
    const poster = await ownedPoster(account, input.posterId);
    if (poster.source.lessonId !== input.lessonId) throw new PosterError("invalid_source");
    if (!isFinishedPoster(poster)) throw new PosterError("review_required");
    if (poster.source.hash !== source.hash) throw new PosterError("source_changed", 409);
    const images = await posterImageData(account, poster);
    const buffer = await sharp(await renderPosterPng(poster.plan, images, false, locale)).webp({ quality: 90 }).toBuffer();
    const path = `learning-posters/${account.uid}/${poster.id}/attachments/${randomUUID()}.webp`;
    const imageUrl = await (dependencies ?? snapshotDependencies(account)).saveSnapshot(path, buffer);
    attachment = { posterId: poster.id, title: poster.plan.title, imageUrl, purpose: poster.plan.purpose, sourceHash: source.hash, planHash: digest(poster.plan) };
  }
  const candidate = attachment;
  return account.db.runTransaction(async tx => {
    const lesson = (await tx.get(lessonRef)).data();
    assertSourceAccess(lesson, account.uid);
    if (candidate) {
      const poster = (await tx.get(account.db.collection("learningPosters").doc(input.posterId))).data();
      if (!poster || poster.ownerId !== account.uid || poster.source?.lessonId !== input.lessonId || !isFinishedPoster(poster) || digest(poster.plan) !== candidate.planHash) throw new PosterError("review_required", 409);
      if (sourceDigest(typeof lesson!.sourceText === "string" ? lesson!.sourceText : String(lesson!.text || "")) !== candidate.sourceHash || poster.source?.hash !== candidate.sourceHash) throw new PosterError("source_changed", 409);
    }
    const attachments = readPosterAttachments(lesson!.learningPosterAttachments).filter(item => item.posterId !== input.posterId);
    if (candidate) {
      if (attachments.length >= 6) throw new PosterError("attachment_limit");
      attachments.push(candidate);
    }
    tx.update(lessonRef, { learningPosterAttachments: attachments, updatedAt: FieldValue.serverTimestamp() });
    return attachments;
  });
}
