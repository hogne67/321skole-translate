// lib/firebaseAdmin.ts
import "server-only";

import { getApps, initializeApp, cert } from "firebase-admin/app";
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

  const fromEnv = loadServiceAccountFromEnv();
  const fromFile = fromEnv ? null : loadServiceAccountFromFile();

  const sa = fromEnv || fromFile;

  if (!sa?.project_id || !sa?.client_email || !sa?.private_key) {
    // 🚫 Ikke fall tilbake til applicationDefault på Vercel.
    // Det gir ofte "Invalid token" fordi prosjekt/credentials blir feil.
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY (recommended on Vercel) " +
        "or FIREBASE_ADMIN_SA_PATH for local file-based credentials."
    );
  }

  initializeApp({
    credential: cert(sa as any),
    projectId: sa.project_id, // ✅ viktig: binder admin til riktig prosjekt
  });
}

initAdmin();

export const adminAuth = getAuth();
export const adminDb = getFirestore();

export function getAdmin() {
  return { auth: adminAuth, db: adminDb };
}
