import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isRecord, safeImageUrl, safeString, type ImageSubmission } from "@/lib/imageSessions";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function asMillis(value: unknown): number {
  if (isRecord(value) && typeof value.toMillis === "function") return value.toMillis();
  if (isRecord(value) && typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await ctx.params;
    if (!sessionId) return json({ error: "Missing sessionId" }, 400);

    const { db } = getAdmin();
    const sessionRef = db.collection("imageSessions").doc(sessionId);
    const [sessionSnap, submissionsSnap] = await Promise.all([
      sessionRef.get(),
      sessionRef.collection("submissions").orderBy("createdAt", "desc").limit(120).get(),
    ]);
    if (!sessionSnap.exists) return json({ error: "Session not found" }, 404);
    const participantsSnap = await sessionRef.collection("participants").orderBy("updatedAt", "desc").limit(80).get();

    const session = sessionSnap.data() ?? {};
    const participants = participantsSnap.docs
      .map((doc) => {
        const item = doc.data();
        return {
          id: doc.id,
          displayName: safeString(item.displayName),
          updatedAt: asMillis(item.updatedAt),
        };
      })
      .filter((item) => item.displayName)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 60);
    const submissions = submissionsSnap.docs
      .map((doc) => {
        const item = doc.data() as ImageSubmission;
        return {
          id: doc.id,
          text: safeString(item.text),
          displayName: safeString(item.displayName),
          createdAt: asMillis(item.createdAt),
        };
      })
      .filter((item) => item.text);

    return json({
      session: {
        id: sessionId,
        code: safeString(session.code),
        status: session.status === "finished" ? "finished" : session.status === "active" ? "active" : "lobby",
        prompt: safeString(session.prompt, "Se på bildet og skriv hva du legger merke til."),
        imageUrl: safeImageUrl(session.imageUrl),
        timerSeconds: typeof session.timerSeconds === "number" && session.timerSeconds > 0 ? session.timerSeconds : null,
        endsAt: asMillis(session.endsAt) || null,
        submissions,
        total: submissionsSnap.size,
        participants,
        participantCount: participantsSnap.size,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load image activity";
    return json({ error: message }, 500);
  }
}
