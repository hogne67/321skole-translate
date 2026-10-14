// lib/auth.ts
import { auth } from "@/lib/firebase";
import type { VerificationEmailResult } from "@/lib/email/verificationResult";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
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
  locale = "nb"
): Promise<VerificationEmailResult> {
  const token = await user.getIdToken();
  const response = await fetch("/api/email/verification", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ locale }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    const reason = response.status === 429 ? "too_many_attempts" : "verification_email_failed";
    throw Object.assign(new Error(reason), {
      code: response.status === 429 ? "auth/too-many-requests" : reason,
    });
  }
  return {
    ok: true, alreadyVerified: result.alreadyVerified === true,
    delivery: ["sent", "recently_sent", "pending"].includes(result.delivery) ? result.delivery : undefined,
    retryAfterSeconds: typeof result.retryAfterSeconds === "number"
      ? Math.max(0, Math.min(60, Math.ceil(result.retryAfterSeconds))) : 60,
  };
}

export async function logout() {
  await signOut(auth);
}
