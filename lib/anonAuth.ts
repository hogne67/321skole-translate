// lib/anonAuth.ts
import { auth } from "@/lib/firebase";
import {
  signInAnonymously,
  type User,
  GoogleAuthProvider,
  linkWithPopup,
  linkWithCredential,
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
} from "firebase/auth";

/**
 * Forhindrer at flere komponenter samtidig prøver å signInAnonymously(),
 * som kan gi race conditions / ekstra console-støy.
 */
let ensureAnonPromise: Promise<User> | null = null;

/**
 * Sikrer at vi alltid har en bruker i session:
 * - hvis innlogget (anon eller vanlig) -> returner user
 * - hvis ikke -> opprett anonym user
 *
 * VIKTIG:
 * Denne funksjonen skal bare kalles på sider som tillater anon (student/public/share).
 * Ikke kall den i teacher/admin-sider.
 */
export async function ensureAnonymousUser(): Promise<User> {
  // ✅ Hvis vi allerede har en user (anon eller ekte), bruk den
  if (auth.currentUser) return auth.currentUser;

  // ✅ Dedup parallelle kall
  if (ensureAnonPromise) return ensureAnonPromise;

  ensureAnonPromise = (async () => {
    try {
      const cred = await signInAnonymously(auth);
      return cred.user;
    } finally {
      ensureAnonPromise = null;
    }
  })();

  return ensureAnonPromise;
}

export function isAnonymous(user: User | null | undefined) {
  return !!user?.isAnonymous;
}

/**
 * Oppgrader anonym bruker til Google-konto (beholder uid, og dermed data).
 * Hvis brukeren ikke er anonym, gjør vi vanlig Google sign-in.
 */
export async function linkAnonymousWithGoogle(): Promise<User> {
  const current = auth.currentUser;

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  // Ikke innlogget? Da gjør vi vanlig sign-in i stedet.
  if (!current) {
    const { signInWithPopup } = await import("firebase/auth");
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  }

  // Ikke anonym? Da er det vanlig sign-in som gjelder.
  if (!current.isAnonymous) {
    const { signInWithPopup } = await import("firebase/auth");
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  }

  // ✅ Anonym -> link med popup (beholder uid)
  const linked = await linkWithPopup(current, provider);
  return linked.user;
}

/**
 * Oppgrader anonym bruker til email/passord (beholder uid, og dermed data).
 *
 * NB:
 * - Hvis email allerede finnes som konto, kan vi ikke "linke" anonym til den uten innlogging først.
 *   Da må brukeren logge inn på den kontoen, og evt. merge data (senere).
 */
export async function linkAnonymousWithEmailPassword(
  email: string,
  password: string
): Promise<User> {
  const current = auth.currentUser;

  // hvis ikke innlogget: normal create user
  if (!current) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user;
  }

  // hvis ikke anonym: normal create user (vil typisk feile hvis allerede innlogget)
  if (!current.isAnonymous) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user;
  }

  // Sjekk om email allerede finnes
  const methods = await fetchSignInMethodsForEmail(auth, email);
  if (methods.length > 0) {
    throw new Error("Denne e-posten er allerede i bruk. Logg inn i stedet.");
  }

  // ✅ Anonym -> link credential
  const credential = EmailAuthProvider.credential(email, password);
  const linked = await linkWithCredential(current, credential);
  return linked.user;
}
