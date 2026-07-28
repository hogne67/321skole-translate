import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isRecord, safeString, scoreRowsFromAnswers, type QuizSessionDoc, type SessionAnswer } from "@/lib/quizSessions";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function publicQuestions(session: QuizSessionDoc, isHost: boolean) {
  const questions = Array.isArray(session.questions) ? session.questions : [];
  const currentIndex = typeof session.currentIndex === "number" ? session.currentIndex : 0;
  const showAnswer = session.showAnswer === true || session.status === "finished";

  return questions.map((question, index) => ({
    type: question.type,
    question: question.question,
    options: question.options,
    ...(isHost || (showAnswer && index === currentIndex) || session.status === "finished"
      ? { correctIndex: question.correctIndex, explanation: question.explanation }
      : {}),
  }));
}

export async function GET(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await ctx.params;
    if (!sessionId) return json({ error: "Missing sessionId" }, 400);

    const { auth, db } = getAdmin();
    const sessionSnap = await db.collection("quizSessions").doc(sessionId).get();
    if (!sessionSnap.exists) return json({ error: "Session not found" }, 404);
    const session = (sessionSnap.data() ?? {}) as QuizSessionDoc;

    let isHost = false;
    const token = getBearerToken(req);
    if (token) {
      try {
        const decoded = await auth.verifyIdToken(token);
        const userSnap = await db.collection("users").doc(decoded.uid).get();
        const user = userSnap.data() ?? {};
        const roles = isRecord(user.roles) ? user.roles : {};
        isHost = session.ownerId === decoded.uid || user.role === "admin" || roles.admin === true;
      } catch {
        isHost = false;
      }
    }

    const [participantsSnap, answersSnap] = await Promise.all([
      db.collection("quizSessions").doc(sessionId).collection("participants").get(),
      db.collection("quizSessions").doc(sessionId).collection("answers").get(),
    ]);

    const answers = answersSnap.docs.map((doc) => doc.data() as SessionAnswer);
    const scores = scoreRowsFromAnswers(answers, Array.isArray(session.questions) ? session.questions.length : 0);
    const currentIndex = typeof session.currentIndex === "number" ? session.currentIndex : 0;
    const currentAnswers = answers.filter((answer) => answer.questionIndex === currentIndex);
    const counts = new Map<string, number>();
    currentAnswers.forEach((answer) => {
      const choice = safeString(answer.choice);
      if (choice) counts.set(choice, (counts.get(choice) ?? 0) + 1);
    });

    return json({
      ok: true,
      isHost,
      session: {
        id: sessionId,
        code: session.code,
        status: session.status ?? "lobby",
        mode: session.mode ?? "manual",
        title: safeString(session.title, "321 quiz"),
        description: safeString(session.description),
        imageUrl: safeString(session.imageUrl),
        currentIndex,
        showAnswer: session.showAnswer === true,
        questionStartedAt: typeof session.questionStartedAt === "number" ? session.questionStartedAt : null,
        answerShownAt: typeof session.answerShownAt === "number" ? session.answerShownAt : null,
        phase: session.phase === "reveal" || session.phase === "results" || session.phase === "next" ? session.phase : "answer",
        phaseStartedAt: typeof session.phaseStartedAt === "number" ? session.phaseStartedAt : null,
        answerSeconds: typeof session.answerSeconds === "number" ? session.answerSeconds : 30,
        revealSeconds: typeof session.revealSeconds === "number" ? session.revealSeconds : 20,
        resultsSeconds: typeof session.resultsSeconds === "number" ? session.resultsSeconds : 20,
        nextSeconds: typeof session.nextSeconds === "number" ? session.nextSeconds : 5,
        questions: publicQuestions(session, isHost),
        participantCount: participantsSnap.size,
        answerCount: answers.length,
        currentAnswerCount: currentAnswers.length,
        counts: Object.fromEntries(counts.entries()),
        scores,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load quiz session";
    return json({ error: message }, 500);
  }
}
