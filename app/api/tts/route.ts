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

function hasStringMessage(x: unknown): x is { message: string } {
  return (
    typeof x === "object" &&
    x !== null &&
    "message" in x &&
    typeof (x as Record<string, unknown>).message === "string"
  );
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (hasStringMessage(err)) return err.message;
  return "TTS failed";
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();

    const b = (body ?? {}) as Record<string, unknown>;
    const lessonId = String(b.lessonId ?? "").trim();
    const text = String(b.text ?? "").trim();
    const lang = normalizeLang(String(b.lang ?? "no"));
    const voice = String(b.voice ?? "marin").trim();

    if (!lessonId) return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
    if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });

    const audioRes = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      response_format: "mp3",
    });

    const arrayBuffer = await audioRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:audio/mpeg;base64,${base64}`;

    return NextResponse.json({
      url: dataUrl,
      lang,
      voice,
      bytes: base64.length,
    });
  } catch (e: unknown) {
    console.error("TTS error:", e);
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}
