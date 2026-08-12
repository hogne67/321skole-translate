import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isRecord, makeUniqueImageCode, safeImageUrl, safeString, safeTimerSeconds } from "@/lib/imageSessions";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const [body, userSnap] = await Promise.all([
      req.json().catch(() => ({})) as Promise<{ prompt?: unknown; imageUrl?: unknown; timerSeconds?: unknown }>,
      db.collection("users").doc(uid).get(),
    ]);

    const user = userSnap.data() ?? {};
    const roles = isRecord(user.roles) ? user.roles : {};
    const canUse = user.role === "teacher" || user.role === "admin" || roles.admin === true;
    if (!canUse) return json({ error: "Not allowed" }, 403);

    const prompt = safeString(body.prompt).replace(/\s+/g, " ").trim().slice(0, 240);
    if (prompt.length < 3) return json({ error: "Skriv en instruksjon først." }, 400);
    const imageUrl = safeImageUrl(body.imageUrl);
    if (!imageUrl) return json({ error: "Legg inn en gyldig bilde-URL først." }, 400);

    const timerSeconds = safeTimerSeconds(body.timerSeconds);
    const code = await makeUniqueImageCode(db);
    const sessionRef = db.collection("imageSessions").doc();
    await sessionRef.set({
      ownerId: uid,
      code,
      status: "lobby",
      prompt,
      imageUrl,
      timerSeconds,
      endsAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return json({ ok: true, sessionId: sessionRef.id, code });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start image activity";
    return json({ error: message }, 500);
  }
}
