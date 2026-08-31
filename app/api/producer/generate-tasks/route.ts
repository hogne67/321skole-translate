// app/api/producer/generate-tasks/route.ts
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getFeatureStatusAdmin,
  consumeFeatureAdmin,
} from "@/lib/featureGuardAdmin";
import { getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";
import { emailVerificationRequiredResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";

export const runtime = "nodejs";

type GenerateTasksBody = {
  level?: string;
  language?: string;
  topic?: string;
  textType?: string;
  text?: string;
  tasks?: {
    mcq?: number;
    trueFalse?: number;
    facts?: number;
    reflection?: number;
  };
  a1Start?: A1StartConfig;
};

type A1StartConfig = {
  type?: string;
  verb?: string;
  tense?: string;
  sentenceCount?: number;
  topic?: string;
  trueFalseCount?: number;
  imageSentenceCount?: number;
  verbSentenceCount?: number;
  wordClass?: string;
  word?: string;
  focusSound?: string;
  soundSentenceCount?: number;
  soundWordCount?: number;
};

type TasksOnly = {
  multipleChoice: Array<{
    q: string;
    options: [string, string, string, string];
    answerIndex: 0 | 1 | 2 | 3;
  }>;
  trueFalse: Array<{ statement: string; answer: boolean }>;
  writeFacts: string[];
  reflectionQuestions: string[];
};

type OpenAIErrorLike = { message?: string; code?: string | number };

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
  studentAccessMode?: string | null;
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

  return {
    uid,
    role,
    plan,
    studentAccessMode:
      typeof data?.studentAccessMode === "string" ? data.studentAccessMode : null,
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

function resolveLanguageName(code: string): string {
  const c = code.trim().toLowerCase();

  if (c === "nb" || c === "no" || c === "nn") return "Norwegian";
  if (c === "en") return "English";
  if (c === "pt") return "Portuguese";
  if (c === "pt-br") return "Brazilian Portuguese";
  if (c === "es") return "Spanish";
  if (c === "de") return "German";
  if (c === "fr") return "French";
  if (c === "it") return "Italian";
  if (c === "pl") return "Polish";
  if (c === "uk") return "Ukrainian";
  if (c === "ar") return "Arabic";

  return code;
}

function clampCount(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function buildOpenTaskGuidance(level: string, languageName: string) {
  const normalized = level.trim().toUpperCase();

  if (normalized === "A1") {
    return `
A1 open question rules:
- At A1, reflectionQuestions are NOT real reflection tasks. Treat them as short, concrete open comprehension questions.
- Ask about something clearly found in the source text.
- The learner should answer with a word, phrase, or one very short sentence.
- Do not ask yes/no questions.
- Do not ask "What do you think...?", "Why do you think...?", "Explain...", "Write about...", or "What is important...?"
- Do not ask for feelings, values, causes, consequences, comparison, interpretation, or personal reflection.
- Prefer simple question words such as who, what, where, what does, what likes, what happens.
- Each reflectionQuestions item must be one short question only, with no follow-up instruction.
- Example in Norwegian: "Hva liker Lene med jobben sin?"
- Keep the language natural for ${languageName} and CEFR ${level}.
`.trim();
  }

  const levelGuidance =
    normalized === "A2"
        ? "A2: Use simple everyday language. Ask for an opinion, feeling, or choice, and invite one reason."
        : normalized === "B1"
          ? "B1: Ask the learner to reflect, give a personal opinion, imagine a situation, or explain what people can learn. Invite 2-4 connected sentences."
          : normalized === "B2"
            ? "B2: Ask for a more developed reflection with reasons, consequences, different perspectives, or comparison with society or the learner's own experience."
            : "C1/C2: Ask for nuanced reflection, interpretation, values, reliability, consequences, perspectives, or critical thinking. The task can invite a longer, more precise answer.";

  return `
Open task quality rules:
- reflectionQuestions must be richer than a single bare question.
- Each reflectionQuestions item should normally contain 2 short parts in one string: first the main question, then a short follow-up telling what the answer can include.
- Use formats like: "What do you think...? Explain why.", "How do you think it felt...? Write about thoughts, feelings and challenges.", "If you were ..., what would you do? Give reasons for your choice."
- Prefer reflection, personal opinion, perspective-taking, values, cause/effect, or what people can learn from the text.
- A yes/no question is allowed only if it also asks the learner to explain why.
- The question must be grounded in the source text, but it may ask the learner to imagine, evaluate, or connect the text to their own thinking.
- Do not ask for facts only in reflectionQuestions; factual recall belongs in writeFacts, multipleChoice, or trueFalse.
- Keep the language natural for ${languageName} and CEFR ${level}.
- ${levelGuidance}
`.trim();
}

function buildA1StartTaskPrompt(args: {
  languageName: string;
  text: string;
  config: A1StartConfig;
}) {
  const isHighFrequency = args.config.type === "high_frequency_words";
  const isSoundLadder = args.config.type === "sound_reading_ladder";
  if (isSoundLadder) return buildA1StartSoundLadderTaskPrompt(args);
  const verb = String(args.config.verb || "").trim();
  const word = String(args.config.word || "").trim();
  const targetWord = isHighFrequency ? word : verb;
  if (!targetWord) throw new Error("A target verb or word is required for A1 Start.");
  const trueFalseCount = clampCount(Number(args.config.trueFalseCount ?? 5), 0, 10, 5);
  const imageSentenceCount = clampCount(Number(args.config.imageSentenceCount ?? 5), 0, 10, 5);
  const verbSentenceCount = clampCount(Number(args.config.verbSentenceCount ?? 5), 0, 10, 5);

  return `
Create very simple tasks for an A1 Start learner.

Target language: ${args.languageName}
Target ${isHighFrequency ? "high-frequency word" : "verb"}: ${targetWord}

SOURCE SENTENCES:
"""
${args.text}
"""

Return valid JSON only in this exact structure:
{
  "tasks": {
    "multipleChoice": [],
    "trueFalse": [
      { "statement": "A simple statement about the source sentences.", "answer": true }
    ],
    "writeFacts": [],
    "reflectionQuestions": [
      "Write ${imageSentenceCount} sentences for the picture.",
      "Write ${verbSentenceCount} sentences using the ${isHighFrequency ? "word" : "verb"} \\"${targetWord}\\"."
    ]
  }
}

Strict rules:
- Write every task and option in ${args.languageName}.
- Keep the instructions extremely short and concrete.
- Create exactly ${trueFalseCount} true/false statements based only on the source sentences.
- Each true/false statement must be simple, meaningful, and clearly checkable against the source sentences.
- ${imageSentenceCount > 0
    ? `Return exactly one open instruction meaning: Write ${imageSentenceCount} sentences for the picture.`
    : "Do not return an open instruction."}
- ${verbSentenceCount > 0
    ? `Return exactly one open instruction meaning: Write ${verbSentenceCount} sentences using the ${isHighFrequency ? "word" : "verb"} "${targetWord}".`
    : `Do not return an instruction about writing sentences with the ${isHighFrequency ? "word" : "verb"} "${targetWord}".`}
- Do not add explanations, reflection, factual recall, multiple choice, or other tasks.
`.trim();
}

function buildA1StartSoundLadderTaskPrompt(args: {
  languageName: string;
  text: string;
  config: A1StartConfig;
}) {
  const focusSound = String(args.config.focusSound || "").trim();
  const soundWordCount = [10, 14, 20].includes(Number(args.config.soundWordCount))
    ? Number(args.config.soundWordCount)
    : 10;
  if (!focusSound) throw new Error("A focus sound is required for A1 Start sound ladder.");

  return `
Create very simple tasks for an A1 Start learner.

Target language: ${args.languageName}
Focus sound: ${focusSound}

SOURCE TEXT:
"""
${args.text}
"""

Return valid JSON only in this exact structure:
{
  "tasks": {
    "multipleChoice": [],
    "trueFalse": [
      { "statement": "A simple statement about the source text.", "answer": true }
    ],
    "writeFacts": [],
      "reflectionQuestions": [
      "Write ${soundWordCount} words with the ${focusSound} sound.",
      "Write ${soundWordCount} sentences with the ${focusSound} sound.",
      "Write 5 sentences for the picture."
    ]
  }
}

Strict rules:
- Write every task in ${args.languageName}.
- Keep all tasks very short and concrete.
- Create exactly 5 true/false statements based only on the source text.
- Each true/false statement must be simple, meaningful, and clearly checkable against the source text.
- Create exactly these 3 open task meanings:
  1. Write ${soundWordCount} words with the focus sound.
  2. Write ${soundWordCount} sentences with the focus sound.
  3. Write 5 sentences for the picture.
- Do not create multiple choice, explanations, factual recall, or extra tasks.
`.trim();
}

function buildA1StartImagePrompt(languageName: string, count: number): string {
  if (languageName === "Norwegian") return `Skriv ${count} setninger til bildet.`;
  if (languageName === "Portuguese" || languageName === "Brazilian Portuguese") {
    return `Escreva ${count} frases sobre a imagem.`;
  }
  return `Write ${count} sentences for the picture.`;
}

function buildA1StartVerbPrompt(languageName: string, count: number, verb: string): string {
  if (languageName === "Norwegian") return `Skriv ${count} setninger med verbet "${verb}".`;
  if (languageName === "Portuguese" || languageName === "Brazilian Portuguese") {
    return `Escreva ${count} frases com o verbo "${verb}".`;
  }
  return `Write ${count} sentences using the verb "${verb}".`;
}

function buildA1StartWordPrompt(languageName: string, count: number, word: string): string {
  if (languageName === "Norwegian") return `Skriv ${count} setninger med ordet "${word}".`;
  if (languageName === "Portuguese" || languageName === "Brazilian Portuguese") {
    return `Escreva ${count} frases com a palavra "${word}".`;
  }
  return `Write ${count} sentences using the word "${word}".`;
}

function buildA1StartSoundFallbackTasks(languageName: string, focusSound: string, soundWordCount: number): string[] {
  if (languageName === "Norwegian") {
    return [
      `Skriv ${soundWordCount} ord med ${focusSound}-lyden.`,
      `Skriv ${soundWordCount} setninger med ${focusSound}-lyden.`,
      "Skriv 5 setninger til bildet.",
    ];
  }
  if (languageName === "Portuguese" || languageName === "Brazilian Portuguese") {
    return [
      `Escreva ${soundWordCount} palavras com o som ${focusSound}.`,
      `Escreva ${soundWordCount} frases com o som ${focusSound}.`,
      "Escreva 5 frases sobre a imagem.",
    ];
  }
  return [
    `Write ${soundWordCount} words with the ${focusSound} sound.`,
    `Write ${soundWordCount} sentences with the ${focusSound} sound.`,
    "Write 5 sentences for the picture.",
  ];
}

function buildA1StartTrueFalseFallback(text: string, count: number): TasksOnly["trueFalse"] {
  const lines = Array.from(
    new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/[.!?]+$/, ""))
        .filter(Boolean)
    )
  );
  if (lines.length === 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const source = lines[index % lines.length];
    if (index % 2 === 0 || lines.length === 1) {
      return { statement: source, answer: true };
    }

    const words = source.split(/\s+/);
    const replacement = lines[(index + 1) % lines.length].split(/\s+/).at(-1);
    if (words.length >= 3 && replacement && replacement !== words.at(-1)) {
      words[words.length - 1] = replacement;
      return { statement: words.join(" "), answer: false };
    }

    return { statement: source, answer: true };
  });
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY mangler i .env.local" },
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
      feature: "producer_create_lesson",
    });

    if (!status.allowed) {
      return mapStatusToResponse(status);
    }

    const body = (await req.json()) as GenerateTasksBody;

    const level = String(body.level || "A2").trim();
    const language = String(body.language || "en").trim();
    const languageName = resolveLanguageName(language);
    const topic = String(body.topic || "Untitled topic").trim();
    const textType = String(body.textType || "Everyday story").trim();
    const text = String(body.text || "").trim();

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "Mangler 'text' i request body." },
        { status: 400 }
      );
    }

    const mcq = clampCount(Number(body.tasks?.mcq ?? 6), 0, 20, 6);
    const trueFalse = clampCount(Number(body.tasks?.trueFalse ?? 10), 0, 30, 10);
    const facts = clampCount(Number(body.tasks?.facts ?? 6), 0, 10, 6);
    const reflection = clampCount(Number(body.tasks?.reflection ?? 3), 0, 20, 3);
    const isA1Start = level === "A1_START";
    const isA1 = level.toUpperCase() === "A1";

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system = isA1Start
      ? `
You create highly controlled beginning-reading tasks for 321skole.
You must return valid JSON only.
All task texts must be written only in the requested target language.
`.trim()
      : `
You create CEFR-adapted reading tasks for 321skole.
You must return valid JSON only.
The output language must strictly follow the requested target language.
Do not default to the UI language, prompt language, instruction language, or topic language unless it matches the requested target language.
All task texts must be written only in the requested target language.
`.trim();

    const userPrompt = isA1Start
      ? buildA1StartTaskPrompt({
        languageName,
        text,
        config: body.a1Start || {},
      })
      : `
Create tasks based ONLY on the text below.

Target language: ${languageName}
CEFR level: ${level}
Topic: ${topic}
Text type: ${textType}

SOURCE TEXT (use this as the factual basis):
"""
${text}
"""

Important rules:
- All questions, statements, options, prompts, and task texts must be written in ${languageName}.
- Do not use Norwegian, English, or any other language unless it is the target language.
- Do not let the language of the source text instructions or topic override the target language.
- Base the tasks only on information found in the source text.
- Do not invent facts that are not supported by the source text.
- The task language must match CEFR level ${level}.
- multipleChoice must always contain exactly 4 options.
- answerIndex must point to the correct option.
- trueFalse statements must be checkable against the source text.
- writeFacts should be short task prompts suitable for the learner.
- reflectionQuestions should be ${isA1
    ? "short, concrete, open comprehension questions based directly on the source text"
    : "open-ended, thoughtful, and relevant to the source text"}.

${buildOpenTaskGuidance(level, languageName)}

Return EXACTLY valid JSON with no markdown and no extra text in this structure:
{
  "tasks": {
    "multipleChoice": [
      { "q": string, "options": [string, string, string, string], "answerIndex": 0 }
    ],
    "trueFalse": [
      { "statement": string, "answer": true }
    ],
    "writeFacts": [string],
    "reflectionQuestions": [string]
  }
}

Counts:
- multipleChoice: ${mcq}
- trueFalse: ${trueFalse}
- writeFacts: ${facts}
- reflectionQuestions: ${reflection}
`.trim();

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const resp = await client.responses.create({
      model,
      text: { format: { type: "json_object" } },
      input: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });

    const out = (resp.output_text || "").trim();
    if (!out) {
      return NextResponse.json(
        { ok: false, error: "Tomt svar fra modellen." },
        { status: 500 }
      );
    }

    let parsed: { tasks: TasksOnly };
    try {
      parsed = JSON.parse(out) as { tasks: TasksOnly };
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Modellen returnerte ikke gyldig JSON.",
          raw: out.slice(0, 2000),
        },
        { status: 500 }
      );
    }

    if (!parsed?.tasks) {
      return NextResponse.json(
        { ok: false, error: "Mangler 'tasks' i JSON-respons." },
        { status: 500 }
      );
    }

    if (isA1Start) {
      const requestedTrueFalse = clampCount(Number(body.a1Start?.trueFalseCount ?? 5), 0, 10, 5);
      const requestedImageSentences = clampCount(Number(body.a1Start?.imageSentenceCount ?? 5), 0, 10, 5);
      const requestedVerbSentences = clampCount(Number(body.a1Start?.verbSentenceCount ?? 5), 0, 10, 5);
      const selectedVerb = String(body.a1Start?.verb || "").trim();
      const selectedWord = String(body.a1Start?.word || "").trim();
      const isHighFrequency = body.a1Start?.type === "high_frequency_words";
      const isSoundLadder = body.a1Start?.type === "sound_reading_ladder";
      if (isSoundLadder) {
        const focusSound = String(body.a1Start?.focusSound || "").trim();
        const soundWordCount = [10, 14, 20].includes(Number(body.a1Start?.soundWordCount))
          ? Number(body.a1Start?.soundWordCount)
          : 10;
        const generatedTrueFalse = Array.isArray(parsed.tasks.trueFalse)
          ? parsed.tasks.trueFalse.slice(0, 5)
          : [];
        const fallbackTrueFalse = buildA1StartTrueFalseFallback(text, 5);
        parsed.tasks = {
          multipleChoice: [],
          trueFalse: [
            ...generatedTrueFalse,
            ...fallbackTrueFalse.slice(generatedTrueFalse.length),
          ].slice(0, 5),
          writeFacts: [],
          reflectionQuestions: buildA1StartSoundFallbackTasks(
            languageName,
            focusSound,
            soundWordCount
          ),
        };
      } else {
      const generatedTrueFalse = Array.isArray(parsed.tasks.trueFalse)
        ? parsed.tasks.trueFalse.slice(0, requestedTrueFalse)
        : [];
      const fallbackTrueFalse = buildA1StartTrueFalseFallback(text, requestedTrueFalse);
      parsed.tasks = {
        multipleChoice: [],
        trueFalse: [
          ...generatedTrueFalse,
          ...fallbackTrueFalse.slice(generatedTrueFalse.length),
        ].slice(0, requestedTrueFalse),
        writeFacts: [],
        reflectionQuestions: [
          ...(requestedImageSentences > 0
            ? [buildA1StartImagePrompt(languageName, requestedImageSentences)]
            : []),
          ...(requestedVerbSentences > 0
            ? [
              isHighFrequency
                ? buildA1StartWordPrompt(languageName, requestedVerbSentences, selectedWord)
                : buildA1StartVerbPrompt(languageName, requestedVerbSentences, selectedVerb),
            ]
            : []),
        ],
      };
      }
    }

    await consumeFeatureAdmin({
      uid: user.uid,
      feature: "producer_create_lesson",
    });

    const quotaAfter = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      studentAccessMode: user.studentAccessMode,
      feature: "producer_create_lesson",
    });

    return NextResponse.json({
      ok: true,
      tasks: parsed.tasks,
      quota: {
        feature: "producer_create_lesson",
        bucket: quotaAfter.bucket,
        limit: quotaAfter.limit,
        used: quotaAfter.used,
        remaining: quotaAfter.remaining,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "EMAIL_VERIFICATION_REQUIRED") {
      return emailVerificationRequiredResponse();
    }
    return NextResponse.json(
      { ok: false, error: getErrorMessage(err) || "Ukjent feil" },
      { status: 500 }
    );
  }
}
