import { NextResponse } from "next/server";
import { generateWorksheet, normalizeRequest } from "@/lib/math/fractions/generateWorksheet";
import type { GenerateFractionWorksheetRequest } from "@/lib/math/fractions/generateWorksheet";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as GenerateFractionWorksheetRequest;
        const params = normalizeRequest(body);
        const worksheet = generateWorksheet(params);

        return NextResponse.json({
            ok: true,
            worksheet,
        });
    } catch (error) {
        console.error("generate-fraction-worksheet failed:", error);

        const message =
            error instanceof Error
                ? error.message
                : "Failed to generate fraction worksheet";

        return NextResponse.json(
            {
                ok: false,
                error: message,
            },
            { status: message === "INVALID_DENOMINATOR_RANGE" ? 400 : 500 }
        );
    }
}
