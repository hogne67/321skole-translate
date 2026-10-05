import { NextResponse } from "next/server";
import { generateCalculationWorksheet, normalizeCalculationRequest } from "@/lib/math/fractions/generateCalculationWorksheet";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, error: "INVALID_CALCULATION_SETTINGS" }, { status: 400 });
    return NextResponse.json({ ok: true, worksheet: generateCalculationWorksheet(normalizeCalculationRequest(body)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ ok: false, error: message }, { status: message.startsWith("INVALID_") || error instanceof SyntaxError ? 400 : 500 });
  }
}
