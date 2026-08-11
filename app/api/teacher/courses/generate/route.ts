import "server-only";

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { canAccessAcademy, hasAdminAccess } from "@/lib/courses/academyAccess";
import { consumeFeatureAdmin, getFeatureStatusAdmin } from "@/lib/featureGuardAdmin";
import { getEffectivePlan } from "@/lib/featureAccess";
import { emailVerificationRequiredResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";

export const runtime = "nodejs";

type GenerateCourseBody = {
  kind?: unknown;
  subject?: unknown;
  subtopic?: unknown;
  additionalDescription?: unknown;
  level?: unknown;
  audience?: unknown;
  language?: unknown;
  numberOfSessions?: unknown;
  durationMinutes?: unknown;
  title?: unknown;
  description?: unknown;
  learningGoals?: unknown;
};

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

function safeNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
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

async function requireAcademyAccess(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  if (needsEmailVerification(decoded)) {
    return { error: emailVerificationRequiredResponse() };
  }
  const uid = decoded.uid;
  const profileSnap = await db.collection("users").doc(uid).get();
  const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};

  if (!isTeacherOrAdmin(profile) || !canAccessAcademy(profile)) {
    return { error: json({ error: "No academy access" }, 403) };
  }

  return { uid, profile };
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

function parseProposal(value: unknown) {
  const record = isRecord(value) ? value : {};

  return {
    title: safeString(record.title).slice(0, 120),
    description: safeString(record.description).slice(0, 1200),
    learningGoals: safeString(record.learningGoals).slice(0, 1600),
    targetAudience: safeString(record.targetAudience).slice(0, 800),
    level: safeString(record.level).slice(0, 80),
    language: safeString(record.language).slice(0, 80),
    priceText: safeString(record.priceText).slice(0, 160),
  };
}

function parseCoursePlan(value: unknown, numberOfSessions: number, durationMinutes: number) {
  const record = isRecord(value) ? value : {};
  const sessions = Array.isArray(record.sessions) ? record.sessions : [];

  return sessions.slice(0, numberOfSessions).map((item, index) => {
    const session = isRecord(item) ? item : {};
    return {
      sessionNumber: index + 1,
      title: safeString(session.title).slice(0, 120),
      description: safeString(session.description).slice(0, 1000),
      contentSuggestions: safeString(session.contentSuggestions).slice(0, 1000),
      homework: safeString(session.homework).slice(0, 600),
      startsAt: "",
      durationMinutes,
      meetingUrl: "",
      status: "planned",
    };
  });
}

export async function POST(req: Request) {
  try {
    const access = await requireAcademyAccess(req);
    if ("error" in access) return access.error;
    const profile = access.profile as Record<string, unknown>;
    const role = typeof profile.role === "string" ? profile.role : "teacher";
    const plan = getProfilePlan(profile);

    const featureStatus = await getFeatureStatusAdmin({
      uid: access.uid,
      role,
      plan,
      feature: "ai_generate_text",
    });
    if (!featureStatus.allowed) return quotaErrorResponse(featureStatus.reason);

    if (!process.env.OPENAI_API_KEY) {
      return json({ error: "OPENAI_API_KEY is not configured" }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as GenerateCourseBody;
    const subject = safeString(body.subject) || "norsk";
    const subtopic = safeString(body.subtopic) || "grammatikk";
    const additionalDescription = safeString(body.additionalDescription).slice(0, 1200);
    const level = safeString(body.level) || "A2";
    const audience = safeString(body.audience) || "voksne";
    const language = safeString(body.language) || "Norsk";
    const numberOfSessions = safeNumber(body.numberOfSessions, 6);
    const durationMinutes = safeNumber(body.durationMinutes, 120);
    const kind = safeString(body.kind) || "admin";

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    if (kind === "coursePlan") {
      const title = safeString(body.title) || "Uten tittel";
      const description = safeString(body.description).slice(0, 1200);
      const learningGoals = safeString(body.learningGoals).slice(0, 1600);

      const response = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        text: { format: { type: "json_object" } },
        temperature: 0.35,
        input: [
          {
            role: "system",
            content:
              "You design simple course session plans for teacher-led courses. Return JSON only. Do not create concrete exercises, full texts, quizzes, assignments, or lesson content.",
          },
          {
            role: "user",
            content: `
Create a high-level course plan with ${numberOfSessions} sessions.

Course frame:
- Course title: ${title}
- Description: ${description || "No description yet."}
- Learning goals: ${learningGoals || "No learning goals yet."}
- Subject: ${subject}
- Subtopic: ${subtopic}
- Teacher's additional description: ${additionalDescription || "No extra description provided."}
- CEFR/level: ${level}
- Learner group: ${audience}
- Course language: ${language}
- Duration per session: ${durationMinutes} minutes

Important:
- Only suggest themes and content directions.
- Do NOT generate concrete tasks, full texts, quizzes, lesson pages or detailed exercises.
- contentSuggestions can mention types such as short reading text, dialogue, vocabulary work, discussion, practical example, reflection, or simple writing practice.
- homework should be optional/light and described as a suggestion, not a full assignment.
- Write in the course language where natural.

Return exact JSON:
{
  "sessions": [
    {
      "sessionNumber": number,
      "title": string,
      "description": string,
      "contentSuggestions": string,
      "homework": string
    }
  ]
}
            `.trim(),
          },
        ],
      });

      const output = response.output_text?.trim() || "{}";
      const coursePlan = parseCoursePlan(JSON.parse(output), numberOfSessions, durationMinutes);
      if (coursePlan.length === 0) return json({ error: "Could not generate course plan" }, 500);
      await consumeFeatureAdmin({ uid: access.uid, feature: "ai_generate_text" });
      const quotaAfter = await getFeatureStatusAdmin({
        uid: access.uid,
        role,
        plan,
        feature: "ai_generate_text",
      });
      return json({
        coursePlan,
        quota: {
          feature: "ai_generate_text",
          bucket: quotaAfter.bucket,
          limit: quotaAfter.limit,
          used: quotaAfter.used,
          remaining: quotaAfter.remaining,
        },
      }, 200);
    }

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      text: { format: { type: "json_object" } },
      temperature: 0.35,
      input: [
        {
          role: "system",
          content:
            "You design practical teacher-led courses for 321Academy. Return JSON only. Keep the course realistic, concrete, and suitable for the selected learner group.",
        },
        {
          role: "user",
          content: `
Create an administrative course proposal.

Practical choices:
- Subject: ${subject}
- Subtopic: ${subtopic}
- Teacher's additional description: ${additionalDescription || "No extra description provided."}
- CEFR/level: ${level}
- Learner group: ${audience}
- Course language: ${language}
- Number of sessions: ${numberOfSessions}
- Duration per session: ${durationMinutes} minutes

Write the proposal in the course language where natural.
Learning goals should be a short bullet-style plain text list.
Do not mention payment, AI, video integrations, automatic enrollment, Lessons, Spaces or Library.

Return exact JSON:
{
  "title": string,
  "description": string,
  "learningGoals": string,
  "targetAudience": string,
  "level": string,
  "language": string,
  "priceText": string
}
          `.trim(),
        },
      ],
    });

    const output = response.output_text?.trim() || "{}";
    const proposal = parseProposal(JSON.parse(output));

    if (!proposal.title || !proposal.description) {
      return json({ error: "Could not generate a complete course proposal" }, 500);
    }

    await consumeFeatureAdmin({ uid: access.uid, feature: "ai_generate_text" });
    const quotaAfter = await getFeatureStatusAdmin({
      uid: access.uid,
      role,
      plan,
      feature: "ai_generate_text",
    });

    return json({
      proposal,
      quota: {
        feature: "ai_generate_text",
        bucket: quotaAfter.bucket,
        limit: quotaAfter.limit,
        used: quotaAfter.used,
        remaining: quotaAfter.remaining,
      },
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate course";
    return json({ error: message }, 500);
  }
}
