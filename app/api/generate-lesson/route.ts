// app/api/generate-lesson/route.ts
import OpenAI from "openai";

export const runtime = "nodejs";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function pickString(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const topic = pickString(body, ["topic"]) || "Everyday life";
    const level = pickString(body, ["level"]) || "A2";
    const length = pickString(body, ["length"]) || "normal"; // short | normal | long

    const lengthSpec =
      length === "short"
        ? "Reading text length: 90–140 words."
        : length === "long"
        ? "Reading text length: 220–320 words."
        : "Reading text length: 150–220 words.";

    // Adjust task count by level (simple, pragmatic)
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
      // ✅ JSON mode for Responses API
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

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Ugyldig JSON fra modellen.", raw }, { status: 500 });
    }

    // Basic sanitation
    const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
    parsed.tasks = tasks
      .map((t: any, i: number) => ({
        id: String(t?.id ?? `t${i + 1}`),
        type: t?.type,
        order: typeof t?.order === "number" ? t.order : i + 1,
        prompt: String(t?.prompt ?? ""),
        options: Array.isArray(t?.options) ? t.options.map((x: any) => String(x)) : undefined,
        correctAnswer: t?.correctAnswer ?? (t?.type === "open" ? "" : undefined),
      }))
      .filter((t: any) => ["truefalse", "mcq", "open"].includes(t.type));

    return Response.json({
      title: String(parsed?.title ?? `Lesson: ${topic}`),
      level: String(parsed?.level ?? level),
      topic: String(parsed?.topic ?? topic),
      sourceText: String(parsed?.sourceText ?? ""),
      tasks: parsed.tasks,
    });
  } catch (err: any) {
    console.error("Generate lesson route error:", err);
    return Response.json({ error: err?.message ?? "Generate failed" }, { status: 500 });
  }
}
