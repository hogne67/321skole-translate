import "server-only";

import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";
import { acceptSchoolInvite } from "@/lib/schools/server";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);

  return match ? match[1] : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
    const authToken = getBearerToken(req);
    if (!authToken) {
      return json({ ok: false, error: "Missing Authorization Bearer token" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const inviteToken = readString(body.token);

    if (!inviteToken) {
      return json({ ok: false, error: "Missing invite token" }, 400);
    }

    const { auth } = getAdmin();
    const decoded = await auth.verifyIdToken(authToken);
    const uid = decoded.uid;

    if (!uid) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const userRecord =
      decoded.email && decoded.name
        ? null
        : await auth.getUser(uid).catch(() => null);
    const email = decoded.email ?? userRecord?.email ?? "";
    const displayName = decoded.name ?? userRecord?.displayName ?? null;

    if (!email) {
      return json({ ok: false, error: "Authenticated user is missing email" }, 400);
    }

    const result = await acceptSchoolInvite({
      token: inviteToken,
      uid,
      email,
      displayName,
    });

    return json(result, result.ok ? 200 : 400);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return json({ ok: false, error: message || "Failed to accept school invite" }, 500);
  }
}
