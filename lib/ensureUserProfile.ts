// lib/ensureUserProfile.ts
import type { User } from "firebase/auth";
import { ensureUserProfile as ensureUserProfileFromUser } from "@/lib/userProfile";

/**
 * Legacy wrapper.
 * Bruk heller ensureUserProfile(user) fra "@/lib/userProfile" direkte.
 *
 * VIKTIG:
 * - UID-only (string) kan ikke "ensure" trygt i klienten uten autentisering.
 *   Derfor gjør vi NO-OP når vi bare har uid.
 * - Anonyme brukere skal ikke forsøke å ensure/read /users, ellers kan public/share henge.
 */
export async function ensureUserProfile(userOrUid: User | string) {
  // ✅ UID-only -> NO-OP (kan ikke sikre profil uten auth)
  if (typeof userOrUid === "string") {
    return;
  }

  // ✅ Anonym -> NO-OP (public/share skal ikke kreve /users)
  if (userOrUid.isAnonymous) {
    return;
  }

  // ✅ Vanlig innlogget bruker
  await ensureUserProfileFromUser(userOrUid);
}
