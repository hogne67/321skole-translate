// lib/googleAuth.ts
import {
  GoogleAuthProvider,
  linkWithPopup,
  signInWithPopup,
  signInWithCredential,
  type Auth,
} from "firebase/auth";
import type { FirebaseError } from "firebase/app";

function isFirebaseError(err: unknown): err is FirebaseError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code?: unknown }).code === "string"
  );
}

export async function signInOrLinkGoogle(auth: Auth) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const current = auth.currentUser;

  // ✅ Hvis vi er i guest/anon: LINK i stedet for signIn
  if (current?.isAnonymous) {
    try {
      const res = await linkWithPopup(current, provider);
      return { user: res.user, linked: true, fromAnonUid: current.uid };
    } catch (err: unknown) {
      // Google-konto allerede brukt på annen UID:
      if (isFirebaseError(err) && err.code === "auth/credential-already-in-use") {
        const cred = GoogleAuthProvider.credentialFromError(err);
        if (!cred) throw err;

        const anonUid = current.uid;
        const res2 = await signInWithCredential(auth, cred);
        return {
          user: res2.user,
          linked: false,
          fromAnonUid: anonUid,
          needsMerge: true,
        };
      }
      throw err;
    }
  }

  // ✅ Vanlig innlogging
  const res = await signInWithPopup(auth, provider);
  return { user: res.user, linked: false };
}