import "server-only";

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/courses/academyAccess";
import { getAdmin } from "@/lib/firebaseAdmin";
import { consumeFeatureAdmin, getFeatureStatusAdmin } from "@/lib/featureGuardAdmin";
import { getEffectivePlan } from "@/lib/featureAccess";
import {
  normalizeCurriculumSource,
  normalizePlannerActivity,
  normalizePlannerConcreteLearningGoal,
  normalizePlannerDocument,
  normalizePlannerFrame,
  normalizePlannerPeriod,
  normalizePlannerWeekPlan,
  type PlannerActivity,
  type PlannerConcreteLearningGoal,
  type PlannerPeriod,
  type PlannerWeekPlan,
} from "@/lib/planner/types";

export const runtime = "nodejs";

type GenerateSectionBody = {
  kind?: unknown;
  periodIndex?: unknown;
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

function parsePeriods(value: unknown): PlannerPeriod[] {
  const record = isRecord(value) ? value : {};
  const periods = Array.isArray(record.periods) ? record.periods : [];
  return periods.map((period, index) => normalizePlannerPeriod(period, index));
}

function parseActivities(value: unknown): PlannerActivity[] {
  const record = isRecord(value) ? value : {};
  const activities = Array.isArray(record.activities) ? record.activities : [];
  return activities.map((activity, index) => normalizePlannerActivity(activity, index));
}

function parseWeekPlans(value: unknown): PlannerWeekPlan[] {
  const record = isRecord(value) ? value : {};
  const weekPlans = Array.isArray(record.weekPlans) ? record.weekPlans : [];
  return weekPlans.map((weekPlan, index) => normalizePlannerWeekPlan(weekPlan, index));
}

function parseConcreteLearningGoals(value: unknown): PlannerConcreteLearningGoal[] {
  const record = isRecord(value) ? value : {};
  const goals = Array.isArray(record.concreteLearningGoals) ? record.concreteLearningGoals : [];
  return goals
    .map((goal, index) => normalizePlannerConcreteLearningGoal(goal, index))
    .filter((goal) => goal.goal.trim() || goal.studentLanguage.trim() || goal.evidence.trim())
    .slice(0, 4);
}

function parseGoalLinks(value: unknown) {
  const record = isRecord(value) ? value : {};
  const periodLinks = Array.isArray(record.periodLinks)
    ? record.periodLinks
        .map((item) => {
          const link = isRecord(item) ? item : {};
          return {
            periodId: typeof link.periodId === "string" ? link.periodId : "",
            linkedGoalIds: Array.isArray(link.linkedGoalIds)
              ? link.linkedGoalIds.filter((id): id is string => typeof id === "string")
              : [],
          };
        })
        .filter((link) => link.periodId && link.linkedGoalIds.length > 0)
    : [];
  const weekLinks = Array.isArray(record.weekLinks)
    ? record.weekLinks
        .map((item) => {
          const link = isRecord(item) ? item : {};
          return {
            periodId: typeof link.periodId === "string" ? link.periodId : "",
            weekPlanId: typeof link.weekPlanId === "string" ? link.weekPlanId : "",
            linkedGoalIds: Array.isArray(link.linkedGoalIds)
              ? link.linkedGoalIds.filter((id): id is string => typeof id === "string")
              : [],
          };
        })
        .filter((link) => link.periodId && link.weekPlanId && link.linkedGoalIds.length > 0)
    : [];

  return { periodLinks, weekLinks };
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

    const body = (await req.json().catch(() => ({}))) as GenerateSectionBody;
    const kind = typeof body.kind === "string" ? body.kind : "";
    const periodIndex = typeof body.periodIndex === "number" ? body.periodIndex : Number(body.periodIndex);
    const frame = normalizePlannerFrame(body.frame);
    const curriculum = normalizeCurriculumSource(body.curriculum);
    const document = normalizePlannerDocument(body.document);

    if (
      kind !== "annual" &&
      kind !== "periods" &&
      kind !== "activities" &&
      kind !== "weeks" &&
      kind !== "studentGoals" &&
      kind !== "goalLinks" &&
      kind !== "reflectionSummary"
    ) {
      return json({ error: "Unknown generation kind" }, 400);
    }

    const selectedPeriod =
      Number.isFinite(periodIndex) && periodIndex >= 0
        ? document.periods[Math.floor(periodIndex)]
        : null;

    if (kind === "weeks" && !selectedPeriod) {
      return json({ error: "Missing selected period" }, 400);
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      text: { format: { type: "json_object" } },
      temperature: 0.35,
      input: [
        {
          role: "system",
          content:
            "You help teachers continue editing an existing school plan. Return JSON only. Keep suggestions editable, practical, and aligned with the existing plan.",
        },
        {
          role: "user",
          content:
            kind === "periods"
              ? `
Create period suggestions for this annual plan.

Frame:
- Country: ${frame.country}
- School type: ${frame.schoolType}
- Subject: ${frame.subject}
- Level: ${frame.level}
- Language: ${frame.language}
- School year: ${frame.schoolYear}
- Teaching weeks: ${frame.teachingWeeks}
- Total hours: ${frame.totalHours}
- Focus area: ${frame.focusArea || "No special focus area"}
- Curriculum: ${curriculum.framework || curriculum.type}

Existing plan:
- Title: ${document.title}
- Description: ${document.description}
- Learning goals: ${document.learningGoals}
- Concrete learning goals:
${document.concreteLearningGoals.map((goal) => `  - ${goal.id}: ${goal.studentLanguage || goal.goal}`).join("\n") || "  - None yet."}
- Assessment forms: ${document.assessmentForms}
- Annual overview: ${document.annualOverview}

Create 4 to 8 periods. Write in the plan language. Keep each period concise and usable.
Use linkedGoalIds to connect each period to the most relevant concrete learning goals when available.

Return exact JSON:
{
      "periods": [
    {
      "id": string,
      "status": "planned",
      "title": string,
      "weeks": string,
      "linkedGoalIds": string[],
      "goals": string,
      "content": string,
      "methods": string,
      "assessment": string,
      "reflection": string,
      "weekPlans": []
    }
  ]
}
              `.trim()
              : kind === "activities"
                ? `
Create activity suggestions for this annual plan.

Frame:
- Country: ${frame.country}
- School type: ${frame.schoolType}
- Subject: ${frame.subject}
- Level: ${frame.level}
- Language: ${frame.language}
- Focus area: ${frame.focusArea || "No special focus area"}

Existing plan:
- Title: ${document.title}
- Learning goals: ${document.learningGoals}
- Work methods: ${document.workMethods}
- Assessment forms: ${document.assessmentForms}
- Periods: ${document.periods
                  .map((period) => `${period.title || "Untitled"} (${period.weeks}): ${period.goals || period.content}`)
                  .join("\n")}

Create 6 to 10 practical activity suggestions. Do not create full lesson content. Write in the plan language.

Return exact JSON:
{
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
              `.trim()
                : kind === "weeks"
                  ? `
Create week plans for one selected period.

Frame:
- Country: ${frame.country}
- School type: ${frame.schoolType}
- Subject: ${frame.subject}
- Level: ${frame.level}
- Language: ${frame.language}
- School year: ${frame.schoolYear}
- Focus area: ${frame.focusArea || "No special focus area"}

Annual plan:
- Title: ${document.title}
- Learning goals: ${document.learningGoals}
- Concrete learning goals:
${document.concreteLearningGoals.map((goal) => `  - ${goal.id}: ${goal.studentLanguage || goal.goal}`).join("\n") || "  - None yet."}
- Assessment forms: ${document.assessmentForms}
- Work methods: ${document.workMethods}

Selected period:
- Title: ${selectedPeriod?.title || ""}
- Weeks: ${selectedPeriod?.weeks || ""}
- Goals: ${selectedPeriod?.goals || ""}
- Content: ${selectedPeriod?.content || ""}
- Methods: ${selectedPeriod?.methods || ""}
- Assessment: ${selectedPeriod?.assessment || ""}

Create 2 to 6 weekly plans that fit inside the selected period.
Do not create full lessons or long assignments. Keep it usable as planning notes.
Use linkedGoalIds to connect each week plan to relevant concrete learning goals when available.
Write in the plan language.

Return exact JSON:
{
  "weekPlans": [
    {
      "id": string,
      "week": string,
      "title": string,
      "linkedGoalIds": string[],
      "goals": string,
      "activities": string,
      "assessment": string,
      "notes": string
    }
  ]
}
              `.trim()
                  : kind === "studentGoals"
                    ? `
Break the annual learning goals down into concrete goals for students or participants.

Frame:
- Country: ${frame.country}
- School type: ${frame.schoolType}
- Subject: ${frame.subject}
- Level: ${frame.level}
- Language: ${frame.language}
- Plan type: ${frame.planType}
- Focus area: ${frame.focusArea || "No special focus area"}
- Curriculum: ${curriculum.framework || curriculum.type}

Plan:
- Title: ${document.title}
- Description: ${document.description}
- Overarching learning goals: ${document.learningGoals}
- Core elements: ${document.coreElements}
- Basic skills: ${document.basicSkills}
- Assessment forms: ${document.assessmentForms}
- Period goals:
${document.periods.map((period) => `  - ${period.title}: ${period.goals}`).join("\n") || "  - No period goals yet."}

Create 3 to 4 concrete learning goals that are understandable for students/participants.
Each goal must be observable, assessable, and phrased in plain language.
Do not create lesson activities. Write in the plan language.

Return exact JSON:
{
  "concreteLearningGoals": [
    {
      "id": string,
      "goal": string,
      "studentLanguage": string,
      "evidence": string
    }
  ]
}
              `.trim()
                  : kind === "goalLinks"
                    ? `
Suggest links between concrete learning goals and the existing periods/week plans.

Frame:
- Subject: ${frame.subject}
- Level: ${frame.level}
- Language: ${frame.language}
- School type: ${frame.schoolType}
- Focus area: ${frame.focusArea || "No special focus area"}

Concrete learning goals:
${document.concreteLearningGoals
  .map((goal) => `- ${goal.id}: ${goal.studentLanguage || goal.goal}. Evidence: ${goal.evidence}`)
  .join("\n") || "- None"}

Periods and week plans:
${document.periods
  .map(
    (period) => `- Period ${period.id}: ${period.title}
  Goals: ${period.goals}
  Content: ${period.content}
  Methods: ${period.methods}
  Week plans:
${period.weekPlans
  .map(
    (weekPlan) => `    - Week ${weekPlan.id}: ${weekPlan.week} ${weekPlan.title}
      Goals: ${weekPlan.goals}
      Activities: ${weekPlan.activities}`
  )
  .join("\n") || "    - None"}`
  )
  .join("\n\n") || "- None"}

Only use IDs that exist above.
Link each period and week plan to the most relevant concrete learning goals.
Use 1 to 3 goal IDs per period or week plan when relevant.
Skip periods or week plans where no concrete goal fits.

Return exact JSON:
{
  "periodLinks": [
    {
      "periodId": string,
      "linkedGoalIds": string[]
    }
  ],
  "weekLinks": [
    {
      "periodId": string,
      "weekPlanId": string,
      "linkedGoalIds": string[]
    }
  ]
}
              `.trim()
                  : kind === "reflectionSummary"
                    ? `
Summarize the teacher's reflection log into a useful year-end planning note.

Frame:
- Subject: ${frame.subject}
- Level: ${frame.level}
- School year: ${frame.schoolYear}
- Plan type: ${frame.planType}
- Focus area: ${frame.focusArea || "No special focus area"}

Plan:
- Title: ${document.title}
- Learning goals: ${document.learningGoals}
- Assessment forms: ${document.assessmentForms}
- Work methods: ${document.workMethods}

Reflection log:
${document.reflectionLog
  .map(
    (entry) => `
- Date: ${entry.date}
  Period: ${entry.period}
  Title: ${entry.title}
  What worked: ${entry.whatWorked}
  What to adjust: ${entry.whatToAdjust}
  Next step: ${entry.nextStep}
`.trim()
  )
  .join("\n\n") || "No reflection entries yet."}

Write in the plan language. Be concrete and professionally useful.
Return exact JSON:
{
  "yearEndSummary": string,
  "nextYearNotes": string
}
              `.trim()
                : `
Improve the annual plan sections without changing period or activity lists.

Frame:
- Country: ${frame.country}
- School type: ${frame.schoolType}
- Subject: ${frame.subject}
- Level: ${frame.level}
- Language: ${frame.language}
- School year: ${frame.schoolYear}
- Teaching weeks: ${frame.teachingWeeks}
- Total hours: ${frame.totalHours}
- Focus area: ${frame.focusArea || "No special focus area"}
- Plan type: ${frame.planType}
- Curriculum: ${curriculum.framework || curriculum.type}
- Teacher curriculum text: ${curriculum.customText || "No custom text"}

Current annual plan:
- Title: ${document.title}
- Description: ${document.description}
- Subject relevance: ${document.subjectRelevance}
- Core values: ${document.coreValues}
- Core elements: ${document.coreElements}
- Interdisciplinary themes: ${document.interdisciplinaryThemes}
- Basic skills: ${document.basicSkills}
- Learning goals: ${document.learningGoals}
- Assessment forms: ${document.assessmentForms}
- Work methods: ${document.workMethods}
- Annual overview: ${document.annualOverview}
- Reflection: ${document.reflection}
- Individual plan details: ${JSON.stringify(document.individualDetails)}

Keep the teacher's intent, but make the language clearer, more professional, and easier to use across the school year.
Do not add period or activity arrays.
Write in the plan language.

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
  }
}
              `.trim(),
        },
      ],
    });

    const output = response.output_text?.trim() || "{}";
    const parsed = JSON.parse(output) as unknown;
    await consumeFeatureAdmin({ uid: access.uid, feature: "ai_generate_text" });
    const quotaAfter = await getFeatureStatusAdmin({
      uid: access.uid,
      role,
      plan,
      feature: "ai_generate_text",
    });

    if (kind === "annual") {
      const generated = normalizePlannerDocument(parsed);
      if (!generated.title && !generated.description) return json({ error: "Could not improve annual plan" }, 500);
      return json({ document: generated, quota: quotaAfter }, 200);
    }

    if (kind === "periods") {
      const periods = parsePeriods(parsed);
      if (periods.length === 0) return json({ error: "Could not generate periods" }, 500);
      return json({ periods, quota: quotaAfter }, 200);
    }

    if (kind === "weeks") {
      const weekPlans = parseWeekPlans(parsed);
      if (weekPlans.length === 0) return json({ error: "Could not generate week plans" }, 500);
      return json({ weekPlans, quota: quotaAfter }, 200);
    }

    if (kind === "studentGoals") {
      const concreteLearningGoals = parseConcreteLearningGoals(parsed);
      if (concreteLearningGoals.length === 0) {
        return json({ error: "Could not generate concrete learning goals" }, 500);
      }
      return json({ concreteLearningGoals, quota: quotaAfter }, 200);
    }

    if (kind === "goalLinks") {
      const { periodLinks, weekLinks } = parseGoalLinks(parsed);
      if (periodLinks.length === 0 && weekLinks.length === 0) {
        return json({ error: "Could not suggest goal links" }, 500);
      }
      return json({ periodLinks, weekLinks, quota: quotaAfter }, 200);
    }

    if (kind === "reflectionSummary") {
      const record = isRecord(parsed) ? parsed : {};
      const yearEndSummary = typeof record.yearEndSummary === "string" ? record.yearEndSummary : "";
      const nextYearNotes = typeof record.nextYearNotes === "string" ? record.nextYearNotes : "";
      if (!yearEndSummary && !nextYearNotes) return json({ error: "Could not summarize reflections" }, 500);
      return json({ yearEndSummary, nextYearNotes, quota: quotaAfter }, 200);
    }

    const activities = parseActivities(parsed);
    if (activities.length === 0) return json({ error: "Could not generate activities" }, 500);
    return json({ activities, quota: quotaAfter }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate planner section";
    return json({ error: message }, 500);
  }
}
