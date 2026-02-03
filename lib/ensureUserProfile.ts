// lib/ensureUserProfile.ts
import type { User } from "firebase/auth";
import { ensureUserProfile as ensureUserProfileFromUser } from "@/lib/userProfile";

/**
 * Legacy wrapper.
 * Bruk helst ensureUserProfile(user) fra "@/lib/userProfile" direkte.
 *
 * VIKTIG:
 * - UID-only (string) kan ikke "ensure" trygt i klienten uten autentisering -> NO-OP.
 * - Anonyme brukere skal ikke forsøke å ensure/read /users -> NO-OP (public/share skal ikke henge).
 */
export async function ensureUserProfileLegacy(userOrUid: User | string) {
  if (typeof userOrUid === "string") return;
  if (userOrUid.isAnonymous) return;

  try {
    await ensureUserProfileFromUser(userOrUid);
  } catch (err) {
    // Ikke crash UI, men logg for debugging
    console.warn("ensureUserProfileLegacy failed:", err);
  }
}
