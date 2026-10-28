import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { getSpaceAccess, ownsSpaceSubmission } from "@/lib/security/spaceAccess.server";
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

export async function GET(req: Request, context: RouteContext) {
  try {
    const { spaceId, assignmentId, studentUid } = await context.params;

    if (!spaceId || !assignmentId || !studentUid) {
      return NextResponse.json(
        { ok: false, error: "Missing route params" },
        { status: 400 }
      );
    }

    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { auth, db } = getAdmin();
    let decoded;
    try { decoded = await auth.verifyIdToken(token, true); }
    catch (accountError) { return NextResponse.json({ error: "Unauthorized" }, { status: (accountErrorStatus(accountError) ?? 401) }); }
    const access = await getSpaceAccess(db, spaceId, decoded.uid);
    if (!access.canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

    const data = snap.data()!;
    if (!access.canTeach && !ownsSpaceSubmission(data, decoded.uid, access.participantId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
      { status: (accountErrorStatus(err) ?? 500) }
    );
  }
}