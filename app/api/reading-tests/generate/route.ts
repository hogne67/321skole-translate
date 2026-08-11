import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getFeatureStatusAdmin,
  consumeFeatureAdmin,
} from "@/lib/featureGuardAdmin";
import { getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";
import { emailVerificationRequiredWebResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";

export const runtime = "nodejs";

type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

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
};

type ReadingTrueFalseTask = {
  prompt: string;
  correctAnswer: boolean;
};

type ReadingBestSummaryTask = {
  prompt: string;
  options: [string, string, string];
  correctAnswer: string;
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

type LevelSpec = {
  minWords: number;
  maxWords: number;
  targetWords: number;
  mcqCount: number;
  trueFalseCount: number;
  topicGuidance: string;
  languageGuidance: string;
  lengthGuidance: string;
};

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
};

const REQUIRED_TASK_TYPES: ReadingTestTaskType[] = ["mcq", "true_false", "best_summary"];

const LEVEL_SPECS: Record<CefrLevel, LevelSpec> = {
  A1: {
    minWords: 60,
    maxWords: 80,
    targetWords: 70,
    mcqCount: 2,
    trueFalseCount: 1,
    topicGuidance: "Familiar everyday situations.",
    languageGuidance:
      "Use short sentences, easy words, and very little information in each sentence.",
    lengthGuidance: "Write one short paragraph of about 70 words.",
  },
  A2: {
    minWords: 100,
    maxWords: 150,
    targetWords: 125,
    mcqCount: 3,
    trueFalseCount: 2,
    topicGuidance: "Familiar topics from everyday life, school, work, family, and leisure.",
    languageGuidance:
      'Use simple sentences and some connectors such as "fordi", "men", "også" and "etterpå" when the target language is Norwegian.',
    lengthGuidance: "Write 2 paragraphs with about 60 words each.",
  },
  B1: {
    minWords: 150,
    maxWords: 220,
    targetWords: 185,
    mcqCount: 4,
    trueFalseCount: 3,
    topicGuidance: "Everyday life, society, work, school, and simple factual texts.",
    languageGuidance:
      "Use a more coherent text with details, cause and effect, and simple reflection.",
    lengthGuidance: "Write 3 paragraphs with about 60 words each.",
  },
  B2: {
    minWords: 220,
    maxWords: 320,
    targetWords: 270,
    mcqCount: 5,
    trueFalseCount: 4,
    topicGuidance: "Society, work, education, culture, and current topics.",
    languageGuidance:
      "Use a more complex text with viewpoints, nuance, and some indirect information.",
    lengthGuidance:
      "Write 4 paragraphs with about 65-75 words each. The text should be developed enough to include viewpoints, nuance, examples, and some indirect information.",
  },
  C1: {
    minWords: 180,
    maxWords: 260,
    targetWords: 220,
    mcqCount: 5,
    trueFalseCount: 4,
    topicGuidance: "Complex but accessible topics for advanced language learners.",
    languageGuidance:
      "Use advanced, coherent language with nuance while keeping the test assessable.",
    lengthGuidance: "Write 3-4 coherent paragraphs.",
  },
  C2: {
    minWords: 180,
    maxWords: 260,
    targetWords: 220,
    mcqCount: 5,
    trueFalseCount: 4,
    topicGuidance: "Complex but accessible topics for advanced language learners.",
    languageGuidance:
      "Use advanced, coherent language with nuance while keeping the test assessable.",
    lengthGuidance: "Write 3-4 coherent paragraphs.",
  },
};

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

function buildTaskInstructions(spec: LevelSpec) {
  const blocks: string[] = [];

  blocks.push(`Multiple choice:
- Create exactly ${spec.mcqCount} multiple choice questions.
- Each question must have exactly 3 options.
- Only 1 option is correct.
- The correctAnswer must be exactly equal to one of the options.
- The wrong options must be plausible, but not tricky or misleading.
- The wrong options must be clearly wrong based on the text.`);

  blocks.push(`True or false:
- Create exactly ${spec.trueFalseCount} true/false statements.
- Each statement must be answerable directly from the text.
- Each statement must be clearly true or clearly false based on the text.
- The prompt must be the statement itself.
- correctAnswer must be a boolean: true or false.`);

  blocks.push(`Best summary:
- Create exactly 1 best summary task.
- The task must have exactly 3 short summaries of the whole text.
- Only 1 summary must clearly be the best representation of the main idea.
- The 2 wrong summaries should be believable, but either too narrow, contain a wrong main point, or exaggerate something.
- The correctAnswer must be exactly equal to one of the options.`);

  return blocks.join("\n\n");
}

function buildOutputShape(level: CefrLevel, language: string, topic: string) {
  return `Return valid JSON in exactly this structure:
{
  "title": "",
  "cefrLevel": "${level}",
  "language": "${language}",
  "topic": "${topic}",
  "wordCount": 0,
  "text": "",
  "tasks": {
    "mcq": [
      {
        "prompt": "",
        "options": ["", "", ""],
        "correctAnswer": ""
      }
    ],
    "trueFalse": [
      {
        "prompt": "",
        "correctAnswer": true
      }
    ],
    "bestSummary": {
      "prompt": "",
      "options": ["", "", ""],
      "correctAnswer": ""
    }
  },
  "feedback": {
    "learner": "",
    "adult": "",
    "nextStep": ""
  }
}`;
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
    schoolId: typeof data?.schoolId === "string" ? data.schoolId : null,
    schoolRole: typeof data?.schoolRole === "string" ? data.schoolRole : null,
    schoolStatus: typeof data?.schoolStatus === "string" ? data.schoolStatus : null,
  });

  return { uid, role, plan };
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

