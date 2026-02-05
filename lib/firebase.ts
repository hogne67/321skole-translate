// lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

type FirebaseConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

const firebaseConfig: FirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Ikke throw på top-level i Next (kan knekke prerender/build).
// Gi tydelig advarsel i dev.
const missing = !firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.authDomain;

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
// Hvis ikke: behold null (for server/build-situasjoner)
const app: FirebaseApp | null =
  !missing
    ? getApps().length
      ? getApp()
      : initializeApp(firebaseConfig)
    : null;

// Nullable exports (trygge å importere hvor som helst)
export const appMaybe = app;
export const authMaybe: Auth | null = app ? getAuth(app) : null;
export const dbMaybe: Firestore | null = app ? getFirestore(app) : null;
export const storageMaybe: FirebaseStorage | null = app ? getStorage(app) : null;

// Strict exports (for klientkode som forventer at Firebase er satt opp)
function invariant<T>(v: T | null, msg: string): T {
  if (v) return v;

  // Ikke krash prerender/build: kun throw i browser runtime.
  if (typeof window === "undefined") {
    throw new Error(msg);
  }

  // I browser: throw tydelig (og tidlig)
  throw new Error(msg);
}

export const auth = invariant(
  authMaybe,
  "Firebase Auth not initialized. Check NEXT_PUBLIC_FIREBASE_* env."
);
export const db = invariant(
  dbMaybe,
  "Firestore not initialized. Check NEXT_PUBLIC_FIREBASE_* env."
);
export const storage = invariant(
  storageMaybe,
  "Firebase Storage not initialized. Check NEXT_PUBLIC_FIREBASE_* env."
);

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

// Type-safe global flags (ingen any)
declare global {
  var __FIRESTORE_EMULATOR_CONNECTED__: boolean | undefined;
  var __AUTH_EMULATOR_CONNECTED__: boolean | undefined;
}

if (USE_EMULATORS) {
  // ---- Firestore emulator ----
  const fsHost = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1";
  const fsPort = Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? "8080");

  if (!globalThis.__FIRESTORE_EMULATOR_CONNECTED__) {
    try {
      connectFirestoreEmulator(db, fsHost, fsPort);
      globalThis.__FIRESTORE_EMULATOR_CONNECTED__ = true;
      console.log(`[firebase] Firestore emulator connected: ${fsHost}:${fsPort}`);
    } catch (e: unknown) {
      console.warn("[firebase] connectFirestoreEmulator warning:", e);
    }
  }

  // ---- Auth emulator ----
  const authHost = process.env.NEXT_PUBLIC_AUTH_EMULATOR_HOST ?? "127.0.0.1";
  const authPort = Number(process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT ?? "9099");

  if (!globalThis.__AUTH_EMULATOR_CONNECTED__) {
    try {
      connectAuthEmulator(auth, `http://${authHost}:${authPort}`, {
        disableWarnings: true,
      });
      globalThis.__AUTH_EMULATOR_CONNECTED__ = true;
      console.log(`[firebase] Auth emulator connected: http://${authHost}:${authPort}`);
    } catch (e: unknown) {
      console.warn("[firebase] connectAuthEmulator warning:", e);
    }
  }
}

// Dev-only debug: viser tydelig om vi er live/emulator
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const mode = USE_EMULATORS ? "EMULATOR" : "LIVE";
  console.log(`[firebase] loaded | mode=${mode} | projectId=${firebaseConfig.projectId ?? "?"}`);
}
