// app\api\spaces\[spaceId]\lessons\[assignmentId]\geometry-submission\[studentUid]\route.ts
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    spaceId: string;
    assignmentId: string;
    studentUid: string;
  }>;
};

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { spaceId, assignmentId, studentUid } = await context.params;

    if (!spaceId || !assignmentId || !studentUid) {
      return NextResponse.json(
        { ok: false, error: "Missing route params" },
        { status: 400 }
      );
    }

    const { db } = getAdmin();

    const submissionRef = db
      .collection("spaces")
      .doc(spaceId)
      .collection("lessons")
      .doc(assignmentId)
      .collection("submissions")
      .doc(studentUid);

    const snap = await submissionRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: "Submission not found" },
        { status: 404 }
      );
    }

    const data = snap.data();

    return NextResponse.json({
      ok: true,
      submission: {
        id: snap.id,
        ...data,
      },
    });
  } catch (err) {
    console.error("geometry-submission GET failed:", err);

    return NextResponse.json(
      { ok: false, error: "Failed to load geometry submission" },
      { status: 500 }
    );
  }
}