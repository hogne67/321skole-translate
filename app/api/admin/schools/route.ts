import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getAdmin } from "@/lib/firebaseAdmin";
import { getTeacherSeatLimit, isValidSchoolPlanKey } from "@/lib/schools/constants";
import { createSchool } from "@/lib/schools/server";
import type { BillingType, SchoolPlanKey } from "@/lib/schools/types";

export const runtime = "nodejs";

type AdminProfile = {
  role?: unknown;
  roles?: unknown;
  adminLevel?: unknown;
  disabled?: unknown;
};

type CreateSchoolBody = {
  name?: unknown;
  contactName?: unknown;
  contactEmail?: unknown;
  billingType?: unknown;
  planKey?: unknown;
  teacherSeatLimit?: unknown;
  adminUid?: unknown;
  adminEmail?: unknown;
  adminDisplayName?: unknown;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);

  return match ? match[1] : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown): string | null {
  const text = readString(value);
  return text || null;
}

function readPositiveInt(value: unknown): number | null {
  const numberValue =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

  if (!Number.isFinite(numberValue)) return null;

  const rounded = Math.floor(numberValue);
  return rounded > 0 ? rounded : null;
}

function readBillingType(value: unknown): BillingType {
  return value === "stripe" ? "stripe" : "manual";
}

function serializeTimestamp(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (isRecord(value) && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }

  return null;
}

function isAdminProfile(profile: AdminProfile | null): boolean {
  if (!profile || profile.disabled === true) return false;

  const roles = isRecord(profile.roles) ? profile.roles : {};
  return profile.role === "admin" || roles.admin === true;
}

function isSuperAdminProfile(profile: AdminProfile | null): boolean {
  return isAdminProfile(profile) && profile?.adminLevel === "superadmin";
}

async function readAdminProfile(req: Request): Promise<{
  uid: string;
  profile: AdminProfile | null;
}> {
  const token = getBearerToken(req);
  if (!token) throw new Error("Missing Authorization Bearer token");

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;

  if (!uid) throw new Error("Unauthorized");

  const snap = await db.collection("users").doc(uid).get();
  const profile = snap.exists ? ((snap.data() ?? {}) as AdminProfile) : null;

  return { uid, profile };
}

async function countActiveTeachers(schoolId: string): Promise<number> {
  const { db } = getAdmin();
  const snapshot = await db
    .collection("schools")
    .doc(schoolId)
    .collection("members")
    .where("role", "==", "school_teacher")
    .where("status", "==", "active")
    .get();

  return snapshot.size;
}

export async function GET(req: Request) {
  try {
    const { profile } = await readAdminProfile(req);

    if (!isAdminProfile(profile)) {
      return json({ ok: false, error: "Forbidden" }, 403);
    }

    const { db } = getAdmin();
    const snapshot = await db.collection("schools").orderBy("createdAt", "desc").get();

    const schools = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const activeTeacherCount =
          typeof data.activeTeacherCount === "number"
            ? data.activeTeacherCount
            : await countActiveTeachers(doc.id);

        return {
          id: doc.id,
          name: data.name ?? null,
          contactName: data.contactName ?? null,
          contactEmail: data.contactEmail ?? null,
          planKey: data.planKey ?? null,
          billingType: data.billingType ?? null,
          status: data.status ?? null,
          teacherSeatLimit: data.teacherSeatLimit ?? null,
          activeTeacherCount,
          createdByUid: data.createdByUid ?? null,
          stripeCustomerId: data.stripeCustomerId ?? null,
          stripeSubscriptionId: data.stripeSubscriptionId ?? null,
          createdAt: serializeTimestamp(data.createdAt),
          updatedAt: serializeTimestamp(data.updatedAt),
        };
      })
    );

    return json({ ok: true, schools });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("Authorization") || message === "Unauthorized" ? 401 : 500;

    return json({ ok: false, error: message || "Failed to load schools" }, status);
  }
}

export async function POST(req: Request) {
  try {
    const { uid, profile } = await readAdminProfile(req);

    if (!isSuperAdminProfile(profile)) {
      return json({ ok: false, error: "Only superadmin can create schools" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as CreateSchoolBody;
    const name = readString(body.name);
    const adminUid = readString(body.adminUid);
    const adminEmail = readOptionalString(body.adminEmail);
    const adminDisplayName = readOptionalString(body.adminDisplayName);
    const contactName = readOptionalString(body.contactName);
    const contactEmail = readOptionalString(body.contactEmail);
    const billingType = readBillingType(body.billingType);
    const planKey: SchoolPlanKey = isValidSchoolPlanKey(body.planKey)
      ? body.planKey
      : "school_5";
    const presetLimit = getTeacherSeatLimit(planKey);
    const customLimit = readPositiveInt(body.teacherSeatLimit);
    const teacherSeatLimit = customLimit ?? presetLimit ?? 1;

    if (!name) return json({ ok: false, error: "Missing school name" }, 400);
    if (!adminUid) return json({ ok: false, error: "Missing first school admin UID" }, 400);
    if (teacherSeatLimit <= 0) {
      return json({ ok: false, error: "Teacher seat limit must be greater than 0" }, 400);
    }

    const result = await createSchool({
      name,
      contactName,
      contactEmail,
      billingType,
      planKey,
      teacherSeatLimit,
      adminUid,
      adminEmail,
      adminDisplayName,
    });

    const { db } = getAdmin();
    await db.collection("users").doc(adminUid).set(
      {
        schoolId: result.schoolId,
        schoolRole: "school_admin",
        schoolStatus: "active",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await db.collection("adminAuditEvents").add({
      type: "school_created",
      actorUid: uid,
      schoolId: result.schoolId,
      targetUid: adminUid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return json({ ok: true, ...result }, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("Authorization") || message === "Unauthorized" ? 401 : 500;

    return json({ ok: false, error: message || "Failed to create school" }, status);
  }
}
