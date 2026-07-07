import "server-only";

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/courses/academyAccess";
import { getAdmin } from "@/lib/firebaseAdmin";
import { normalizePlanner } from "@/lib/planner/types";

type SharePlannerBody = {
  spaceId?: unknown;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTeacherOrAdmin(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  if (hasAdminAccess(profile)) return true;

  const roles = isRecord(profile.roles) ? profile.roles : null;
  return profile.role === "teacher" || roles?.teacher === true;
}

function readTitle(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request, ctx: { params: Promise<{ plannerId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { plannerId } = await ctx.params;
    if (!plannerId) return json({ error: "Missing plannerId" }, 400);

    const body = (await req.json().catch(() => ({}))) as SharePlannerBody;
    const spaceId = typeof body.spaceId === "string" ? body.spaceId.trim() : "";
    if (!spaceId) return json({ error: "Missing spaceId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const [profileSnap, plannerSnap, spaceSnap] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("planners").doc(plannerId).get(),
      db.collection("spaces").doc(spaceId).get(),
    ]);

    const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};
    if (!isTeacherOrAdmin(profile)) return json({ error: "No teacher access" }, 403);
    if (!plannerSnap.exists) return json({ error: "Planner not found" }, 404);
    if (!spaceSnap.exists) return json({ error: "Space not found" }, 404);

    const isAdmin = hasAdminAccess(profile);
    const plannerData = plannerSnap.data() ?? {};
    const spaceData = spaceSnap.data() ?? {};
    if (!isAdmin && plannerData.ownerUid !== uid) return json({ error: "No access to planner" }, 403);
    if (!isAdmin && spaceData.ownerId !== uid) return json({ error: "No access to space" }, 403);

    const planner = normalizePlanner(plannerSnap.id, plannerData as Record<string, unknown>);
    const title = planner.document.title.trim() || `${planner.frame.subject} ${planner.frame.schoolYear}`;
    const now = new Date();
    const assignmentRef = db.collection("spaces").doc(spaceId).collection("lessons").doc();

    await db.runTransaction(async (tx) => {
      tx.set(assignmentRef, {
        status: "active",
        sourceType: "planner",
        sourceId: plannerId,
        title,
        description: planner.document.description || planner.frame.focusArea || null,
        level: planner.frame.level || null,
        language: planner.frame.language || null,
        topic: planner.frame.subject || null,
        lessonType: "planner",
        taskType: "planner",
        contentType: "planner",
        planner: {
          plannerId,
          schoolYear: planner.frame.schoolYear,
          subject: planner.frame.subject,
          level: planner.frame.level,
          periods: planner.document.periods.map((period) => ({
            id: period.id,
            title: period.title,
            weeks: period.weeks,
            goals: period.goals,
            content: period.content,
            methods: period.methods,
            assessment: period.assessment,
            learningGoals: period.learningGoals.map((goal) => ({
              id: goal.id,
              goal: goal.goal,
              studentLanguage: goal.studentLanguage,
            })),
            weekPlans: period.weekPlans.map((weekPlan) => ({
              id: weekPlan.id,
              week: weekPlan.week,
              title: weekPlan.title,
              goals: weekPlan.goals,
              activities: weekPlan.activities,
              assessment: weekPlan.assessment,
              notes: weekPlan.notes,
            })),
          })),
        },
        assignedAt: now,
        createdAt: now,
        assignedByUid: uid,
        updatedAt: now,
      });

      tx.set(
        db.collection("spaces").doc(spaceId),
        {
          activeLessonId: assignmentRef.id,
          activeLessonTitle: title,
          activeUpdatedAt: now,
        },
        { merge: true }
      );

      tx.set(
        db.collection("planners").doc(plannerId),
        {
          sharedToSpaces: {
            [spaceId]: {
              assignmentId: assignmentRef.id,
              title: readTitle(spaceData.title) || "Space",
              sharedAt: now,
            },
          },
          updatedAt: now,
        },
        { merge: true }
      );
    });

    return json({ spaceId, assignmentId: assignmentRef.id }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not share planner to space";
    return json({ error: message }, 500);
  }
}
