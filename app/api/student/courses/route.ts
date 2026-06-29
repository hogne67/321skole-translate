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

function safeNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normalizeParticipantStatus(value: unknown): ParticipantStatus {
  if (value === "invited" || value === "active" || value === "completed" || value === "cancelled") {
    return value;
  }

  return "enrolled";
}

function dateIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === "function") {
      const date = candidate.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
    }
  }

  return "";
}

function isMissingCollectionGroupIndexError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("FAILED_PRECONDITION") && message.includes("participants");
}

async function findParticipantDocs(
  db: FirebaseFirestore.Firestore,
  uid: string,
  emailCandidates: string[]
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  try {
    const snapshots = await Promise.all(
      [
        db.collectionGroup("participants").where("participantUid", "==", uid).limit(50).get(),
        ...emailCandidates.map((candidate) =>
          db.collectionGroup("participants").where("email", "==", candidate).limit(50).get()
        ),
      ]
    );
    return snapshots.flatMap((snap) => snap.docs);
  } catch (error) {
    if (!isMissingCollectionGroupIndexError(error)) throw error;

    const coursesSnap = await db.collection("courses").limit(200).get();
    const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    for (const courseDoc of coursesSnap.docs) {
      const participantSnapshots = await Promise.all(
        [
          courseDoc.ref.collection("participants").where("participantUid", "==", uid).limit(5).get(),
          ...emailCandidates.map((candidate) =>
            courseDoc.ref.collection("participants").where("email", "==", candidate).limit(5).get()
          ),
        ]
      );
      docs.push(...participantSnapshots.flatMap((snap) => snap.docs));
    }

    return docs;
  }
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const rawEmail = safeString(decoded.email);
    const email = rawEmail.toLowerCase();
    if (!email) return json({ courses: [] }, 200);

    const emailCandidates = Array.from(new Set([rawEmail, email].filter(Boolean)));
    const participantDocs = await findParticipantDocs(db, uid, emailCandidates);

    const courses = [];
    const seen = new Set<string>();

    for (const participantDoc of participantDocs) {
      const courseRef = participantDoc.ref.parent.parent;
      if (!courseRef || seen.has(courseRef.id)) continue;
      seen.add(courseRef.id);

      const participant = participantDoc.data() ?? {};
      const participantStatus = normalizeParticipantStatus(participant.status);
      if (participantStatus === "cancelled") continue;

      const courseSnap = await courseRef.get();
      if (!courseSnap.exists) continue;

      const course = courseSnap.data() ?? {};
      const status = safeString(course.status);
      if (status !== "published" && status !== "active" && status !== "completed") continue;

      const coursePlan = normalizeCoursePlan(course.coursePlan);
      const nextSession =
        coursePlan
          .filter((session) => session.status === "planned")
          .sort((a, b) => {
            const aTime = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
            const bTime = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
            return aTime - bTime;
          })[0] ?? null;

      const participantResourceCount = coursePlan.reduce(
        (sum, session) =>
          sum + session.resources.filter((resource) => resource.visibility === "participants").length,
        0
      );

      courses.push({
        id: courseRef.id,
        title: safeString(course.title),
        description: safeString(course.description),
        language: safeString(course.language),
        level: safeString(course.level),
        status,
        participantStatus,
        publicUrl: safeString(course.publicUrl),
        numberOfSessions: safeNumber(course.numberOfSessions),
        numberOfWeeks: safeNumber(course.numberOfWeeks),
        nextSession: nextSession
          ? {
              sessionNumber: nextSession.sessionNumber,
              title: nextSession.title,
              startsAt: nextSession.startsAt,
              durationMinutes: nextSession.durationMinutes,
            }
          : null,
        participantResourceCount,
        updatedAt: dateIso(course.updatedAt),
      });
    }

    courses.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return json({ courses }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load student courses";
    return json({ error: message }, 500);
  }
}
