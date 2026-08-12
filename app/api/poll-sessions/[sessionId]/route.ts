import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isRecord, normalizePollOptions, safeString, type PollVote } from "@/lib/pollSessions";

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
    const sessionRef = db.collection("pollSessions").doc(sessionId);
    const [sessionSnap, votesSnap] = await Promise.all([
      sessionRef.get(),
      sessionRef.collection("votes").limit(1000).get(),
    ]);
    if (!sessionSnap.exists) return json({ error: "Session not found" }, 404);

    const session = sessionSnap.data() ?? {};
    const options = normalizePollOptions(session.options);
    const counts = new Map(options.map((option) => [option, 0]));
    let total = 0;

    votesSnap.docs.forEach((doc) => {
      const vote = doc.data() as PollVote;
      const choice = safeString(vote.choice);
      if (!counts.has(choice)) return;
      counts.set(choice, (counts.get(choice) ?? 0) + 1);
      total += 1;
    });

    return json({
      session: {
        id: sessionId,
        code: safeString(session.code),
        status: session.status === "finished" ? "finished" : "active",
        question: safeString(session.question, "Hva mener du?"),
        options: options.map((option) => ({ option, count: counts.get(option) ?? 0 })),
        timerSeconds: typeof session.timerSeconds === "number" && session.timerSeconds > 0 ? session.timerSeconds : null,
        endsAt: asMillis(session.endsAt) || null,
        total,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load poll";
    return json({ error: message }, 500);
  }
}
