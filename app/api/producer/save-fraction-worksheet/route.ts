import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import type { FractionWorksheet } from "@/lib/math/fractions/types";

export const runtime = "nodejs";

type SaveFractionWorksheetRequest = {
    worksheet?: FractionWorksheet;
    source?: string;
};

async function getUid(req: Request): Promise<string | null> {
    const authHeader =
        req.headers.get("authorization") || req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) return null;

    const idToken = authHeader.slice(7).trim();
    if (!idToken) return null;

    const { auth } = getAdmin();
    const decoded = await auth.verifyIdToken(idToken);

    return decoded.uid;
}

function isValidWorksheet(value: unknown): value is FractionWorksheet {
    if (!value || typeof value !== "object") return false;

    const worksheet = value as Partial<FractionWorksheet>;

    return (
        typeof worksheet.title === "string" &&
        typeof worksheet.instructions === "string" &&
        Array.isArray(worksheet.tasks)
    );
}

export async function POST(req: Request) {
    try {
        const uid = await getUid(req);

        if (!uid) {
            return NextResponse.json(
                { ok: false, error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = (await req.json()) as SaveFractionWorksheetRequest;
        const worksheet = body.worksheet;

        if (!isValidWorksheet(worksheet)) {
            return NextResponse.json(
                { ok: false, error: "Invalid fraction worksheet" },
                { status: 400 }
            );
        }

        const { db } = getAdmin();

        const docRef = await db.collection("lessons").add({
            ownerId: uid,
            title: worksheet.title,
            level: worksheet.level,
            language: worksheet.language === "nb" ? "no" : worksheet.language,

            type: "math_worksheet",
            mathType: "fractions",
            contentType: "fraction_worksheet",
            source: body.source || "math-fractions-generator",

            mathWorksheet: worksheet,
            fractionWorksheet: worksheet,

            visibility: "private",
            archived: false,
            isActive: true,

            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
            ok: true,
            id: docRef.id,
            worksheetId: docRef.id,
            lessonId: docRef.id,
        });
    } catch (error) {
        console.error("save-fraction-worksheet failed:", error);

        const message =
            error instanceof Error ? error.message : "Failed to save worksheet";

        return NextResponse.json(
            { ok: false, error: message },
            { status: 500 }
        );
    }
}