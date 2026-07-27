import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { calculateScore, safeString, type QuizSessionDoc } from "@/lib/quizSessions";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await ctx.params;
    if (!sessionId) return json({ error: "Missing sessionId" }, 400);

    const body = (await req.json().catch(() => ({}))) as {
      participantId?: unknown;
      questionIndex?: unknown;
      choice?: unknown;
    };
    const participantId = safeString(body.participantId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    const questionIndex = typeof body.questionIndex === "number" && Number.isInteger(body.questionIndex) ? body.questionIndex : -1;
    const choice = safeString(body.choice).slice(0, 500);
    if (!participantId) return json({ error: "Missing participantId" }, 400);
    if (questionIndex < 0) return json({ error: "Missing questionIndex" }, 400);
    if (!choice) return json({ error: "Missing choice" }, 400);

    const { db } = getAdmin();
    const sessionRef = db.collection("quizSessions").doc(sessionId);
    const [sessionSnap, participantSnap] = await Promise.all([
      sessionRef.get(),
      sessionRef.collection("participants").doc(participantId).get(),
    ]);
    if (!sessionSnap.exists) return json({ error: "Session not found" }, 404);
    if (!participantSnap.exists) return json({ error: "Participant not found" }, 404);

    const session = (sessionSnap.data() ?? {}) as QuizSessionDoc;
    const currentIndex = typeof session.currentIndex === "number" ? session.currentIndex : 0;
    if (session.status !== "active") return json({ error: "Quiz is not active" }, 409);
    if (session.showAnswer === true) return json({ error: "Answer is locked" }, 409);
    if (questionIndex !== currentIndex) return json({ error: "Question changed" }, 409);

    const question = Array.isArray(session.questions) ? session.questions[questionIndex] : null;
    if (!question) return json({ error: "Question not found" }, 404);

    const alias = safeString(participantSnap.get("alias"), "Deltaker");
    const emoji = safeString(participantSnap.get("emoji"));
    const correctChoice = question.options[question.correctIndex] ?? "";
    const correct = choice === correctChoice;
    const responseMs = typeof session.questionStartedAt === "number" ? Math.max(0, Date.now() - session.questionStartedAt) : null;
    const score = calculateScore(correct, responseMs);

    const answerRef = sessionRef.collection("answers").doc(`${participantId}_${questionIndex}`);
    const answerSnap = await answerRef.get();
    await answerRef.set(
      {
        participantId,
        alias,
        emoji,
        questionIndex,
        choice,
        correct,
        score,
        responseMs,
        ...(answerSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json({ ok: true, correct, score, responseMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save answer";
    return json({ error: message }, 500);
  }
}
