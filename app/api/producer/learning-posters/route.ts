import { NextResponse } from "next/server";
import { normalizePosterSettings, PosterError, type PosterPlan } from "@/lib/learningPosters/model";
import { digest, generatePosterImages, ownedPoster, posterAccount, readSource, savePoster, suggestPoster, suggestPosterGoal, withPosterQuota } from "@/lib/learningPosters/server";
import { renderPosterPng } from "@/lib/learningPosters/render.server";
import { listPosterLessons } from "@/lib/learningPosters/sources.server";
import { listFinishedPosters, listLinkedPosters, posterImageData, posterThumbnail } from "@/lib/learningPosters/content.server";
import { setLessonPosterAttachment } from "@/lib/learningPosters/attachments.server";
import { readPosterAttachments } from "@/lib/learningPosters/attachments";
import { applyLessonPosterCover, previewLessonPosterCover } from "@/lib/learningPosters/cover.server";
import type { PosterCoverSelection } from "@/lib/learningPosters/cover";

export const runtime = "nodejs";
export const maxDuration = 180;
function failure(error: unknown) {
  const status = error instanceof PosterError ? error.status : 500;
  if (!(error instanceof PosterError)) console.error("learning_poster_request_failed");
  return NextResponse.json({ ok: false, reason: error instanceof PosterError ? error.reason : "generation_failed" }, { status });
}
export async function GET(req: Request) {
  try {
    const account = await posterAccount(req);
    const params = new URL(req.url).searchParams;
    const locale = ["nb", "en", "pt"].includes(params.get("locale") || "") ? params.get("locale")! : "nb";
    const linkedLessonId = params.get("linkedLessonId");
    if (linkedLessonId) {
      const posters = await listLinkedPosters(account, linkedLessonId);
      const lesson = (await account.db.collection("lessons").doc(linkedLessonId).get()).data();
      return NextResponse.json({ ok: true, posters, attachments: readPosterAttachments(lesson?.learningPosterAttachments) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (params.get("content") === "1") {
      return NextResponse.json({ ok: true, posters: await listFinishedPosters(account, locale) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const posterId = params.get("posterId");
    if (posterId) {
      const poster = await ownedPoster(account, posterId);
      if (params.get("thumbnail") === "1") {
        const thumbnail = await posterThumbnail(account, poster, locale);
        return new Response(new Uint8Array(thumbnail), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=60", Vary: "Authorization" } });
      }
      let stale = true;
      try {
        const source = await readSource(account.db, account.uid, { lessonId: poster.source.lessonId, text: poster.source.text });
        stale = source.hash !== poster.source.hash;
      } catch { /* A deleted or inaccessible source needs review. */ }
      if (params.get("download") === "png") {
        if (stale || poster.reviewedHash !== digest(poster.plan)) throw new PosterError("review_required");
        if (poster.images.length !== poster.plan.items.length) throw new PosterError("images_required");
        const images = await posterImageData(account, poster);
        const png = await withPosterQuota(account, "image_download", () => renderPosterPng(poster.plan, images, params.get("hideText") === "1", locale));
        return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": 'attachment; filename="321school-learning-poster.png"', "Cache-Control": "private, no-store" } });
      }
      return NextResponse.json({ ok: true, poster: { ...poster, stale } });
    }
    const lessonId = params.get("lessonId");
    const [lessons, posters] = await Promise.all([
      listPosterLessons(account.db, account.uid),
      account.db.collection("learningPosters").where("ownerId", "==", account.uid).limit(100).get(),
    ]);
    const source = lessonId ? await readSource(account.db, account.uid, { lessonId }) : null;
    return NextResponse.json({ ok: true, source,
      lessons,
      posters: posters.docs.filter(doc => !lessonId || doc.get("source")?.lessonId === lessonId).map(doc => ({
        id: doc.id, title: doc.get("plan")?.title || "", sourceText: doc.get("source")?.text || "" })),
    });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    const account = await posterAccount(req);
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some(key => !["action", "id", "source", "settings", "plan", "approved", "lessonId", "posterId", "enabled", "selection", "revision"].includes(key))) throw new PosterError("invalid_input");
    const data = body as Record<string, unknown>;
    if (data.action === "cover-preview" || data.action === "cover-apply") {
      if (typeof data.lessonId !== "string" || typeof data.posterId !== "string" || (data.selection !== "all" && typeof data.selection !== "number")) throw new PosterError("invalid_input");
      const input = { lessonId: data.lessonId, posterId: data.posterId, selection: data.selection as PosterCoverSelection };
      if (data.action === "cover-preview") {
        const preview = await previewLessonPosterCover(account, input);
        return new Response(new Uint8Array(preview.buffer), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Poster-Revision": preview.revision } });
      }
      if (typeof data.revision !== "string") throw new PosterError("invalid_input");
      return NextResponse.json({ ok: true, cover: await applyLessonPosterCover(account, { ...input, revision: data.revision }) });
    }
    if (data.action === "attachment") {
      if (typeof data.lessonId !== "string" || typeof data.posterId !== "string" || typeof data.enabled !== "boolean") throw new PosterError("invalid_input");
      const selectedLocale = new URL(req.url).searchParams.get("locale");
      const locale = selectedLocale && ["nb", "en", "pt"].includes(selectedLocale) ? selectedLocale : "nb";
      return NextResponse.json({ ok: true, attachments: await setLessonPosterAttachment(account, { lessonId: data.lessonId, posterId: data.posterId, enabled: data.enabled }, locale) });
    }
    if (data.action === "generate") {
      if (typeof data.id !== "string") throw new PosterError("invalid_input");
      return NextResponse.json({ ok: true, poster: await generatePosterImages(account, data.id) });
    }
    if (!data.source || typeof data.source !== "object" || Array.isArray(data.source)) throw new PosterError("invalid_source");
    const supplied = data.source as Record<string, unknown>;
    const source = await readSource(account.db, account.uid, supplied);
    if (source.lessonId && supplied.hash !== source.hash) throw new PosterError("source_changed", 409);
    if (data.action === "suggest" || data.action === "suggest-goal") {
      const settings = normalizePosterSettings(data.settings);
      if (data.action === "suggest-goal") return NextResponse.json({ ok: true, goal: await suggestPosterGoal(account, source, settings) });
      const plan = await suggestPoster(account, source, settings);
      return NextResponse.json({ ok: true, plan });
    }
    if (data.action !== "save" || (data.id !== undefined && typeof data.id !== "string")) throw new PosterError("invalid_input");
    return NextResponse.json({ ok: true, poster: await savePoster(account, {
      id: data.id as string | undefined, source, plan: data.plan as PosterPlan, approved: data.approved === true,
    }) });
  } catch (error) { return failure(error); }
}
