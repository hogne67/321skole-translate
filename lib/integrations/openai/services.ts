import "server-only";
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import type { AdapterFactory } from "oidc-provider";
import { getAdmin } from "@/lib/firebaseAdmin";
import { firestoreAdapter } from "./adapter";
import { GRANT_TTL, IntegrationError, type IntegrationConfig } from "./config";

export const DELEGATIONS_COLLECTION = "openaiOAuthDelegations";
export type FirebaseIdentity = { uid: string; tokensValidAfter: number };
export type VerifiedFirebaseIdentity = FirebaseIdentity & { authTime: number };
export type GrantBinding = { uid: string; clientId: string; authTime: number; revoked: boolean; expiresAt: number };
export interface OAuthServices {
  adapter: AdapterFactory;
  getIdentity(uid: string): Promise<FirebaseIdentity | undefined>;
  verifyFirebaseToken(token: string): Promise<VerifiedFirebaseIdentity>;
  saveBinding(grantId: string, binding: GrantBinding): Promise<void>;
  getBinding(grantId: string): Promise<GrantBinding | undefined>;
  revokeForUser(uid: string): Promise<void>;
  checkRateLimit(uid: string): Promise<void>;
}
const bindingId = (id: string) => createHash("sha256").update(id).digest("hex");

export function firebaseOAuthServices(config: Pick<IntegrationConfig, "allowedUids">, admin: Pick<ReturnType<typeof getAdmin>, "auth" | "db"> = getAdmin()): OAuthServices {
  const { auth, db } = admin;
  const bindings = db.collection(DELEGATIONS_COLLECTION);
  const getIdentity: OAuthServices["getIdentity"] = async (uid) => {
    if (!config.allowedUids.has(uid)) return undefined;
    let user;
    try { user = await auth.getUser(uid); } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "auth/user-not-found") return undefined;
      throw error;
    }
    const profile = await db.collection("users").doc(uid).get();
    if (user.disabled || !profile.exists || profile.data()?.disabled === true) return undefined;
    return { uid: user.uid, tokensValidAfter: user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) / 1000 : 0 };
  };
  return {
    adapter: firestoreAdapter(db), getIdentity,
    async verifyFirebaseToken(token) {
      let decoded;
      try { decoded = await auth.verifyIdToken(token, true); }
      catch { throw new IntegrationError("Invalid Firebase sign-in. Sign in again.", 401); }
      if (decoded.firebase.sign_in_provider === "anonymous") throw new IntegrationError("A registered account is required.", 403);
      const identity = await getIdentity(decoded.uid);
      if (!identity) throw new IntegrationError("Account is not enabled for this private prototype.", 403);
      return { ...identity, authTime: decoded.auth_time };
    },
    async saveBinding(grantId, binding) {
      await bindings.doc(bindingId(grantId)).create({ ...binding, cleanupAt: Timestamp.fromMillis(binding.expiresAt * 1000) });
    },
    async getBinding(grantId) {
      const data = (await bindings.doc(bindingId(grantId)).get()).data();
      return data ? { uid: data.uid, clientId: data.clientId, authTime: data.authTime, revoked: data.revoked, expiresAt: data.expiresAt } : undefined;
    },
    async revokeForUser(uid) {
      const snap = await bindings.where("uid", "==", uid).get();
      // Tombstones are retained until expiry: a delayed token exchange cannot revive a revoked grant.
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        for (const doc of snap.docs.slice(i, i + 400)) batch.update(doc.ref, { revoked: true });
        await batch.commit();
      }
    },
    async checkRateLimit(uid) {
      const now = Date.now();
      const record = db.collection("openaiOAuthRateLimits").doc(bindingId(uid));
      await db.runTransaction(async (tx) => {
        const data = (await tx.get(record)).data();
        const fresh = !data || now - data.windowStart >= 60000;
        const count = fresh ? 0 : data.count;
        if (count >= 30) throw new IntegrationError("Too many integration requests. Try again in a minute.", 429);
        tx.set(record, { windowStart: fresh ? now : data.windowStart, count: count + 1, expiresAt: Timestamp.fromMillis(now + GRANT_TTL * 1000) });
      });
    },
  };
}
