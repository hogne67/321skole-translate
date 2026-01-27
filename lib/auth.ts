// lib/auth.ts
import { auth } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { ensureUserProfile } from "@/lib/ensureUserProfile";

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const cred = await signInWithPopup(auth, provider);
  await ensureUserProfile(cred.user.uid);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}
