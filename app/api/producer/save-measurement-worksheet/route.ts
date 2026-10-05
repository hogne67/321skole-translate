import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { sanitizeMeasurementWorksheet } from "@/lib/math/measurement/worksheet";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { auth, db } = getAdmin();
  let uid: string;
  try { uid = (await auth.verifyIdToken(token)).uid; }
  catch { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); }
  try {
    const body = await req.json();
    const worksheet = sanitizeMeasurementWorksheet(body?.worksheet);
    if (!worksheet) return NextResponse.json({ ok: false, error: "Invalid measurement worksheet" }, { status: 400 });
    const text = [worksheet.instructions, ...worksheet.tasks.map(task => `${task.quantity} ${task.fromUnit} = ___ ${task.toUnit}`)].join("\n");
    const ref = await db.collection("lessons").add({
      ownerId: uid, uid, title: worksheet.title, description: worksheet.instructions,
      text, sourceText: text, language: worksheet.language,
      type: "math_worksheet", lessonType: "math_measurement", taskType: "math_measurement", mathType: "measurement", contentType: "measurement_worksheet",
      source: "math-measurement-generator", mathWorksheet: worksheet, measurementWorksheet: worksheet,
      meta: ["math", "math_worksheet", "measurement", "measurement_worksheet"],
      visibility: "private", publishVisibility: "private", showInLibrary: false, archived: false, isActive: true,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    console.error("save-measurement-worksheet failed", error);
    return NextResponse.json({ ok: false, error: "Save failed" }, { status: error instanceof SyntaxError ? 400 : 500 });
  }
}
