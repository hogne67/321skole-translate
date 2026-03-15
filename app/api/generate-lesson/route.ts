// app/api/generate-lesson/route.ts
import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type LessonTaskType = "truefalse" | "mcq" | "open";

type LessonTask = {
  id: string;
  type: LessonTaskType;
  order: number;
  prompt: string;
  options?: string[];
  correctAnswer?: string | boolean;
  explanation?: string;
};

type LessonJSON = {
  title?: string;
  level?: string;
  topic?: string;
  language?: string;
  sourceText?: string;
  text?: string;
  tasks?: unknown;
};

function toErrorString(err: unknown): string {
  if (!err) return "Generate failed";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;

  if (typeof err === "object" && err !== null) {
    const o = err as Record<string, unknown>;
    const message = typeof o.message === "string" ? o.message : "";
    const code = typeof o.code === "string" ? o.code : "";
    return message || code || "Generate failed";
  }

  return "Generate failed";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickString(obj: unknown, keys: string[]) {
  const rec = isRecord(obj) ? obj : null;
  for (const k of keys) {
    const v = rec?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickBoolean(obj: unknown, keys: string[]) {
  const rec = isRecord(obj) ? obj : null;
  for (const k of keys) {
    const v = rec?.[k];
    if (typeof v === "boolean") return v;
  }
  return false;
}

function isTaskType(v: unknown): v is LessonTaskType {
  return v === "truefalse" || v === "mcq" || v === "open";
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map((x) => String(x));
}

function normalizeLanguage(value: string): string {
  const v = value.trim();
  return v || "en";
}

function getLanguageInstruction(language: string) {
  const lower = language.toLowerCase();

  if (lower === "no" || lower === "nb" || lower === "nn") {
    return "Write everything in Norwegian.";
  }

  if (lower === "pt" || lower === "pt-br" || lower === "pt-pt") {
    return "Write everything in Portuguese.";
  }

  if (lower === "es") return "Write everything in Spanish.";
  if (lower === "fr") return "Write everything in French.";
  if (lower === "de") return "Write everything in German.";
  if (lower === "it") return "Write everything in Italian.";
  if (lower === "uk") return "Write everything in Ukrainian.";
  if (lower === "ar") return "Write everything in Arabic.";
  if (lower === "pl") return "Write everything in Polish.";
  if (lower === "tr") return "Write everything in Turkish.";
  if (lower === "ru") return "Write everything in Russian.";

  return `Write everything in the language with code "${language}".`;
}

function getLengthSpec(length: string) {
  if (length === "short") return "Reading text length: 90-140 words.";
  if (length === "long") return "Reading text length: 220-320 words.";
  return "Reading text length: 150-220 words.";
}

function getTaskSpec(level: string, closedOnly: boolean) {
  if (closedOnly) {
    if (level === "A1") {
      return 'Create 4 tasks total: 2 true/false and 2 mcq (3 options). Do not create open tasks.';
    }
    if (level === "A2") {
      return 'Create 5 tasks total: 2 true/false and 3 mcq (3 options). Do not create open tasks.';
    }
    return 'Create 6 tasks total: 2 true/false and 4 mcq (4 options). Do not create open tasks.';
  }

  if (level === "A1") {
    return "Create 4 tasks total: 2 true/false, 1 mcq (3 options), 1 open (very short).";
  }
  if (level === "A2") {
    return "Create 6 tasks total: 2 true/false, 2 mcq (4 options), 2 open (short).";
  }
  if (level === "B1") {
    return "Create 7 tasks total: 2 true/false, 2 mcq (4 options), 3 open (short/medium).";
  }
  if (level === "B2") {
    return "Create 8 tasks total: 2 true/false, 2 mcq (4 options), 4 open (medium).";
  }
  if (level === "C1") {
    return "Create 8 tasks total: 1 true/false, 2 mcq (4 options), 5 open (medium/long).";
  }
  return "Create 8 tasks total: 1 true/false, 2 mcq (4 options), 5 open (longer, more advanced).";
}

function normalizeTask(
  input: unknown,
  index: number,
  closedOnly: boolean
): LessonTask | null {
  if (!isRecord(input)) return null;

  const rawType = input.type;
  if (!isTaskType(rawType)) return null;
  if (closedOnly && rawType === "open") return null;

  const prompt =
    typeof input.prompt === "string"
      ? input.prompt.trim()
      : typeof input.question === "string"
        ? input.question.trim()
        : "";

  if (!prompt) return null;

  const options =
    rawType === "mcq"
      ? asStringArray(input.options) ?? asStringArray(input.choices) ?? []
      : asStringArray(input.options);

  const correctAnswerRaw =
    input.correctAnswer ??
    input.answer ??
    (rawType === "open" ? "" : undefined);

  let correctAnswer: string | boolean | undefined;
  if (typeof correctAnswerRaw === "string" || typeof correctAnswerRaw === "boolean") {
    correctAnswer = correctAnswerRaw;
  } else if (correctAnswerRaw != null) {
    correctAnswer = String(correctAnswerRaw);
  }

  return {
    id: typeof input.id === "string" ? input.id : `t${index + 1}`,
    type: rawType,
    order: typeof input.order === "number" ? input.order : index + 1,
    prompt,
    options: rawType === "mcq" ? options : options,
    correctAnswer,
    explanation:
      typeof input.explanation === "string" ? input.explanation : undefined,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as unknown;

    const topic = pickString(body, ["topic"]) || "Everyday life";
    const level = pickString(body, ["level"]) || "A2";
    const length = pickString(body, ["length"]) || "normal";
    const language = normalizeLanguage(pickString(body, ["language"]) || "en");
    const closedOnly = pickBoolean(body, ["closedOnly"]);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
    }

    const prompt =
      `Make a lesson for a student.\n` +
      `CEFR level: ${level}\n` +
      `Topic: ${topic}\n` +
      `Language code: ${language}\n` +
      `${getLanguageInstruction(language)}\n` +
      `${getLengthSpec(length)}\n\n` +
      `Tasks:\n${getTaskSpec(level, closedOnly)}\n\n` +
      `Return valid JSON only.\n` +
      `Preferred JSON shape:\n` +
      `{\n` +
      `  "title": "string",\n` +
      `  "level": "string",\n` +
      `  "topic": "string",\n` +
      `  "language": "string",\n` +
      `  "sourceText": "string",\n` +
      `  "tasks": [\n` +
      `    {\n` +
      `      "id": "unique short id",\n` +
      `      "type": "truefalse|mcq|open",\n` +
      `      "order": 1,\n` +
      `      "prompt": "string",\n` +
      `      "options": ["string"],\n` +
      `      "correctAnswer": "string|boolean",\n` +
      `      "explanation": "string"\n` +
      `    }\n` +
      `  ]\n` +
      `}\n\n` +
      `Rules:\n` +
      `- sourceText must match the CEFR level\n` +
      `- Write the text, prompts, answer options and explanations in the requested language\n` +
      `- For truefalse: correctAnswer must be true or false\n` +
      `- For mcq: options must exist and correctAnswer must equal one of the options\n` +
      `- For open: correctAnswer should be empty string\n` +
      `- Use simple, clear language and coherent text\n` +
      (closedOnly ? `- Do not create any open tasks\n` : "");

    const r = await client.responses.create({
      model: "gpt-4o-mini",
      text: { format: { type: "json_object" } },
      input: [
        {
          role: "system",
          content:
            "You create language learning lessons. Output valid JSON only. Keep it classroom-friendly and factually safe.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const raw = r.output_text?.trim();

    if (!raw) {
      return Response.json({ error: "Empty response from model." }, { status: 500 });
    }

    let parsedUnknown: unknown;
    try {
      parsedUnknown = JSON.parse(raw);
    } catch {
      return Response.json(
        { error: "Invalid JSON from model.", raw },
        { status: 500 }
      );
    }

    if (!isRecord(parsedUnknown)) {
      return Response.json(
        { error: "Model returned non-object JSON.", raw },
        { status: 500 }
      );
    }

    const parsed = parsedUnknown as LessonJSON;
    const tasksRaw = Array.isArray(parsed.tasks) ? parsed.tasks : [];

    const tasks = tasksRaw
      .map((task, index) => normalizeTask(task, index, closedOnly))
      .filter((task): task is LessonTask => task !== null);

    const sourceText =
      typeof parsed.sourceText === "string"
        ? parsed.sourceText
        : typeof parsed.text === "string"
          ? parsed.text
          : "";

    if (!sourceText.trim()) {
      return Response.json(
        { error: "Model returned lesson without sourceText.", raw },
        { status: 500 }
      );
    }

    if (tasks.length === 0) {
      return Response.json(
        { error: "Model returned lesson without valid tasks.", raw },
        { status: 500 }
      );
    }

    return Response.json({
      title: String(parsed.title ?? `Lesson: ${topic}`),
      level: String(parsed.level ?? level),
      topic: String(parsed.topic ?? topic),
      language: typeof parsed.language === "string" && parsed.language.trim()
        ? parsed.language
        : language,
      sourceText,
      tasks,
    });
  } catch (err: unknown) {
    console.error("Generate lesson route error:", err);
    return Response.json({ error: toErrorString(err) }, { status: 500 });
  }
}