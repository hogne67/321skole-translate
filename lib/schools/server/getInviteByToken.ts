import { Timestamp } from "firebase-admin/firestore";

import { schoolInvitesCollectionRef } from "@/lib/schools/server/refs";
import { hashInviteToken } from "@/lib/schools/server/tokens";
import type { SchoolInviteDoc } from "@/lib/schools/types";

export type GetInviteByTokenResult = {
  ok: boolean;
  reason?: "invite_not_found" | "invite_not_pending" | "invite_expired";
  inviteId?: string;
  invite?: SchoolInviteDoc;
};

function isExpired(expiresAt: SchoolInviteDoc["expiresAt"]): boolean {
  if (!expiresAt) return false;

  return expiresAt.toMillis() <= Timestamp.now().toMillis();
}

export async function getInviteByToken(token: string): Promise<GetInviteByTokenResult> {
  const inviteTokenHash = hashInviteToken(token);
  const snapshot = await schoolInvitesCollectionRef()
    .where("inviteTokenHash", "==", inviteTokenHash)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return { ok: false, reason: "invite_not_found" };
  }

  const doc = snapshot.docs[0]!;
  const invite = {
    id: doc.id,
    ...(doc.data() as SchoolInviteDoc),
  };

  if (invite.status !== "pending") {
    return {
      ok: false,
      reason: "invite_not_pending",
      inviteId: doc.id,
      invite,
    };
  }

  if (isExpired(invite.expiresAt)) {
    return {
      ok: false,
      reason: "invite_expired",
      inviteId: doc.id,
      invite,
    };
  }

  return {
    ok: true,
    inviteId: doc.id,
    invite,
  };
}
