// app/api/producer/create-lesson/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { limitForFeature } from "@/lib/limits";

const FEATURE = "producer_create_lesson";

type Body = {
  title: string;
  level: string;
  language: string;
  prompt: string;
  topic?: string;
  textType: string;
  sourceText: string;
  tasks: unknown[];
};

type UsageDoc = {
  features?: Record<string, { used?: number }>;
  updatedAt?: unknown;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function safeNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** YYYY-MM in Europe/Oslo */
function currentPeriodOslo(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value || "1970";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  return `${year}-${month}`;
}

function readUsed(doc: UsageDoc | null | undefined, feature: string): number {
  const used = doc?.features?.[feature]?.used;
  return safeNumber(used);
}

// Admin-check (same pattern as elsewhere)
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function isAdminUser(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return false;
  const d = snap.data() as Record<string, unknown>;

  if (typeof d.role === "string" && d.role === "admin") return true;

  const roles = d.roles;
  if (isRecord(roles) && roles.admin === true) return true;

  return false;
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Not signed in." }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const [admin] = await Promise.all([isAdminUser(db, uid)]);

    const body = (await req.json()) as Partial<Body>;

    const title = String(body.title || "").trim();
    const sourceText = String(body.sourceText || "").trim();

    if (!title) return json({ error: "Title is required." }, 400);
    if (!sourceText) return json({ error: "Source text is empty." }, 400);

    const period = currentPeriodOslo();

    // Data model: usage/{uid}/months/{YYYY-MM}
    const usageRef = db.collection("usage").doc(uid).collection("months").doc(period);

    // New lesson id (draft)
    const lessonRef = db.collection("lessons").doc();

    const limit = limitForFeature(FEATURE, { uid, isAdmin: admin });

    const result = await db.runTransaction(async (tx) => {
      const usageSnap = await tx.get(usageRef);
      const usage = (usageSnap.exists ? (usageSnap.data() as UsageDoc) : null) ?? null;

      const usedBefore = readUsed(usage, FEATURE);
      if (usedBefore + 1 > limit) {
        return {
          ok: false as const,
          quota: {
            feature: FEATURE,
            limit,
            used: usedBefore,
            remaining: Math.max(0, limit - usedBefore),
            period,
          },
        };
      }

      const usedAfter = usedBefore + 1;

      // consume quota
      tx.set(
        usageRef,
        {
          ...(usage ?? {}),
          features: {
            ...(usage?.features ?? {}),
            [FEATURE]: { used: usedAfter },
          },
          updatedAt: FieldValue.serverTimestamp(),
        } satisfies UsageDoc,
        { merge: true }
      );

      const cleanTextType = String(body.textType || "")
        .trim()
        .replace(/^"+|"+$/g, "")
        .trim();

      // create lesson draft
      tx.set(lessonRef, {
        ownerId: uid,
        status: "draft",
        title,
        level: String(body.level || "A2"),
        language: String(body.language || "nb"),

        topic: String(body.topic || body.prompt || ""),
        prompt: String(body.prompt || ""),

        textType: cleanTextType,
        texttype: cleanTextType, // legacy-compat

        estimatedMinutes: 20,
        releaseMode: "ALL_AT_ONCE",

        sourceText,
        tasks: Array.isArray(body.tasks) ? body.tasks : [],

        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        source: "producer-texts-new",

        deletedAt: null,
        activePublishedId: null,
      });

      return {
        ok: true as const,
        id: lessonRef.id,
        quota: {
          feature: FEATURE,
          limit,
          used: usedAfter,
          remaining: Math.max(0, limit - usedAfter),
          period,
        },
      };
    });

    if (!result.ok) {
      return json({ error: "Limit reached", quota: result.quota }, 429);
    }

    return json({ id: result.id, quota: result.quota }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Unknown error" }, 500);
  }
}