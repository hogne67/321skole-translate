import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";

export type SessionQuestion = {
  type: "multiple_choice" | "true_false";
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type QuizSessionDoc = {
  ownerId?: string;
  quizId?: string;
  code?: string;
  status?: "lobby" | "active" | "finished";
  mode?: "manual" | "auto";
  title?: string;
  description?: string;
  imageUrl?: string;
  questions?: SessionQuestion[];
  currentIndex?: number;
  showAnswer?: boolean;
  questionStartedAt?: number | null;
  answerShownAt?: number | null;
  answerSeconds?: number;
  revealSeconds?: number;
  resultsSeconds?: number;
  nextSeconds?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type SessionAnswer = {
  participantId?: string;
  alias?: string;
  emoji?: string;
  questionIndex?: number;
  choice?: string;
  correct?: boolean;
  score?: number;
  responseMs?: number | null;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => safeString(item)).filter(Boolean);
}

export function normalizeQuestions(raw: unknown): SessionQuestion[] {
  const items = Array.isArray(raw) ? raw : [];
  return items
    .map((item): SessionQuestion | null => {
      const q = isRecord(item) ? item : {};
      const question = safeString(q.question || q.prompt);
      const options = safeStringArray(q.options).slice(0, 4);
      const correctIndex = typeof q.correctIndex === "number" ? q.correctIndex : 0;
      if (!question || options.length < 2) return null;
      return {
        type: q.type === "true_false" ? "true_false" : "multiple_choice",
        question,
        options,
        correctIndex: Math.max(0, Math.min(options.length - 1, Math.trunc(correctIndex))),
        explanation: safeString(q.explanation),
      };
    })
    .filter((item): item is SessionQuestion => item !== null);
}

export function makeSessionCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function makeUniqueSessionCode(db: Firestore): Promise<string> {
  for (let i = 0; i < 8; i += 1) {
    const code = makeSessionCode();
    const snap = await db.collection("quizSessions").where("code", "==", code).limit(1).get();
    if (snap.empty) return code;
  }
  return makeSessionCode();
}

export function calculateScore(correct: boolean, responseMs: number | null): number {
  if (!correct) return 0;
  if (responseMs === null) return 1000;
  return 1000 + Math.max(0, 500 - Math.round(responseMs / 100));
}

export function scoreRowsFromAnswers(answers: SessionAnswer[], totalQuestions: number) {
  const rows = new Map<string, { participantId: string; alias: string; emoji: string; score: number; correct: number; answered: number; totalMs: number }>();

  for (const answer of answers) {
    const participantId = safeString(answer.participantId);
    if (!participantId) continue;
    const row = rows.get(participantId) ?? {
      participantId,
      alias: safeString(answer.alias, "Deltaker"),
      emoji: safeString(answer.emoji),
      score: 0,
      correct: 0,
      answered: 0,
      totalMs: 0,
    };
    row.alias = safeString(answer.alias, row.alias);
    row.emoji = safeString(answer.emoji, row.emoji);
    row.score += typeof answer.score === "number" ? answer.score : 0;
    row.correct += answer.correct === true ? 1 : 0;
    row.answered += 1;
    row.totalMs += typeof answer.responseMs === "number" ? answer.responseMs : 0;
    rows.set(participantId, row);
  }

  return [...rows.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correct !== a.correct) return b.correct - a.correct;
    return a.totalMs - b.totalMs;
  }).map((row) => ({ ...row, totalQuestions }));
}

export function nowUpdate() {
  return {
    updatedAt: FieldValue.serverTimestamp(),
  };
}
