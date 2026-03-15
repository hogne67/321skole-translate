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

    const text = pickString(body, "text");
    const language = normalizeLanguage(pickString(body, "language", "en"));
    const level = pickString(body, "level", "A2");
    const mode = pickString(body, "mode", "sentence");

    if (!text) {
      return Response.json({ error: "Missing text." }, { status: 400 });
    }

    const lengthRule =
      mode === "short"
        ? "The user may provide 2 to 4 short sentences or one short paragraph."
        : "The user will usually provide one sentence.";

    const prompt =
      `You are a helpful language teacher.\n` +
      `${getLanguageInstruction(language)}\n` +
      `CEFR level of the learner: ${level}\n` +
      `${lengthRule}\n\n` +
      `Task:\n` +
      `1. Correct the user's text.\n` +
      `2. Explain the most important mistakes simply and clearly.\n` +
      `3. Give one slightly better natural version.\n\n` +
      `Rules:\n` +
      `- Keep the explanation short and pedagogical.\n` +
      `- Adapt the explanation to the learner's CEFR level.\n` +
      `- Do not be harsh.\n` +
      `- Keep the same meaning as the original.\n` +
      `- Return JSON only.\n` +
      `- Do not use markdown.\n` +
      `- Do not add text before or after the JSON.\n\n` +
      `Return this exact shape:\n` +
      `{\n` +
      `  "corrected": "string",\n` +
      `  "explanation": "string",\n` +
      `  "betterVersion": "string",\n` +
      `  "language": "string",\n` +
      `  "level": "string"\n` +
      `}\n\n` +
      `User text:\n${text}`;

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      text: { format: { type: "json_object" } },
      input: [
        {
          role: "system",
          content:
            "You help language learners improve their sentences. Return valid JSON only.",
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

    const corrected =
      typeof parsed.corrected === "string" ? parsed.corrected.trim() : "";

    const explanation =
      typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";

    const betterVersion =
      typeof parsed.betterVersion === "string" ? parsed.betterVersion.trim() : "";

    if (!corrected || !explanation || !betterVersion) {
      return Response.json(
        { error: "Model response missing required fields.", raw },
        { status: 500 }
      );
    }

    return Response.json({
      corrected,
      explanation,
      betterVersion,
      language: typeof parsed.language === "string" ? parsed.language : language,
      level: typeof parsed.level === "string" ? parsed.level : level,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    console.error("sentence-fixer route error:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}