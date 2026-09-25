import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { sanitizeArithmeticWorksheet } from "@/lib/math/arithmetic/sanitize";
import type { ArithmeticWorksheet } from "@/lib/math/arithmetic/types";

export const runtime = "nodejs";

type SaveArithmeticWorksheetRequest = {
  worksheet?: ArithmeticWorksheet;
  source?: string;
};

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isGoogleApisLookupError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    process.env.NODE_ENV !== "production" &&
    message.includes("getaddrinfo") &&
    message.includes("www.googleapis.com")
  );
}

function decodeUidForLocalDev(idToken: string): string | null {
  try {
    const [, payload] = idToken.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const decoded = JSON.parse(
      Buffer.from(padded, "base64").toString("utf8")
    ) as Record<string, unknown>;

    if (typeof decoded.user_id === "string") return decoded.user_id;
    if (typeof decoded.sub === "string") return decoded.sub;
    return null;
  } catch {
    return null;
  }
}

async function getUidFromRequest(req: Request): Promise<string | null> {
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const { auth } = getAdmin();
  try {
    const decoded = await auth.verifyIdToken(idToken);
    return decoded.uid || null;
  } catch (error) {
    if (!isGoogleApisLookupError(error)) throw error;
    return decodeUidForLocalDev(idToken);
  }
}

function buildPlainTextSummary(worksheet: ArithmeticWorksheet) {
  const lines: string[] = [];

  lines.push(worksheet.instructions);
  lines.push("");

  worksheet.tasks.forEach((task, index) => {
    lines.push(`${index + 1}. ${task.expression} =`);
  });

  if (worksheet.showAnswerKey) {
    lines.push("");
    lines.push("FASIT");
    lines.push("");

    worksheet.tasks.forEach((task, index) => {
      lines.push(`${index + 1}. ${task.answer}`);
    });
  }

  return lines.join("\n").trim();
}

export async function POST(req: Request) {
  try {
    const uid = await getUidFromRequest(req);

    if (!uid) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as SaveArithmeticWorksheetRequest;
    const worksheet = sanitizeArithmeticWorksheet(body.worksheet);

    if (!worksheet) {
      return NextResponse.json(
        { ok: false, error: "Invalid arithmetic worksheet payload." },
        { status: 400 }
      );
    }

    const { db } = getAdmin();
    const lessonRef = db.collection("lessons").doc();
    const plainText = buildPlainTextSummary(worksheet);
    const source = safeString(body.source, "math-arithmetic-generator");
    const savedAt = new Date().toISOString();

    await lessonRef.set({
      ownerId: uid,
      uid,
      title: worksheet.title,
      description: worksheet.instructions,
      text: plainText,
      sourceText: plainText,
      language: worksheet.language,
      level: worksheet.level,
      status: "published",
      lessonType: "math_arithmetic",
      taskType: "math_arithmetic",
      mathType: "arithmetic",
      contentType: "arithmetic_worksheet",
      textType: "worksheet",
      topic: worksheet.operation,
      difficulty: worksheet.difficulty,
      source,
      isActive: true,
      publishVisibility: "private",
      showInLibrary: false,
      mathWorksheet: worksheet,
      arithmeticWorksheet: worksheet,
      tasks: worksheet.tasks,
      meta: ["math", "worksheet", "arithmetic", "arithmetic_worksheet"],
      savedAt,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      id: lessonRef.id,
      worksheetId: lessonRef.id,
      lessonId: lessonRef.id,
    });
  } catch (error) {
    console.error("save-arithmetic-worksheet failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to save worksheet",
      },
      { status: 500 }
    );
  }
}
