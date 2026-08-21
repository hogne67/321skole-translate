import OpenAI from "openai";
import { getAdmin } from "@/lib/firebaseAdmin";
import { consumeFeatureAdmin, getFeatureStatusAdmin } from "@/lib/featureGuardAdmin";
import { getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";
import { emailVerificationRequiredWebResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_SUPPORT_SECTIONS = [
  "idea",
  "main_character",
  "other_characters",
  "setting",
  "conflict",
  "solution",
  "opening_type",
  "title",
  "introduction",
  "main_part",
  "ending",
  "content_check",
  "language_check",
  "self_assessment",
] as const;

const ALLOWED_SUPPORT_SECTIONS = new Set<string>([
  ...DEFAULT_SUPPORT_SECTIONS,
  "topic",
  "purpose_audience",
  "key_terms",
  "facts_examples",
  "discussion",
  "structure",
  "sources",
  "structure_check",
  "fact_check",
]);

type SupportSectionId = string;

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
};

type GenerateDraftBody = {
  language?: string;
  level?: string;
  genre?: string;
  writingGenre?: string;
  supportSectionIds?: string[];
  targetWordCount?: number;
  prompt?: string;
};

type GeneratedWritingDraft = {
  title: string;
  assignmentText: string;
  criteria: string[];
  supportWordsBySection: Record<SupportSectionId, string[]>;
  targetWordCount?: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickString(obj: unknown, key: string, fallback = ""): string {
  if (!isRecord(obj)) return fallback;
  const value = obj[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function pickNumber(obj: unknown, key: string, fallback: number): number {
  if (!isRecord(obj)) return fallback;
  const value = obj[key];
  const parsed = typeof value === "number" ? value : Number.parseInt(pickString(obj, key), 10);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function cleanList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanSupportSectionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_SUPPORT_SECTIONS];
  const cleaned = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => ALLOWED_SUPPORT_SECTIONS.has(item));
  return cleaned.length ? Array.from(new Set(cleaned)).slice(0, 24) : [...DEFAULT_SUPPORT_SECTIONS];
}

function normalizeLevel(value: string): string {
  const normalized = value.trim().toUpperCase();
  return ["A1", "A2", "B1", "B2", "C1", "C2"].includes(normalized) ? normalized : "A2";
}

function defaultWordCount(level: string): number {
  if (level === "A1") return 100;
  if (level === "A2") return 200;
  if (level === "B1") return 350;
  if (level === "B2") return 500;
  return 800;
}

function languageInstruction(language: string): string {
  const lower = language.toLowerCase();
  if (lower === "nb" || lower === "no" || lower === "nn") return "Write all user-facing text in Norwegian Bokmal.";
  if (lower === "en") return "Write all user-facing text in English.";
  if (lower === "pt" || lower === "pt-br" || lower === "pt-pt") return "Write all user-facing text in Portuguese.";
  return `Write all user-facing text in the language with code "${language}".`;
}

function levelGuidance(level: string): string {
  if (level === "A1") {
    return "A1: very simple concrete language, short sentences, familiar situations, little abstraction.";
  }
  if (level === "A2") {
    return "A2: simple everyday language, short clear sentences, concrete vocabulary, simple connectors.";
  }
  if (level === "B1") {
    return "B1: clear everyday language with some variation and room for simple reflection.";
  }
  if (level === "B2") {
    return "B2: varied language, more nuance, causes, consequences and richer descriptions.";
  }
  return "C1/C2: advanced, nuanced language and room for interpretation, style and precise reflection.";
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

async function getRequestUserContext(req: Request): Promise<RequestUserContext | null> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(idToken);
  if (needsEmailVerification(decoded)) throw new Error("EMAIL_VERIFICATION_REQUIRED");

  const uid = decoded.uid;
  const userSnap = await db.collection("users").doc(uid).get();
  const data = userSnap.exists ? userSnap.data() : undefined;
  const roles = data?.roles && typeof data.roles === "object" ? (data.roles as Record<string, unknown>) : {};
  const role =
    roles.admin === true
      ? "admin"
      : typeof data?.role === "string"
        ? data.role
        : typeof data?.mode === "string"
          ? data.mode
          : "anonymous";

  const plan = getEffectivePlan({
    plan: typeof data?.plan === "string" ? data.plan : "free",
    billing:
      data?.billing && typeof data.billing === "object"
        ? (data.billing as { plan?: string | null; status?: string | null })
        : null,
    schoolId: typeof data?.schoolId === "string" ? data.schoolId : null,
    schoolRole: typeof data?.schoolRole === "string" ? data.schoolRole : null,
    schoolStatus: typeof data?.schoolStatus === "string" ? data.schoolStatus : null,
  });

  return { uid, role, plan };
}

function quotaErrorResponse(status: Awaited<ReturnType<typeof getFeatureStatusAdmin>>) {
  if (status.reason === "limit_reached") {
    return Response.json({ error: "Du har brukt opp månedens AI-kvote.", quota: status }, { status: 403 });
  }
  if (status.reason === "teacher_only") {
    return Response.json({ error: "Denne funksjonen er bare tilgjengelig for lærere.", quota: status }, { status: 403 });
  }
  return Response.json({ error: "Denne funksjonen krever et abonnement.", quota: status }, { status: 403 });
}

function cleanGeneratedDraft(value: unknown, fallbackWordCount: number, supportSections: string[]): GeneratedWritingDraft | null {
  if (!isRecord(value)) return null;
  const supportSource = isRecord(value.supportWordsBySection) ? value.supportWordsBySection : {};
  const supportWordsBySection = Object.fromEntries(
    supportSections.map((sectionId) => [sectionId, cleanList(supportSource[sectionId], 16)])
  ) as Record<SupportSectionId, string[]>;

  const title = pickString(value, "title", "Skriveaktivitet");
  const assignmentText = pickString(value, "assignmentText");
  const criteria = cleanList(value.criteria, 16);
  if (!assignmentText || criteria.length < 5) return null;

  return {
    title,
    assignmentText,
    criteria,
    supportWordsBySection,
    targetWordCount: Math.max(20, Math.min(2000, pickNumber(value, "targetWordCount", fallbackWordCount))),
  };
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
    }

    const user = await getRequestUserContext(req);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const quotaBefore = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      feature: "ai_generate_text",
    });
    if (!quotaBefore.allowed) return quotaErrorResponse(quotaBefore);

    const body = (await req.json().catch(() => ({}))) as GenerateDraftBody;
    const language = pickString(body, "language", "nb");
    const level = normalizeLevel(pickString(body, "level", "A2"));
    const genre = pickString(body, "genre", "Fortelling").slice(0, 80);
    const writingGenre = pickString(body, "writingGenre", "story") === "factual" ? "factual" : "story";
    const supportSections = cleanSupportSectionIds(body.supportSectionIds);
    const teacherPrompt = pickString(body, "prompt").slice(0, 1000);
    const targetWordCount = Math.max(20, Math.min(2000, pickNumber(body, "targetWordCount", defaultWordCount(level))));

    const prompt = [
      "Create a teacher-editable writing activity draft for 321school.",
      languageInstruction(language),
      `CEFR level: ${level}`,
      `Level guidance: ${levelGuidance(level)}`,
      `Main writing type: ${writingGenre === "factual" ? "factual text" : "creative/literary text"}`,
      `Genre: ${genre}`,
      `Target length: ${targetWordCount} words`,
      teacherPrompt ? `Teacher theme/request: ${teacherPrompt}` : "Teacher theme/request: none. Choose a broad, usable idea.",
      "",
      "The task is for a structured writing process with planning room, writing room and control room.",
      writingGenre === "factual"
        ? "For factual text: include topic, purpose, reader, facts, examples, structure, possible discussion and fact/source checking. Do not invent unstable or current facts."
        : "For creative/literary text: include genre, main character, conflict/challenge, change/development, ending, description, senses/thoughts/feelings and target length.",
      "Criteria must be assessable student-facing criteria, one criterion per line.",
      "Support words should be useful for students at the requested CEFR level.",
      "For each support section, return 4-8 short support words or sentence starters.",
      "Avoid copyrighted characters, brands, named public figures, current facts, exact statistics and news-sensitive claims.",
      "Return JSON only. No markdown.",
      "",
      "Return this exact shape:",
      "{",
      '  "title": "string",',
      '  "assignmentText": "string",',
      '  "criteria": ["string"],',
      '  "targetWordCount": 200,',
      '  "supportWordsBySection": {',
      ...supportSections.map((sectionId, index) => `    "${sectionId}": ["string"]${index === supportSections.length - 1 ? "" : ","}`),
      "  }",
      "}",
    ].join("\n");

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      text: { format: { type: "json_object" } },
      temperature: 0.35,
      input: [
        {
          role: "system",
          content:
            "You create practical classroom writing activities for language learners. Return valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = response.output_text?.trim();
    if (!raw) return Response.json({ error: "Empty response from model." }, { status: 500 });

    const jsonText = extractJsonObject(raw);
    if (!jsonText) return Response.json({ error: "Could not find JSON in model response.", raw }, { status: 500 });

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return Response.json({ error: "Invalid JSON from model.", raw }, { status: 500 });
    }

    const draft = cleanGeneratedDraft(parsed, targetWordCount, supportSections);
    if (!draft) return Response.json({ error: "Model response missing usable writing draft.", raw }, { status: 500 });

    await consumeFeatureAdmin({ uid: user.uid, feature: "ai_generate_text" });
    const quotaAfter = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      feature: "ai_generate_text",
    });

    return Response.json({
      ...draft,
      quota: {
        feature: "ai_generate_text",
        bucket: quotaAfter.bucket,
        limit: quotaAfter.limit,
        used: quotaAfter.used,
        remaining: quotaAfter.remaining,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "EMAIL_VERIFICATION_REQUIRED") {
      return emailVerificationRequiredWebResponse();
    }
    const message = error instanceof Error ? error.message : "Unknown server error";
    console.error("writing draft generator route error:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
