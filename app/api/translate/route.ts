import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  text?: string;
  targetLang?: string;
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const text = (body.text || "").trim();
    const targetLang = (body.targetLang || "").trim();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY mangler i .env.local" },
        { status: 500 }
      );
    }
    if (!text) return NextResponse.json({ error: "Mangler tekst." }, { status: 400 });
    if (!targetLang) return NextResponse.json({ error: "Mangler språk." }, { status: 400 });

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const resp = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "Du er en profesjonell oversetter. Oversett teksten nøyaktig og naturlig. Ikke legg til forklaringer.",
        },
        {
          role: "user",
          content: `Mål-språk: ${targetLang}\n\nTekst:\n${text}`,
        },
      ],
    });

    return NextResponse.json({ translation: (resp.output_text || "").trim() });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Ukjent feil" }, { status: 500 });
  }
}
