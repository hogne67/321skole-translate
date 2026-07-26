import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type QuizQuestion = {
  type: "multiple_choice" | "true_false";
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  seconds: number;
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
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeLanguage(language: string): string {
  return language.trim() || "nb";
}

function getLanguageInstruction(language: string): string {
  const lower = language.toLowerCase();
  if (lower === "no" || lower === "nb" || lower === "nn") return "Write everything in Norwegian Bokmal.";
  if (lower === "pt" || lower === "pt-br" || lower === "pt-pt") return "Write everything in Portuguese.";
  if (lower === "en") return "Write everything in English.";
  return `Write everything in the language with code "${language}".`;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function cleanQuestion(raw: unknown, index: number, fallbackSeconds: number): QuizQuestion | null {
  if (!isRecord(raw)) return null;
  const question = pickString(raw, "question");
  const explanation = pickString(raw, "explanation");
  const rawType = pickString(raw, "type", "multiple_choice");
  const type = rawType === "true_false" ? "true_false" : "multiple_choice";
  const options = Array.isArray(raw.options)
    ? raw.options.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  const correctIndex = Math.trunc(pickNumber(raw, "correctIndex", 0));
  const seconds = Math.max(10, Math.min(120, Math.trunc(pickNumber(raw, "seconds", fallbackSeconds))));

  if (!question || !explanation) return null;
  if (type === "true_false") {
    const tfOptions = options.length >= 2 ? options.slice(0, 2) : ["Sant", "Usant"];
    return {
      type,
      question,
      options: tfOptions,
      correctIndex: correctIndex === 1 ? 1 : 0,
      explanation,
      seconds,
    };
  }

  const nextOptions = options.slice(0, 4);
  if (nextOptions.length < 2) return null;

  return {
    type,
    question,
    options: nextOptions,
    correctIndex: Math.max(0, Math.min(nextOptions.length - 1, correctIndex)),
    explanation,
    seconds,
  };
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const language = normalizeLanguage(pickString(body, "language", "nb"));
    const level = pickString(body, "level", "A2");
    const sourceMode = pickString(body, "sourceMode", "topic");
    const topic = pickString(body, "topic");
    const sourceText = pickString(body, "sourceText");
    const focus = pickString(body, "focus", "understanding");
    const count = Math.max(3, Math.min(12, Math.trunc(pickNumber(body, "count", 6))));
    const seconds = Math.max(10, Math.min(120, Math.trunc(pickNumber(body, "seconds", 30))));

    if (sourceMode === "text" && sourceText.length < 40) {
      return Response.json({ error: "Add a little more lesson text first." }, { status: 400 });
    }
    if (sourceMode !== "text" && !topic) {
      return Response.json({ error: "Missing topic." }, { status: 400 });
    }

    const prompt =
      `You are creating a classroom quiz for 321school.\n` +
      `${getLanguageInstruction(language)}\n` +
      `Learner level: ${level}\n` +
      `Number of questions: ${count}\n` +
      `Default seconds per question: ${seconds}\n` +
      `Focus: ${focus}\n\n` +
      `Source:\n` +
      (sourceMode === "text" ? sourceText : topic) +
      `\n\nRules:\n` +
      `- Create a useful classroom quiz, not a worksheet.\n` +
      `- Use a mix of multiple_choice and true_false when it fits.\n` +
      `- Multiple choice must have 3 or 4 options.\n` +
      `- True/false must have exactly 2 options, written in the target language.\n` +
      `- Include one short explanation per question.\n` +
      `- Make distractors plausible but clearly wrong.\n` +
      `- Return JSON only. No markdown.\n\n` +
      `Return this exact shape:\n` +
      `{\n` +
      `  "title": "string",\n` +
      `  "description": "string",\n` +
      `  "level": "string",\n` +
      `  "language": "string",\n` +
      `  "questions": [\n` +
      `    {\n` +
      `      "type": "multiple_choice",\n` +
      `      "question": "string",\n` +
      `      "options": ["string", "string", "string", "string"],\n` +
      `      "correctIndex": 0,\n` +
      `      "explanation": "string",\n` +
      `      "seconds": ${seconds}\n` +
      `    }\n` +
      `  ]\n` +
      `}`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      text: { format: { type: "json_object" } },
      input: [
        {
          role: "system",
          content: "Create editable classroom quizzes. Return valid JSON only.",
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

    if (!isRecord(parsed)) return Response.json({ error: "Model returned non-object JSON.", raw }, { status: 500 });

    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .map((item, index) => cleanQuestion(item, index, seconds))
      .filter((item): item is QuizQuestion => item !== null)
      .slice(0, count);

    if (questions.length < 3) {
      return Response.json({ error: "Model response missing usable questions.", raw }, { status: 500 });
    }

    return Response.json({
      title: pickString(parsed, "title", topic || "321 quiz"),
      description: pickString(parsed, "description", ""),
      level: pickString(parsed, "level", level),
      language: pickString(parsed, "language", language),
      sourceMode,
      topic,
      sourceText: sourceMode === "text" ? sourceText : "",
      focus,
      questions,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    console.error("quiz-generator route error:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
