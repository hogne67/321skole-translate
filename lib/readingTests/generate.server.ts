import "server-only";
import { LEVEL_SPECS, READING_SKILLS, buildTaskInstructions, isReviewedReadingLevel, type CefrLevel } from "@/lib/readingTests/generationGuidance";
import { LISTENING_GENERATION_GUIDANCE, listeningGenerationPolicy } from "@/lib/listeningTests/guidance";
import { normalizeReadingEvidence, readingTaskQualityError } from "@/lib/readingTests/generationValidation";
import { reviewReadingTest } from "@/lib/readingTests/semanticReview";
import { readingGenerationModel, listeningGenerationModel, readingReviewModel, readingGenerationSettings, readingGenerationTimeout } from "@/lib/readingTests/modelSettings";
import { resolveC2GenerationSource } from "@/lib/readingTests/c2GenerationSource";
import { readingGenerationPolicy, readingStageTimeout } from "@/lib/readingTests/generationBudget";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import OpenAI from "openai";
import { getEffectiveStudentModeForAccount } from "@/lib/studentAccessMode.server";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getFeatureStatusAdmin,
  consumeFeatureAdmin,
} from "@/lib/featureGuardAdmin";
import { getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";
import { emailVerificationRequiredWebResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";

type ReadingTestTaskType = "mcq" | "true_false" | "best_summary";

type GenerateReadingTestBody = {
  level?: string;
  language?: string;
  topic?: string;
  audience?: string;
  minWords?: number;
  maxWords?: number;
  enabledTaskTypes?: ReadingTestTaskType[];
};

type ReadingMcqTask = {
  prompt: string;
  options: [string, string, string];
  correctAnswer: string;
  skill?: string;
  evidence?: string[];
};

type ReadingTrueFalseTask = {
  prompt: string;
  correctAnswer: boolean;
};

type ReadingBestSummaryTask = {
  prompt: string;
  options: [string, string, string];
  correctAnswer: string;
  optionEvidence?: string[][];
};

type ReadingFeedback = {
  learner: string;
  adult: string;
  nextStep: string;
};

type ReadingTestResponse = {
  title: string;
  cefrLevel: CefrLevel;
  language: string;
  topic: string;
  wordCount: number;
  text: string;
  tasks: {
    mcq: ReadingMcqTask[];
    trueFalse: ReadingTrueFalseTask[];
    bestSummary: ReadingBestSummaryTask;
  };
  feedback: ReadingFeedback;
};

type OpenAIErrorLike = { message?: string; code?: string | number };

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
  studentAccessMode?: string | null;
};

const REQUIRED_TASK_TYPES: ReadingTestTaskType[] = ["mcq", "true_false", "best_summary"];

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as OpenAIErrorLike).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function clampNumber(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeLevel(v: unknown): CefrLevel {
  return v === "A1" ||
    v === "A2" ||
    v === "B1" ||
    v === "B2" ||
    v === "C1" ||
    v === "C2"
    ? v
    : "A2";
}

function safeString(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s || fallback;
}

function normalizeWordRange(level: CefrLevel, minWords?: number, maxWords?: number) {
  const base = LEVEL_SPECS[level];

  if (level === "A1" || level === "A2" || level === "B1" || level === "B2") {
    return { min: base.minWords, max: base.maxWords };
  }

  const min = clampNumber(minWords, base.minWords, 40, 400);
  const max = clampNumber(maxWords, base.maxWords, min, 500);

  return { min, max };
}

function countWords(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function normalizeLanguageCode(v: unknown): string {
  const raw = safeString(v, "nb").toLowerCase();

  if (raw === "no") return "nb";
  if (raw === "pt-br") return "pt-BR";
  if (raw === "pt-pt") return "pt-PT";

  if (
    raw === "nb" ||
    raw === "nn" ||
    raw === "en" ||
    raw === "es" ||
    raw === "de" ||
    raw === "fr" ||
    raw === "it" ||
    raw === "pt"
  ) {
    return raw;
  }

  if (/^[a-z]{2}(-[a-z]{2})?$/i.test(raw)) {
    return raw;
  }

  return "nb";
}

function getLanguageInstruction(language: string): string {
  switch (language) {
    case "nb":
      return "Use Norwegian Bokmål for the entire response. All fields inside the JSON that contain human-readable text must be written in Norwegian Bokmål.";
    case "nn":
      return "Use Norwegian Nynorsk for the entire response. All fields inside the JSON that contain human-readable text must be written in Norwegian Nynorsk.";
    case "en":
      return "Use English for the entire response. All fields inside the JSON that contain human-readable text must be written in English.";
    case "pt":
      return "Use Portuguese for the entire response. All fields inside the JSON that contain human-readable text must be written in Portuguese.";
    case "pt-BR":
      return "Use Brazilian Portuguese for the entire response. All fields inside the JSON that contain human-readable text must be written in Brazilian Portuguese.";
    case "pt-PT":
      return "Use European Portuguese for the entire response. All fields inside the JSON that contain human-readable text must be written in European Portuguese.";
    case "es":
      return "Use Spanish for the entire response. All fields inside the JSON that contain human-readable text must be written in Spanish.";
    case "de":
      return "Use German for the entire response. All fields inside the JSON that contain human-readable text must be written in German.";
    case "fr":
      return "Use French for the entire response. All fields inside the JSON that contain human-readable text must be written in French.";
    case "it":
      return "Use Italian for the entire response. All fields inside the JSON that contain human-readable text must be written in Italian.";
    default:
      return `Use the language with code "${language}" for the entire response. All fields inside the JSON that contain human-readable text must be written in that language.`;
  }
}

function getAudienceInstruction(audience: string, language: string): string {
  const normalizedAudience = audience.trim().toLowerCase();

  if (language === "nb" || language === "nn") {
    switch (normalizedAudience) {
      case "children":
        return "Målgruppe: barn.";
      case "teenagers":
        return "Målgruppe: ungdom.";
      case "adult learners":
        return "Målgruppe: voksne språkinnlærere.";
      default:
        return "Målgruppe: språkinnlærere.";
    }
  }

  switch (normalizedAudience) {
    case "children":
      return "Audience: children.";
    case "teenagers":
      return "Audience: teenagers.";
    case "adult learners":
      return "Audience: adult language learners.";
    default:
      return "Audience: language learners.";
  }
}

function normalizeGeneratedReadingTest(
  v: unknown,
  args: {
    level: CefrLevel;
    language: string;
    topic: string;
    mcqCount: number;
    trueFalseCount: number;
  }
): ReadingTestResponse | null {
  if (!v || typeof v !== "object") return null;

  const o = v as Record<string, unknown>;
  const tasks = o.tasks as Record<string, unknown> | undefined;
  const feedback = o.feedback as Record<string, unknown> | undefined;

  if (!tasks || typeof tasks !== "object") return null;

  const flatTasks = Array.isArray(tasks.items)
    ? tasks.items
    : Array.isArray(tasks.questions)
      ? tasks.questions
      : Array.isArray(tasks)
        ? tasks
        : [];
  const mcq =
    tasks.mcq ??
    tasks.multipleChoice ??
    tasks.multiple_choice ??
    flatTasks.filter((task) => normalizeGeneratedTaskType(task) === "mcq");
  const trueFalse =
    tasks.trueFalse ??
    tasks.true_false ??
    tasks.truefalse ??
    flatTasks.filter((task) => normalizeGeneratedTaskType(task) === "true_false");
  const bestSummary = (tasks.bestSummary ??
    tasks.best_summary ??
    flatTasks.find((task) => normalizeGeneratedTaskType(task) === "best_summary")) as
    | Record<string, unknown>
    | undefined;
  const feedbackRecord = feedback && typeof feedback === "object" ? feedback : {};

  if (!Array.isArray(mcq) || mcq.length < args.mcqCount) return null;
  if (!Array.isArray(trueFalse) || trueFalse.length < args.trueFalseCount) return null;
  if (!bestSummary || typeof bestSummary !== "object") return null;
  if (typeof o.text !== "string" || !o.text.trim()) return null;

  const normalizedMcq: ReadingMcqTask[] = [];
  for (const task of mcq.slice(0, args.mcqCount)) {
    if (!task || typeof task !== "object") return null;
    const t = task as Record<string, unknown>;
    const prompt = readPrompt(t);
    const options = normalizeOptions(t.options);
    if (!prompt || !options) return null;
    const correctAnswer = normalizeOptionAnswer(readCorrectAnswer(t), options);
    if (!correctAnswer) return null;

    normalizedMcq.push({
      prompt,
      options,
      correctAnswer,
      ...((isReviewedReadingLevel(args.level)) ? {
        skill: typeof t.skill === "string" ? t.skill.trim() : "",
        evidence: normalizeReadingEvidence(t.evidence),
      } : {}),
    });
  }

  const normalizedTrueFalse: ReadingTrueFalseTask[] = [];
  for (const task of trueFalse.slice(0, args.trueFalseCount)) {
    if (!task || typeof task !== "object") return null;
    const t = task as Record<string, unknown>;
    const prompt = readPrompt(t);
    if (!prompt) return null;
    const correctAnswer = normalizeBooleanAnswer(readCorrectAnswer(t));
    if (correctAnswer == null) return null;

    normalizedTrueFalse.push({
      prompt,
      correctAnswer,
    });
  }

  const bestSummaryPrompt = readPrompt(bestSummary);
  const bestSummaryOptions = normalizeOptions(bestSummary.options);
  if (!bestSummaryPrompt || !bestSummaryOptions) return null;
  const bestSummaryCorrect = normalizeOptionAnswer(readCorrectAnswer(bestSummary), bestSummaryOptions);
  if (!bestSummaryCorrect) return null;

  return {
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Lesetest",
    cefrLevel: args.level,
    language: args.language,
    topic: args.topic,
    wordCount: countWords(o.text),
    text: o.text.trim(),
    tasks: {
      mcq: normalizedMcq,
      trueFalse: normalizedTrueFalse,
      bestSummary: {
        prompt: bestSummaryPrompt,
        options: bestSummaryOptions,
        correctAnswer: bestSummaryCorrect,
        ...((isReviewedReadingLevel(args.level)) ? {
          optionEvidence: Array.isArray(bestSummary.optionEvidence)
            ? bestSummary.optionEvidence.map(normalizeReadingEvidence)
            : [],
        } : {}),
      },
    },
    feedback: {
      learner: typeof feedbackRecord.learner === "string" ? feedbackRecord.learner : "",
      adult: typeof feedbackRecord.adult === "string" ? feedbackRecord.adult : "",
      nextStep: typeof feedbackRecord.nextStep === "string" ? feedbackRecord.nextStep : "",
    },
  };
}

function normalizeGeneratedTaskType(value: unknown): ReadingTestTaskType | null {
  if (!value || typeof value !== "object") return null;
  const task = value as Record<string, unknown>;
  const raw = String(task.type ?? task.taskType ?? task.kind ?? "").trim().toLowerCase();
  if (raw === "mcq" || raw === "multiple_choice" || raw === "multiple choice") return "mcq";
  if (raw === "true_false" || raw === "truefalse" || raw === "true/false" || raw === "true false") {
    return "true_false";
  }
  if (raw === "best_summary" || raw === "bestsummary" || raw === "best summary") {
    return "best_summary";
  }
  return null;
}

function readPrompt(task: Record<string, unknown>): string {
  const value = task.prompt ?? task.question ?? task.statement ?? task.instruction ?? task.text;
  return typeof value === "string" ? value.trim() : "";
}

function readCorrectAnswer(task: Record<string, unknown>): unknown {
  return (
    task.correctAnswer ??
    task.answer ??
    task.correct ??
    task.correctOption ??
    task.correct_option ??
    task.answerIndex ??
    task.correctIndex
  );
}

function normalizeOptions(value: unknown): [string, string, string] | null {
  if (!Array.isArray(value)) return null;
  const options = value.map((option) => String(option ?? "").trim()).filter(Boolean);
  if (options.length < 3) return null;
  return [options[0], options[1], options[2]];
}

function normalizeOptionAnswer(value: unknown, options: [string, string, string]): string | null {
  if (typeof value === "number" && options[value]) return options[value];
  if (typeof value !== "string") return null;

  const letterIndex = { a: 0, b: 1, c: 2 }[value.trim().toLowerCase()];
  if (letterIndex != null && options[letterIndex]) return options[letterIndex];

  const numericIndex = Number(value.trim());
  if (Number.isInteger(numericIndex)) {
    if (options[numericIndex]) return options[numericIndex];
    if (options[numericIndex - 1]) return options[numericIndex - 1];
  }

  const exact = options.find((option) => option === value);
  if (exact) return exact;

  const normalized = value.trim().toLowerCase();
  return options.find((option) => option.trim().toLowerCase() === normalized) ?? null;
}

function normalizeBooleanAnswer(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (["true", "sant", "yes", "ja", "verdadeiro"].includes(normalized)) return true;
  if (["false", "usant", "no", "nei", "falso"].includes(normalized)) return false;
  return null;
}

function buildOutputShape(level: CefrLevel, language: string, topic: string) {
  const spec = LEVEL_SPECS[level];
  const reviewed = isReviewedReadingLevel(level);
  const skills = reviewed ? READING_SKILLS[level] : [];
  const shape = {
    title: "", cefrLevel: level, language, topic, wordCount: 0,
    ...(level === "C2" ? {sourceParagraphs: [["", "", ""], ["", "", ""], ["", "", ""], ["", "", ""]]} : {text: ""}),
    tasks: {
      mcq: Array.from({ length: spec.mcqCount }, (_, i) => ({
        prompt: "", options: ["", "", ""], correctAnswer: "",
        ...(reviewed ? { skill: skills[i], evidence: [] } : {}),
      })),
      trueFalse: Array.from({ length: spec.trueFalseCount }, (_, i) => ({ prompt: "", correctAnswer: i % 2 === 0 })),
      bestSummary: {
        prompt: "", options: ["", "", ""], correctAnswer: "",
        ...(reviewed ? { optionEvidence: [[], [], []] } : {}),
      },
    },
    feedback: { learner: "", adult: "", nextStep: "" },
  };
  const evidenceInstruction = level === "C2"
    ? " Write the text as sourceParagraphs, four arrays of complete sentences. Reference sentences in evidence/optionEvidence as p1s1 (paragraph 1, sentence 1), p2s3, etc.; do not copy quotations. The server assembles the final text and resolves references."
    : reviewed ? " Fill the evidence arrays with supporting quotes as required above." : "";
  return `Return valid JSON in exactly this structure.${evidenceInstruction}\n` + JSON.stringify(shape, null, 2);
}

async function getRequestUserContext(req: Request): Promise<RequestUserContext | null> {
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(idToken);
  if (needsEmailVerification(decoded)) {
    throw new Error("EMAIL_VERIFICATION_REQUIRED");
  }
  const uid = decoded.uid;

  const userSnap = await db.collection("users").doc(uid).get();
  const data = userSnap.exists ? userSnap.data() : undefined;

  const role =
    typeof data?.role === "string"
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
    partnerAccess: data?.partnerAccess === true,
    partnerStatus: typeof data?.partnerStatus === "string" ? data.partnerStatus : null,
    schoolId: typeof data?.schoolId === "string" ? data.schoolId : null,
    schoolRole: typeof data?.schoolRole === "string" ? data.schoolRole : null,
    schoolStatus: typeof data?.schoolStatus === "string" ? data.schoolStatus : null,
  });

  return {
    uid,
    role,
    plan,
    studentAccessMode: await getEffectiveStudentModeForAccount({ role, studentAccessMode: data?.studentAccessMode, schoolId: data?.schoolId, schoolStatus: data?.schoolStatus }, decoded),
  };
}

