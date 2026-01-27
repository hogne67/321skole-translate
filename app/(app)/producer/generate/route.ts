import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GenerateBody = {
  level?: string;          // "A1" | "A2" | "B1" ...
  language?: string;       // "en" | "no"
  topic?: string;          // "Moving to a New Country"
  textType?: string;       // "Everyday story"
  textLength?: number;     // ca ord
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
    const topic = (body.topic || "Untitled topic").trim();
    const textType = (body.textType || "Everyday story").trim();
    const textLength = Number(body.textLength || 260);

    const mcq = Number(body.tasks?.mcq ?? 6);
    const trueFalse = Number(body.tasks?.trueFalse ?? 10);
    const facts = Number(body.tasks?.facts ?? 6);
    const reflection = Number(body.tasks?.reflection ?? 3);

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system = `
Du er en profesjonell innholdsprodusent for språkinnlæring (CEFR).
Du skal lage en "content pack" for 321skole.
Du må returnere ren JSON og ingenting annet.
`.trim();

    const user = `
Lag en content pack på språk: ${language} for nivå: ${level}

Tema: ${topic}
Teksttype: ${textType}
Lengde: ca ${textLength} ord.

Krav:
- Språket skal passe nivå ${level}.
- Teksten skal ha tydelige avsnitt.
- Oppgavene skal kreve info fra teksten.
- Ikke bruk unødvendig vanskelige egennavn og årstall.

RETURNER EKSAKT gyldig JSON (ingen markdown, ingen ekstra tekst) i denne strukturen:
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

Antall:
- multipleChoice: ${mcq}
- trueFalse: ${trueFalse}
- writeFacts: ${facts}
- reflectionQuestions: ${reflection}
`.trim();

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
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
      // Hvis modellen likevel ikke returnerte ren JSON, gi debug-hjelp
      return NextResponse.json(
        { error: "Modellen returnerte ikke gyldig JSON.", raw: out.slice(0, 2000) },
        { status: 500 }
      );
    }

    return NextResponse.json({ contentPack: parsed });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Ukjent feil" },
      { status: 500 }
    );
  }
}