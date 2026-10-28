import "server-only";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

export class AccountAccessError extends Error {
  constructor(message: string, public readonly status: 401 | 403 | 503, public readonly code: string) { super(message); }
}
export function accountErrorStatus(error: unknown): number | undefined {
  if (error instanceof AccountAccessError) return error.status;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string"
    && ["auth/id-token-revoked", "auth/id-token-expired", "auth/invalid-id-token", "auth/argument-error", "auth/user-disabled", "auth/user-not-found"].includes(error.code)) return 401;
  return undefined;
}
export function isGloballyEnabled(profile: Record<string, unknown> | undefined): boolean {
  return profile?.disabled !== true && profile?.authDisabled !== true;
}
export function assertActiveProfile(profile: Record<string, unknown> | undefined, decoded?: DecodedIdToken) {
  if (!isGloballyEnabled(profile)) throw new AccountAccessError("Account disabled", 403, "auth/account-disabled");
  if (profile && "authRevokedBefore" in profile) {
    const cutoff = profile.authRevokedBefore;
    if (typeof cutoff !== "number" || !Number.isFinite(cutoff) || cutoff < 0 || !decoded || typeof decoded.auth_time !== "number" || decoded.auth_time <= cutoff) {
      throw new AccountAccessError("Sign in again", 401, "auth/id-token-revoked");
    }
  }
}

// A facade, rather than a mutation of the SDK singleton. Every ID-token verification
// through getAdmin forces the real SDK revocation/account check, including outside emulators.
const guarded = new WeakMap<Auth, Auth>();
export function accountCheckedAuth(auth: Auth, db: Firestore): Auth {
  const cached = guarded.get(auth);
  if (cached) return cached;
  const proxy = new Proxy(auth, {
    get(target, key) {
      if (key === "verifyIdToken") return async (token: string): Promise<DecodedIdToken> => {
        let decoded: DecodedIdToken;
        try {
          decoded = await target.verifyIdToken(token, true);
        } catch (error) {
          if (error instanceof AccountAccessError) throw error;
          const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
          const unavailable = code && (!code.startsWith("auth/") || ["auth/internal-error", "auth/invalid-credential", "auth/insufficient-permission", "auth/project-not-found"].includes(code));
          // Never forward a lookup error to callers with an unverified-JWT development fallback.
          throw new AccountAccessError(unavailable ? "Account verification unavailable" : "Invalid or revoked sign-in",
            unavailable ? 503 : 401, unavailable ? "auth/verification-unavailable" : "auth/invalid-session");
        }
        try {
          const profile = (await db.doc(`users/${decoded.uid}`).get()).data();
          assertActiveProfile(profile, decoded);
          return decoded;
        } catch (error) {
          if (error instanceof AccountAccessError) throw error;
          throw new AccountAccessError("Account verification unavailable", 503, "auth/verification-unavailable");
        }
      };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  guarded.set(auth, proxy);
  return proxy;
}
