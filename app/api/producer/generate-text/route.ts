import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GenerateTextBody = {
  level?: string;
  language?: string;
  topic?: string;
  textType?: string;
  textLength?: number;
};

type GenerateTextResult = {
  title: string;
  text: string;
};

type OpenAIErrorLike = { message?: string; code?: string | number };

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

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY mangler i .env.local" }, { status: 500 });
    }

    const body = (await req.json()) as GenerateTextBody;

    const level = (body.level || "A2").trim();
    const language = (body.language || "en").trim();
    const topic = (body.topic || "Untitled topic").trim();
    const textType = (body.textType || "Everyday story").trim();
    const textLength = Number(body.textLength || 260);

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system = `
Du er en profesjonell innholdsprodusent for språkinnlæring (CEFR) for 321skole.
Du må returnere ren JSON og ingenting annet.
`.trim();

    const user = `
Skriv EN tekst på språk: ${language} for nivå: ${level}

Tema: ${topic}
Teksttype: ${textType}
Lengde: ca ${textLength} ord.

Krav:
- Språket skal passe nivå ${level}.
- Teksten skal ha tydelige avsnitt.
- Ikke bruk unødvendig vanskelige egennavn og årstall.

RETURNER EKSAKT gyldig JSON (ingen markdown, ingen ekstra tekst) i denne strukturen:
{
  "title": string,
  "text": string
}
`.trim();

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    let parsed: GenerateTextResult;
    try {
      parsed = JSON.parse(out) as GenerateTextResult;
    } catch {
      return NextResponse.json(
        { error: "Modellen returnerte ikke gyldig JSON.", raw: out.slice(0, 2000) },
        { status: 500 }
      );
    }

    const title = String(parsed.title || "").trim() || "New lesson";
    const text = String(parsed.text || "").trim();

    if (!text) {
      return NextResponse.json({ error: "Mangler 'text' i JSON-respons." }, { status: 500 });
    }

    return NextResponse.json({ title, text });
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) || "Ukjent feil" }, { status: 500 });
  }
}