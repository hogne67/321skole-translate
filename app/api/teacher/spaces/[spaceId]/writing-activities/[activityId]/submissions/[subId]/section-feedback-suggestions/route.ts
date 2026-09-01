import "server-only";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdmin } from "@/lib/firebaseAdmin";
import { upgradeWritingActivityForRuntime, type WritingActivity, type WritingPhase, type WritingSectionTemplate, type WritingSubmission } from "@/lib/writingStation";
import {
  consumeServerFeature,
  getServerFeatureStatusFromProfile,
} from "@/lib/serverFeatureGuard";

type Role = "student" | "teacher" | "admin" | "parent" | "creator";

type Body = {
  phase?: WritingPhase;
};

type Suggestion = {
  sectionId: string;
  text: string;
  status: "approved" | "improve";
};

type OverallSuggestion = {
  text: string;
  status: "reviewed" | "needs_work";
};

const HIDDEN_FACTUAL_PLANNING_SECTION_IDS = new Set(["purpose_audience", "key_terms", "structure"]);

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
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readRole(profile: unknown): Role {
  if (!isRecord(profile)) return "student";
  const role = profile.role;
  if (role === "teacher" || role === "admin" || role === "parent" || role === "creator") return role;
  const roles = profile.roles;
  if (isRecord(roles)) {
    if (roles.admin === true) return "admin";
    if (roles.teacher === true) return "teacher";
    if (roles.creator === true) return "creator";
    if (roles.parent === true) return "parent";
  }
  return "student";
}

