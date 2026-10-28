// app/api/admin/submissions/route.ts
import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";

export const runtime = "nodejs";


function toErrorString(err: unknown): string {
  if (!err) return "Server error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const message = typeof o.message === "string" ? o.message : "";
    const code = typeof o.code === "string" ? o.code : "";
    return message || code || "Server error";
  }

  return "Server error";
}

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token, true);
    const profile = (await db.doc(`users/${decoded.uid}`).get()).data();
    if (profile?.role !== "admin" && profile?.roles?.admin !== true) return Response.json({ error: "Forbidden" }, { status: 403 });

    const lessonId = req.nextUrl.searchParams.get("lessonId") || "";
    const taskType = req.nextUrl.searchParams.get("taskType") || "";
    const onlyIncorrect = (req.nextUrl.searchParams.get("onlyIncorrect") || "") === "1";
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "50"), 200);

    let q: FirebaseFirestore.Query = db
      .collection("submissions")
      .orderBy("createdAt", "desc")
      .limit(limit);

    if (lessonId) q = q.where("lessonId", "==", lessonId);
    if (taskType) q = q.where("taskType", "==", taskType);
    if (onlyIncorrect) q = q.where("isCorrect", "==", false);

    const snap = await q.get();

    const rows = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const createdAt = data.createdAt as { toDate?: () => Date } | undefined;

      return {
        id: d.id,
        ...data,
        createdAt: createdAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    return Response.json({ rows });
  } catch (e: unknown) {
    console.error("Admin submissions GET error:", e);
    return Response.json({ error: toErrorString(e) }, { status: accountErrorStatus(e) ?? 500 });
  }
}
