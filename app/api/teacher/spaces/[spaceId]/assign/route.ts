// app/api/teacher/spaces/[spaceId]/assign/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { limitForFeature } from "@/lib/limits";

type SourceType = "myContent" | "library";

type AssignBody = {
  sourceType: SourceType;
  sourceId: string;
  title?: string;
  level?: string;
  language?: string;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
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

type UsageDoc = {
  features?: Record<string, { used?: number }>;
  updatedAt?: unknown;
};

function readUsed(doc: UsageDoc | null | undefined, feature: string): number {
  const used = doc?.features?.[feature]?.used;
  return typeof used === "number" && Number.isFinite(used) ? used : 0;
}

/**
 * Admin-check (legacy): users/{uid}.roles.admin === true
 * (du har også role string i rules; vi støtter begge)
 */
async function isAdminUser(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return false;
  const d = (snap.data() ?? {}) as Record<string, unknown>;

  // new role string
  if (typeof d.role === "string" && d.role === "admin") return true;

  // legacy roles map
  const roles = d.roles;
  if (isRecord(roles) && roles.admin === true) return true;

  return false;
}

async function isSpaceOwner(db: FirebaseFirestore.Firestore, spaceId: string, uid: string): Promise<boolean> {
  const snap = await db.collection("spaces").doc(spaceId).get();
  if (!snap.exists) return false;
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return typeof d.ownerId === "string" && d.ownerId === uid;
}

export async function POST(req: Request, ctx: { params: Promise<{ spaceId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { spaceId } = await ctx.params;
    if (!spaceId) return json({ error: "Missing spaceId" }, 400);

    const body = (await req.json().catch(() => ({}))) as AssignBody;

    const sourceType: SourceType = body.sourceType === "library" ? "library" : "myContent";
    const sourceId = safeString(body.sourceId).trim();
    const title = safeString(body.title).trim();
    const level = safeString(body.level).trim();
    const language = safeString(body.language).trim();

    if (!sourceId) return json({ error: "Missing body.sourceId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const [admin, owner] = await Promise.all([isAdminUser(db, uid), isSpaceOwner(db, spaceId, uid)]);
    if (!admin && !owner) return json({ error: "No access (owner/admin required)" }, 403);

    // ✅ Quota via central limits
    const feature = "teacher_assign_task";
    const period = currentPeriodOslo();
    const limit = limitForFeature(feature, { uid, isAdmin: admin });

    const usageRef = db.collection("usage").doc(uid).collection("months").doc(period);

    const assignmentRef = db.collection("spaces").doc(spaceId).collection("lessons").doc();
    const spaceRef = db.collection("spaces").doc(spaceId);

    const now = new Date();

    const result = await db.runTransaction(async (tx) => {
      const usageSnap = await tx.get(usageRef);
      const usage = (usageSnap.exists ? (usageSnap.data() as UsageDoc) : null) ?? null;
      const usedBefore = readUsed(usage, feature);

      if (usedBefore + 1 > limit) {
        return {
          ok: false as const,
          quota: {
            feature,
            limit,
            used: usedBefore,
            remaining: Math.max(0, limit - usedBefore),
            period,
          },
        };
      }

      const usedAfter = usedBefore + 1;

      tx.set(
        usageRef,
        {
          ...(usage ?? {}),
          features: {
            ...(usage?.features ?? {}),
            [feature]: { used: usedAfter },
          },
          updatedAt: now,
        } satisfies UsageDoc,
        { merge: true }
      );

      // ✅ Bygg payload uten undefined-felter
      const payload: Record<string, unknown> = {
        status: "active",
        sourceType,
        sourceId,
        title: title || "Untitled task",
        assignedAt: now,
        createdAt: now,
        assignedByUid: uid,
        updatedAt: now,
      };

      if (level) payload.level = level;
      if (language) payload.language = language;

      tx.set(assignmentRef, payload, { merge: false });

      tx.set(
        spaceRef,
        {
          activeLessonId: assignmentRef.id,
          activeLessonTitle: payload.title ?? null,
          activeUpdatedAt: now,
        },
        { merge: true }
      );

      return {
        ok: true as const,
        assignmentId: assignmentRef.id,
        quota: {
          feature,
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

    return json({ assignmentId: result.assignmentId, quota: result.quota }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Assign failed" }, 500);
  }
}