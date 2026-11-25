import { accountErrorStatus, assertActiveProfile } from "@/lib/security/accountAccess.server";
import { getSpaceAccess } from "@/lib/security/spaceAccess.server";
import {
  retainedSubmissionIdentity, SubmissionWriteError, validateStoredStudentSubmission, validateStoredSubmissionIndex,
} from "@/lib/security/studentSubmissionPolicy";
import { transferredSchoolParticipant } from "@/lib/server/transferredSchoolSubmissions";
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

    const lessonRef = db
      .collection("spaces")
      .doc(spaceId)
      .collection("lessons")
      .doc(assignmentId);

    const submissions = lessonRef.collection("submissions");

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

    return await db.runTransaction(async tx => {
      const access = await getSpaceAccess(db, spaceId, uid, tx, decoded);
      assertActiveProfile(access.profile, decoded);
      if (!access.active) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (!(await tx.get(lessonRef)).exists) return NextResponse.json({ ok: false, error: "Assignment not found" }, { status: 404 });
      const { participantId } = access;
      const linkedAccount = access.member?.schoolPupilAccountUid === uid;
      let existing = await tx.get(submissions.doc(uid));
      if (linkedAccount) {
        if (!await transferredSchoolParticipant(db, spaceId, uid, access, tx)) {
          throw new SubmissionWriteError("Geometry access could not be confirmed");
        }
        const previous = await tx.get(submissions.where("participantId", "==", participantId).limit(2));
        // This legacy route has no submission selector. Never pick between separate histories.
        if (previous.size > 1 || (existing.exists && previous.docs.some(row => row.id !== existing.id))) {
          throw new SubmissionWriteError("Multiple geometry submissions require review", 409);
        }
        if (!existing.exists) {
          existing = previous.docs[0] ?? await tx.get(submissions.doc(`${spaceId}_${assignmentId}_${participantId}`));
        }
        if (existing.exists && existing.get("taskType") !== "math_geometry" && existing.get("lessonType") !== "math_geometry") {
          throw new SubmissionWriteError("The stored submission is not a geometry submission", 409);
        }
      }
      const identityContext = { kind: "lessons" as const, spaceId, activityId: assignmentId, submissionId: existing.id, uid, participantId };
      const stored = existing.data();
      if (stored) validateStoredStudentSubmission(stored, identityContext);
      const write = { ...baseData, ...retainedSubmissionIdentity(stored, identityContext), ...(!stored ? { createdAt: now } : {}) };
      if (linkedAccount) {
        const index = await tx.get(db.collection("spaceSubmissions").doc(existing.id));
        // Older geometry used the bare UID as its document ID, which can also name an index in another room.
        const bareUid = existing.id === stored?.uid || existing.id === stored?.studentUid;
        if (!bareUid || (index.get("spaceId") === spaceId && index.get("assignmentId") === assignmentId)) {
          validateStoredSubmissionIndex(index.data(), stored, identityContext);
          if (index.exists || !stored) tx.set(index.ref, write, { merge: true });
        }
      }
      tx.set(existing.ref, write, { merge: true });
      return NextResponse.json({ ok: true, id: existing.id });
    });
  } catch (err) {
    if (!(err instanceof SubmissionWriteError)) console.error("geometry-submit failed:", err);

    return NextResponse.json(
      { ok: false, error: err instanceof SubmissionWriteError ? err.message : "Failed to submit geometry to space" },
      { status: err instanceof SubmissionWriteError ? err.status : (accountErrorStatus(err) ?? 500) }
    );
  }
}
