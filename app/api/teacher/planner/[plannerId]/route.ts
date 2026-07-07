import "server-only";

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/courses/academyAccess";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  normalizeCurriculumSource,
  normalizePlanner,
  normalizePlannerDocument,
  normalizePlannerFrame,
  normalizePlannerLocalFramework,
  serializeOfficialCurriculumBasis,
  type PlannerStatus,
} from "@/lib/planner/types";

type PlannerBody = {
  status?: unknown;
  frame?: unknown;
  curriculum?: unknown;
  document?: unknown;
  officialBasis?: unknown;
  localFramework?: unknown;
};

type PlannerActionBody = {
  action?: unknown;
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

function normalizeStatus(value: unknown): PlannerStatus {
  if (value === "active" || value === "archived") return value;
  return "draft";
}

async function loadPlannerForOwner(req: Request, plannerId: string) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;
  const profileSnap = await db.collection("users").doc(uid).get();
  const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};
  const isAdmin = hasAdminAccess(profile);

  if (!isTeacherOrAdmin(profile)) return { error: json({ error: "No teacher access" }, 403) };

  const plannerRef = db.collection("planners").doc(plannerId);
  const plannerSnap = await plannerRef.get();
  if (!plannerSnap.exists) return { error: json({ error: "Planner not found" }, 404) };

  const current = plannerSnap.data() ?? {};
  if (!isAdmin && current.ownerUid !== uid) return { error: json({ error: "No access" }, 403) };

  return { db, uid, plannerRef, plannerSnap, current };
}

function serializePlanner(id: string, data: FirebaseFirestore.DocumentData) {
  const planner = normalizePlanner(id, data as Record<string, unknown>);
  return {
    ...planner,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null,
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ plannerId: string }> }) {
  try {
    const { plannerId } = await ctx.params;
    if (!plannerId) return json({ error: "Missing plannerId" }, 400);

    const access = await loadPlannerForOwner(req, plannerId);
    if ("error" in access) return access.error;

    return json({ planner: serializePlanner(access.plannerSnap.id, access.current) }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load planner";
    return json({ error: message }, 500);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ plannerId: string }> }) {
  try {
    const { plannerId } = await ctx.params;
    if (!plannerId) return json({ error: "Missing plannerId" }, 400);

    const access = await loadPlannerForOwner(req, plannerId);
    if ("error" in access) return access.error;

    const body = (await req.json().catch(() => ({}))) as PlannerBody;
    const frame = normalizePlannerFrame(body.frame);
    const document = normalizePlannerDocument(body.document);

    await access.plannerRef.set(
      {
        status: normalizeStatus(body.status),
        frame,
        curriculum: normalizeCurriculumSource(body.curriculum),
        officialBasis: serializeOfficialCurriculumBasis(body.officialBasis),
        localFramework: normalizePlannerLocalFramework(body.localFramework),
        document: {
          ...document,
          title: document.title.trim() || `${frame.subject} ${frame.schoolYear}`,
        },
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return json({ plannerId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update planner";
    return json({ error: message }, 500);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ plannerId: string }> }) {
  try {
    const { plannerId } = await ctx.params;
    if (!plannerId) return json({ error: "Missing plannerId" }, 400);

    const access = await loadPlannerForOwner(req, plannerId);
    if ("error" in access) return access.error;

    const body = (await req.json().catch(() => ({}))) as PlannerActionBody;
    const action = typeof body.action === "string" ? body.action : "";
    const nextStatus =
      action === "archive"
        ? "archived"
        : action === "activate"
          ? "active"
          : action === "draft"
            ? "draft"
            : "";

    if (!nextStatus) return json({ error: "Unknown action" }, 400);

    await access.plannerRef.set(
      {
        status: nextStatus,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return json({ plannerId, status: nextStatus }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update planner status";
    return json({ error: message }, 500);
  }
}
