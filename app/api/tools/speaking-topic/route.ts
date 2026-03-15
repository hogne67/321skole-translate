import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickString(obj: unknown, key: string, fallback = ""): string {
  if (!isRecord(obj)) return fallback;
  const value = obj[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeLanguage(language: string): string {
  return language.trim() || "en";
}

function getLanguageInstruction(language: string): string {
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

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as unknown;

    const language = normalizeLanguage(pickString(body, "language", "en"));
    const level = pickString(body, "level", "A2");
    const category = pickString(body, "category", "everyday");

    const prompt =
      `You are a helpful language teacher.\n` +
      `${getLanguageInstruction(language)}\n` +
      `CEFR level of the learner: ${level}\n` +
      `Category: ${category}\n\n` +
      `Task:\n` +
      `Generate one speaking topic for conversation practice.\n` +
      `Return:\n` +
      `1. A short topic title\n` +
      `2. One main question\n` +
      `3. Three short follow-up questions\n\n` +
      `Rules:\n` +
      `- Adapt language difficulty to the CEFR level.\n` +
      `- Keep it classroom-friendly.\n` +
      `- Make it useful for speaking practice.\n` +
      `- Return JSON only.\n` +
      `- Do not use markdown.\n` +
      `- Do not add text before or after the JSON.\n\n` +
      `Return this exact shape:\n` +
      `{\n` +
      `  "topic": "string",\n` +
      `  "question": "string",\n` +
      `  "followups": ["string", "string", "string"],\n` +
      `  "language": "string",\n` +
      `  "level": "string",\n` +
      `  "category": "string"\n` +
      `}`;

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      text: { format: { type: "json_object" } },
      input: [
        {
          role: "system",
          content:
            "You create short, useful speaking prompts for language learners. Return valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const raw = response.output_text?.trim();

    if (!raw) {
      return Response.json({ error: "Empty response from model." }, { status: 500 });
    }

    const jsonText = extractJsonObject(raw);

    if (!jsonText) {
      return Response.json(
        { error: "Could not find JSON in model response.", raw },
        { status: 500 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return Response.json({ error: "Invalid JSON from model.", raw }, { status: 500 });
    }

    if (!isRecord(parsed)) {
      return Response.json({ error: "Model returned non-object JSON.", raw }, { status: 500 });
    }

    const topic = typeof parsed.topic === "string" ? parsed.topic.trim() : "";
    const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
    const followups = Array.isArray(parsed.followups)
      ? parsed.followups.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : [];

    if (!topic || !question || followups.length === 0) {
      return Response.json(
        { error: "Model response missing required fields.", raw },
        { status: 500 }
      );
    }

    return Response.json({
      topic,
      question,
      followups,
      language: typeof parsed.language === "string" ? parsed.language : language,
      level: typeof parsed.level === "string" ? parsed.level : level,
      category: typeof parsed.category === "string" ? parsed.category : category,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    console.error("speaking-topic route error:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}