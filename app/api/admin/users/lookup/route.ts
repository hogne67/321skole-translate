import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isAdminProfile(data: Record<string, unknown>): boolean {
  const roles = isRecord(data.roles) ? data.roles : {};
  return data.role === "admin" || roles.admin === true;
}

function toJsonSafe(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (isRecord(value) && typeof value.toDate === "function") {
        return [key, value.toDate().toISOString()];
      }

      return [key, value];
    })
  );
}

async function requireAdmin(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const adminSnap = await db.collection("users").doc(decoded.uid).get();
  const adminProfile = adminSnap.data() ?? {};

  if (!adminSnap.exists || !isAdminProfile(adminProfile)) {
    return { error: json({ error: "No access (admin required)" }, 403) };
  }

  return { auth, db };
}

function publicAuthUser(user: Awaited<ReturnType<ReturnType<typeof getAdmin>["auth"]["getUserByEmail"]>>) {
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    disabled: user.disabled,
    emailVerified: user.emailVerified,
    providerData: user.providerData.map((provider) => ({
      providerId: provider.providerId,
      uid: provider.uid,
      email: provider.email ?? null,
      displayName: provider.displayName ?? null,
    })),
  };
}

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if ("error" in admin) return admin.error;

    const url = new URL(req.url);
    const rawEmail = (url.searchParams.get("email") ?? "").trim();
    if (!rawEmail || !rawEmail.includes("@")) {
      return json({ error: "Email is required" }, 400);
    }

    const authLookupEmail = rawEmail.toLowerCase();
    let authUser: ReturnType<typeof publicAuthUser> | null = null;
    let authError: string | null = null;

    try {
      authUser = publicAuthUser(await admin.auth.getUserByEmail(authLookupEmail));
    } catch (error) {
      authError =
        isRecord(error) && error.code === "auth/user-not-found"
          ? "not_found"
          : error instanceof Error
            ? error.message
            : "lookup_failed";
    }

    const profileByUid =
      authUser?.uid
        ? await admin.db.collection("users").doc(authUser.uid).get()
        : null;

    const profileByUidData =
      profileByUid?.exists
        ? {
            id: profileByUid.id,
            ...toJsonSafe(profileByUid.data() ?? {}),
          }
        : null;

    const emails = Array.from(new Set([rawEmail, authLookupEmail]));
    const byEmailSnaps = await Promise.all(
      emails.map((email) => admin.db.collection("users").where("email", "==", email).limit(10).get())
    );

    const seen = new Set<string>();
    const profilesByEmail = byEmailSnaps.flatMap((snap) =>
      snap.docs.flatMap((doc) => {
        if (seen.has(doc.id)) return [];
        seen.add(doc.id);
        return [{ id: doc.id, ...toJsonSafe(doc.data() ?? {}) }];
      })
    );

    return json({
      ok: true,
      email: rawEmail,
      authUser,
      authError,
      profileByUid: profileByUidData,
      profilesByEmail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "User lookup failed";
    const status = message.includes("Authorization") ? 401 : 500;
    return json({ error: message }, status);
  }
}
