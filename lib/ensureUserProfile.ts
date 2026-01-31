// lib/ensureUserProfile.ts
import type { User } from "firebase/auth";
import { ensureUserProfile as ensureUserProfileFromUser } from "@/lib/userProfile";

/**
 * Legacy wrapper.
 * Bruk heller ensureUserProfile(user) fra "@/lib/userProfile" direkte.
 *
 * Merk: Hvis du sender inn kun UID (string), kan vi ikke sette email/displayName.
 * Da kaller vi likevel ensureUserProfile(...) for å backfylle defaults (roles/caps/teacherStatus/etc).
 */
export async function ensureUserProfile(userOrUid: User | string) {
  if (typeof userOrUid === "string") {
    // UID-only "best effort": sørg for at userProfile-funksjonen får et objekt
    // som i praksis har de feltene den typisk trenger (uid, email, displayName).
    // Firebase User.email/displayName er ofte null, så null er tryggere enn undefined.
    const fakeUser = {
      uid: userOrUid,
      email: null,
      displayName: null,
      // resten settes til tomme/ufarlige defaults for å unngå utilsiktet tilgang
      isAnonymous: true,
      providerData: [],
    } as unknown as User;

    await ensureUserProfileFromUser(fakeUser);
    return;
  }

  await ensureUserProfileFromUser(userOrUid);
}
