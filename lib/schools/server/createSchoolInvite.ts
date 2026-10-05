import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { inviteCapacityReason, validateInviteRecipients, type InviteRecipient } from "@/lib/schools/inviteBatch";
import { createInviteToken, createInviteCode, normalizeInviteCode, hashInviteToken } from "./tokens";

export type CreateSchoolInviteInput = { schoolId: string; email: string; displayName?: string; invitedBy: string };
export type CreateSchoolInviteResult = { ok: boolean; reason?: string; inviteId?: string; token?: string; inviteCode?: string };
export type CreatedInvite = InviteRecipient & { inviteId: string; token: string; inviteCode: string };

export async function createSchoolInvites(input: { schoolId: string; recipients: InviteRecipient[]; invitedBy: string }): Promise<{
  ok: boolean; reason?: string; invites?: CreatedInvite[];
}> {
  let recipients: InviteRecipient[];
  try { recipients = validateInviteRecipients(input.recipients); }
  catch (error) { return { ok: false, reason: error instanceof Error ? error.message : "invalid_batch" }; }
  const { db } = getAdmin();
  const schoolRef = db.collection("schools").doc(input.schoolId);
  return db.runTransaction(async (transaction) => {
    const [school, members, pending] = await Promise.all([
      transaction.get(schoolRef), transaction.get(schoolRef.collection("members")),
      transaction.get(db.collection("schoolInvites").where("schoolId", "==", input.schoolId).where("status", "==", "pending")),
    ]);
    if (!school.exists) return { ok: false, reason: "school_not_found" };
    if (school.get("status") !== "active") return { ok: false, reason: "school_not_active" };
    const validPending = pending.docs.filter((doc) => !doc.get("expiresAt") || doc.get("expiresAt").toMillis() > Date.now());
    if (recipients.some((recipient) => validPending.some((doc) => doc.get("email") === recipient.email))) return { ok: false, reason: "pending_invite_exists" };
    if (recipients.some((recipient) => members.docs.some((doc) => doc.get("status") === "active" && doc.get("email")?.toLowerCase() === recipient.email))) return { ok: false, reason: "member_exists" };
    const activeTeachers = members.docs.filter((doc) => doc.get("role") === "school_teacher" && doc.get("status") === "active").length;
    const limit = school.get("teacherSeatLimit");
    const capacityReason = inviteCapacityReason(limit, activeTeachers, validPending.length, recipients.length);
    if (capacityReason) return { ok: false, reason: capacityReason };
    const now = FieldValue.serverTimestamp();
    const expiresAt = Timestamp.fromMillis(Date.now() + 14 * 86400000);
    const invites = recipients.map((recipient) => {
      const ref = db.collection("schoolInvites").doc();
      const token = createInviteToken();
      const inviteCode = createInviteCode();
      transaction.set(ref, {
        schoolId: input.schoolId, ...recipient, role: "school_teacher", status: "pending",
        invitedByUid: input.invitedBy, acceptedByUid: null,
        inviteToken: token, inviteTokenHash: hashInviteToken(token),
        inviteCode, inviteCodeHash: hashInviteToken(normalizeInviteCode(inviteCode)),
        expiresAt, acceptedAt: null, revokedAt: null, createdAt: now, updatedAt: now,
      });
      return { ...recipient, inviteId: ref.id, token, inviteCode };
    });
    transaction.update(schoolRef, { updatedAt: now });
    return { ok: true, invites };
  });
}
export async function createSchoolInvite(input: CreateSchoolInviteInput): Promise<CreateSchoolInviteResult> {
  const result = await createSchoolInvites({ ...input, recipients: [{ email: input.email, displayName: input.displayName }] });
  return { ok: result.ok, reason: result.reason, ...result.invites?.[0] };
}
