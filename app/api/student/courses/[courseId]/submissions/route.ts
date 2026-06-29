import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { normalizeCoursePlan } from "@/lib/courses/types";

type ParticipantStatus = "invited" | "enrolled" | "active" | "completed" | "cancelled";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeParticipantStatus(value: unknown): ParticipantStatus {
  if (value === "invited" || value === "active" || value === "completed" || value === "cancelled") {
    return value;
  }

  return "enrolled";
}

function canSeeCourseStatus(status: string): boolean {
  return status === "published" || status === "active" || status === "completed";
}

export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { courseId } = await ctx.params;
    if (!courseId) return json({ error: "Missing courseId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const rawEmail = safeString(decoded.email);
    const email = rawEmail.toLowerCase();
    if (!email) return json({ error: "Student email is required" }, 403);

    const body = (await req.json().catch(() => ({}))) as {
      resourceId?: unknown;
      sessionNumber?: unknown;
      comment?: unknown;
    };
    const resourceId = safeString(body.resourceId);
    const requestedSessionNumber = safeNumber(body.sessionNumber);
    const comment = safeString(body.comment).slice(0, 3000);

    if (!resourceId) return json({ error: "Missing resourceId" }, 400);

    const emailCandidates = Array.from(new Set([rawEmail, email].filter(Boolean)));
    const participantDocs = (
      await Promise.all(
        [
          db
            .collection("courses")
            .doc(courseId)
            .collection("participants")
            .where("participantUid", "==", uid)
            .limit(5)
            .get(),
          ...emailCandidates.map((candidate) =>
            db
              .collection("courses")
              .doc(courseId)
              .collection("participants")
              .where("email", "==", candidate)
              .limit(5)
              .get()
          ),
        ]
      )
    ).flatMap((snap) => snap.docs);

    const participantDoc = participantDocs[0];
    if (!participantDoc) return json({ error: "No course access" }, 403);

    const participant = participantDoc.data() ?? {};
    const participantStatus = normalizeParticipantStatus(participant.status);
    if (participantStatus === "cancelled") return json({ error: "No course access" }, 403);

    const courseSnap = await db.collection("courses").doc(courseId).get();
    if (!courseSnap.exists) return json({ error: "Course not found" }, 404);

    const course = courseSnap.data() ?? {};
    const status = safeString(course.status);
    if (!canSeeCourseStatus(status)) return json({ error: "Course is not available" }, 404);

    const coursePlan = normalizeCoursePlan(course.coursePlan);
    const session = coursePlan.find((item) =>
      item.resources.some((resource) => resource.id === resourceId)
    );
    const resource = session?.resources.find((item) => item.id === resourceId);
    if (!session || !resource || resource.visibility === "teacher") {
      return json({ error: "Resource not found" }, 404);
    }

    const sessionNumber = requestedSessionNumber ?? session.sessionNumber;
    const now = new Date();
    const submissionId = `${uid}_course_${courseId}_${resourceId}`;
    const ref = db.collection("practiceSubmissions").doc(submissionId);
    const existingSnap = await ref.get();

    await ref.set(
      {
        uid,
        userId: uid,
        userEmail: email,
        courseId,
        courseSessionNumber: sessionNumber,
        courseResourceId: resourceId,
        courseResourceTitle: resource.title || resource.type,
        lessonId: "",
        publishedLessonId: "",
        source: "course",
        kind: "manual",
        status: "submitted",
        answers: {
          comment,
        },
        manualComment: comment,
        updatedAt: now,
        ...(existingSnap.exists ? {} : { createdAt: now }),
      },
      { merge: true }
    );

    return json({ submissionId, status: "submitted" }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save course submission";
    return json({ error: message }, 500);
  }
}
