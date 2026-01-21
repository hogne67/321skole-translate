// app/api/tts/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs"; // audio binary -> node runtime (ikke edge)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function normalizeLang(lang: string): "no" | "en" | "pt-BR" {
  const v = (lang || "").toLowerCase().trim();
  if (v === "pt" || v === "pt-br" || v === "pt_br") return "pt-BR";
  if (v === "en") return "en";
  return "no";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const lessonId = String(body.lessonId || "").trim();
    const text = String(body.text || "").trim();
    const lang = normalizeLang(String(body.lang || "no"));
    const voice = String(body.voice || "marin").trim(); // "marin" er fin start

    if (!lessonId) {
      return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    // OpenAI TTS
    const audioRes = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
     response_format: "mp3",

      // Ikke alle SDK-er støtter et eksplisitt "language"-felt her,
      // så vi sender det ikke. Modellen håndterer språket basert på input-tekst.
    });

    const arrayBuffer = await audioRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Return as data URL (enkelt å spille av uten lagring)
    const dataUrl = `data:audio/mpeg;base64,${base64}`;

    return NextResponse.json({
      url: dataUrl,
      lang,
      voice,
      bytes: base64.length,
    });
  } catch (e: any) {
    console.error("TTS error:", e);
    return NextResponse.json({ error: e?.message ?? "TTS failed" }, { status: 500 });
  }
}
