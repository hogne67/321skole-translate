import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { readSchoolAiPolicy } from "@/lib/security/schoolAiPolicy.server";

export const runtime = "nodejs";
type Context = { params: Promise<{ schoolId: string }> };

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function actor(req: Request, write = false) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token, true);
  if (!decoded.uid) return null;
  const profile = await db.collection("users").doc(decoded.uid).get();
  const data = profile.data() ?? {};
  const roles = data.roles && typeof data.roles === "object" ? data.roles as Record<string, unknown> : {};
  if (data.disabled === true || !(data.role === "admin" || roles.admin === true)
    || data.adminLevel === "moderator" || (write && data.adminLevel !== "superadmin")) return null;
  return { uid: decoded.uid, db, canEdit: data.adminLevel === "superadmin" };
}

function schoolIdFrom(raw: string) {
  const id = raw.trim();
  return id && !id.includes("/") ? id : null;
}

export async function GET(req: Request, context: Context) {
  try {
    if (!req.headers.get("authorization")) return json({ ok: false, error: "Unauthorized" }, 401);
    const admin = await actor(req);
    if (!admin) return json({ ok: false, error: "Forbidden" }, 403);
    const schoolId = schoolIdFrom((await context.params).schoolId);
    if (!schoolId) return json({ ok: false, error: "Invalid school" }, 400);
    const school = await admin.db.collection("schools").doc(schoolId).get();
    if (!school.exists) return json({ ok: false, error: "School not found" }, 404);
    return json({ ok: true, schoolId, policy: readSchoolAiPolicy(school.data()), canEdit: admin.canEdit });
  } catch (error) {
    return json({ ok: false, error: "Could not load school AI policy" }, accountErrorStatus(error) ?? 500);
  }
}

export async function PATCH(req: Request, context: Context) {
  try {
    if (!req.headers.get("authorization")) return json({ ok: false, error: "Unauthorized" }, 401);
    const admin = await actor(req, true);
    if (!admin) return json({ ok: false, error: "Forbidden" }, 403);
    const schoolId = schoolIdFrom((await context.params).schoolId);
    if (!schoolId) return json({ ok: false, error: "Invalid school" }, 400);
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "Invalid policy" }, 400);
    const input = body as Record<string, unknown>;
    if (Object.keys(input).sort().join(",") !== "expectedVersion,lessonFeedbackDisabled,writingDisabled"
      || typeof input.lessonFeedbackDisabled !== "boolean" || typeof input.writingDisabled !== "boolean"
      || !Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 0) {
      return json({ ok: false, error: "Invalid policy" }, 400);
    }
    const schoolRef = admin.db.collection("schools").doc(schoolId);
    const auditRef = admin.db.collection("adminAuditEvents").doc();
    const result = await admin.db.runTransaction(async (tx) => {
      const school = await tx.get(schoolRef);
      if (!school.exists) return { status: 404, error: "School not found" };
      const before = readSchoolAiPolicy(school.data());
      if (before.version !== input.expectedVersion) return { status: 409, error: "Policy changed; reload before saving" };
      const after = {
        lessonFeedbackDisabled: input.lessonFeedbackDisabled as boolean,
        writingDisabled: input.writingDisabled as boolean,
        version: before.version + 1,
      };
      tx.update(schoolRef, { aiPolicy: after, updatedAt: FieldValue.serverTimestamp() });
      tx.create(auditRef, {
        type: "school_ai_policy_updated", schoolId, actorUid: admin.uid,
        before, after, createdAt: FieldValue.serverTimestamp(),
      });
      return { status: 200, policy: after };
    });
    if ("error" in result) return json({ ok: false, error: result.error }, result.status);
    return json({ ok: true, schoolId, policy: result.policy });
  } catch (error) {
    return json({ ok: false, error: "Could not update school AI policy" }, accountErrorStatus(error) ?? 500);
  }
}
