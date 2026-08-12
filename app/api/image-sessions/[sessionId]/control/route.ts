import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isRecord, safeString } from "@/lib/imageSessions";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { sessionId } = await ctx.params;
    if (!sessionId) return json({ error: "Missing sessionId" }, 400);

    const body = (await req.json().catch(() => ({}))) as { action?: unknown };
    const action = safeString(body.action);
    if (action !== "start") return json({ error: "Unsupported action" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const [sessionSnap, userSnap] = await Promise.all([
      db.collection("imageSessions").doc(sessionId).get(),
      db.collection("users").doc(uid).get(),
    ]);
    if (!sessionSnap.exists) return json({ error: "Session not found" }, 404);

    const user = userSnap.data() ?? {};
    const roles = isRecord(user.roles) ? user.roles : {};
    const session = sessionSnap.data() ?? {};
    const ownerId = safeString(session.ownerId);
    const isAdmin = user.role === "admin" || roles.admin === true;
    if (ownerId !== uid && !isAdmin) return json({ error: "Not allowed" }, 403);
    if (session.status === "finished") return json({ error: "Bildeaktiviteten er avsluttet." }, 409);

    const timerSeconds = typeof session.timerSeconds === "number" && session.timerSeconds > 0 ? session.timerSeconds : null;
    const now = Date.now();
    await sessionSnap.ref.set(
      {
        status: "active",
        startedAt: FieldValue.serverTimestamp(),
        endsAt: timerSeconds ? Timestamp.fromMillis(now + timerSeconds * 1000) : null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not control image activity";
    return json({ error: message }, 500);
  }
}
