import "server-only";

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/courses/academyAccess";
import { getAdmin } from "@/lib/firebaseAdmin";
import { consumeFeatureAdmin, getFeatureStatusAdmin } from "@/lib/featureGuardAdmin";
import { getEffectivePlan } from "@/lib/featureAccess";
import {
  normalizeCurriculumSource,
  normalizePlannerDocument,
  normalizePlannerFrame,
} from "@/lib/planner/types";

export const runtime = "nodejs";

type GeneratePlannerBody = {
  frame?: unknown;
  curriculum?: unknown;
  document?: unknown;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTeacherOrAdmin(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  if (hasAdminAccess(profile)) return true;

  const roles = isRecord(profile.roles) ? profile.roles : null;
  return profile.role === "teacher" || roles?.teacher === true;
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

async function requireTeacherAccess(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;
  const profileSnap = await db.collection("users").doc(uid).get();
  const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};

  if (!isTeacherOrAdmin(profile)) return { error: json({ error: "No teacher access" }, 403) };
  return { uid, profile: profile as Record<string, unknown> };
}

function quotaErrorResponse(reason?: string) {
  if (reason === "limit_reached") return json({ error: "You have reached your monthly AI generation limit." }, 429);
  return json({ error: "AI generation is not available on your current plan." }, 403);
}

export async function POST(req: Request) {
  try {
    const access = await requireTeacherAccess(req);
    if ("error" in access) return access.error;

    const profile = access.profile;
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

    const body = (await req.json().catch(() => ({}))) as GeneratePlannerBody;
    const frame = normalizePlannerFrame(body.frame);
    const curriculum = normalizeCurriculumSource(body.curriculum);
    const currentDocument = normalizePlannerDocument(body.document);
    const detailInstruction =
      frame.aiLevel === "short"
        ? "Keep each section compact and practical."
        : frame.aiLevel === "detailed"
          ? "Make the plan detailed enough to guide real teaching across the full year."
          : "Use a balanced level of detail.";

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      text: { format: { type: "json_object" } },
      temperature: 0.35,
      input: [
        {
          role: "system",
          content:
            "You create editable school planning documents for teachers. Return JSON only. Do not invent official curriculum codes unless the user provided them.",
        },
        {
          role: "user",
          content: `
Create a first draft for 321Planner.

Frame:
- Country: ${frame.country}
- School type: ${frame.schoolType}
- Subject: ${frame.subject}
- Level: ${frame.level}
- Language for the plan: ${frame.language}
- School year: ${frame.schoolYear}
- Teaching weeks: ${frame.teachingWeeks}
- Total hours: ${frame.totalHours}
- Focus area: ${frame.focusArea || "No special focus area"}
- Plan type: ${frame.planType}
- Detail level: ${frame.aiLevel}
- Individual learner: ${currentDocument.individualDetails.learnerName || "Not specified"}
- Individual context: ${currentDocument.individualDetails.learnerContext || "Not specified"}
- Individual adaptations/focus: ${currentDocument.individualDetails.adaptations || "Not specified"}

Curriculum basis:
- Source type: ${curriculum.type}
- Framework: ${curriculum.framework || "Not specified"}
- Teacher text: ${curriculum.customText || "No custom text"}
- Uploaded document name: ${curriculum.uploadName || "No uploaded document"}

${detailInstruction}
The plan must remain editable and teacher-owned. Include assessment and reflection fields.
For Norway, refer broadly to LK20/FOV elements when relevant, but avoid fabricated exact competence goal IDs.
For individual plans, focus on adapted progression and support while preserving dignity and professional language.

Return exact JSON:
{
  "title": string,
  "description": string,
  "subjectRelevance": string,
  "coreValues": string,
  "coreElements": string,
  "interdisciplinaryThemes": string,
  "basicSkills": string,
  "learningGoals": string,
  "assessmentForms": string,
  "workMethods": string,
  "annualOverview": string,
  "reflection": string,
  "individualDetails": {
    "learnerName": string,
    "learnerContext": string,
    "supportNeeds": string,
    "adaptations": string,
    "progression": string,
    "collaboration": string,
    "evaluation": string
  },
  "periods": [
    {
      "id": string,
      "title": string,
      "weeks": string,
      "goals": string,
      "content": string,
      "methods": string,
      "assessment": string,
      "reflection": string,
      "weekPlans": []
    }
  ],
  "activities": [
    {
      "id": string,
      "title": string,
      "period": string,
      "description": string,
      "method": string,
      "assessment": string
    }
  ]
}
          `.trim(),
        },
      ],
    });

    const output = response.output_text?.trim() || "{}";
    const document = normalizePlannerDocument(JSON.parse(output));
    if (!document.title || document.periods.length === 0) {
      return json({ error: "Could not generate a complete planner draft" }, 500);
    }

    await consumeFeatureAdmin({ uid: access.uid, feature: "ai_generate_text" });
    const quotaAfter = await getFeatureStatusAdmin({
      uid: access.uid,
      role,
      plan,
      feature: "ai_generate_text",
    });

    return json({
      document,
      quota: {
        feature: "ai_generate_text",
        bucket: quotaAfter.bucket,
        limit: quotaAfter.limit,
        used: quotaAfter.used,
        remaining: quotaAfter.remaining,
      },
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate planner";
    return json({ error: message }, 500);
  }
}
