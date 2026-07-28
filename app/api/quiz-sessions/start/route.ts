import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isRecord, makeUniqueSessionCode, normalizeQuestions, safeString } from "@/lib/quizSessions";

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
    const body = (await req.json().catch(() => ({}))) as { lessonId?: unknown };
    const lessonId = safeString(body.lessonId);
    if (!lessonId) return json({ error: "Missing lessonId" }, 400);

    const [lessonSnap, userSnap] = await Promise.all([
      db.collection("lessons").doc(lessonId).get(),
      db.collection("users").doc(uid).get(),
    ]);
    if (!lessonSnap.exists) return json({ error: "Quiz not found" }, 404);

    const user = userSnap.data() ?? {};
    const data = lessonSnap.data() ?? {};
    const roles = isRecord(user.roles) ? user.roles : {};
    const ownerId = safeString(data.ownerId || data.uid);
    const isAdmin = user.role === "admin" || roles.admin === true;
    if (ownerId !== uid && !isAdmin) return json({ error: "Not allowed" }, 403);

    const quiz = isRecord(data.quiz) ? data.quiz : {};
    const questions = normalizeQuestions(Array.isArray(quiz.questions) ? quiz.questions : data.tasks);
    if (questions.length < 1) return json({ error: "Quiz has no questions" }, 400);

    const code = await makeUniqueSessionCode(db);
    const sessionRef = db.collection("quizSessions").doc();
    await sessionRef.set({
      ownerId: uid,
      quizId: lessonId,
      code,
      status: "lobby",
      mode: "manual",
      title: safeString(quiz.title || data.title, "321 quiz"),
      description: safeString(quiz.description || data.description),
      imageUrl: safeString(data.coverImageUrl || data.imageUrl),
      questions,
      currentIndex: 0,
      showAnswer: false,
      questionStartedAt: null,
      answerShownAt: null,
      phase: "answer",
      phaseStartedAt: null,
      answerSeconds: 30,
      revealSeconds: 20,
      resultsSeconds: 20,
      nextSeconds: 5,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return json({ ok: true, sessionId: sessionRef.id, code });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start quiz session";
    return json({ error: message }, 500);
  }
}
