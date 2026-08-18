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
import { buildStoryWritingTemplate, storyWritingTemplate } from "@/lib/writingStation";
import type { WritingLevel, WritingProgression } from "@/lib/writingStation";

type CreateWritingActivityBody = {
  title?: string;
  level?: string;
  language?: string;
  theme?: string;
  progression?: WritingProgression;
  aiEnabled?: boolean;
  assignmentText?: string;
  criteria?: string[];
  competenceGoals?: string[];
  supportWordsBySection?: Record<string, string[]>;
  aiMaxUsesTotal?: number;
  aiMaxUsesPerSection?: number;
  allowPrintImageUpload?: boolean;
  allowAiImage?: boolean;
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

function cleanList(v: unknown, maxItems = 16): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => safeString(item).trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanSupportWords(v: unknown): Record<string, string[]> {
  if (!isRecord(v)) return {};
  return Object.fromEntries(
    Object.entries(v)
      .map(([sectionId, words]) => [sectionId, cleanList(words, 16)] as const)
      .filter(([, words]) => words.length > 0)
  );
}

function clampNumber(v: unknown, fallback: number, min: number, max: number): number {
  const value = typeof v === "number" ? v : Number.parseInt(safeString(v), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
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

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const body = (await req.json().catch(() => ({}))) as CreateWritingActivityBody;

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const profile = await loadUserProfileAccess(db, uid);
    if (!profile.isAdmin && profile.role !== "teacher") {
      return json({ error: "No access (teacher/admin required)" }, 403);
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
    const assignmentText = safeString(body.assignmentText).trim();
    const criteria = cleanList(body.criteria, 16);
    const competenceGoals = cleanList(body.competenceGoals, 8);
    const supportWordsBySection = cleanSupportWords(body.supportWordsBySection);
    const aiMaxUsesTotal = clampNumber(body.aiMaxUsesTotal, 20, 0, 80);
    const aiMaxUsesPerSection = clampNumber(body.aiMaxUsesPerSection, 2, 0, 5);
    const allowPrintImageUpload = body.allowPrintImageUpload === true;
    const allowAiImage = body.allowAiImage === true;
    const template = buildStoryWritingTemplate({
      supportWordsBySection,
      criteria,
      maxUsesPerSection: aiMaxUsesPerSection,
      aiEnabled,
    });

    const usageRef = db.collection("usage").doc(uid).collection("months").doc(period);
    const activityRef = db.collection("writingActivities").doc();
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

      tx.set(activityRef, {
        activityType: "writing_station",
        sourceType: "teacher_library",
        status: "draft",
        ownerUid: uid,
        title,
        genre: template.genre,
        language,
        level,
        theme: theme || null,
        assignmentText: assignmentText || null,
        criteria,
        competenceGoals,
        allowPrintImageUpload,
        allowAiImage,
        templateVersion: template.templateVersion,
        templateTitle: template.title,
        rooms: template.rooms,
        progression,
        aiPolicy: {
          enabled: aiEnabled,
          maxUsesTotal: aiMaxUsesTotal,
          licenseRequired: true,
        },
        createdAt: now,
        updatedAt: now,
      });

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
