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

async function requirePlannerAccess(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;
  const profileSnap = await db.collection("users").doc(uid).get();
  const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};

  if (!isTeacherOrAdmin(profile)) {
    return { error: json({ error: "No teacher access" }, 403) };
  }

  return { db, uid, isAdmin: hasAdminAccess(profile) };
}

function serializePlanner(id: string, data: FirebaseFirestore.DocumentData) {
  const planner = normalizePlanner(id, data as Record<string, unknown>);
  return {
    ...planner,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null,
  };
}

export async function GET(req: Request) {
  try {
    const access = await requirePlannerAccess(req);
    if ("error" in access) return access.error;

    const snap = access.isAdmin
      ? await access.db.collection("planners").get()
      : await access.db.collection("planners").where("ownerUid", "==", access.uid).get();

    const planners = snap.docs.map((doc) => serializePlanner(doc.id, doc.data()));
    return json({ planners }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load planners";
    return json({ error: message }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const access = await requirePlannerAccess(req);
    if ("error" in access) return access.error;

    const body = (await req.json().catch(() => ({}))) as PlannerBody;
    const frame = normalizePlannerFrame(body.frame);
    const document = normalizePlannerDocument(body.document);
    const title = document.title.trim() || `${frame.subject} ${frame.schoolYear}`;
    const now = new Date();

    const docRef = await access.db.collection("planners").add({
      ownerUid: access.uid,
      status: normalizeStatus(body.status),
      frame,
      curriculum: normalizeCurriculumSource(body.curriculum),
      officialBasis: serializeOfficialCurriculumBasis(body.officialBasis),
      localFramework: normalizePlannerLocalFramework(body.localFramework),
      document: {
        ...document,
        title,
      },
      createdAt: now,
      updatedAt: now,
    });

    return json({ plannerId: docRef.id }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create planner";
    return json({ error: message }, 500);
  }
}
