import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isRecord, safeMotion, safeString, type WordwallSubmission } from "@/lib/wordwallSessions";

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
    const sessionRef = db.collection("wordwallSessions").doc(sessionId);
    const [sessionSnap, submissionsSnap, participantsSnap] = await Promise.all([
      sessionRef.get(),
      sessionRef.collection("submissions").orderBy("createdAt", "desc").limit(300).get(),
      sessionRef.collection("participants").orderBy("updatedAt", "desc").limit(300).get(),
    ]);
    if (!sessionSnap.exists) return json({ error: "Session not found" }, 404);

    const session = sessionSnap.data() ?? {};
    const groups = new Map<string, { word: string; count: number; latestAt: number }>();
    submissionsSnap.docs.forEach((doc) => {
      const item = doc.data() as WordwallSubmission;
      const key = safeString(item.normalized || item.word).toLocaleLowerCase("nb");
      const word = safeString(item.word);
      if (!key || !word) return;
      const current = groups.get(key) ?? { word, count: 0, latestAt: 0 };
      current.count += 1;
      current.latestAt = Math.max(current.latestAt, asMillis(item.createdAt));
      groups.set(key, current);
    });
    const participants = participantsSnap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          displayName: safeString(data.displayName),
          joinedAt: asMillis(data.joinedAt),
        };
      })
      .filter((participant) => participant.displayName)
      .sort((a, b) => b.joinedAt - a.joinedAt)
      .slice(0, 60);

    return json({
      session: {
        id: sessionId,
        code: safeString(session.code),
        status: session.status === "finished" ? "finished" : session.status === "active" ? "active" : "lobby",
        prompt: safeString(session.prompt, "Skriv ett ord som passer."),
        motion: safeMotion(session.motion),
        timerSeconds: typeof session.timerSeconds === "number" && session.timerSeconds > 0 ? session.timerSeconds : null,
        endsAt: asMillis(session.endsAt) || null,
        words: [...groups.values()].sort((a, b) => b.count - a.count || b.latestAt - a.latestAt),
        total: submissionsSnap.size,
        participantCount: participantsSnap.size,
        participants,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load wordwall";
    return json({ error: message }, 500);
  }
}
