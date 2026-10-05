import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { formatComparisonValue, sanitizeComparisonWorksheet } from "@/lib/math/comparison/worksheet";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { auth, db } = getAdmin();
  let uid: string;
  try { uid = (await auth.verifyIdToken(token)).uid; }
  catch { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); }
  try {
    const body = await req.json(), worksheet = sanitizeComparisonWorksheet(body?.worksheet);
    if (!worksheet) return NextResponse.json({ ok: false, error: "Invalid comparison worksheet" }, { status: 400 });
    const text = [worksheet.instructions, ...worksheet.tasks.map(task => `${formatComparisonValue(task.left, worksheet.language)} ___ ${formatComparisonValue(task.right, worksheet.language)}`)].join("\n");
    const ref = await db.collection("lessons").add({
      ownerId: uid, uid, title: worksheet.title, description: worksheet.instructions, text, sourceText: text, language: worksheet.language,
      type: "math_worksheet", lessonType: "math_comparison", taskType: "math_comparison", mathType: "comparison", contentType: "comparison_worksheet",
      source: "math-comparison-generator", mathWorksheet: worksheet, meta: ["math", "math_worksheet", "comparison", "comparison_worksheet"],
      visibility: "private", publishVisibility: "private", showInLibrary: false, archived: false, isActive: true,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    console.error("save-comparison-worksheet failed", error);
    return NextResponse.json({ ok: false, error: "Save failed" }, { status: error instanceof SyntaxError ? 400 : 500 });
  }
}
