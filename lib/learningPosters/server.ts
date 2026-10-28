import "server-only";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import sharp from "sharp";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getAdmin } from "../firebaseAdmin";
import { getFeatureDecisionFromProfile, getQuotaBucket, type FeatureKey } from "../featureAccess";
import { needsEmailVerification } from "../emailVerificationGuard";
import { isPosterReadingLesson, readSavedPosterLesson } from "./sources.server";
import { normalizePlan, normalizedText, PosterError, posterGoalPrompt, posterImagePrompt, posterSuggestionPrompt, sourceWarnings,
  type LearningPoster, type PosterPlan, type PosterSource } from "./model";

// Firestore reorders map keys. Approval must depend on content, not key order.
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item
)).digest("hex");
export const sourceDigest = (text: string) => digest(normalizedText(text));
export async function posterAccount(req: Request, adminFactory = getAdmin) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new PosterError("unauthorized", 401);
  const admin = adminFactory();
  let decoded;
  try { decoded = await admin.auth.verifyIdToken(token, true); }
  catch (error) {
    const accountStatus = accountErrorStatus(error);
    if (accountStatus !== undefined) throw new PosterError(accountStatus === 403 ? "forbidden" : accountStatus === 401 ? "unauthorized" : "authentication_unavailable", accountStatus);
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (["auth/argument-error", "auth/invalid-id-token", "auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found"].includes(String(code))) {
      throw new PosterError("unauthorized", 401);
    }
    // Network/configuration failures do not mean the user has signed out.
    console.error("poster_authentication_unavailable");
    throw new PosterError("authentication_unavailable", 503);
  }
  if (decoded.firebase.sign_in_provider === "anonymous") throw new PosterError("unauthorized", 401);
  const profile = (await admin.db.collection("users").doc(decoded.uid).get()).data();
  if (!profile || profile.disabled || !["teacher", "creator", "admin", "parent"].includes(profile.role)) throw new PosterError("forbidden", 403);
  const decision = getFeatureDecisionFromProfile({ ...profile, feature: "producer_create_lesson" });
  if (!decision.allowed) throw new PosterError("forbidden", 403);
  return { ...admin, uid: decoded.uid, profile, verified: !needsEmailVerification(decoded) };
}
export type PosterAccount = Awaited<ReturnType<typeof posterAccount>>;
export function assertSourceAccess(data: Record<string, unknown> | undefined, uid: string) {
  if (!data || data.ownerId !== uid || data.deletedAt) throw new PosterError("source_not_found", 404);
}
export async function readSource(db: Firestore, uid: string, input: { lessonId?: unknown; text?: unknown; title?: unknown }): Promise<PosterSource> {
  let lessonId: string | null = null; let text: string; let title: string;
  if (typeof input.lessonId === "string" && input.lessonId) {
    lessonId = input.lessonId;
    let data;
    if (lessonId.startsWith("saved:")) data = await readSavedPosterLesson(db, uid, lessonId);
    else {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(lessonId)) throw new PosterError("invalid_input");
      data = (await db.collection("lessons").doc(lessonId).get()).data();
      assertSourceAccess(data, uid);
    }
    if (!isPosterReadingLesson(data!)) throw new PosterError("invalid_source");
    text = typeof data!.sourceText === "string" ? data!.sourceText : typeof data!.text === "string" ? data!.text : "";
    title = typeof data!.title === "string" ? data!.title : "";
  } else {
    text = typeof input.text === "string" ? input.text : "";
    title = typeof input.title === "string" ? input.title.slice(0, 120) : "";
  }
  if (!text.trim() || text.length > 12000) throw new PosterError("invalid_source");
  return { lessonId, title: title.slice(0, 120), text, hash: sourceDigest(text) };
}
export async function ownedPoster(account: PosterAccount, id: string): Promise<LearningPoster> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new PosterError("invalid_input");
  const data = (await account.db.collection("learningPosters").doc(id).get()).data();
  if (!data || data.ownerId !== account.uid) throw new PosterError("poster_not_found", 404);
  return { ...data, id } as LearningPoster;
}
export async function withPosterQuota<T>(account: PosterAccount, feature: FeatureKey, work: () => Promise<T>): Promise<T> {
  if (["ai_generate_text", "ai_image_generate"].includes(feature) && !account.verified) throw new PosterError("email_verification_required", 403);
  const decision = getFeatureDecisionFromProfile({ ...account.profile, feature });
  if (!decision.allowed) throw new PosterError("quota_unavailable", 403);
  const bucket = getQuotaBucket(feature);
  const month = new Date().toISOString().slice(0, 7);
  const usageRef = account.db.doc(`users/${account.uid}/usage/${month}`);
  await account.db.runTransaction(async tx => {
    const used = Number((await tx.get(usageRef)).get(bucket) || 0);
    if (used >= decision.limit) throw new PosterError("quota_exhausted", 403);
    tx.set(usageRef, { [bucket]: used + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  try { return await work(); }
  catch (error) {
    try {
      await account.db.runTransaction(async tx => {
        const used = Number((await tx.get(usageRef)).get(bucket) || 0);
        tx.set(usageRef, { [bucket]: Math.max(0, used - 1) }, { merge: true });
      });
    }
    catch { console.error("poster_quota_refund_failed"); }
    throw error;
  }
}
async function requestPosterSuggestion(prompt: string): Promise<unknown> {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const keys = ["label", "caption", "explanation", "quote", "visualPrompt"];
    const response = await openai.chat.completions.create({
      store: false,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      response_format: { type: "json_schema", json_schema: { name: "learning_poster", strict: true,
        schema: { type: "object", properties: { title: { type: "string" }, goal: { type: "string" }, items: { type: "array",
          items: { type: "object", properties: Object.fromEntries(keys.map(key => [key, { type: "string" }])),
            required: keys, additionalProperties: false } } }, required: ["title", "goal", "items"], additionalProperties: false } } },
    });
    return JSON.parse(response.choices[0]?.message.content || "null");
}
export async function suggestPoster(account: PosterAccount, source: PosterSource, settings: Omit<PosterPlan, "items">,
  createSuggestion: (prompt: string) => Promise<unknown> = requestPosterSuggestion) {
  return withPosterQuota(account, "ai_generate_text", async () => {
    const output = await createSuggestion(posterSuggestionPrompt(source, settings));
    if (!output || typeof output !== "object") throw new PosterError("generation_failed", 502);
    // The teacher's brief guides the proposal; the returned goal is student-facing.
    const plan = normalizePlan({ ...settings, ...output });
    // Never present a paraphrase as an exact source quotation.
    for (const index of sourceWarnings(plan, source.text)) plan.items[index].quote = "";
    return plan;
  });
}
export async function suggestPosterGoal(account: PosterAccount, source: PosterSource, settings: Omit<PosterPlan, "items">) {
  return withPosterQuota(account, "ai_generate_text", async () => {
    const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
      store: false,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "system", content: posterGoalPrompt(source, settings) }],
      response_format: { type: "json_schema", json_schema: { name: "poster_goal", strict: true,
        schema: { type: "object", properties: { goal: { type: "string" } }, required: ["goal"], additionalProperties: false } } },
    });
    const output: unknown = JSON.parse(response.choices[0]?.message.content || "null");
    if (!output || typeof output !== "object" || !("goal" in output) || typeof output.goal !== "string" || !output.goal.trim() || output.goal.length > 240) throw new PosterError("generation_failed", 502);
    return output.goal.trim();
  });
}
export async function savePoster(account: PosterAccount, input: { id?: string; source: PosterSource; plan: unknown; approved?: boolean }) {
  const plan = normalizePlan(input.plan);
  if (sourceWarnings(plan, input.source.text).length) throw new PosterError("invalid_quote");
  const old = input.id ? await ownedPoster(account, input.id) : null;
  const ref = account.db.collection("learningPosters").doc(old?.id || randomUUID());
  const sameVisuals = old && digest(old.plan.items.map(i => i.visualPrompt)) === digest(plan.items.map(i => i.visualPrompt));
  const data = { ownerId: account.uid, source: input.source, plan, images: sameVisuals ? old.images : [],
    reviewedHash: input.approved ? digest(plan) : null, updatedAt: FieldValue.serverTimestamp(),
    ...(!old ? { createdAt: FieldValue.serverTimestamp() } : {}) };
  await ref.set(data, { merge: true });
  return { ...data, id: ref.id } as LearningPoster;
}
type ImageDependencies = {
  createSheet: (prompt: string) => Promise<Buffer>;
  saveImage: (path: string, buffer: Buffer) => Promise<{ path: string; url: string }>;
};
function imageDependencies(account: PosterAccount): ImageDependencies {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new PosterError("generation_failed", 503);
  const bucket = account.storage.bucket(bucketName);
  return {
    createSheet: async prompt => {
      const result = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).images.generate({ model: "gpt-image-1", prompt,
        size: "1536x1024", quality: "medium", output_format: "webp", n: 1 });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new PosterError("generation_failed", 502);
      return Buffer.from(b64, "base64");
    },
    saveImage: async (path, buffer) => {
      const token = randomUUID();
      await bucket.file(path).save(buffer, { resumable: false, contentType: "image/webp",
        metadata: { metadata: { ownerId: account.uid, firebaseStorageDownloadTokens: token } } });
      return { path, url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}` };
    },
  };
}
export async function generatePosterImages(account: PosterAccount, id: string, dependencies?: ImageDependencies) {
  const poster = await ownedPoster(account, id);
  if (poster.reviewedHash !== digest(poster.plan)) throw new PosterError("review_required");
  const current = await readSource(account.db, account.uid, { lessonId: poster.source.lessonId, text: poster.source.text, title: poster.source.title });
  if (current.hash !== poster.source.hash) throw new PosterError("source_changed", 409);
  const deps = dependencies ?? imageDependencies(account);
  const ref = account.db.collection("learningPosters").doc(id);
  const started = Timestamp.now(); const runId = randomUUID();
  await account.db.runTransaction(async tx => {
    const data = (await tx.get(ref)).data();
    if (!data || data.ownerId !== account.uid || data.reviewedHash !== digest(poster.plan) || data.source?.hash !== poster.source.hash) throw new PosterError("review_required");
    if (Date.now() - (data.imageStartedAt?.toMillis?.() || 0) < 180_000) throw new PosterError("generation_busy", 409);
    tx.update(ref, { imageStartedAt: started, imageRunId: runId });
  });
  try {
    return await withPosterQuota(account, "ai_image_generate", async () => {
      const sheet = await sharp(await deps.createSheet(posterImagePrompt(poster.plan))).resize(1536, 1024, { fit: "contain", background: "white" }).toBuffer();
      const images: LearningPoster["images"] = [];
      for (let i = 0; i < poster.plan.items.length; i++) {
        const buffer = await sharp(sheet).extract({ left: (i % 3) * 512, top: Math.floor(i / 3) * 512, width: 512, height: 512 }).webp({ quality: 92 }).toBuffer();
        const path = `learning-posters/${account.uid}/${id}/${runId}-${i}.webp`;
        images.push(await deps.saveImage(path, buffer));
      }
      const latestSource = await readSource(account.db, account.uid, { lessonId: poster.source.lessonId, text: poster.source.text });
      if (latestSource.hash !== poster.source.hash) throw new PosterError("source_changed", 409);
      await account.db.runTransaction(async tx => {
        const data = (await tx.get(ref)).data();
        if (!data || data.imageRunId !== runId || data.reviewedHash !== digest(poster.plan) || data.source?.hash !== poster.source.hash) throw new PosterError("poster_changed", 409);
        tx.update(ref, { images, imageStartedAt: null, updatedAt: FieldValue.serverTimestamp() });
      });
      return { ...poster, images };
    });
  } finally {
    await account.db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      if (data?.imageRunId === runId) tx.update(ref, { imageStartedAt: null });
    }).catch(() => console.error("poster_image_unlock_failed"));
  }
}
