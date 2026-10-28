import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus, isGloballyEnabled } from "@/lib/security/accountAccess.server";
import { getSpaceAccess } from "@/lib/security/spaceAccess.server";
import { evaluatePupilJoin, isActivePupil, joinText, type JoinMember } from "@/lib/spaceJoinPolicy";

type Context = { params: Promise<{ spaceId: string; memberId: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const adminProfile = (profile: Record<string, unknown> | undefined) => profile?.role === "admin" ||
  !!profile?.roles && typeof profile.roles === "object" && "admin" in profile.roles && profile.roles.admin === true;

export async function POST(req: Request, context: Context) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "unauthorized" }, 401);
  try {
    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token, true);
    const { spaceId, memberId } = await context.params;
    if (!spaceId || !memberId || spaceId.includes("/") || memberId.includes("/")) return json({ error: "invalid_request" }, 400);
    const access = await getSpaceAccess(db, spaceId, decoded.uid);
    if (!access.owner && !adminProfile(access.profile)) return json({ error: "forbidden" }, 403);
    const parsed: unknown = await req.json().catch(() => ({}));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "invalid_request" }, 400);
    const body = parsed as Record<string, unknown>;
    if (body.action !== "approve" && body.action !== "reject") return json({ error: "invalid_action" }, 400);
    const result = await db.runTransaction(async tx => {
      const current = await getSpaceAccess(db, spaceId, decoded.uid, tx);
      if (!current.owner && !(isGloballyEnabled(current.profile) && adminProfile(current.profile))) return { error: "forbidden", status: 403 };
      const memberRef = db.doc(`spaceMembers/${memberId}`);
      const member = await tx.get(memberRef), data = member.data();
      if (!data || data.spaceId !== spaceId || !data.uid || memberId !== `${spaceId}_${data.uid}` || data.role !== "student" || data.status !== "pending_approval" || data.active !== false) return { error: "request_unavailable", status: 409 };
      if (body.action === "reject") {
        tx.update(memberRef, { status: "rejected", active: false, archived: true, approvalCode: FieldValue.delete(), approvalExpiresAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
        return { ok: true, action: "reject" };
      }
      if (!current.exists || current.space?.archived === true || current.space?.status === "archived") return { error: "room_unavailable", status: 409 };
      if (!(data.approvalExpiresAt instanceof Timestamp) || data.approvalExpiresAt.toMillis() <= Date.now()) return { error: "request_expired", status: 409 };
      if (!/^[0-9]{6}$/.test(joinText(body.confirmationCode)) || body.confirmationCode !== data.approvalCode) return { error: "confirmation_mismatch", status: 400 };
      const matches = await tx.get(db.collection("spaceMembers").where("studentCodeKey", "==", `${spaceId}:${joinText(data.studentCode)}`));
      const decision = evaluatePupilJoin(null, matches.docs.map(doc => doc.data() as JoinMember));
      if ("error" in decision || decision.participantId !== data.participantId) return { error: "request_unavailable", status: 409 };
      const original = await tx.get(db.doc(`spaceMembers/${spaceId}_${decision.participantId}`));
      const originalData = original.data();
      const displayName = originalData?.teacherManaged === true && originalData.participantId === decision.participantId ? joinText(originalData.displayName) : decision.displayName;
      if (!displayName) return { error: "missing_pupil_name", status: 409 };
      tx.update(memberRef, {
        status: "active", active: true, archived: false, displayName, studentName: displayName,
        approvedByUid: decoded.uid, approvedAt: FieldValue.serverTimestamp(),
        approvalCode: FieldValue.delete(), approvalExpiresAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(),
      });
      // Preserve the original teacher-created identity as the authoritative name record.
      const origin = matches.docs.find(doc => isActivePupil(doc.data() as JoinMember));
      if (origin && !joinText(origin.data().uid)) tx.update(origin.ref, { status: "linked", active: false, archived: true, linkedToMemberId: memberId, updatedAt: FieldValue.serverTimestamp() });
      return { ok: true, action: "approve" };
    });
    return "error" in result ? json({ error: result.error }, result.status) : json(result);
  } catch (error) { return json({ error: "access_request_failed" }, accountErrorStatus(error) ?? 500); }
}
