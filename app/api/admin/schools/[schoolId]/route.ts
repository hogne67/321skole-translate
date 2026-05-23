import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getAdmin } from "@/lib/firebaseAdmin";
import { isValidSchoolPlanKey } from "@/lib/schools/constants";
import type { BillingType, SchoolPlanKey, SchoolStatus } from "@/lib/schools/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    schoolId?: string;
  }>;
};

type AdminProfile = {
  role?: unknown;
  roles?: unknown;
  adminLevel?: unknown;
  disabled?: unknown;
};

type UpdateSchoolBody = {
  name?: unknown;
  contactName?: unknown;
  contactEmail?: unknown;
  billingType?: unknown;
  planKey?: unknown;
  status?: unknown;
  teacherSeatLimit?: unknown;
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

function readBillingType(value: unknown): BillingType | null {
  if (value === "manual" || value === "stripe") return value;
  return null;
}

function readSchoolStatus(value: unknown): SchoolStatus | null {
  if (
    value === "inactive" ||
    value === "trialing" ||
    value === "active" ||
    value === "past_due" ||
    value === "canceled"
  ) {
    return value;
  }

  return null;
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

async function verifyAdmin(req: Request): Promise<{
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

  if (!isAdminProfile(profile)) throw new Error("Forbidden");

  return { uid, profile };
}

export async function GET(req: Request, context: RouteContext) {
  try {
    await verifyAdmin(req);

    const { schoolId: rawSchoolId } = await context.params;
    const schoolId = readString(rawSchoolId);

    if (!schoolId) return json({ ok: false, error: "Missing schoolId" }, 400);

    const { db } = getAdmin();
    const schoolSnap = await db.collection("schools").doc(schoolId).get();

    if (!schoolSnap.exists) {
      return json({ ok: false, error: "School not found" }, 404);
    }

    const schoolData = schoolSnap.data() ?? {};
    const membersSnap = await db
      .collection("schools")
      .doc(schoolId)
      .collection("members")
      .orderBy("createdAt", "desc")
      .get();

    const members = membersSnap.docs.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        uid: data.uid ?? doc.id,
        email: data.email ?? null,
        displayName: data.displayName ?? null,
        role: data.role ?? null,
        status: data.status ?? null,
        createdAt: serializeTimestamp(data.createdAt),
        joinedAt: serializeTimestamp(data.joinedAt),
        disabledAt: serializeTimestamp(data.disabledAt ?? data.deactivatedAt),
      };
    });

    const activeTeacherCount = members.filter(
      (member) => member.role === "school_teacher" && member.status === "active"
    ).length;

    return json({
      ok: true,
      schoolId,
      school: {
        id: schoolId,
        name: schoolData.name ?? null,
        contactName: schoolData.contactName ?? null,
        contactEmail: schoolData.contactEmail ?? null,
        planKey: schoolData.planKey ?? null,
        billingType: schoolData.billingType ?? null,
        status: schoolData.status ?? null,
        teacherSeatLimit: schoolData.teacherSeatLimit ?? null,
        activeTeacherCount,
        createdByUid: schoolData.createdByUid ?? null,
        stripeCustomerId: schoolData.stripeCustomerId ?? null,
        stripeSubscriptionId: schoolData.stripeSubscriptionId ?? null,
        createdAt: serializeTimestamp(schoolData.createdAt),
        updatedAt: serializeTimestamp(schoolData.updatedAt),
      },
      members,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      message === "Forbidden"
        ? 403
        : message.includes("Authorization") || message === "Unauthorized"
          ? 401
          : 500;

    return json({ ok: false, error: message || "Failed to load school" }, status);
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { uid, profile } = await verifyAdmin(req);

    if (!isSuperAdminProfile(profile)) {
      return json({ ok: false, error: "Only superadmin can edit schools" }, 403);
    }

    const { schoolId: rawSchoolId } = await context.params;
    const schoolId = readString(rawSchoolId);

    if (!schoolId) return json({ ok: false, error: "Missing schoolId" }, 400);

    const body = (await req.json().catch(() => ({}))) as UpdateSchoolBody;
    const name = readString(body.name);
    const contactName = readOptionalString(body.contactName);
    const contactEmail = readOptionalString(body.contactEmail);
    const billingType = readBillingType(body.billingType);
    const planKey: SchoolPlanKey | null = isValidSchoolPlanKey(body.planKey)
      ? body.planKey
      : null;
    const status = readSchoolStatus(body.status);
    const teacherSeatLimit = readPositiveInt(body.teacherSeatLimit);

    if (!name) return json({ ok: false, error: "Missing school name" }, 400);
    if (!planKey) return json({ ok: false, error: "Invalid plan" }, 400);
    if (!status) return json({ ok: false, error: "Invalid status" }, 400);
    if (!billingType) return json({ ok: false, error: "Invalid billing type" }, 400);
    if (!teacherSeatLimit) {
      return json({ ok: false, error: "Teacher seat limit must be greater than 0" }, 400);
    }

    const { db } = getAdmin();
    const schoolRef = db.collection("schools").doc(schoolId);
    const schoolSnap = await schoolRef.get();

    if (!schoolSnap.exists) {
      return json({ ok: false, error: "School not found" }, 404);
    }

    await schoolRef.set(
      {
        name,
        contactName,
        contactEmail,
        billingType,
        planKey,
        status,
        teacherSeatLimit,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await db.collection("adminAuditEvents").add({
      type: "school_updated",
      actorUid: uid,
      schoolId,
      createdAt: FieldValue.serverTimestamp(),
    });

    return json({ ok: true, schoolId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      message === "Forbidden"
        ? 403
        : message.includes("Authorization") || message === "Unauthorized"
          ? 401
          : 500;

    return json({ ok: false, error: message || "Failed to update school" }, status);
  }
}