export async function POST(req: Request) {
  try {
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
      feature: "producer_create_reading_test",
    });

    if (!status.allowed) {
      return mapStatusToResponse(status);
    }

    const body = (await req.json()) as GenerateReadingTestBody;

    const level = normalizeLevel(body.level);
    const language = normalizeLanguageCode(body.language);
    const topic = safeString(body.topic, language === "nb" ? "dagligliv" : "everyday life");
    const audience = safeString(body.audience, "learners");
    const enabledTaskTypes = REQUIRED_TASK_TYPES;
    const levelSpec = LEVEL_SPECS[level];

    const { min, max } = normalizeWordRange(level, body.minWords, body.maxWords);

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system = `
You are an expert language teacher and reading test writer for 321skole.
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
Create one reading test.

Target language:
- Language code: "${language}"
- ${getLanguageInstruction(language)}

Requirements:
- Write one coherent reading text.
- The "text" field itself must be between ${min} and ${max} words. This is mandatory.
- Aim for about ${levelSpec.targetWords} words in the "text" field.
- Count only the words inside the "text" field, not the title, tasks, options, or feedback.
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

${buildTaskInstructions(levelSpec)}

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
`.trim();

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let normalized: ReadingTestResponse | null = null;
    let lastRaw = "";
    let lastParsed: unknown = null;
    let lastError = "";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const retryInstruction =
        attempt === 0
          ? ""
          : `

Previous attempt failed: ${lastError || "wrong word count or structure"}.
You must now regenerate the whole JSON.
The "text" field must contain ${min}-${max} words. Aim for about ${levelSpec.targetWords} words.
${levelSpec.lengthGuidance}
Do not shorten the text below ${min} words.
`.trim();

      const resp = await client.responses.create({
        model,
        temperature: 0.4,
        max_output_tokens: 5000,
        input: [
          { role: "system", content: system },
          { role: "user", content: retryInstruction ? `${userPrompt}\n\n${retryInstruction}` : userPrompt },
        ],
      });

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

      if (candidate.wordCount < min || candidate.wordCount > max) {
        lastError = `Generated text had ${candidate.wordCount} words, expected ${min}-${max}.`;
        continue;
      }

      normalized = candidate;
      break;
    }

    if (!normalized) {
      return NextResponse.json(
        {
          ok: false,
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

    await consumeFeatureAdmin({
      uid: user.uid,
      feature: "producer_create_reading_test",
    });

    const quotaAfter = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      feature: "producer_create_reading_test",
    });

    return NextResponse.json({
      ok: true,
      readingTest: normalized,
      quota: {
        feature: "producer_create_reading_test",
        bucket: quotaAfter.bucket,
        limit: quotaAfter.limit,
        used: quotaAfter.used,
        remaining: quotaAfter.remaining,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "EMAIL_VERIFICATION_REQUIRED") {
      return emailVerificationRequiredWebResponse();
    }
    return NextResponse.json(
      { ok: false, error: getErrorMessage(err) || "Unknown error" },
      { status: 500 }
    );
  }
}
