import "server-only";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Kreativ førstegenerering er deaktivert. Offisielt læreplangrunnlag må hentes og kontrolleres før planleggingen starter.",
    },
    { status: 410 }
  );
}
