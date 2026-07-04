import "server-only";

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/courses/academyAccess";
import { getAdmin } from "@/lib/firebaseAdmin";
import { getNextSchoolYear, titleForCopiedPlanner } from "@/lib/planner/schoolYear";
import {
  normalizeCurriculumSource,
  normalizePlannerDocument,
  normalizePlannerFrame,
} from "@/lib/planner/types";

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

export async function POST(req: Request, ctx: { params: Promise<{ plannerId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { plannerId } = await ctx.params;
    if (!plannerId) return json({ error: "Missing plannerId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const profileSnap = await db.collection("users").doc(uid).get();
    const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};
    const isAdmin = hasAdminAccess(profile);

    if (!isTeacherOrAdmin(profile)) return json({ error: "No teacher access" }, 403);

    const plannerSnap = await db.collection("planners").doc(plannerId).get();
    if (!plannerSnap.exists) return json({ error: "Planner not found" }, 404);

    const current = plannerSnap.data() ?? {};
    if (!isAdmin && current.ownerUid !== uid) return json({ error: "No access" }, 403);

    const frame = normalizePlannerFrame(current.frame);
    const curriculum = normalizeCurriculumSource(current.curriculum);
    const document = normalizePlannerDocument(current.document);
    const nextSchoolYear = getNextSchoolYear(frame.schoolYear);
    const now = new Date();
    const copiedDocument = {
      ...document,
      title: titleForCopiedPlanner(document.title, frame.schoolYear, nextSchoolYear),
      reflection: "",
      yearEndSummary: "",
      nextYearNotes: document.nextYearNotes,
      reflectionLog: [],
      periods: document.periods.map((period) => ({ ...period, reflection: "" })),
    };

    const docRef = await db.collection("planners").add({
      ownerUid: uid,
      status: "draft",
      frame: {
        ...frame,
        schoolYear: nextSchoolYear,
      },
      curriculum,
      document: copiedDocument,
      copiedFromPlannerId: plannerId,
      createdAt: now,
      updatedAt: now,
    });

    return json({ plannerId: docRef.id, schoolYear: nextSchoolYear }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not duplicate planner";
    return json({ error: message }, 500);
  }
}
