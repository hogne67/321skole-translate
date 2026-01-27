// app/api/producer/generate/route.ts
import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GenerateBody = {
  level?: string;
  language?: string; // e.g. "pt-BR"
  topic?: string; // (in your UI this is really the prompt/instructions)
  textType?: string;
  textLength?: number;
  tasks?: {
    mcq?: number;
    trueFalse?: number;
    facts?: number;
    reflection?: number;
  };
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function langName(code: string) {
  const c = (code || "").toLowerCase();

  const map: Record<string, string> = {
    no: "Norwegian (Bokmål)",
    nb: "Norwegian (Bokmål)",
    nn: "Norwegian (Nynorsk)",
    en: "English",
    uk: "Ukrainian",
    ar: "Arabic",
    pl: "Polish",
    es: "Spanish",
    pt: "Portuguese",
    "pt-br": "Portuguese (Brazil)",
    so: "Somali",
    ti: "Tigrinya",
  };

  return map[c] || `the selected language (${c})`;
}


function clampInt(n: any, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY mangler i .env.local" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as GenerateBody;

    const level = (body.level || "A2").trim();
    const language = (body.language || "en").trim();
    const languageName = langName(language);



    const topic = (body.topic || "Untitled topic").trim(); // prompt/instructions
    const textType = (body.textType || "Everyday story").trim();
    const textLength = clampInt(body.textLength ?? 260, 60, 1200, 260);

    const mcq = clampInt(body.tasks?.mcq ?? 6, 0, 30, 6);
    const trueFalse = clampInt(body.tasks?.trueFalse ?? 10, 0, 40, 10);
    const facts = clampInt(body.tasks?.facts ?? 6, 0, 30, 6);
    const reflection = clampInt(body.tasks?.reflection ?? 3, 0, 20, 3);

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    // ✅ This is the exact prompt you want in writeFacts
    const WRITE_FACT_PROMPT = "Write a fact from the text. Use your own words.";

    const resp = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: `
You are a professional content producer for language learning (CEFR).

HARD REQUIREMENTS (must follow):
- Output language: ${langName}. (Code: ${language})
- EVERYTHING must be written in ${langName}: title, text, MCQ questions + options, true/false statements, writeFacts prompts, reflection questions.
- Do NOT use English or other languages unless the user explicitly asks for bilingual output.
- Even if the user's instructions are written in another language, you STILL output in ${langName}.
- Return ONLY valid JSON. No markdown. No explanations.

CRITICAL FOR writeFacts:
- writeFacts MUST be prompts only (instructions to the student).
- Do NOT include examples, quotes, copied sentences, or facts from the text inside writeFacts.
- Each writeFacts item must be EXACTLY this sentence (verbatim):
  "${WRITE_FACT_PROMPT}"
          `.trim(),
        },
        {
          role: "user",
          content: `
Create a content pack for CEFR level: ${level}

User prompt / instructions:
${topic}

Text type: ${textType}
Target length: about ${textLength} words.

Quality rules:
- Language must match level ${level}.
- The text should have clear paragraphs.
- Tasks must require information from the text.
- Avoid unnecessarily difficult proper names and too many years.

Return EXACT valid JSON (no markdown, no extra text) in this structure:
{
  "title": string,
  "level": string,
  "language": string,
  "topic": string,
  "text": string,
  "tasks": {
    "multipleChoice": [
      { "q": string, "options": [string, string, string, string], "answerIndex": 0-3 }
    ],
    "trueFalse": [
      { "statement": string, "answer": true|false }
    ],
    "writeFacts": [ string ],
    "reflectionQuestions": [ string ]
  }
}

Counts:
- multipleChoice: ${mcq}
- trueFalse: ${trueFalse}
- writeFacts: ${facts}
- reflectionQuestions: ${reflection}

Reminder (strict):
- writeFacts MUST be prompts only and MUST equal exactly:
  "${WRITE_FACT_PROMPT}"
          `.trim(),
        },
      ],
    });

    const out = (resp.output_text || "").trim();
    if (!out) {
      return NextResponse.json({ error: "Tomt svar fra modellen." }, { status: 500 });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(out);
    } catch {
      return NextResponse.json(
        { error: "Modellen returnerte ikke gyldig JSON.", raw: out.slice(0, 2000) },
        { status: 500 }
      );
    }

    // ✅ Enforce language field in JSON to match selection
    parsed.language = language;

    // ✅ HARD ENFORCE writeFacts EXACTLY as requested (no examples ever)
    if (!parsed.tasks) parsed.tasks = {};
    const desiredFactsCount = facts;

    parsed.tasks.writeFacts = Array.from({ length: desiredFactsCount }, () => WRITE_FACT_PROMPT);

    return NextResponse.json({ contentPack: parsed });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Ukjent feil" },
      { status: 500 }
    );
  }
}
