// app/api/teacher/spaces/[spaceId]/assign/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getEffectivePlan,
  getFeatureLimit,
  getQuotaBucket,
  type AppRole,
  type PlanKey,
} from "@/lib/featureAccess";

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
  imageTasks?: unknown;
  status?: string;
  isActive?: boolean;
  ownerId?: string;
  lessonType?: string;
  taskType?: string;
  readingTestConfig?: unknown;
  textSize?: string;

  mathWorksheet?: unknown;
  fractionWorksheet?: unknown;
  mathType?: string;
  contentType?: string;
};

type UserProfileAccess = {
  role: AppRole;
  plan: PlanKey;
  isAdmin: boolean;
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

function readUsed(doc: UsageDoc | null | undefined, key: string): number {
  const used = doc?.features?.[key]?.used;
  return typeof used === "number" && Number.isFinite(used) ? used : 0;
}

function nonEmptyOrUndefined(v: unknown): string | undefined {
  const s = safeString(v).trim();
  return s ? s : undefined;
}

function pickSourceLessonData(
  raw: FirebaseFirestore.DocumentData | undefined
): SourceLessonData {
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
    imageTasks: d.imageTasks ?? null,
    status: nonEmptyOrUndefined(d.status),
    isActive: typeof d.isActive === "boolean" ? d.isActive : undefined,
    ownerId: nonEmptyOrUndefined(d.ownerId),
    lessonType: nonEmptyOrUndefined(d.lessonType),
    taskType: nonEmptyOrUndefined(d.taskType),
    readingTestConfig: d.readingTestConfig ?? null,
    textSize: nonEmptyOrUndefined(d.textSize),

    mathWorksheet: d.mathWorksheet ?? null,
    fractionWorksheet: d.fractionWorksheet ?? null,
    mathType: nonEmptyOrUndefined(d.mathType),
    contentType: nonEmptyOrUndefined(d.contentType),
  };
}

function isFractionSource(source: SourceLessonData): boolean {
  return (
    source.mathType === "fractions" ||
    source.contentType === "fraction_worksheet" ||
    isRecord(source.fractionWorksheet)
  );
}

function normalizeRole(role?: string, isAdminFlag?: boolean): AppRole {
  if (isAdminFlag) return "admin";
  if (role === "teacher") return "teacher";
  if (role === "student") return "student";
  if (role === "parent") return "parent";
  if (role === "creator") return "creator";
  if (role === "admin") return "admin";
  return "anonymous";
}

function normalizePlan(plan?: string): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

async function loadUserProfileAccess(
  db: FirebaseFirestore.Firestore,
  uid: string
): Promise<UserProfileAccess> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    return { role: "anonymous", plan: "free", isAdmin: false };
  }

  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const roleValue = typeof d.role === "string" ? d.role : undefined;
  const planValue = typeof d.plan === "string" ? d.plan : undefined;

  const roles = d.roles;
  const isAdminFromRoles = isRecord(roles) && roles.admin === true;
  const isAdminFromRole = roleValue === "admin";
  const isAdmin = isAdminFromRoles || isAdminFromRole;

  return {
    role: normalizeRole(roleValue, isAdmin),
    plan: getEffectivePlan({
      plan: normalizePlan(planValue),
      billing:
        d.billing && typeof d.billing === "object"
          ? (d.billing as { plan?: string | null; status?: string | null })
          : null,
      schoolId: typeof d.schoolId === "string" ? d.schoolId : null,
      schoolRole: typeof d.schoolRole === "string" ? d.schoolRole : null,
      schoolStatus: typeof d.schoolStatus === "string" ? d.schoolStatus : null,
    }),
    isAdmin,
  };
}

