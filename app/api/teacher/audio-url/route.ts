import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type Body = {
  storagePath?: unknown;
  mode?: unknown;
};

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBucketName(): string {
  const bucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "";

  if (!bucket.trim()) {
    throw new Error(
      "Missing storage bucket env. Set FIREBASE_STORAGE_BUCKET or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET."
    );
  }

  return bucket.trim();
}

function parseStudentAudioPath(storagePath: string): { spaceId: string } | null {
  const parts = storagePath.split("/").filter(Boolean);
  if (
    parts.length < 7 ||
    parts[0] !== "spaces" ||
    parts[2] !== "assignments" ||
    parts[4] !== "submissions" ||
    parts[6] !== "audio"
  ) {
    return null;
  }

  return { spaceId: parts[1] };
}

function filenameFromStoragePath(storagePath: string): string {
  const fallback = "321skole-elevopptak.webm";
  const raw = storagePath.split("/").filter(Boolean).at(-1) || fallback;
  const clean = raw.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+/, "");
  return clean || fallback;
}

function hasRole(profile: Record<string, unknown> | null, role: string): boolean {
  if (!profile) return false;
  if (profile.role === role) return true;
  const roles = profile.roles;
  return isRecord(roles) && roles[role] === true;
}

function isAdmin(profile: Record<string, unknown> | null): boolean {
  return hasRole(profile, "admin");
}

function isActiveMember(member: Record<string, unknown> | null): boolean {
  if (!member) return false;
  const status = safeString(member.status).toLowerCase();
  return (
    member.archived !== true &&
    member.active !== false &&
    status !== "removed" &&
    status !== "disabled" &&
    status !== "inactive"
  );
}

function isTeachingMember(member: Record<string, unknown> | null): boolean {
  if (!isActiveMember(member)) return false;
  const activeMember = member as Record<string, unknown>;
  const role = safeString(activeMember.role).toLowerCase();
  const staffRole = safeString(activeMember.staffRole).toLowerCase();
  return (
    role === "teacher" ||
    role === "co_teacher" ||
    staffRole === "co_teacher" ||
    staffRole === "substitute"
  );
}

async function canReadSpaceAudio(params: {
  db: Firestore;
  uid: string;
  spaceId: string;
  profile: Record<string, unknown> | null;
}): Promise<boolean> {
  const { db, uid, spaceId, profile } = params;
  if (isAdmin(profile)) return true;

  const spaceSnap = await db.collection("spaces").doc(spaceId).get();
  if (!spaceSnap.exists) return false;

  const space = (spaceSnap.data() ?? {}) as Record<string, unknown>;
  if (safeString(space.ownerId) === uid || safeString(space.ownerUid) === uid) {
    return true;
  }

  const memberSnap = await db.collection("spaceMembers").doc(`${spaceId}_${uid}`).get();
  const member = memberSnap.exists ? ((memberSnap.data() ?? {}) as Record<string, unknown>) : null;
  return isTeachingMember(member);
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const storagePath = safeString(body.storagePath);
    const mode = safeString(body.mode).toLowerCase();
    const parsed = parseStudentAudioPath(storagePath);

    if (!storagePath || !parsed) {
      return NextResponse.json({ error: "Invalid audio path" }, { status: 400 });
    }

    const { auth, db, storage } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const profileSnap = await db.collection("users").doc(uid).get();
    const profile = profileSnap.exists ? ((profileSnap.data() ?? {}) as Record<string, unknown>) : null;

    const allowed = await canReadSpaceAudio({
      db,
      uid,
      spaceId: parsed.spaceId,
      profile,
    });

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const bucket = storage.bucket(getBucketName());
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ error: "Audio file not found" }, { status: 404 });
    }

    const expiresAt = Date.now() + 15 * 60 * 1000;
    const filename = filenameFromStoragePath(storagePath);
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: expiresAt,
      version: "v4",
      responseDisposition:
        mode === "download" ? `attachment; filename="${filename}"` : undefined,
    });

    return NextResponse.json({ url, expiresAt, filename });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not create audio URL.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
