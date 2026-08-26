import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { buildWritingTemplate, factualWritingTemplate, storyWritingTemplate } from "@/lib/writingStation";
import type { WritingLevel, WritingProgression } from "@/lib/writingStation";

type UpdateWritingActivityBody = {
  title?: string;
  level?: string;
  language?: string;
  theme?: string;
  genre?: string;
  targetWordCount?: number;
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

function normalizeLevel(level: unknown): WritingLevel {
  const value = safeString(level).trim().toUpperCase();
  if (value === "A1") return "A1";
  if (value === "A2") return "A2";
  if (value === "B1") return "B1";
  if (value === "B2") return "B2";
  if (value === "C1") return "C1";
  if (value === "C2") return "C2";
  return "A2";
}

function normalizeProgression(value: unknown): WritingProgression {
  if (value === "free") return "free";
  if (value === "locked") return "locked";
  return "guided";
}

function normalizeWritingGenre(value: unknown): "story" | "factual" {
  return safeString(value).trim() === "factual" ? "factual" : "story";
}

function isAdminProfile(data: Record<string, unknown>): boolean {
  if (data.role === "admin") return true;
  const roles = data.roles;
  return isRecord(roles) && roles.admin === true;
}

async function requireWritableActivity(req: Request, activityId: string) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;

  const [profileSnap, activitySnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("writingActivities").doc(activityId).get(),
  ]);

  if (!activitySnap.exists) return { error: json({ error: "Writing activity not found" }, 404) };

  const profile = (profileSnap.data() ?? {}) as Record<string, unknown>;
  const activity = activitySnap.data() ?? {};
  const isAdmin = isAdminProfile(profile);
  const ownsActivity = activity.ownerUid === uid;

  if (!isAdmin && !ownsActivity) {
    return { error: json({ error: "No access (owner/admin required)" }, 403) };
  }

  return { db, activity };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ activityId: string }> }
) {
  try {
    const { activityId } = await ctx.params;
    if (!activityId) return json({ error: "Missing activityId" }, 400);

    const access = await requireWritableActivity(req, activityId);
    if ("error" in access) return access.error;

    return json({ activity: { id: activityId, ...access.activity } }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Read writing activity failed" }, 500);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ activityId: string }> }
) {
  try {
    const { activityId } = await ctx.params;
    if (!activityId) return json({ error: "Missing activityId" }, 400);

    const access = await requireWritableActivity(req, activityId);
    if ("error" in access) return access.error;

    const body = (await req.json().catch(() => ({}))) as UpdateWritingActivityBody;
    const genre = normalizeWritingGenre(body.genre);
    const baseTemplate = genre === "factual" ? factualWritingTemplate : storyWritingTemplate;
    const title = safeString(body.title).trim() || baseTemplate.title;
    const level = normalizeLevel(body.level);
    const language = safeString(body.language).trim() || "nb";
    const theme = safeString(body.theme).trim();
    const targetWordCount = clampNumber(body.targetWordCount, 140, 20, 2000);
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
    const template = buildWritingTemplate(genre, {
      supportWordsBySection,
      criteria,
      maxUsesPerSection: aiMaxUsesPerSection,
      aiEnabled,
    });

    const now = new Date();
    await access.db.collection("writingActivities").doc(activityId).set(
      {
        activityType: "writing_station",
        sourceType: "teacher_library",
        status: "draft",
        title,
        genre: template.genre,
        language,
        level,
        theme: theme || null,
        targetWordCount,
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
        deletedAt: null,
        updatedAt: now,
      },
      { merge: true }
    );

    return json({ activityId }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Update writing activity failed" }, 500);
  }
}
