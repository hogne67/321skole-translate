// lib/firebaseAdmin.ts
import "server-only";

import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
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
  // ✅ Option A: single JSON env (most reliable on Vercel)
  const json = process.env.FIREBASE_ADMIN_SA_JSON;
  if (json) {
    try {
      const parsed: any = JSON.parse(json);
      return {
        project_id: parsed.project_id,
        client_email: parsed.client_email,
        private_key: String(parsed.private_key || "").replace(/\\n/g, "\n"),
      };
    } catch (e) {
      // continue to split vars
    }
  }

  // Option B: split env vars
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

function ensureAdminApp(): App {
  if (getApps().length) return getApps()[0]!;

  const fromEnv = loadServiceAccountFromEnv();
  const fromFile = fromEnv ? null : loadServiceAccountFromFile();
  const sa = fromEnv || fromFile;

  if (!sa?.project_id || !sa?.client_email || !sa?.private_key) {
    // This is the exact error you see:
    throw new Error(
      "Missing Firebase Admin credentials at runtime. " +
        "Set FIREBASE_ADMIN_SA_JSON (recommended), or FIREBASE_ADMIN_PROJECT_ID/FIREBASE_ADMIN_CLIENT_EMAIL/FIREBASE_ADMIN_PRIVATE_KEY."
    );
  }

  return initializeApp({
    credential: cert(sa as any),
    projectId: sa.project_id,
  });
}

export function getAdmin(): { auth: Auth; db: Firestore } {
  ensureAdminApp();
  return { auth: getAuth(), db: getFirestore() };
}
