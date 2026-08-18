import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

type AssignBody = {
  spaceId?: string;
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

function isAdminProfile(data: Record<string, unknown>): boolean {
  if (data.role === "admin") return true;
  const roles = data.roles;
  return isRecord(roles) && roles.admin === true;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ activityId: string }> }
) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { activityId } = await ctx.params;
    if (!activityId) return json({ error: "Missing activityId" }, 400);

    const body = (await req.json().catch(() => ({}))) as AssignBody;
    const spaceId = safeString(body.spaceId).trim();
    if (!spaceId) return json({ error: "Missing spaceId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const [profileSnap, sourceSnap, spaceSnap] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("writingActivities").doc(activityId).get(),
      db.collection("spaces").doc(spaceId).get(),
    ]);

    const profile = (profileSnap.data() ?? {}) as Record<string, unknown>;
    const isAdmin = isAdminProfile(profile);

    if (!sourceSnap.exists) return json({ error: "Writing activity not found" }, 404);
    if (!spaceSnap.exists) return json({ error: "Space not found" }, 404);

    const source = sourceSnap.data() ?? {};
    const space = spaceSnap.data() ?? {};
    const ownsSource = source.ownerUid === uid;
    const ownsSpace = space.ownerId === uid;

    if (!isAdmin && (!ownsSource || !ownsSpace)) {
      return json({ error: "No access (owner/admin required)" }, 403);
    }

    const now = new Date();
    const assignedRef = db
      .collection("spaces")
      .doc(spaceId)
      .collection("writingActivities")
      .doc();

    const payload = {
      activityType: "writing_station",
      status: "assigned",
      ownerUid: typeof source.ownerUid === "string" ? source.ownerUid : uid,
      assignedByUid: uid,
      spaceId,
      sourceActivityId: activityId,
      title: safeString(source.title) || "Fortelling",
      genre: source.genre || "story",
      language: source.language || "nb",
      level: source.level || "A2",
      theme: source.theme ?? null,
      assignmentText: source.assignmentText ?? null,
      criteria: Array.isArray(source.criteria) ? source.criteria : [],
      competenceGoals: Array.isArray(source.competenceGoals) ? source.competenceGoals : [],
      allowPrintImageUpload: source.allowPrintImageUpload === true,
      allowAiImage: source.allowAiImage === true,
      templateVersion: source.templateVersion || 1,
      templateTitle: source.templateTitle || "Fortelling",
      rooms: Array.isArray(source.rooms) ? source.rooms : [],
      progression: source.progression || "guided",
      aiPolicy: isRecord(source.aiPolicy)
        ? source.aiPolicy
        : {
            enabled: true,
            maxUsesTotal: 20,
            licenseRequired: true,
          },
      assignedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await db.runTransaction(async (tx) => {
      tx.set(assignedRef, payload);
      tx.set(
        db.collection("spaces").doc(spaceId),
        {
          activeWritingActivityId: assignedRef.id,
          activeWritingActivityTitle: payload.title,
          activeUpdatedAt: now,
        },
        { merge: true }
      );
      tx.set(
        db.collection("writingActivities").doc(activityId),
        {
          lastAssignedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    });

    return json({ activityId: assignedRef.id, spaceId }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Assign writing activity failed" }, 500);
  }
}
