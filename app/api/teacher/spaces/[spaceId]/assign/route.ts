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

type UsageDoc = {
  features?: Record<string, { used?: number }>;
  updatedAt?: unknown;
};

type SourceLessonData = {
  title?: string;
  level?: string;
  language?: string;
  topic?: string;
  description?: string;
  sourceText?: string;
  text?: string;
  tasks?: unknown;
  coverImageUrl?: string;
  status?: string;
  isActive?: boolean;
  ownerId?: string;
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

function readUsed(doc: UsageDoc | null | undefined, feature: string): number {
  const used = doc?.features?.[feature]?.used;
  return typeof used === "number" && Number.isFinite(used) ? used : 0;
}

function nonEmptyOrUndefined(v: unknown): string | undefined {
  const s = safeString(v).trim();
  return s ? s : undefined;
}

function pickSourceLessonData(raw: FirebaseFirestore.DocumentData | undefined): SourceLessonData {
  const d = (raw ?? {}) as Record<string, unknown>;

  return {
    title: nonEmptyOrUndefined(d.title),
    level: nonEmptyOrUndefined(d.level),
    language: nonEmptyOrUndefined(d.language),
    topic: nonEmptyOrUndefined(d.topic),
    description: nonEmptyOrUndefined(d.description),
    sourceText: nonEmptyOrUndefined(d.sourceText),
    text: nonEmptyOrUndefined(d.text),
    tasks: d.tasks,
    coverImageUrl: nonEmptyOrUndefined(d.coverImageUrl),
    status: nonEmptyOrUndefined(d.status),
    isActive: typeof d.isActive === "boolean" ? d.isActive : undefined,
    ownerId: nonEmptyOrUndefined(d.ownerId),
  };
}

async function isAdminUser(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return false;
  const d = (snap.data() ?? {}) as Record<string, unknown>;

  if (typeof d.role === "string" && d.role === "admin") return true;

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

async function loadSourceLesson(params: {
  db: FirebaseFirestore.Firestore;
  sourceType: SourceType;
  sourceId: string;
  uid: string;
  isAdmin: boolean;
}): Promise<SourceLessonData> {
  const { db, sourceType, sourceId, uid, isAdmin } = params;

  if (sourceType === "library") {
    const snap = await db.collection("published_lessons").doc(sourceId).get();
    if (!snap.exists) {
      throw new Error("Source lesson not found in published_lessons");
    }

    const source = pickSourceLessonData(snap.data());

    const inactive = source.isActive === false;
    const archived = typeof source.status === "string" && source.status.toLowerCase() === "archived";
    if (inactive || archived) {
      throw new Error("Source lesson is not active");
    }

    return source;
  }

  const snap = await db.collection("lessons").doc(sourceId).get();
  if (!snap.exists) {
    throw new Error("Source lesson not found in lessons");
  }

  const source = pickSourceLessonData(snap.data());

  // For myContent: admin may assign any; normal user may only assign own lesson
  if (!isAdmin && source.ownerId && source.ownerId !== uid) {
    throw new Error("No access to source lesson");
  }

  return source;
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
    const titleOverride = safeString(body.title).trim();
    const levelOverride = safeString(body.level).trim();
    const languageOverride = safeString(body.language).trim();

    if (!sourceId) return json({ error: "Missing body.sourceId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const [admin, owner] = await Promise.all([isAdminUser(db, uid), isSpaceOwner(db, spaceId, uid)]);
    if (!admin && !owner) return json({ error: "No access (owner/admin required)" }, 403);

    const source = await loadSourceLesson({
      db,
      sourceType,
      sourceId,
      uid,
      isAdmin: admin,
    });

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

      const finalTitle = titleOverride || source.title || "Untitled task";
      const finalLevel = levelOverride || source.level || null;
      const finalLanguage = languageOverride || source.language || null;

      const payload: Record<string, unknown> = {
        status: "active",
        sourceType,
        sourceId,

        // snapshot fields for stable student access
        title: finalTitle,
        level: finalLevel,
        language: finalLanguage,
        topic: source.topic ?? null,
        description: source.description ?? null,
        sourceText: source.sourceText ?? null,
        text: source.text ?? null,
        tasks: source.tasks ?? [],
        coverImageUrl: source.coverImageUrl ?? null,

        assignedAt: now,
        createdAt: now,
        assignedByUid: uid,
        updatedAt: now,
      };

      tx.set(assignmentRef, payload, { merge: false });

      tx.set(
        spaceRef,
        {
          activeLessonId: assignmentRef.id,
          activeLessonTitle: finalTitle,
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