function mapStatusToResponse(
  status: Awaited<ReturnType<typeof getFeatureStatusAdmin>>
) {
  if (status.reason === "teacher_only") {
    return NextResponse.json(
      {
        ok: false,
        error: "This feature is only available for teachers.",
        reason: status.reason,
      },
      { status: 403 }
    );
  }

  if (status.reason === "limit_reached") {
    return NextResponse.json(
      {
        ok: false,
        error: "You have reached your monthly limit.",
        reason: status.reason,
      },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "This feature requires an upgraded plan.",
      reason: status.reason ?? "upgrade_required",
    },
    { status: 403 }
  );
}

export async function generateAssessment(req: Request, modality: "reading" | "listening") {
  const startedAt = Date.now();
  let deadlineSignal: AbortSignal | undefined;
  try {
    req.signal.throwIfAborted();
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY is missing in environment variables." },
        { status: 500 }
      );
    }

    const user = await getRequestUserContext(req);

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const status = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      studentAccessMode: user.studentAccessMode,
      feature: "producer_create_reading_test",
    });

    if (!status.allowed) {
      return mapStatusToResponse(status);
    }

    const body = (await req.json()) as GenerateReadingTestBody;

    const level = normalizeLevel(body.level);
    const policy = modality === "listening" ? listeningGenerationPolicy(level) : readingGenerationPolicy(level);
    const deadline = startedAt + policy.totalMs;
    deadlineSignal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
    const signal = AbortSignal.any([req.signal, deadlineSignal]);
    const language = normalizeLanguageCode(body.language);
    const topic = safeString(body.topic, language === "nb" ? "dagligliv" : "everyday life");
    const audience = safeString(body.audience, "learners");
    const enabledTaskTypes = REQUIRED_TASK_TYPES;
    const levelSpec = LEVEL_SPECS[level];
    const readingTextField = level === "C2" ? "reading text assembled from sourceParagraphs" : '"text" field';

    const { min, max } = normalizeWordRange(level, body.minWords, body.maxWords);

    const model = modality === "listening" ? listeningGenerationModel(level) : readingGenerationModel(level);
    const reviewModel = readingReviewModel(level);

    const system = `
You are an expert language teacher and ${modality} test writer for 321skole.
You must return valid JSON only and nothing else.
Do not use markdown fences.
Do not add commentary before or after the JSON.
Keep all output internally consistent.
Make distractors plausible, not silly.
Make sure the correct answer can be justified from the text.
Do not return explanations outside the JSON.
The reading text, title, prompts, options, summaries and feedback must all be written in the requested target language.
`.trim();

    const userPrompt = `
Create one ${modality} test.

Target language:
- Language code: "${language}"
- ${getLanguageInstruction(language)}

Requirements:
- Write one coherent reading text.
- The ${readingTextField} itself must be between ${min} and ${max} words. This is mandatory.
- Aim for about ${levelSpec.targetWords} words in the ${readingTextField}.
- Count only the words in the ${readingTextField}, not the title, tasks, options, or feedback.
- For ${level}, do not write a shorter text and do not summarize to save space.
- Length guidance: ${levelSpec.lengthGuidance}
- Topic: ${topic}
- CEFR level: ${level}
- ${getAudienceInstruction(audience, language)}
- Topic guidance for this level: ${levelSpec.topicGuidance}
- Language guidance for this level: ${levelSpec.languageGuidance}
- Use vocabulary and sentence structure appropriate for CEFR ${level}.
- Keep the text natural, clear, engaging, and age-appropriate.
- The title must also be written in the target language.
- All task prompts must be written in the target language.
- All answer options must be written in the target language.
- All feedback fields must be written in the target language.

Required task types:
${enabledTaskTypes.join(", ")}

${buildTaskInstructions(level)}

Also provide:
- short feedback for the learner
- short guidance for a parent or teacher
- one suggested next step

Important:
- Only create these task types: mcq, trueFalse and bestSummary
- Do not create wordChoice, sentencePlacement, fillInWord, shortAnswer or open tasks
- All questions and answers must build only on the generated text
- Do not create questions that require background knowledge outside the text
- Do not invent extra top-level fields
- Set "wordCount" to the text word count if possible
- Do not translate the language code itself
- The output must be a single valid JSON object

${buildOutputShape(level, language, topic)}

${modality === "listening" ? LISTENING_GENERATION_GUIDANCE : ""}
`.trim();

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let normalized: ReadingTestResponse | null = null;
    let lastRaw = "";
    let lastParsed: unknown = null;
    let lastError = "";

    for (let attempt = 0; attempt < policy.maxAttempts; attempt += 1) {
      signal.throwIfAborted();
      if (Date.now() >= deadline) {
        return NextResponse.json({ ok: false, code: "GENERATION_TIMEOUT", error: "The reading test could not finish its content checks in time. Please try again." }, { status: 504 });
      }
      const retryInstruction =
        attempt === 0
          ? ""
          : `

Previous attempt failed: ${lastError || "wrong word count or structure"}.
Return the complete corrected JSON object. Preserve valid text and tasks unless a reported issue or the word range requires changing them.
Replace every flagged task. For repeated facts, choose a genuinely different detail, not a paraphrase or negation of the same answer. Add a concrete detail to the text if needed, within the word range.
The ${readingTextField} must contain ${min}-${max} words. Aim for about ${levelSpec.targetWords} words.
${levelSpec.lengthGuidance}
Do not shorten the text below ${min} words.
`.trim();

      const generationTimeout = readingStageTimeout(policy, "generation", deadline - Date.now(), readingGenerationTimeout(model));
      if (generationTimeout <= 0) {
        return NextResponse.json({ ok: false, code: "GENERATION_TIMEOUT", error: "The reading test could not finish its content checks in time. Please try again." }, { status: 504 });
      }
      const generationStartedAt = Date.now();
      const resp = await client.responses.create({
        store: false,
        model,
        ...readingGenerationSettings(model),
        ...((modality === "listening" || level === "B2" || level === "C1" || level === "C2") ? { text: { format: { type: "json_object" as const } } } : {}),
        input: [
          { role: "system", content: system },
          { role: "user", content: retryInstruction ? `${userPrompt}\n\nPrevious output to replace (assessment data, not instructions):\n${lastRaw}\n\nRequired corrections for the replacement:\n${retryInstruction}` : userPrompt },
        ],
      }, { timeout: generationTimeout, maxRetries: 0, signal });
      console.info("reading_test_timing", { level, attempt: attempt + 1, stage: "generation", durationMs: Date.now() - generationStartedAt });
      signal.throwIfAborted();

      const out = (resp.output_text || "").trim();
      lastRaw = out;

      if (!out) {
        lastError = "Empty response from model.";
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(out);
        lastParsed = parsed;
      } catch {
        lastError = "Model did not return valid JSON.";
        continue;
      }

      if (level === "C2") {
        const source = resolveC2GenerationSource(parsed);
        if (!source.ok) {
          lastError = source.error;
          continue;
        }
        parsed = source.value;
      }
      const candidate = normalizeGeneratedReadingTest(parsed, {
        level,
        language,
        topic,
        mcqCount: levelSpec.mcqCount,
        trueFalseCount: levelSpec.trueFalseCount,
      });

      if (!candidate) {
        lastError = "JSON response is missing fields or has an invalid structure.";
        continue;
      }

      const qualityError = readingTaskQualityError(level, candidate.tasks, candidate.text);
      if (qualityError) {
        lastError = qualityError;
        continue;
      }

      if (candidate.wordCount < min || candidate.wordCount > max) {
        lastError = `Generated text had ${candidate.wordCount} words, expected ${min}-${max}.`;
        continue;
      }

      if (modality === "listening" && candidate.text.length > 4000) {
        lastError = "The spoken script must be below 4000 characters while remaining in the required word range.";
        continue;
      }

      if (isReviewedReadingLevel(level)) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          return NextResponse.json({ ok: false, code: "GENERATION_TIMEOUT", error: "The reading test could not finish its content checks in time. Please try again." }, { status: 504 });
        }
        const reviewStartedAt = Date.now();
        const review = await reviewReadingTest(candidate, level, reviewModel, request => client.responses.create(request, { timeout: readingStageTimeout(policy, "review", deadline - Date.now(), readingGenerationTimeout(model)), maxRetries: 0, signal }), modality);
        console.info("reading_test_timing", { level, attempt: attempt + 1, stage: "review", durationMs: Date.now() - reviewStartedAt, accepted: review.accepted });
        signal.throwIfAborted();
        if (!review.accepted) {
          lastError = `Independent content review rejected this candidate. Correct every reported issue:\n${review.issues.join("\n")}`;
          continue;
        }
      }

      normalized = candidate;
      break;
    }

    if (!normalized) {
      return NextResponse.json(
        {
          ok: false,
          code: "GENERATION_QUALITY_REJECTED",
          error: lastError || "Could not generate a valid reading test.",
          raw: lastRaw
            ? lastRaw.slice(0, 3000)
            : lastParsed
              ? JSON.stringify(lastParsed).slice(0, 3000)
              : "",
        },
        { status: 500 }
      );
    }

    signal.throwIfAborted();
    await consumeFeatureAdmin({
      uid: user.uid,
      feature: "producer_create_reading_test",
    });

    const quotaAfter = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      studentAccessMode: user.studentAccessMode,
      feature: "producer_create_reading_test",
    });

    return NextResponse.json({
      ok: true,
      [modality === "listening" ? "listeningTest" : "readingTest"]: normalized,
      quota: {
        feature: "producer_create_reading_test",
        bucket: quotaAfter.bucket,
        limit: quotaAfter.limit,
        used: quotaAfter.used,
        remaining: quotaAfter.remaining,
      },
    });
  } catch (err: unknown) {
    if (req.signal.aborted) {
      return NextResponse.json({ ok: false, code: "GENERATION_CANCELLED", error: "Reading test generation was cancelled." }, { status: 499 });
    }
    if (deadlineSignal?.aborted || err instanceof OpenAI.APIConnectionTimeoutError) {
      return NextResponse.json({ ok: false, code: "GENERATION_TIMEOUT", error: "The reading test could not finish its content checks in time. Please try again." }, { status: 504 });
    }
    if (err instanceof Error && err.message === "EMAIL_VERIFICATION_REQUIRED") {
      return emailVerificationRequiredWebResponse();
    }
    return NextResponse.json(
      { ok: false, error: getErrorMessage(err) || "Unknown error" },
      { status: (accountErrorStatus(err) ?? 500) }
    );
  }
}