async function isSpaceOwner(
  db: FirebaseFirestore.Firestore,
  spaceId: string,
  uid: string
): Promise<boolean> {
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
    if (!snap.exists) throw new Error("Source lesson not found in published_lessons");

    const source = pickSourceLessonData(snap.data());

    const inactive = source.isActive === false;
    const archived =
      typeof source.status === "string" &&
      source.status.toLowerCase() === "archived";

    if (inactive || archived) throw new Error("Source lesson is not active");

    return source;
  }

  const snap = await db.collection("lessons").doc(sourceId).get();
  if (!snap.exists) throw new Error("Source lesson not found in lessons");

  const source = pickSourceLessonData(snap.data());

  if (!isAdmin && source.ownerId && source.ownerId !== uid) {
    throw new Error("No access to source lesson");
  }

  return source;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ spaceId: string }> }
) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { spaceId } = await ctx.params;
    if (!spaceId) return json({ error: "Missing spaceId" }, 400);

    const body = (await req.json().catch(() => ({}))) as AssignBody;

    const sourceType: SourceType =
      body.sourceType === "library" ? "library" : "myContent";

    const sourceId = safeString(body.sourceId).trim();
    const titleOverride = safeString(body.title).trim();
    const levelOverride = safeString(body.level).trim();
    const languageOverride = safeString(body.language).trim();

    if (!sourceId) return json({ error: "Missing body.sourceId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const [profile, owner] = await Promise.all([
      loadUserProfileAccess(db, uid),
      isSpaceOwner(db, spaceId, uid),
    ]);

    if (!profile.isAdmin && !owner) {
      return json({ error: "No access (owner/admin required)" }, 403);
    }

    const source = await loadSourceLesson({
      db,
      sourceType,
      sourceId,
      uid,
      isAdmin: profile.isAdmin,
    });

    const isFractions = isFractionSource(source);
    const fractionWorksheet = source.fractionWorksheet ?? source.mathWorksheet ?? null;

    const feature = "teacher_assign_task" as const;
    const bucket = getQuotaBucket(feature);
    const period = currentPeriodOslo();
    const shouldCountQuota = sourceType !== "myContent";

    const limit = shouldCountQuota
      ? getFeatureLimit(profile.role, profile.plan, feature)
      : null;

    const usageRef = db.collection("usage").doc(uid).collection("months").doc(period);
    const assignmentRef = db.collection("spaces").doc(spaceId).collection("lessons").doc();
    const spaceRef = db.collection("spaces").doc(spaceId);

    const now = new Date();

    const result = await db.runTransaction(async (tx) => {
      let quota:
        | {
          feature: string;
          bucket: string;
          limit: number;
          used: number;
          remaining: number;
          period: string;
        }
        | null = null;

      if (shouldCountQuota) {
        const usageSnap = await tx.get(usageRef);
        const usage =
          (usageSnap.exists ? (usageSnap.data() as UsageDoc) : null) ?? null;

        const usedBefore = readUsed(usage, bucket);
        const safeLimit = limit ?? 0;

        if (usedBefore + 1 > safeLimit) {
          return {
            ok: false as const,
            quota: {
              feature,
              bucket,
              limit: safeLimit,
              used: usedBefore,
              remaining: Math.max(0, safeLimit - usedBefore),
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
              [bucket]: { used: usedAfter },
            },
            updatedAt: now,
          } satisfies UsageDoc,
          { merge: true }
        );

        quota = {
          feature,
          bucket,
          limit: safeLimit,
          used: usedAfter,
          remaining: Math.max(0, safeLimit - usedAfter),
          period,
        };
      }

      const finalTitle = titleOverride || source.title || "Untitled task";
      const finalLevel = levelOverride || source.level || null;
      const finalLanguage = languageOverride || source.language || null;

      const payload: Record<string, unknown> = {
        status: "active",
        sourceType,
        sourceId,

        title: finalTitle,
        level: finalLevel,
        language: finalLanguage,
        topic: source.topic ?? null,
        description: source.description ?? null,
        sourceText: source.sourceText ?? null,
        text: source.text ?? null,
        tasks: source.tasks ?? [],
        coverImageUrl: source.coverImageUrl ?? null,
        imageTasks: source.imageTasks ?? null,

        lessonType: isFractions
          ? "math_fractions"
          : source.lessonType ?? null,
        taskType: isFractions
          ? "math_fractions"
          : source.taskType ?? null,
        readingTestConfig: source.readingTestConfig ?? null,
        textSize: source.textSize ?? null,

        mathWorksheet: isFractions ? fractionWorksheet : source.mathWorksheet ?? null,
        fractionWorksheet: isFractions ? fractionWorksheet : source.fractionWorksheet ?? null,
        mathType: isFractions ? "fractions" : source.mathType ?? null,
        contentType: isFractions
          ? "fraction_worksheet"
          : source.contentType ?? null,

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
        quota,
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
