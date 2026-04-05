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

    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const body = await req.json();
    const { worksheet, answersByTaskId, auto, aiFeedback } = body ?? {};

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

    const lessonSnap = await lessonRef.get();

    if (!lessonSnap.exists) {
      return NextResponse.json(
        { ok: false, error: "Assignment not found" },
        { status: 404 }
      );
    }

    const submissionRef = lessonRef.collection("submissions").doc(uid);

    const existingSnap = await submissionRef.get();
    const now = new Date();

    const baseData = {
      spaceId,
      assignmentId,
      lessonId: assignmentId,
      studentUid: uid,
      taskType: "math_geometry",
      status: "submitted",
      worksheet,
      answersByTaskId,
      auto: auto ?? null,
      aiFeedback: aiFeedback ?? null,
      updatedAt: now,
      submittedAt: now,
    };

    if (existingSnap.exists) {
      await submissionRef.set(baseData, { merge: true });
    } else {
      await submissionRef.set({
        ...baseData,
        createdAt: now,
      });
    }

    return NextResponse.json({
      ok: true,
      id: submissionRef.id,
    });
  } catch (err) {
    console.error("geometry-submit failed:", err);

    return NextResponse.json(
      { ok: false, error: "Failed to submit geometry to space" },
      { status: 500 }
    );
  }
}