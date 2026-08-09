// lib/anonAuth.ts
import { auth, db } from "@/lib/firebase";
import {
  signInAnonymously,
  type User,
  GoogleAuthProvider,
  OAuthProvider,
  linkWithPopup,
  linkWithCredential,
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  type AuthError,
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

function getAuthErrorCode(err: unknown): string {
  if (!err) return "";
  if (typeof err === "object" && err !== null && "code" in err) {
    const c = (err as { code?: unknown }).code;
    return typeof c === "string" ? c : "";
  }
  return "";
}

/**
 * Oppgrader anonym bruker til Google-konto.
 *
 * - Normal case: anon -> linkWithPopup => beholder uid (data følger med).
 * - Edge case: auth/credential-already-in-use (Google-konto finnes fra før)
 *   => signIn med credential og merge anon-data -> eksisterende konto (best effort).
 */
export async function linkAnonymousWithGoogle(): Promise<User> {
  const current = auth.currentUser;

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const { signInWithPopup, signInWithCredential } = await import("firebase/auth");

  // Ikke innlogget? Da gjør vi vanlig sign-in.
  if (!current) {
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  }

  // Ikke anonym? Da er det vanlig sign-in som gjelder.
  if (!current.isAnonymous) {
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  }

  // ✅ Anonym -> prøv å linke (beholder uid)
  try {
    const linked = await linkWithPopup(current, provider);
    return linked.user;
  } catch (err: unknown) {
    const code = getAuthErrorCode(err);

    // ✅ Google-konto er allerede knyttet til en annen UID
    if (code === "auth/credential-already-in-use") {
      const credFromErr = GoogleAuthProvider.credentialFromError(err as AuthError);
      if (!credFromErr) throw err;

      const anonUid = current.uid;

      // Sign in til den eksisterende google-brukeren
      const signed = await signInWithCredential(auth, credFromErr);

      // ✅ MIGRER anon-data (best effort)
      // Merk: mergeAnonToUser forventer (db, anonUid, newUid)
      try {
        const { mergeAnonToUser } = await import("@/lib/mergeAnon");
        await mergeAnonToUser(db, anonUid, signed.user.uid);
      } catch {
        // ignore (kan logges hvis du vil)
      }

      return signed.user;
    }

    throw err;
  }
}

/**
 * Oppgrader anonym bruker til Feide-konto via Firebase OIDC.
 */
export async function linkAnonymousWithFeide(): Promise<User> {
  const current = auth.currentUser;
  const provider = new OAuthProvider("oidc.feide");
  provider.setCustomParameters({ login_hint: "feide|all" });

  const { signInWithPopup, signInWithCredential } = await import("firebase/auth");

  if (!current) {
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  }

  if (!current.isAnonymous) {
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  }

  try {
    const linked = await linkWithPopup(current, provider);
    return linked.user;
  } catch (err: unknown) {
    const code = getAuthErrorCode(err);

    if (code === "auth/credential-already-in-use") {
      const credFromErr = OAuthProvider.credentialFromError(err as AuthError);
      if (!credFromErr) throw err;

      const anonUid = current.uid;
      const signed = await signInWithCredential(auth, credFromErr);

      try {
        const { mergeAnonToUser } = await import("@/lib/mergeAnon");
        await mergeAnonToUser(db, anonUid, signed.user.uid);
      } catch {
        // Best effort: innlogging skal ikke stoppes av en merge-feil.
      }

      return signed.user;
    }

    throw err;
  }
}

/**
 * Oppgrader anonym bruker til email/passord (beholder uid, og dermed data).
 *
 * NB:
 * - Hvis email allerede finnes som konto, kan vi ikke "linke" anonym til den uten innlogging først.
 *   Da må brukeren logge inn på den kontoen, og evt. merge data (senere).
 */
export async function linkAnonymousWithEmailPassword(email: string, password: string): Promise<User> {
  const current = auth.currentUser;

  const e = (email || "").trim();

  // hvis ikke innlogget: normal create user
  if (!current) {
    const cred = await createUserWithEmailAndPassword(auth, e, password);
    return cred.user;
  }

  // hvis ikke anonym: normal create user (vil typisk feile hvis allerede innlogget)
  if (!current.isAnonymous) {
    const cred = await createUserWithEmailAndPassword(auth, e, password);
    return cred.user;
  }

  // Sjekk om email allerede finnes
  const methods = await fetchSignInMethodsForEmail(auth, e);
  if (methods.length > 0) {
    throw new Error("Denne e-posten er allerede i bruk. Logg inn i stedet.");
  }

  // ✅ Anonym -> link credential
  const credential = EmailAuthProvider.credential(e, password);
  const linked = await linkWithCredential(current, credential);
  return linked.user;
}
