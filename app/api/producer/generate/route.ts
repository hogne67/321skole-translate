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

function languageLabel(code: string) {
  const c = (code || "").trim();

  // Common ones first
  const map: Record<string, string> = {
    "pt-BR": "Brazilian Portuguese",
    pt: "Portuguese",
    en: "English",
    no: "Norwegian (Bokmål)",
    nb: "Norwegian (Bokmål)",
    nn: "Norwegian (Nynorsk)",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    nl: "Dutch",
    sv: "Swedish",
    da: "Danish",
    fi: "Finnish",
    pl: "Polish",
    uk: "Ukrainian",
    ru: "Russian",
    ar: "Arabic",
    tr: "Turkish",
  };

  return map[c] || `the selected language (${c})`;
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
    const langName = languageLabel(language);

    const topic = (body.topic || "Untitled topic").trim(); // now: prompt/instructions
    const textType = (body.textType || "Everyday story").trim();
    const textLength = Number(body.textLength || 260);

    const mcq = Number(body.tasks?.mcq ?? 6);
    const trueFalse = Number(body.tasks?.trueFalse ?? 10);
    const facts = Number(body.tasks?.facts ?? 6);
    const reflection = Number(body.tasks?.reflection ?? 3);

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const resp = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: `
You are a professional content producer for language learning (CEFR).

HARD REQUIREMENTS (must follow):
- Output language: ${langName}. (Code: ${language})
- EVERYTHING must be written in ${langName}: title, text, MCQ questions + options, true/false statements, facts prompts, reflection questions.
- Do NOT use English or other languages unless the user explicitly asks for bilingual output.
- Even if the user's instructions are written in another language, you STILL output in ${langName}.
- Return ONLY valid JSON. No markdown. No explanations.
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

    // Optional safety: enforce language field in JSON to match selection
    parsed.language = language;

    return NextResponse.json({ contentPack: parsed });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Ukjent feil" },
      { status: 500 }
    );
  }
}
