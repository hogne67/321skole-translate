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
import { storyWritingTemplate } from "@/lib/writingStation";
import type { WritingLevel, WritingProgression } from "@/lib/writingStation";

type CreateWritingActivityBody = {
  title?: string;
  level?: string;
  language?: string;
  theme?: string;
  progression?: WritingProgression;
  aiEnabled?: boolean;
};

type UsageDoc = {
  features?: Record<string, { used?: number }>;
  updatedAt?: unknown;
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
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

function normalizeLevel(level: unknown): WritingLevel {
  const value = safeString(level).trim().toUpperCase();
  if (value === "A1") return "A1";
  if (value === "A2") return "A2";
  if (value === "B1") return "B1";
  if (value === "B2") return "B2";
  if (value === "C1") return "C1";
  return "A2";
}

function normalizeProgression(value: unknown): WritingProgression {
  if (value === "free") return "free";
  if (value === "locked") return "locked";
  return "guided";
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

export async function POST(
  req: Request,
  ctx: { params: Promise<{ spaceId: string }> }
) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { spaceId } = await ctx.params;
    if (!spaceId) return json({ error: "Missing spaceId" }, 400);

    const body = (await req.json().catch(() => ({}))) as CreateWritingActivityBody;

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

    const feature = "writing_station_create_activity" as const;
    const bucket = getQuotaBucket(feature);
    const period = currentPeriodOslo();
    const limit = getFeatureLimit(profile.role, profile.plan, feature);

    const title = safeString(body.title).trim() || storyWritingTemplate.title;
    const level = normalizeLevel(body.level);
    const language = safeString(body.language).trim() || "nb";
    const theme = safeString(body.theme).trim();
    const progression = normalizeProgression(body.progression);
    const aiEnabled = body.aiEnabled !== false;

    const usageRef = db.collection("usage").doc(uid).collection("months").doc(period);
    const activityRef = db
      .collection("spaces")
      .doc(spaceId)
      .collection("writingActivities")
      .doc();
    const spaceRef = db.collection("spaces").doc(spaceId);

    const now = new Date();

    const result = await db.runTransaction(async (tx) => {
      const usageSnap = await tx.get(usageRef);
      const usage = (usageSnap.exists ? (usageSnap.data() as UsageDoc) : null) ?? null;
      const usedBefore = readUsed(usage, bucket);

      if (usedBefore + 1 > limit) {
        return {
          ok: false as const,
          quota: {
            feature,
            bucket,
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
            [bucket]: { used: usedAfter },
          },
          updatedAt: now,
        } satisfies UsageDoc,
        { merge: true }
      );

      const payload = {
        activityType: "writing_station",
        status: "assigned",
        ownerUid: uid,
        assignedByUid: uid,
        spaceId,
        title,
        genre: storyWritingTemplate.genre,
        language,
        level,
        theme: theme || null,
        templateVersion: storyWritingTemplate.templateVersion,
        templateTitle: storyWritingTemplate.title,
        rooms: storyWritingTemplate.rooms,
        progression,
        aiPolicy: {
          enabled: aiEnabled,
          maxUsesTotal: 20,
          licenseRequired: true,
        },
        assignedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      tx.set(activityRef, payload, { merge: false });

      tx.set(
        spaceRef,
        {
          activeWritingActivityId: activityRef.id,
          activeWritingActivityTitle: title,
          activeUpdatedAt: now,
        },
        { merge: true }
      );

      return {
        ok: true as const,
        activityId: activityRef.id,
        quota: {
          feature,
          bucket,
          limit,
          used: usedAfter,
          remaining: Math.max(0, limit - usedAfter),
          period,
        },
      };
    });

    if (!result.ok) return json({ error: "Limit reached", quota: result.quota }, 429);

    return json({ activityId: result.activityId, quota: result.quota }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Create writing activity failed" }, 500);
  }
}
