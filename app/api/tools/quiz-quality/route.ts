import OpenAI from "openai";
import { getAdmin } from "@/lib/firebaseAdmin";
import { consumeFeatureAdmin, getFeatureStatusAdmin } from "@/lib/featureGuardAdmin";
import { getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";
import { emailVerificationRequiredWebResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type QuestionMode = "mixed" | "multiple_choice" | "true_false";
type Difficulty = "easy" | "medium" | "hard";
type QualityStatus = "ready" | "check_fact" | "improve_language" | "multiple_answers";

type QuizQuestion = {
  type: "multiple_choice" | "true_false";
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  seconds: number;
};

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
  studentAccessMode?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pickQuestionMode(value: unknown): QuestionMode {
  if (value === "multiple_choice" || value === "true_false") return value;
  return "mixed";
}

function pickDifficulty(value: unknown): Difficulty {
  if (value === "easy" || value === "hard") return value;
  return "medium";
}

function pickQualityStatus(value: unknown): QualityStatus {
  if (value === "check_fact" || value === "improve_language" || value === "multiple_answers") return value;
  return "ready";
}

function getLanguageInstruction(language: string): string {
  const lower = language.toLowerCase();
  if (lower === "no" || lower === "nb" || lower === "nn") return "Write everything in Norwegian Bokmal.";
  if (lower === "pt" || lower === "pt-br" || lower === "pt-pt") return "Write everything in Portuguese.";
  if (lower === "en") return "Write everything in English.";
  return `Write everything in the language with code "${language}".`;
}

function cleanExplanation(value: string): string {
  return value
    .replace(/\s*,?\s*(noe som|og det|dette)\s+gjør\s+[^.]{0,80}?\s+til\s+det\s+riktige\s+svaret\.?$/i, ".")
    .replace(/\s*,?\s*(which|and this|this)\s+makes\s+[^.]{0,80}?\s+the\s+correct\s+answer\.?$/i, ".")
    .replace(/\s*,?\s*(o que|isso)\s+(faz|torna)\s+[^.]{0,80}?\s+(a\s+)?resposta\s+correta\.?$/i, ".")
    .replace(/\s+\./g, ".")
    .replace(/\.{2,}$/g, ".")
    .trim();
}

function normalizeQuestion(value: unknown): QuizQuestion | null {
  if (!isRecord(value)) return null;
  const options = Array.isArray(value.options)
    ? value.options.map((option) => safeString(option)).filter(Boolean).slice(0, 4)
    : [];
  const question = safeString(value.question || value.prompt);
  if (!question || options.length < 2) return null;
  return {
    type: value.type === "true_false" ? "true_false" : "multiple_choice",
    question,
    options,
    correctIndex: Math.max(0, Math.min(options.length - 1, Math.trunc(safeNumber(value.correctIndex, 0)))),
    explanation: cleanExplanation(safeString(value.explanation)),
    seconds: Math.max(10, Math.min(120, Math.trunc(safeNumber(value.seconds, 30)))),
  };
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

  const userSnap = await db.collection("users").doc(decoded.uid).get();
  const data = userSnap.exists ? userSnap.data() : undefined;
  const role = typeof data?.role === "string" ? data.role : typeof data?.mode === "string" ? data.mode : "anonymous";
  const plan = getEffectivePlan({
    plan: typeof data?.plan === "string" ? data.plan : "free",
    billing:
      data?.billing && typeof data.billing === "object"
        ? (data.billing as { plan?: string | null; status?: string | null })
        : null,
    partnerAccess: data?.partnerAccess === true,
    partnerStatus: typeof data?.partnerStatus === "string" ? data.partnerStatus : null,
    schoolId: typeof data?.schoolId === "string" ? data.schoolId : null,
    schoolRole: typeof data?.schoolRole === "string" ? data.schoolRole : null,
    schoolStatus: typeof data?.schoolStatus === "string" ? data.schoolStatus : null,
  });

  return {
    uid: decoded.uid,
    role,
    plan,
    studentAccessMode: typeof data?.studentAccessMode === "string" ? data.studentAccessMode : null,
  };
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

async function checkQuota(user: RequestUserContext) {
  const quota = await getFeatureStatusAdmin({
    uid: user.uid,
    role: user.role,
    plan: user.plan,
    studentAccessMode: user.studentAccessMode,
    feature: "producer_create_quiz",
  });
  if (!quota.allowed) return quotaErrorResponse(quota);
  return null;
}

async function consumeAndReadQuota(user: RequestUserContext) {
  await consumeFeatureAdmin({ uid: user.uid, feature: "producer_create_quiz" });
  const quota = await getFeatureStatusAdmin({
    uid: user.uid,
    role: user.role,
    plan: user.plan,
    studentAccessMode: user.studentAccessMode,
    feature: "producer_create_quiz",
  });
  return {
    feature: "producer_create_quiz",
    bucket: quota.bucket,
    limit: quota.limit,
    used: quota.used,
    remaining: quota.remaining,
  };
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
    }

    const user = await getRequestUserContext(req);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const quotaError = await checkQuota(user);
    if (quotaError) return quotaError;

    const body = (await req.json().catch(() => ({}))) as unknown;
    if (!isRecord(body)) return Response.json({ error: "Invalid request." }, { status: 400 });

    const action = body.action === "replace_question" ? "replace_question" : "quality_check";
    const questions = Array.isArray(body.questions)
      ? body.questions.map(normalizeQuestion).filter((item): item is QuizQuestion => item !== null)
      : [];
    if (!questions.length) return Response.json({ error: "Missing questions." }, { status: 400 });

    const language = safeString(body.language, "nb");
    const level = safeString(body.level, "A2");
    const difficulty = pickDifficulty(body.difficulty);
    const focus = safeString(body.focus, "easy_mix");
    const topic = safeString(body.topic || body.title, "321 quiz");
    const sourceMode = safeString(body.sourceMode, "topic");
    const sourceText = safeString(body.sourceText);
    const questionMode = pickQuestionMode(body.questionMode);

    if (action === "quality_check") {
      const prompt =
        `You are quality-checking an editable classroom quiz for a teacher.\n` +
        `${getLanguageInstruction(language)}\n` +
        `Topic: ${topic}\nLevel: ${level}\nDifficulty: ${difficulty}\nCategory: ${focus}\n` +
        `Source mode: ${sourceMode}\n` +
        (sourceText ? `Source text:\n${sourceText.slice(0, 12000)}\n` : "") +
        `\nQuestions:\n${JSON.stringify(questions)}\n\n` +
        `Task:\n` +
        `- Do not create new questions.\n` +
        `- Review each question for teacher use.\n` +
        `- Mark "ready" when the question is usable after ordinary teacher reading.\n` +
        `- Mark "check_fact" when it contains dates, names, places, statistics, ranking, current facts, or claims that should be verified.\n` +
        `- Mark "improve_language" when wording is awkward, too complex/simple for level, or explanation sounds artificial.\n` +
        `- Mark "multiple_answers" when more than one option may be correct or the answer key is unclear.\n` +
        `- Be strict with superlatives such as "most famous", "best known", "mest kjent", "viktigst", "størst", or similar. Unless the source proves it, mark "check_fact" and suggest neutral wording.\n` +
        `- Be strict with "all of the above" / "alle de ovenfor" options. Mark "multiple_answers" if individual options may also be correct, or "check_fact" if every listed option must be verified.\n` +
        `- If the correct option is "all of the above", the explanation must verify every included option. If it does not, mark "check_fact" or suggest a cleaner question.\n` +
        `- Prefer questions with one concrete answer. Avoid vague questions like "which known museum exists in Oslo" if several options are known museums in Oslo.\n` +
        `- Suggest a short improvement only when useful. Keep comments calm and practical.\n` +
        `Return JSON only: {"items":[{"index":0,"status":"ready|check_fact|improve_language|multiple_answers","note":"short note","suggestedQuestion":"optional","suggestedExplanation":"optional"}]}`;

      const response = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        text: { format: { type: "json_object" } },
        temperature: 0.1,
        input: [
          { role: "system", content: "Quality-check classroom quiz drafts. Be concise, cautious, and practical. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
      });

      const raw = response.output_text?.trim();
      const jsonText = raw ? extractJsonObject(raw) : null;
      if (!jsonText) return Response.json({ error: "Could not read quality check." }, { status: 500 });
      const parsed = JSON.parse(jsonText) as unknown;
      const items = isRecord(parsed) && Array.isArray(parsed.items)
        ? parsed.items.filter(isRecord).map((item) => ({
            index: Math.max(0, Math.trunc(safeNumber(item.index, 0))),
            status: pickQualityStatus(item.status),
            note: safeString(item.note),
            suggestedQuestion: safeString(item.suggestedQuestion),
            suggestedExplanation: cleanExplanation(safeString(item.suggestedExplanation)),
          })).filter((item) => item.index < questions.length)
        : [];

      const quota = await consumeAndReadQuota(user);
      return Response.json({ items, quota });
    }

    const replaceIndex = Math.max(0, Math.min(questions.length - 1, Math.trunc(safeNumber(body.index, 0))));
    const prompt =
      `Create one replacement question for an editable classroom quiz.\n` +
      `${getLanguageInstruction(language)}\n` +
      `Topic: ${topic}\nLevel: ${level}\nDifficulty: ${difficulty}\nCategory: ${focus}\nQuestion mode: ${questionMode}\n` +
      (sourceText ? `Use only this source text for factual claims:\n${sourceText.slice(0, 12000)}\n` : "") +
      `Existing questions to avoid repeating:\n${JSON.stringify(questions.map((question) => question.question))}\n` +
      `Question to replace:\n${JSON.stringify(questions[replaceIndex])}\n\n` +
      `Rules:\n` +
      `- Return one question only.\n` +
      `- Keep facts broad and easy for a teacher to verify when no source text is supplied.\n` +
      `- Avoid fragile claims, exact statistics, rankings, current events, and formula explanations.\n` +
      `- Avoid superlatives such as "most famous", "best known", "mest kjent", "viktigst", or "størst" unless the source explicitly supports the claim.\n` +
      `- Do not use "all of the above", "alle de ovenfor", or equivalent options.\n` +
      `- Ask questions with one clearly correct answer and clearly wrong distractors.\n` +
      `- Multiple choice needs 3 or 4 options. True/false needs exactly 2 options.\n` +
      `- Return JSON only: {"question":{"type":"multiple_choice|true_false","question":"string","options":["string"],"correctIndex":0,"explanation":"string","seconds":30}}`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      text: { format: { type: "json_object" } },
      temperature: 0.15,
      input: [
        { role: "system", content: "Create one safe, editable classroom quiz question. Return valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const raw = response.output_text?.trim();
    const jsonText = raw ? extractJsonObject(raw) : null;
    if (!jsonText) return Response.json({ error: "Could not read replacement question." }, { status: 500 });
    const parsed = JSON.parse(jsonText) as unknown;
    const question = normalizeQuestion(isRecord(parsed) ? parsed.question : null);
    if (!question) return Response.json({ error: "Replacement question was not usable." }, { status: 500 });

    const quota = await consumeAndReadQuota(user);
    return Response.json({ question, quota });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "EMAIL_VERIFICATION_REQUIRED") {
      return emailVerificationRequiredWebResponse();
    }
    const message = error instanceof Error ? error.message : "Unknown server error";
    console.error("quiz-quality route error:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
