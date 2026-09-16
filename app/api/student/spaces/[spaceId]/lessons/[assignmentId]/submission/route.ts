import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{
    spaceId: string;
    assignmentId: string;
  }>;
};

type SaveBody = {
  submissionId?: unknown;
  payload?: unknown;
  isFirstWrite?: unknown;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isActiveMember(data: FirebaseFirestore.DocumentData | undefined): boolean {
  if (!data) return false;
  if (data.archived === true) return false;
  if (data.active === false) return false;
  if (typeof data.status === "string" && data.status.toLowerCase() === "removed") return false;
  return true;
}

async function hasSpaceMembership(
  db: FirebaseFirestore.Firestore,
  spaceId: string,
  uid: string
): Promise<{ ok: boolean; participantId: string | null }> {
  const canonical = await db.collection("spaceMembers").doc(`${spaceId}_${uid}`).get();
  if (canonical.exists && isActiveMember(canonical.data())) {
    const data = canonical.data() ?? {};
    const participantId = safeString(data.participantId) || uid;
    return { ok: true, participantId };
  }

  const legacy = await db
    .collection("spaceMembers")
    .where("spaceId", "==", spaceId)
    .where("uid", "==", uid)
    .limit(5)
    .get();

  const active = legacy.docs.find((doc) => isActiveMember(doc.data()));
  if (!active) return { ok: false, participantId: null };

  const data = active.data() ?? {};
  return { ok: true, participantId: safeString(data.participantId) || uid };
}

function cleanPayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) return {};

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "createdAt" || key === "updatedAt") continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export async function POST(req: Request, ctx: RouteParams) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ ok: false, error: "Unauthorized" }, 401);

    const { spaceId, assignmentId } = await ctx.params;
    if (!spaceId || !assignmentId) return json({ ok: false, error: "Missing route params." }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    if (!uid) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as SaveBody;
    const membership = await hasSpaceMembership(db, spaceId, uid);
    if (!membership.ok) return json({ ok: false, error: "Not a member of this space." }, 403);

    const memberParticipantId = membership.participantId || uid;
    const submissionId = safeString(body.submissionId) || `${spaceId}_${assignmentId}_${memberParticipantId}`;
    const expectedOwnId = `${spaceId}_${assignmentId}_${uid}`;
    const expectedParticipantId = `${spaceId}_${assignmentId}_${memberParticipantId}`;

    const nestedRef = db
      .collection("spaces")
      .doc(spaceId)
      .collection("lessons")
      .doc(assignmentId)
      .collection("submissions")
      .doc(submissionId);

    const existingSnap = await nestedRef.get();
    if (existingSnap.exists) {
      const existing = existingSnap.data() ?? {};
      const existingParticipantId = safeString(existing.participantId);
      if (existing.uid !== uid && existingParticipantId !== memberParticipantId) {
        return json({ ok: false, error: "Forbidden" }, 403);
      }
    } else if (submissionId !== expectedOwnId && submissionId !== expectedParticipantId) {
      return json({ ok: false, error: "Invalid submission id." }, 400);
    }

    const payload = cleanPayload(body.payload);
    if (payload.uid !== uid) return json({ ok: false, error: "Invalid uid." }, 400);
    if (safeString(payload.participantId) !== memberParticipantId) {
      return json({ ok: false, error: "Invalid participant id." }, 400);
    }
    if (payload.spaceId !== spaceId) return json({ ok: false, error: "Invalid space id." }, 400);
    if (payload.assignmentId !== assignmentId) return json({ ok: false, error: "Invalid assignment id." }, 400);

    const writePayload = {
      ...payload,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existingSnap.exists || body.isFirstWrite === false
        ? {}
        : { createdAt: FieldValue.serverTimestamp() }),
    };

    await nestedRef.set(writePayload, { merge: true });
    await db.collection("spaceSubmissions").doc(submissionId).set(writePayload, { merge: true });

    return json({ ok: true, submissionId }, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not save submission.";
    return json({ ok: false, error: message }, 500);
  }
}
