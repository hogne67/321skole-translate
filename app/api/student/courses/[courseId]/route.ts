import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { normalizeCourseMarketing, normalizeCoursePlan } from "@/lib/courses/types";

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

function safeNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function dateIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
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

export async function GET(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
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

    const coursePlan = normalizeCoursePlan(course.coursePlan).map((session) => ({
      ...session,
      resources: session.resources
        .filter((resource) => resource.visibility !== "teacher")
        .map((resource) => ({
          id: resource.id,
          type: resource.type,
          visibility: resource.visibility,
          sourceType: resource.sourceType,
          sourceId: resource.sourceId,
          title: resource.title,
          description: resource.description,
          url:
            resource.sourceType === "library"
              ? ""
              : resource.type === "link" || resource.type === "pdf" || resource.type === "note"
                ? resource.url
                : "",
          openMode:
            resource.sourceType === "library" && resource.sourceId
              ? "lesson"
              : resource.type === "platform" || resource.sourceType === "myContent"
              ? "later"
              : resource.url
                ? "link"
                : "none",
        })),
    }));

    const messagesSnap = await db
      .collection("courses")
      .doc(courseId)
      .collection("messages")
      .get();

    const announcements = messagesSnap.docs
      .map((doc) => {
        const data = doc.data() ?? {};
        return {
          id: doc.id,
          subject: safeString(data.subject),
          body: safeString(data.body),
          status: safeString(data.status),
          createdAt: dateIso(data.createdAt),
        };
      })
      .filter((message) => message.subject || message.body)
      .filter((message) => message.status !== "draft")
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 20)
      .map(({ id, subject, body, createdAt }) => ({ id, subject, body, createdAt }));

    const submissionsSnap = await db
      .collection("practiceSubmissions")
      .where("courseId", "==", courseId)
      .limit(200)
      .get();

    const resourceSubmissions = submissionsSnap.docs
      .map((doc) => {
        const data = doc.data() ?? {};
        return {
          id: doc.id,
          uid: safeString(data.uid),
          kind: safeString(data.kind),
          courseResourceId: safeString(data.courseResourceId),
          status: safeString(data.status) || "submitted",
          comment: safeString(data.manualComment),
          instructorFeedback: safeString(data.instructorFeedback),
          reviewStatus: safeString(data.reviewStatus) || "none",
          updatedAt: dateIso(data.updatedAt),
        };
      })
      .filter((submission) => submission.uid === uid)
      .filter((submission) => submission.courseResourceId)
      .map((submission) => ({
        id: submission.id,
        kind: submission.kind,
        courseResourceId: submission.courseResourceId,
        status: submission.status,
        comment: submission.comment,
        instructorFeedback: submission.instructorFeedback,
        reviewStatus: submission.reviewStatus,
        updatedAt: submission.updatedAt,
      }));

    const manualSubmissions = resourceSubmissions.filter(
      (submission) => submission.kind === "manual"
    );

    return json(
      {
        course: {
          id: courseSnap.id,
          title: safeString(course.title),
          description: safeString(course.description),
          learningGoals: safeString(course.learningGoals),
          targetAudience: safeString(course.targetAudience),
          language: safeString(course.language),
          level: safeString(course.level),
          status,
          publicUrl: safeString(course.publicUrl),
          numberOfSessions: safeNumber(course.numberOfSessions),
          numberOfWeeks: safeNumber(course.numberOfWeeks),
          marketing: normalizeCourseMarketing(course.marketing),
          participantStatus,
          coursePlan,
          announcements,
          manualSubmissions,
          resourceSubmissions,
        },
      },
      200
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load student course";
    return json({ error: message }, 500);
  }
}
