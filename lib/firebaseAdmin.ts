// lib/firebaseAdmin.ts
import "server-only";

import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

type ServiceAccountJSON = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function loadServiceAccountFromFile(): ServiceAccountJSON | null {
  const saPath = process.env.FIREBASE_ADMIN_SA_PATH;
  if (!saPath) return null;

  const fullPath = path.resolve(process.cwd(), saPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Service account file not found: ${fullPath}`);
  }

  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function loadServiceAccountFromEnv(): ServiceAccountJSON | null {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey.replace(/\\n/g, "\n"),
  };
}

function initAdmin() {
  if (getApps().length) return;

  // Prioritet:
  // 1) Env vars (best på Vercel)
  // 2) Fil via FIREBASE_ADMIN_SA_PATH (ok lokalt)
  // 3) applicationDefault (hvis du kjører på GCP)
  const fromEnv = loadServiceAccountFromEnv();
  const fromFile = fromEnv ? null : loadServiceAccountFromFile();

  if (fromEnv) {
    initializeApp({ credential: cert(fromEnv as any) });
    return;
  }

  if (fromFile) {
    initializeApp({ credential: cert(fromFile as any) });
    return;
  }

  // Fallback (valgfritt, men nyttig hvis du kjører i GCP-miljø)
  initializeApp({ credential: applicationDefault() });
}

initAdmin();

export const adminAuth = getAuth();
export const adminDb = getFirestore();

// Kompatibilitet med eksisterende kode
export function getAdmin() {
  return { auth: adminAuth, db: adminDb };
}
