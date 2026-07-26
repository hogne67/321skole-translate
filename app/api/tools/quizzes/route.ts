import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function getUid(req: Request) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;
  const { auth } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  return decoded.uid;
}

function cleanQuiz(raw: unknown) {
  if (!isRecord(raw)) return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  if (!title || questions.length === 0) return null;

  return {
    title,
    description: typeof raw.description === "string" ? raw.description : "",
    level: typeof raw.level === "string" ? raw.level : "A2",
    language: typeof raw.language === "string" ? raw.language : "nb",
    sourceMode: typeof raw.sourceMode === "string" ? raw.sourceMode : "topic",
    topic: typeof raw.topic === "string" ? raw.topic : "",
    sourceText: typeof raw.sourceText === "string" ? raw.sourceText : "",
    focus: typeof raw.focus === "string" ? raw.focus : "understanding",
    questions,
  };
}

export async function GET(req: Request) {
  try {
    const uid = await getUid(req);
    if (!uid) return json({ error: "Not signed in." }, 401);

    const { db } = getAdmin();
    const snap = await db.collection("users").doc(uid).collection("quizzes").orderBy("updatedAt", "desc").limit(20).get();
    const quizzes = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: typeof data.title === "string" ? data.title : "Quiz",
        description: typeof data.description === "string" ? data.description : "",
        level: typeof data.level === "string" ? data.level : "",
        language: typeof data.language === "string" ? data.language : "",
        questionsCount: Array.isArray(data.questions) ? data.questions.length : 0,
        quiz: cleanQuiz(data),
      };
    });

    return json({ quizzes }, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    console.error("quizzes GET error:", error);
    return json({ error: message }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const uid = await getUid(req);
    if (!uid) return json({ error: "Not signed in." }, 401);

    const body = (await req.json().catch(() => ({}))) as unknown;
    const payload = isRecord(body) ? body.quiz : null;
    const quiz = cleanQuiz(payload);
    if (!quiz) return json({ error: "Quiz is missing title or questions." }, 400);

    const quizId = isRecord(body) && typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
    const { db } = getAdmin();
    const col = db.collection("users").doc(uid).collection("quizzes");
    const ref = quizId ? col.doc(quizId) : col.doc();

    await ref.set(
      {
        ...quiz,
        ownerId: uid,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: quizId ? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json({ id: ref.id }, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    console.error("quizzes POST error:", error);
    return json({ error: message }, 500);
  }
}
