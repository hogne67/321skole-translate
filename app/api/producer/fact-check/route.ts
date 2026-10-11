import { generateFactCheckReport } from "@/lib/lessons/server/generateFactCheckReport";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { needsEmailVerification, emailVerificationRequiredResponse } from "@/lib/emailVerificationGuard";
import { getFeatureDecisionFromProfile } from "@/lib/featureAccess";
import { factCheckLesson } from "@/lib/lessons/server/factCheck";
import { LessonError, record } from "@/lib/lessons/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { auth, db } = getAdmin();
    const identity = await auth.verifyIdToken(token).catch(() => null);
    if (!identity || identity.firebase?.sign_in_provider === "anonymous") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (needsEmailVerification(identity)) return emailVerificationRequiredResponse();
    const profile = (await db.collection("users").doc(identity.uid).get()).data();
    if (!profile || profile.disabled || !getFeatureDecisionFromProfile({ ...profile, feature: "producer_create_lesson" }).allowed) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    const body = record(await req.json().catch(() => { throw new LessonError("Invalid JSON.", 400); }), "request");
    if (typeof body.lessonId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.lessonId)
      || typeof body.action !== "string" || !["read", "review", "acknowledge"].includes(body.action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const language = body.reportLanguage === "en" ? "English" : body.reportLanguage === "pt" ? "Portuguese" : "Norwegian Bokmål";
    const result = await factCheckLesson(db, identity.uid, body.lessonId, body.action as "read" | "review" | "acknowledge", typeof body.reviewId === "string" ? body.reviewId : undefined, async content => {
      return generateFactCheckReport(content, language);
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LessonError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("lesson_fact_check_failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Fact check failed. Please try again." }, { status: 502 });
  }
}
