// app/api\spaces\[spaceId]\lessons\[assignmentId]\geometry-review\[studentUid]\route.ts
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

type ReviewStatus = "approved" | "needs_work" | "reviewed";

type ReviewBody = {
  status?: ReviewStatus;
  feedback?: string;
  stars?: number | null;
  role?: "teacher" | "parent";
};

function normalizeStatus(value: unknown): ReviewStatus | null {
  if (value === "approved") return "approved";
  if (value === "needs_work") return "needs_work";
  if (value === "reviewed") return "reviewed";
  return null;
}

function normalizeRole(value: unknown): "teacher" | "parent" {
  return value === "parent" ? "parent" : "teacher";
}

function normalizeStars(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1) return 1;
  if (rounded > 5) return 5;
  return rounded;
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { spaceId, assignmentId, studentUid } = await context.params;

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
    const reviewerUid = decoded.uid;

    const body = (await req.json()) as ReviewBody;
    const status = normalizeStatus(body?.status);
    const feedback =
      typeof body?.feedback === "string" ? body.feedback.trim() : "";
    const stars = normalizeStars(body?.stars);
    const role = normalizeRole(body?.role);

    if (!spaceId || !assignmentId || !studentUid) {
      return NextResponse.json(
        { ok: false, error: "Missing route params" },
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(
        { ok: false, error: "Invalid status" },
        { status: 400 }
      );
    }

    const submissionRef = db
      .collection("spaces")
      .doc(spaceId)
      .collection("lessons")
      .doc(assignmentId)
      .collection("submissions")
      .doc(studentUid);

    const submissionSnap = await submissionRef.get();

    if (!submissionSnap.exists) {
      return NextResponse.json(
        { ok: false, error: "Submission not found" },
        { status: 404 }
      );
    }

    const now = new Date();

    if (role === "parent") {
      await submissionRef.set(
        {
          status,
          parentFeedback: {
            summary: feedback || "",
            stars,
            parentUid: reviewerUid,
            updatedAt: now,
          },
          updatedAt: now,
        },
        { merge: true }
      );
    } else {
      await submissionRef.set(
        {
          status,
          teacherFeedback: {
            summary: feedback || "",
            teacherUid: reviewerUid,
            updatedAt: now,
          },
          updatedAt: now,
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      ok: true,
      status,
    });
  } catch (err) {
    console.error("geometry-review failed:", err);

    return NextResponse.json(
      { ok: false, error: "Failed to review geometry submission" },
      { status: 500 }
    );
  }
}