import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization bearer token" }, 401);

    const body = (await req.json().catch(() => ({}))) as unknown;
    if (!isRecord(body)) return json({ error: "Invalid body" }, 400);

    const uid = typeof body.uid === "string" ? body.uid.trim() : "";
    if (!uid) return json({ error: "Missing uid" }, 400);

    const { auth, db } = getAdmin();

    const decoded = await auth.verifyIdToken(token);
    const adminSnap = await db.collection("users").doc(decoded.uid).get();
    const adminProfile = adminSnap.exists ? adminSnap.data() || {} : {};
    const adminRoles = isRecord(adminProfile.roles) ? adminProfile.roles : {};

    const isAdmin = adminProfile.role === "admin" || adminRoles.admin === true;
    const isSuperAdmin = isAdmin && adminProfile.adminLevel === "superadmin";

    if (!isSuperAdmin) {
      return json({ error: "Only superadmin can verify user emails" }, 403);
    }

    const verifiedAt = new Date();
    await auth.updateUser(uid, { emailVerified: true });

    const userRecord = await auth.getUser(uid);
    await db.collection("users").doc(uid).set(
      {
        uid,
        email: userRecord.email ?? null,
        displayName: userRecord.displayName ?? null,
        emailVerified: true,
        emailVerifiedAt: verifiedAt,
        updatedAt: verifiedAt,
      },
      { merge: true }
    );

    await db.collection("adminAuditEvents").add({
      event: "verify_user_email",
      actorUid: decoded.uid,
      targetUid: uid,
      createdAt: verifiedAt,
    });

    return json({ ok: true, emailVerified: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message || "Unknown error" }, 500);
  }
}
