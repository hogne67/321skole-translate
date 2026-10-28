import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { getSpaceAccess } from "@/lib/security/spaceAccess.server";
import { validateStoredStudentSubmission, retainedSubmissionIdentity, SubmissionWriteError } from "@/lib/security/studentSubmissionPolicy";
// app\api\spaces\[spaceId]\lessons\[assignmentId]\geometry-submit\route.ts
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    spaceId: string;
    assignmentId: string;
  }>;
};

export async function POST(req: Request, context: RouteContext) {
  try {
    const { spaceId, assignmentId } = await context.params;

    const authHeader =
      req.headers.get("authorization") ||
      req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const idToken = authHeader.slice(7).trim();
    const { auth, db } = getAdmin();

    const decoded = await auth.verifyIdToken(idToken, true);
    const uid = decoded.uid;

    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["worksheet", "answersByTaskId", "auto"].includes(key))) {
      return NextResponse.json({ error: "Protected or invalid submission field" }, { status: 403 });
    }
    const { worksheet, answersByTaskId, auto } = body;

    if (!spaceId || !assignmentId) {
      return NextResponse.json(
        { ok: false, error: "Missing route params" },
        { status: 400 }
      );
    }

    if (!worksheet || !answersByTaskId) {
      return NextResponse.json(
        { ok: false, error: "Missing data" },
        { status: 400 }
      );
    }

    const access = await getSpaceAccess(db, spaceId, uid);
    if (!access.active) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const lessonRef = db
      .collection("spaces")
      .doc(spaceId)
      .collection("lessons")
      .doc(assignmentId);

    const lessonSnap = await lessonRef.get();

    if (!lessonSnap.exists) {
      return NextResponse.json(
        { ok: false, error: "Assignment not found" },
        { status: 404 }
      );
    }

    const submissionRef = lessonRef.collection("submissions").doc(uid);

    const now = new Date();

    const baseData = {
      spaceId,
      assignmentId,
      lessonId: assignmentId,
      taskType: "math_geometry",
      status: "submitted",
      worksheet,
      answersByTaskId,
      auto: auto ?? null,
      updatedAt: now,
      submittedAt: now,
    };

    const identityContext = { kind: "lessons" as const, spaceId, activityId: assignmentId, submissionId: uid, uid, participantId: access.participantId };
    await db.runTransaction(async tx => {
      const existing = await tx.get(submissionRef);
      if (existing.exists) validateStoredStudentSubmission(existing.data(), identityContext);
      tx.set(submissionRef, { ...baseData, ...retainedSubmissionIdentity(existing.data(), identityContext), ...(!existing.exists ? { createdAt: now } : {}) }, { merge: true });
    });

    return NextResponse.json({
      ok: true,
      id: submissionRef.id,
    });
  } catch (err) {
    console.error("geometry-submit failed:", err);

    return NextResponse.json(
      { ok: false, error: "Failed to submit geometry to space" },
      { status: err instanceof SubmissionWriteError ? err.status : (accountErrorStatus(err) ?? 500) }
    );
  }
}
