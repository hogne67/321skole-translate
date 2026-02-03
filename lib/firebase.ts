// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Ikke throw på top-level i Next (kan knekke prerender/build).
// Gi tydelig advarsel i dev.
const missing =
  !firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.authDomain;

if (missing && process.env.NODE_ENV === "development") {
  console.warn(
    "Firebase env mangler. Sjekk NEXT_PUBLIC_FIREBASE_* i .env.local og restart dev-serveren.",
    {
      hasApiKey: !!firebaseConfig.apiKey,
      hasProjectId: !!firebaseConfig.projectId,
      hasAuthDomain: !!firebaseConfig.authDomain,
    }
  );
}

// Initialiser bare hvis vi har minimum config.
// Hvis ikke: eksporter "null"-verdier som du kan håndtere i client.
const app =
  !missing
    ? getApps().length
      ? getApp()
      : initializeApp(firebaseConfig as any)
    : null;

export const auth = app ? getAuth(app) : (null as any);
export const db = app ? getFirestore(app) : (null as any);
export const storage = app ? getStorage(app) : (null as any);

/**
 * Emulator toggle (dev + browser only)
 *
 * ✅ Kun opt-in:
 *   NEXT_PUBLIC_USE_EMULATORS="true"
 *
 * Vi kobler både Firestore og Auth-emulator for å unngå “to verdener”.
 *
 * Standard: LIVE.
 */
const USE_EMULATORS =
  process.env.NODE_ENV === "development" &&
  typeof window !== "undefined" &&
  !!app &&
  process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

if (USE_EMULATORS) {
  const g: any = globalThis as any;

  // ---- Firestore emulator ----
  const fsHost = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1";
  const fsPort = Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? "8080");

  if (!g.__FIRESTORE_EMULATOR_CONNECTED__) {
    try {
      connectFirestoreEmulator(db, fsHost, fsPort);
      g.__FIRESTORE_EMULATOR_CONNECTED__ = true;
      console.log(`[firebase] Firestore emulator connected: ${fsHost}:${fsPort}`);
    } catch (e) {
      console.warn("[firebase] connectFirestoreEmulator warning:", e);
    }
  }

  // ---- Auth emulator ----
  const authHost = process.env.NEXT_PUBLIC_AUTH_EMULATOR_HOST ?? "127.0.0.1";
  const authPort = Number(process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT ?? "9099");

  if (!g.__AUTH_EMULATOR_CONNECTED__) {
    try {
      connectAuthEmulator(auth, `http://${authHost}:${authPort}`, {
        disableWarnings: true,
      });
      g.__AUTH_EMULATOR_CONNECTED__ = true;
      console.log(`[firebase] Auth emulator connected: http://${authHost}:${authPort}`);
    } catch (e) {
      console.warn("[firebase] connectAuthEmulator warning:", e);
    }
  }
}

// Dev-only debug: viser tydelig om vi er live/emulator
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const mode = USE_EMULATORS ? "EMULATOR" : "LIVE";
  console.log(
    `[firebase] loaded | mode=${mode} | projectId=${firebaseConfig.projectId ?? "?"}`
  );
}
