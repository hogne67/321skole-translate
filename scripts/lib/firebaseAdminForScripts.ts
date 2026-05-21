import { existsSync, readFileSync } from "fs";
import path from "path";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

type ServiceAccountJSON = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

type ScriptAdmin = {
  db: Firestore;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadDotEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = unquoteEnvValue(line.slice(separatorIndex + 1));

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv() {
  loadDotEnvFile(path.resolve(process.cwd(), ".env.local"));
  loadDotEnvFile(path.resolve(process.cwd(), ".env"));
}

function loadServiceAccountFromFile(): ServiceAccountJSON | null {
  const serviceAccountPath = process.env.FIREBASE_ADMIN_SA_PATH;
  if (!serviceAccountPath) return null;

  const fullPath = path.resolve(process.cwd(), serviceAccountPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Service account file not found: ${fullPath}`);
  }

  return JSON.parse(readFileSync(fullPath, "utf8")) as ServiceAccountJSON;
}

function loadServiceAccountFromEnv(): ServiceAccountJSON | null {
  const json = process.env.FIREBASE_ADMIN_SA_JSON;

  if (json) {
    const parsed: unknown = JSON.parse(json);

    if (isObject(parsed)) {
      return {
        project_id: typeof parsed.project_id === "string" ? parsed.project_id : undefined,
        client_email:
          typeof parsed.client_email === "string" ? parsed.client_email : undefined,
        private_key:
          typeof parsed.private_key === "string"
            ? parsed.private_key.replace(/\\n/g, "\n")
            : undefined,
      };
    }
  }

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

function ensureAdminAppForScripts(): App {
  loadLocalEnv();

  if (getApps().length) return getApps()[0]!;

  const fromEnv = loadServiceAccountFromEnv();
  const fromFile = fromEnv ? null : loadServiceAccountFromFile();
  const serviceAccount = fromEnv || fromFile;

  if (
    !serviceAccount?.project_id ||
    !serviceAccount?.client_email ||
    !serviceAccount?.private_key
  ) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_SA_JSON, " +
        "or FIREBASE_ADMIN_PROJECT_ID/FIREBASE_ADMIN_CLIENT_EMAIL/FIREBASE_ADMIN_PRIVATE_KEY."
    );
  }

  return initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    }),
    projectId: serviceAccount.project_id,
  });
}

export function getAdminForScripts(): ScriptAdmin {
  const app = ensureAdminAppForScripts();
  const db = getFirestore(app);

  db.settings({
    preferRest: true,
  });

  return {
    db,
  };
}
