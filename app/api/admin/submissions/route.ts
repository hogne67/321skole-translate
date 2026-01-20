import { NextRequest } from "next/server";
import admin from "firebase-admin";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

function getAdminToken(req: NextRequest) {
  return (
    req.headers.get("x-admin-token") ||
    req.nextUrl.searchParams.get("token") ||
    ""
  );
}

// Init firebase-admin én gang
function initAdmin() {
  if (admin.apps.length) return;

  // ✅ Lokal dev: gjenbruk scripts/serviceAccountKey.json (samme som du bruker i scripts)
  // ✅ Prod (Vercel): legg inn FIREBASE_SERVICE_ACCOUNT_JSON i env senere
  const jsonFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (jsonFromEnv) {
    const serviceAccount = JSON.parse(jsonFromEnv);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return;
  }

  const filePath = path.join(process.cwd(), "scripts", "serviceAccountKey.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(
      "Missing service account. Add scripts/serviceAccountKey.json (local) or set FIREBASE_SERVICE_ACCOUNT_JSON (prod)."
    );
  }

  const serviceAccount = JSON.parse(fs.readFileSync(filePath, "utf8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export async function GET(req: NextRequest) {
  try {
    const token = getAdminToken(req);
    if (!process.env.ADMIN_TOKEN) {
      return Response.json({ error: "Missing ADMIN_TOKEN in .env.local" }, { status: 500 });
    }
    if (token !== process.env.ADMIN_TOKEN) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    initAdmin();

  const lessonId = req.nextUrl.searchParams.get("lessonId") || "";
const taskType = req.nextUrl.searchParams.get("taskType") || "";
const onlyIncorrect = (req.nextUrl.searchParams.get("onlyIncorrect") || "") === "1";
const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "50"), 200);

const db = admin.firestore();

let q: FirebaseFirestore.Query = db
  .collection("submissions")
  .orderBy("createdAt", "desc")
  .limit(limit);

if (lessonId) q = q.where("lessonId", "==", lessonId);
if (taskType) q = q.where("taskType", "==", taskType);
if (onlyIncorrect) q = q.where("isCorrect", "==", false);

const snap = await q.get();


    const rows = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    return Response.json({ rows });
  } catch (e: any) {
    console.error("Admin submissions GET error:", e);
    return Response.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
