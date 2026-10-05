import { NextResponse } from "next/server";
import { generateMeasurementWorksheet } from "@/lib/math/measurement/worksheet";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_SETTINGS");
    return NextResponse.json({ ok: true, worksheet: generateMeasurementWorksheet(body.settings, body.language, body.showAnswerKey === true) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ ok: false, error: message }, { status: message.startsWith("INVALID_") || error instanceof SyntaxError ? 400 : 500 });
  }
}
