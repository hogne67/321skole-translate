import "server-only";

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { canAccessAcademy, hasAdminAccess } from "@/lib/courses/academyAccess";
import { normalizeCourse, normalizeCourseMarketing } from "@/lib/courses/types";
import { consumeFeatureAdmin, getFeatureStatusAdmin } from "@/lib/featureGuardAdmin";
import { getEffectivePlan } from "@/lib/featureAccess";
import { emailVerificationRequiredResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTeacherOrAdmin(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  if (hasAdminAccess(profile)) return true;

  const roles = isRecord(profile.roles) ? profile.roles : null;
  return profile.role === "teacher" || roles?.teacher === true;
}

function parseMarketing(value: unknown) {
  const record = isRecord(value) ? value : {};

  return {
    summary: safeString(record.summary).slice(0, 500),
    salesText: safeString(record.salesText).slice(0, 1800),
    seoTitle: safeString(record.seoTitle).slice(0, 80),
    seoDescription: safeString(record.seoDescription).slice(0, 180),
  };
}

function getProfilePlan(profile: Record<string, unknown>): string {
  return getEffectivePlan({
    plan: typeof profile.plan === "string" ? profile.plan : null,
    billing:
      profile.billing && typeof profile.billing === "object"
        ? (profile.billing as { plan?: string | null; status?: string | null })
        : null,
    partnerAccess: profile.partnerAccess === true,
    partnerStatus: typeof profile.partnerStatus === "string" ? profile.partnerStatus : null,
    schoolId: typeof profile.schoolId === "string" ? profile.schoolId : null,
    schoolRole: typeof profile.schoolRole === "string" ? profile.schoolRole : null,
    schoolStatus: typeof profile.schoolStatus === "string" ? profile.schoolStatus : null,
  });
}

function quotaErrorResponse(reason?: string) {
  if (reason === "limit_reached") return json({ error: "You have reached your monthly AI generation limit." }, 429);
  return json({ error: "AI generation is not available on your current plan." }, 403);
}

export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { courseId } = await ctx.params;
    if (!courseId) return json({ error: "Missing courseId" }, 400);

    if (!process.env.OPENAI_API_KEY) {
      return json({ error: "OPENAI_API_KEY is not configured" }, 500);
    }

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    if (needsEmailVerification(decoded)) {
      return emailVerificationRequiredResponse();
    }
    const uid = decoded.uid;

    const profileSnap = await db.collection("users").doc(uid).get();
    const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};
    const isAdmin = hasAdminAccess(profile);

    if (!isTeacherOrAdmin(profile) || !canAccessAcademy(profile)) {
      return json({ error: "No academy access" }, 403);
    }

    const featureStatus = await getFeatureStatusAdmin({
      uid,
      role: typeof profile.role === "string" ? profile.role : "teacher",
      plan: getProfilePlan(profile),
      feature: "ai_generate_text",
    });
    if (!featureStatus.allowed) return quotaErrorResponse(featureStatus.reason);

    const courseSnap = await db.collection("courses").doc(courseId).get();
    if (!courseSnap.exists) return json({ error: "Course not found" }, 404);

    const data = courseSnap.data() ?? {};
    if (!isAdmin && data.ownerUid !== uid) return json({ error: "No access" }, 403);

    const course = normalizeCourse(courseSnap.id, data as Record<string, unknown>);
    const marketing = normalizeCourseMarketing(data.marketing);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      text: { format: { type: "json_object" } },
      temperature: 0.45,
      input: [
        {
          role: "system",
          content:
            "You write clear, trustworthy marketing copy for teacher-led courses. Return JSON only. Do not overpromise results. Do not mention AI, payment, Stripe, video integrations, automatic enrollment, Lessons, Spaces or Library.",
        },
        {
          role: "user",
          content: `
Create marketing text for this course.

Course data:
- Title: ${course.title}
- Description: ${course.description}
- Learning goals: ${course.learningGoals}
- Target audience: ${course.targetAudience}
- Language: ${course.language}
- Level: ${course.level}
- Price text: ${course.priceText}
- Number of sessions: ${course.numberOfSessions}
- Number of weeks: ${course.numberOfWeeks}

Existing marketing draft:
- Short public summary: ${marketing.summary || "Empty"}
- Sales text: ${marketing.salesText || "Empty"}
- SEO title: ${marketing.seoTitle || "Empty"}
- SEO description: ${marketing.seoDescription || "Empty"}

Write in the course language where natural.

Tone:
- Professional, positive and concrete.
- This is a course/product we want people to sign up for.
- Make the benefits clear without sounding like hype.
- Emphasize practical value, confidence, progress and good learning outcomes.

Field requirements:
- summary: 2-3 short sentences for the top of the public course page.
- salesText: 2-4 short paragraphs about who the course is for, what participants get, and why it is valuable.
- seoTitle: max 60 characters if possible.
- seoDescription: max 155 characters if possible.

Return exact JSON:
{
  "summary": string,
  "salesText": string,
  "seoTitle": string,
  "seoDescription": string
}
          `.trim(),
        },
      ],
    });

    const output = response.output_text?.trim() || "{}";
    const proposal = parseMarketing(JSON.parse(output));

    if (!proposal.summary || !proposal.salesText) {
      return json({ error: "Could not generate marketing text" }, 500);
    }

    await consumeFeatureAdmin({ uid, feature: "ai_generate_text" });
    const quotaAfter = await getFeatureStatusAdmin({
      uid,
      role: typeof profile.role === "string" ? profile.role : "teacher",
      plan: getProfilePlan(profile),
      feature: "ai_generate_text",
    });

    return json({
      marketing: proposal,
      quota: {
        feature: "ai_generate_text",
        bucket: quotaAfter.bucket,
        limit: quotaAfter.limit,
        used: quotaAfter.used,
        remaining: quotaAfter.remaining,
      },
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate marketing text";
    return json({ error: message }, 500);
  }
}
