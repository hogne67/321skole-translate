// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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

if (missing) {
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "Firebase env mangler. Sjekk NEXT_PUBLIC_FIREBASE_* i .env.local og restart dev-serveren."
    );
  }
}

// Initialiser bare hvis vi har minimum config.
// Hvis ikke: eksporter "null"-verdier som du kan håndtere i client.
const app =
  !missing ? (getApps().length ? getApp() : initializeApp(firebaseConfig as any)) : null;

export const auth = app ? getAuth(app) : (null as any);
export const db = app ? getFirestore(app) : (null as any);
export const storage = app ? getStorage(app) : (null as any);