function isAdminProfile(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  if (profile.role === "admin") return true;
  return isRecord(profile.roles) && profile.roles.admin === true;
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(String).join(", ").trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function visibleSectionsForPhase(activity: WritingActivity, phase: WritingPhase) {
  return (activity.rooms ?? [])
    .filter((room) => room.phase === phase)
    .flatMap((room) => room.sections)
    .filter((section) => {
      if (activity.genre !== "factual" || phase !== "planning") return true;
      return !HIDDEN_FACTUAL_PLANNING_SECTION_IDS.has(section.id);
    });
}

function getSectionText(submission: Partial<WritingSubmission>, section: WritingSectionTemplate): string {
  const answers = submission.answersByFieldId ?? {};
  const drafts = submission.sectionDrafts ?? {};
  const draft = textValue(drafts[section.id]);
  if (draft) return draft;

  if (section.id === "other_characters") {
    const rawCount = Number.parseInt(textValue(answers.other_characters_count), 10);
    const hasLegacy = Boolean(textValue(answers.other_characters_list) || textValue(answers.character_roles));
    let highestUsed = hasLegacy ? 1 : 0;
    for (let i = 1; i <= 5; i += 1) {
      if (
        textValue(answers[`other_character_${i}_name`]) ||
        textValue(answers[`other_character_${i}_role`]) ||
        textValue(answers[`other_character_${i}_description`])
      ) {
        highestUsed = i;
      }
    }
    const count = Math.max(1, Number.isFinite(rawCount) ? rawCount : 0, highestUsed);
    return Array.from({ length: count }, (_, index) => {
      const n = index + 1;
      const name = textValue(answers[`other_character_${n}_name`]);
      const role = textValue(answers[`other_character_${n}_role`]) || (n === 1 ? textValue(answers.character_roles).split(",")[0]?.trim() ?? "" : "");
      const description = textValue(answers[`other_character_${n}_description`]) || (n === 1 ? textValue(answers.other_characters_list) : "");
      return [
        name ? `Person ${n}: ${name}` : "",
        role ? `Rolle: ${role}` : "",
        description ? `Beskrivelse: ${description}` : "",
      ].filter(Boolean).join("\n");
    }).filter(Boolean).join("\n\n");
  }

  return section.fields
    .map((field) => {
      const value = textValue(answers[field.id]);
      return value ? `${field.label}: ${value}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function buildPrompt(args: {
  activity: WritingActivity;
  submission: Partial<WritingSubmission>;
  phase: WritingPhase;
}) {
  const { activity, submission, phase } = args;
  const sections = visibleSectionsForPhase(activity, phase)
    .map((section) => ({
      id: section.id,
      title: section.title,
      prompt: section.prompt,
      text: getSectionText(submission, section),
    }))
    .filter((section) => section.text.trim());

  return [
    `Skriveaktivitet: ${activity.title}`,
    `Sjanger: ${activity.genre}`,
    `Nivå: ${activity.level}`,
    `Språk: ${activity.language}`,
    activity.theme ? `Tema: ${activity.theme}` : "",
    `Fase: ${phase}`,
    "",
    "Lag korte vurderingsforslag til læreren for hver seksjon under.",
    "Svar som JSON med nøkkelen suggestions.",
    "Hvert forslag skal ha sectionId, status og text.",
    "status skal være enten approved eller improve.",
    "text skal være 1-2 korte, vennlige setninger læreren kan redigere før eleven ser dem.",
    "Ikke skriv som KI. Ikke overdriv ros. Vær konkret, pedagogisk og kort.",
    "",
    JSON.stringify({ sections }, null, 2),
  ].filter(Boolean).join("\n");
}

function buildOverallPrompt(args: {
  activity: WritingActivity;
  submission: Partial<WritingSubmission>;
}) {
  const { activity, submission } = args;
  const finalText = textValue(submission.finalText);
  const drafts = submission.sectionDrafts ?? {};
  const draftLines = (activity.rooms ?? [])
    .filter((room) => room.phase === "drafting")
    .flatMap((room) => room.sections)
    .map((section) => {
      const value = textValue(drafts[section.id]);
      return value ? `${section.title}:\n${value}` : "";
    })
    .filter(Boolean);

  return [
    `Skriveaktivitet: ${activity.title}`,
    `Sjanger: ${activity.genre}`,
    `Nivå: ${activity.level}`,
    `Språk: ${activity.language}`,
    activity.theme ? `Tema: ${activity.theme}` : "",
    "",
    "Lag et kort forslag til samlet lærervurdering av teksten.",
    "Svar som JSON med nøkkelen overall.",
    "overall skal ha status og text.",
    "status skal være reviewed hvis teksten kan godkjennes, ellers needs_work.",
    "text skal være 2-4 korte, vennlige setninger læreren kan redigere før eleven ser dem.",
    "Vurder helhet: innhold, sammenheng, struktur og ett konkret neste steg.",
    "Ikke skriv som KI. Ikke overdriv ros. Vær konkret, pedagogisk og kort.",
    "",
    "Ferdig tekst:",
    finalText || draftLines.join("\n\n") || "(tom)",
  ].filter(Boolean).join("\n");
}

function buildSystemPrompt(language: string) {
  const lang = language.toLowerCase();
  const languageInstruction =
    lang === "en"
      ? "Write feedback suggestions in English."
      : lang === "pt"
        ? "Write feedback suggestions in Portuguese."
        : "Write feedback suggestions in Norwegian Bokmål.";

  return [
    "You support a teacher who assesses a student's writing process.",
    languageInstruction,
    "You write draft comments for the teacher, not final automatic feedback to the student.",
    "Keep every comment short, specific, kind, and useful.",
    "Prefer process feedback: what is clear, what should be made clearer, and one possible next move.",
    "Return valid JSON only.",
  ].join("\n");
}

function parseSuggestions(raw: string): Suggestion[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.suggestions)) return [];

  return parsed.suggestions
    .map((item): Suggestion | null => {
      if (!isRecord(item)) return null;
      const sectionId = safeString(item.sectionId).trim();
      const text = safeString(item.text).trim();
      if (!sectionId || !text) return null;
      return {
        sectionId,
        text,
        status: item.status === "approved" ? "approved" : "improve",
      };
    })
    .filter((item): item is Suggestion => item !== null);
}

function parseOverallSuggestion(raw: string): OverallSuggestion | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.overall)) return null;
  const text = safeString(parsed.overall.text).trim();
  if (!text) return null;
  return {
    text,
    status: parsed.overall.status === "reviewed" ? "reviewed" : "needs_work",
  };
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ spaceId: string; activityId: string; subId: string }> }
) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return json({ error: "OPENAI_API_KEY is not configured" }, 500);
    }

    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { spaceId, activityId, subId } = await ctx.params;
    if (!spaceId || !activityId || !subId) return json({ error: "Missing params" }, 400);

    const body = (await req.json().catch(() => ({}))) as Body;
    const phase: WritingPhase =
      body.phase === "drafting" || body.phase === "revision" || body.phase === "final" ? body.phase : "planning";

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const [profileSnap, spaceSnap, memberSnap, activitySnap, submissionSnap] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("spaces").doc(spaceId).get(),
      db.collection("spaceMembers").doc(`${spaceId}_${uid}`).get(),
      db.collection("spaces").doc(spaceId).collection("writingActivities").doc(activityId).get(),
      db.collection("spaces").doc(spaceId).collection("writingActivities").doc(activityId).collection("submissions").doc(subId).get(),
    ]);

    if (!spaceSnap.exists) return json({ error: "Space not found" }, 404);
    if (!activitySnap.exists) return json({ error: "Writing activity not found" }, 404);
    if (!submissionSnap.exists) return json({ error: "Submission not found" }, 404);

    const profile = (profileSnap.data() ?? {}) as Record<string, unknown>;
    const space = (spaceSnap.data() ?? {}) as Record<string, unknown>;
    const role = readRole(profile);
    const isOwner = safeString(space.ownerId) === uid;
    const isAdmin = isAdminProfile(profile);
    const canReview = isOwner || isAdmin || (role === "teacher" && memberSnap.exists);
    if (!canReview) return json({ error: "No access to this submission" }, 403);

    const billing =
      profile.billing && typeof profile.billing === "object"
        ? (profile.billing as { plan?: string | null; status?: string | null })
        : null;

    const featureStatus = await getServerFeatureStatusFromProfile({
      db,
      uid,
      role,
      plan: safeString(profile.plan) || "free",
      billing,
      schoolId: safeString(profile.schoolId) || null,
      schoolRole: safeString(profile.schoolRole) || null,
      schoolStatus: safeString(profile.schoolStatus) || null,
      partnerAccess: profile.partnerAccess === true,
      partnerStatus: safeString(profile.partnerStatus) || null,
      feature: "ai_feedback",
    });

    if (!featureStatus.allowed) {
      return json({ error: "AI feedback limit reached", quota: featureStatus }, 429);
    }

    const activity = upgradeWritingActivityForRuntime({
      id: activitySnap.id,
      ...(activitySnap.data() as Record<string, unknown>),
    } as WritingActivity);
    const submission = {
      id: submissionSnap.id,
      ...(submissionSnap.data() as Record<string, unknown>),
    } as Partial<WritingSubmission>;

    if (phase === "final") {
      const finalText = textValue(submission.finalText) || textValue(
        Object.values(submission.sectionDrafts ?? {})
          .map((value) => textValue(value))
          .filter(Boolean)
          .join("\n\n")
      );
      if (!finalText) return json({ overall: null });

      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [
          { role: "system", content: buildSystemPrompt(safeString(activity.language) || "nb") },
          { role: "user", content: buildOverallPrompt({ activity, submission }) },
        ],
      });

      const raw = response.output_text?.trim();
      if (!raw) return json({ error: "Empty AI response" }, 500);

      const overall = parseOverallSuggestion(raw);
      await consumeServerFeature({
        db,
        uid,
        feature: "ai_feedback",
        amount: 1,
      });

      return json({
        overall,
        quota: {
          remaining: Math.max(0, featureStatus.remaining - 1),
          limit: featureStatus.limit,
        },
      });
    }

    const sectionsWithText = visibleSectionsForPhase(activity, phase)
      .filter((section) => getSectionText(submission, section).trim());

    if (!sectionsWithText.length) {
      return json({ suggestions: [] });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        { role: "system", content: buildSystemPrompt(safeString(activity.language) || "nb") },
        { role: "user", content: buildPrompt({ activity, submission, phase }) },
      ],
    });

    const raw = response.output_text?.trim();
    if (!raw) return json({ error: "Empty AI response" }, 500);

    const allowedSectionIds = new Set(sectionsWithText.map((section) => section.id));
    const suggestions = parseSuggestions(raw).filter((suggestion) => allowedSectionIds.has(suggestion.sectionId));

    await consumeServerFeature({
      db,
      uid,
      feature: "ai_feedback",
      amount: 1,
    });

    return json({
      suggestions,
      quota: {
        remaining: Math.max(0, featureStatus.remaining - 1),
        limit: featureStatus.limit,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message || "Writing section feedback suggestions failed" }, 500);
  }
}
