import "server-only";
import { randomUUID } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

export type AccountAction = "disable" | "reactivate" | "revoke" | "synchronize";
export class AccountManagementError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
// Explicit platform administration only. No school-licence operation calls this function.
export async function manageAccountAccess(auth: Auth, db: Firestore, actorUid: string, uid: string, action: AccountAction) {
  const actor = (await db.doc(`users/${actorUid}`).get()).data();
  if (actor?.disabled === true || actor?.authDisabled === true || actor?.roles?.admin !== true || actor?.adminLevel !== "superadmin") {
    throw new AccountManagementError("Superadmin required", 403);
  }
  if (uid === actorUid) throw new AccountManagementError("Cannot change your own global access", 409);
  const account = await auth.getUser(uid);
  const profileRef = db.doc(`users/${uid}`);
  const operation = randomUUID();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const authCutoff = Math.floor(Date.parse(account.tokensValidAfterTime || new Date(0).toISOString()) / 1000);
  await db.runTransaction(async tx => {
    const current = (await tx.get(profileRef)).data() ?? {};
    const cutoff = Math.max(typeof current.authRevokedBefore === "number" ? current.authRevokedBefore : 0,
      action === "synchronize" ? authCutoff : nowSeconds);
    tx.set(profileRef, {
      authRevokedBefore: cutoff,
      accountAccessOperation: operation, accountAccessStatus: "pending",
      accountAccessByUid: actorUid, accountAccessUpdatedAt: FieldValue.serverTimestamp(),
      ...(action === "disable" || action === "reactivate" ? { disabled: true, authDisabled: true } : {}),
      ...(action === "synchronize" ? { authDisabled: account.disabled, ...(account.disabled ? { disabled: true } : {}) } : {}),
    }, { merge: true });
  });
  // Any failure leaves the restriction/cutoff in place. Never roll back to permissive access.
  if (action === "disable") await auth.updateUser(uid, { disabled: true });
  if (action !== "synchronize") await auth.revokeRefreshTokens(uid);
  if (action === "reactivate") await auth.updateUser(uid, { disabled: false });
  const updatedAccount = await auth.getUser(uid);
  const updatedCutoff = Math.floor(Date.parse(updatedAccount.tokensValidAfterTime || new Date(0).toISOString()) / 1000);
  if (action === "reactivate" && updatedAccount.disabled) throw new AccountManagementError("Auth account is still disabled; profile remains blocked", 409);
  await db.runTransaction(async tx => {
    const current = await tx.get(profileRef);
    if (current.get("accountAccessOperation") !== operation) throw new AccountManagementError("Concurrent account operation; access not relaxed", 409);
    tx.set(profileRef, { accountAccessStatus: "completed",
      authRevokedBefore: Math.max(current.get("authRevokedBefore") ?? 0, updatedCutoff),
      ...(action === "reactivate" ? { disabled: false, authDisabled: false } : {}),
      ...(action === "synchronize" ? { authDisabled: updatedAccount.disabled, ...(updatedAccount.disabled ? { disabled: true } : {}) } : {}),
    }, { merge: true });
  });
  return { ok: true, action, uid, operation, requiresFreshSignIn: action !== "synchronize" || authCutoff > 0 };
}
