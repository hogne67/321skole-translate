import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { canAccessAcademy, hasAdminAccess } from "@/lib/courses/academyAccess";

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
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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

async function requireCourseAccess(req: Request, courseId: string) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;

  const [profileSnap, courseSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("courses").doc(courseId).get(),
  ]);

  if (!courseSnap.exists) return { error: json({ error: "Course not found" }, 404) };

  const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
  const course = courseSnap.data() ?? {};
  const isAdmin = hasAdminAccess(profile);

  if (!isTeacherOrAdmin(profile) || !canAccessAcademy(profile)) {
    return { error: json({ error: "No academy access" }, 403) };
  }

  if (!isAdmin && course.ownerUid !== uid) {
    return { error: json({ error: "No access" }, 403) };
  }

  return { db };
}

function serializeOrder(id: string, data: FirebaseFirestore.DocumentData) {
  const payout = isRecord(data.payout) ? data.payout : {};

  return {
    id,
    status: safeString(data.status),
    buyerEmail: safeString(data.buyerEmail),
    buyerRole: safeString(data.buyerRole),
    currency: safeString(data.currency) || "NOK",
    grossAmountOre: safeNumber(payout.grossAmountOre),
    instructorAmountOre: safeNumber(payout.instructorAmountOre),
    applicationFeeAmountOre: safeNumber(payout.applicationFeeAmountOre),
    paymentFeeOre: safeNumber(payout.paymentFeeOre),
    dailyAiFeeOre: safeNumber(payout.dailyAiFeeOre),
    licenseFeeOre: safeNumber(payout.licenseFeeOre),
    participantHasActiveLicense: data.participantHasActiveLicense === true,
    stripeCheckoutSessionId: safeString(data.stripeCheckoutSessionId),
    stripePaymentIntentId: safeString(data.stripePaymentIntentId),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
    paidAt: data.paidAt?.toDate ? data.paidAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null,
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await ctx.params;
    if (!courseId) return json({ error: "Missing courseId" }, 400);

    const access = await requireCourseAccess(req, courseId);
    if ("error" in access) return access.error;

    const snap = await access.db
      .collection("courseOrders")
      .where("courseId", "==", courseId)
      .get();

    const orders = snap.docs
      .map((doc) => serializeOrder(doc.id, doc.data()))
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });

    return json({ orders }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load orders";
    return json({ error: message }, 500);
  }
}
