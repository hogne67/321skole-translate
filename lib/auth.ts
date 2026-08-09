// lib/auth.ts
import { auth } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  updateProfile,
  type ActionCodeSettings,
  type User,
  type UserCredential,
} from "firebase/auth";

export async function signInWithGoogle(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  // gjør testing enklere: tving konto-velger
  provider.setCustomParameters({ prompt: "select_account" });
  return await signInWithPopup(auth, provider);
}

export async function signInWithFeide(loginHint = "feide|all"): Promise<UserCredential> {
  const provider = new OAuthProvider("oidc.feide");
  provider.setCustomParameters({ login_hint: loginHint });
  return await signInWithPopup(auth, provider);
}

export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  return await signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<UserCredential> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName?.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim() });
  }
  return cred;
}

export async function sendVerificationEmail(
  user: User,
  actionCodeSettings?: ActionCodeSettings
): Promise<void> {
  await sendEmailVerification(user, actionCodeSettings);
}

export async function logout() {
  await signOut(auth);
}
