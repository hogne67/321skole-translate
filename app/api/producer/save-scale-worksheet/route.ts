import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { scaleTaskPrompt, sanitizeScaleWorksheet } from "@/lib/math/scale/worksheet";

export const runtime = "nodejs";
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { auth, db } = getAdmin();
  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(token);
    if (decoded.firebase?.sign_in_provider === "anonymous") return NextResponse.json({ ok: false, error: "Sign in to save worksheets" }, { status: 401 });
    uid = decoded.uid;
  }
  catch (error) { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: accountErrorStatus(error) ?? 401 }); }
  try {
    const body = await req.json(), worksheet = sanitizeScaleWorksheet(body?.worksheet);
    if (!worksheet) return NextResponse.json({ ok: false, error: "Invalid scale worksheet" }, { status: 400 });
    const text = [worksheet.instructions, ...worksheet.tasks.map(task => scaleTaskPrompt(task, worksheet.language))].join("\n");
    const ref = await db.collection("lessons").add({
      ownerId: uid, uid, title: worksheet.title, description: worksheet.instructions, text, sourceText: text, language: worksheet.language,
      type: "math_worksheet", lessonType: "math_scale", taskType: "math_scale", mathType: "scale", contentType: "scale_worksheet",
      source: "math-scale-generator", mathWorksheet: worksheet, meta: ["math", "math_worksheet", "scale", "scale_worksheet"],
      visibility: "private", publishVisibility: "private", showInLibrary: false, archived: false, isActive: true,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    console.error("save-scale-worksheet failed", error);
    return NextResponse.json({ ok: false, error: "Save failed" }, { status: error instanceof SyntaxError ? 400 : accountErrorStatus(error) ?? 500 });
  }
}
