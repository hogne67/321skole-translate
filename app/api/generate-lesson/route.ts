// app/api/generate-lesson/route.ts
import OpenAI from "openai";

export const runtime = "nodejs";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type LessonTaskType = "truefalse" | "mcq" | "open";

type LessonTask = {
  id: string;
  type: LessonTaskType;
  order: number;
  prompt: string;
  options?: string[];
  correctAnswer?: string | boolean;
};

type LessonJSON = {
  title?: string;
  level?: string;
  topic?: string;
  sourceText?: string;
  tasks?: unknown;
};

function toErrorString(err: unknown): string {
  if (!err) return "Generate failed";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const message = typeof o.message === "string" ? o.message : "";
    const code = typeof o.code === "string" ? o.code : "";
    return message || code || "Generate failed";
  }

  return "Generate failed";
}

function pickString(obj: unknown, keys: string[]) {
  const rec = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  for (const k of keys) {
    const v = rec?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function isTaskType(v: unknown): v is LessonTaskType {
  return v === "truefalse" || v === "mcq" || v === "open";
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map((x) => String(x));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as unknown;

    const topic = pickString(body, ["topic"]) || "Everyday life";
    const level = pickString(body, ["level"]) || "A2";
    const length = pickString(body, ["length"]) || "normal"; // short | normal | long

    const lengthSpec =
      length === "short"
        ? "Reading text length: 90–140 words."
        : length === "long"
          ? "Reading text length: 220–320 words."
          : "Reading text length: 150–220 words.";

    const taskSpec =
      level === "A1"
        ? "Create 4 tasks total: 2 true/false, 1 mcq (3 options), 1 open (very short)."
        : level === "A2"
          ? "Create 6 tasks total: 2 true/false, 2 mcq (4 options), 2 open (short)."
          : level === "B1"
            ? "Create 7 tasks total: 2 true/false, 2 mcq (4 options), 3 open (short/medium)."
            : level === "B2"
              ? "Create 8 tasks total: 2 true/false, 2 mcq (4 options), 4 open (medium)."
              : level === "C1"
                ? "Create 8 tasks total: 1 true/false, 2 mcq (4 options), 5 open (medium/long)."
                : "Create 8 tasks total: 1 true/false, 2 mcq (4 options), 5 open (longer, more advanced).";

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
          content:
            `Make a lesson for a student.\n` +
            `CEFR level: ${level}\n` +
            `Topic: ${topic}\n` +
            `${lengthSpec}\n\n` +
            `Tasks:\n${taskSpec}\n\n` +
            `Return JSON EXACTLY like this shape:\n` +
            `{\n` +
            `  "title": "string",\n` +
            `  "level": "A1|A2|B1|B2|C1|C2",\n` +
            `  "topic": "string",\n` +
            `  "sourceText": "string",\n` +
            `  "tasks": [\n` +
            `    {\n` +
            `      "id": "unique short id",\n` +
            `      "type": "truefalse|mcq|open",\n` +
            `      "order": 1,\n` +
            `      "prompt": "string",\n` +
            `      "options": ["string"] ,\n` +
            `      "correctAnswer": "string|boolean"\n` +
            `    }\n` +
            `  ]\n` +
            `}\n\n` +
            `Rules:\n` +
            `- sourceText must match the CEFR level\n` +
            `- For truefalse: correctAnswer must be true or false\n` +
            `- For mcq: options must exist and correctAnswer must equal one of the options\n` +
            `- For open: correctAnswer should be empty string\n` +
            `- Use simple, clear language and coherent text\n`,
        },
      ],
    });

    const raw = r.output_text?.trim() ?? "{}";

    let parsedUnknown: unknown;
    try {
      parsedUnknown = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Ugyldig JSON fra modellen.", raw }, { status: 500 });
    }

    const parsed = (parsedUnknown && typeof parsedUnknown === "object"
      ? (parsedUnknown as LessonJSON)
      : {}) as LessonJSON;

    // Basic sanitation
    const tasksRaw = Array.isArray(parsed.tasks) ? parsed.tasks : [];

    const tasks: LessonTask[] = tasksRaw
      .map((t: unknown, i: number): LessonTask | null => {
        const o = t && typeof t === "object" ? (t as Record<string, unknown>) : {};

        const type = o.type;
        if (!isTaskType(type)) return null;

        const id = String(o.id ?? `t${i + 1}`);
        const order = typeof o.order === "number" ? o.order : i + 1;
        const prompt = String(o.prompt ?? "");

        const options = asStringArray(o.options);
        const correctAnswer =
          o.correctAnswer ?? (type === "open" ? "" : undefined);

        return {
          id,
          type,
          order,
          prompt,
          options: type === "mcq" ? (options ?? []) : options,
          correctAnswer: correctAnswer as string | boolean | undefined,
        };
      })
      .filter((t): t is LessonTask => t !== null);

    return Response.json({
      title: String(parsed.title ?? `Lesson: ${topic}`),
      level: String(parsed.level ?? level),
      topic: String(parsed.topic ?? topic),
      sourceText: String(parsed.sourceText ?? ""),
      tasks,
    });
  } catch (err: unknown) {
    console.error("Generate lesson route error:", err);
    return Response.json({ error: toErrorString(err) }, { status: 500 });
  }
}
