"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock3, Trophy } from "lucide-react";

type PublicQuestion = {
  type: string;
  question: string;
  options: string[];
  correctIndex?: number;
  explanation?: string;
};

type ScoreRow = {
  participantId: string;
  alias: string;
  emoji: string;
  score: number;
  correct: number;
  answered: number;
};

type SessionView = {
  id: string;
  code: string;
  status: "lobby" | "active" | "finished";
  title: string;
  description: string;
  imageUrl: string;
  currentIndex: number;
  showAnswer: boolean;
  questions: PublicQuestion[];
  scores: ScoreRow[];
};

const EMOJIS = ["😀", "😎", "🤓", "🚀", "⭐", "🔥", "🎯", "💡", "🌈", "⚽", "🎧", "🍀"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeSession(value: unknown): SessionView | null {
  if (!isRecord(value)) return null;
  const session = isRecord(value.session) ? value.session : {};
  const questions = Array.isArray(session.questions) ? session.questions : [];
  const scores = Array.isArray(session.scores) ? session.scores : [];
  return {
    id: safeString(session.id),
    code: safeString(session.code),
    status: session.status === "active" || session.status === "finished" ? session.status : "lobby",
    title: safeString(session.title, "321 quiz"),
    description: safeString(session.description),
    imageUrl: safeString(session.imageUrl),
    currentIndex: typeof session.currentIndex === "number" ? session.currentIndex : 0,
    showAnswer: session.showAnswer === true,
    questions: questions.filter(isRecord).map((q) => ({
      type: safeString(q.type, "multiple_choice"),
      question: safeString(q.question),
      options: Array.isArray(q.options) ? q.options.map((item) => safeString(item)).filter(Boolean) : [],
      correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : undefined,
      explanation: safeString(q.explanation),
    })),
    scores: scores.filter(isRecord).map((score) => ({
      participantId: safeString(score.participantId),
      alias: safeString(score.alias, "Deltaker"),
      emoji: safeString(score.emoji),
      score: typeof score.score === "number" ? score.score : 0,
      correct: typeof score.correct === "number" ? score.correct : 0,
      answered: typeof score.answered === "number" ? score.answered : 0,
    })),
  };
}

export default function PublicQuizSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const storageKey = `quizSessionParticipant:${sessionId}`;

  const [session, setSession] = useState<SessionView | null>(null);
  const [alias, setAlias] = useState("");
  const [emoji, setEmoji] = useState("😀");
  const [participantId, setParticipantId] = useState("");
  const [choice, setChoice] = useState("");
  const [sentKey, setSentKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = session?.questions[session.currentIndex] ?? null;
  const currentKey = session ? `${session.id}:${session.currentIndex}` : "";
  const sent = sentKey === currentKey;
  const ownScore = useMemo(() => session?.scores.find((score) => score.participantId === participantId) ?? null, [participantId, session?.scores]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/quiz-sessions/${encodeURIComponent(sessionId)}`);
    const data = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      setError(isRecord(data) && typeof data.error === "string" ? data.error : "Fant ikke quizøkten.");
      return;
    }
    setSession(normalizeSession(data));
    setError(null);
  }, [sessionId]);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { participantId?: unknown; alias?: unknown; emoji?: unknown };
      setParticipantId(safeString(data.participantId));
      setAlias(safeString(data.alias));
      setEmoji(safeString(data.emoji, "😀"));
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1400);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    setChoice("");
    setSentKey("");
  }, [session?.currentIndex, session?.id]);

  async function join() {
    if (!alias.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quiz-sessions/${encodeURIComponent(sessionId)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias, emoji, participantId }),
      });
      const data = (await res.json().catch(() => ({}))) as { participantId?: unknown; error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kunne ikke bli med.");
      const nextId = safeString(data.participantId);
      setParticipantId(nextId);
      window.localStorage.setItem(storageKey, JSON.stringify({ participantId: nextId, alias, emoji }));
    } catch (event) {
      setError(event instanceof Error ? event.message : "Kunne ikke bli med.");
    } finally {
      setBusy(false);
    }
  }

  async function sendAnswer() {
    if (!participantId || !session || !question || !choice) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quiz-sessions/${encodeURIComponent(sessionId)}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, questionIndex: session.currentIndex, choice }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kunne ikke sende svar.");
      setSentKey(currentKey);
      await load();
    } catch (event) {
      setError(event instanceof Error ? event.message : "Kunne ikke sende svar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-sm">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-violet-700">321quiz live</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">{session?.title ?? "Quiz"}</h1>
          {session?.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{session.description}</p> : null}
        </header>

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div> : null}

        {!participantId ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-3xl font-black">Skriv navn eller gruppenavn</h2>
            <p className="mt-2 text-slate-600">Dette vises i resultatlisten.</p>
            <input
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              className="mt-6 w-full rounded-2xl border border-slate-300 px-4 py-4 text-xl font-bold outline-none focus:border-violet-500"
              placeholder="F.eks. Team 3"
              autoFocus
            />
            <div className="mt-5 grid grid-cols-6 gap-2">
              {EMOJIS.map((item) => (
                <button key={item} type="button" onClick={() => setEmoji(item)} className={["flex h-12 items-center justify-center rounded-2xl border text-2xl", emoji === item ? "border-slate-950 bg-slate-950" : "bg-white"].join(" ")}>
                  {item}
                </button>
              ))}
            </div>
            <button onClick={join} disabled={busy || !alias.trim()} className="mt-6 w-full rounded-2xl bg-emerald-600 px-5 py-4 text-base font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
              Bli med
            </button>
          </section>
        ) : session?.status === "finished" ? (
          <section className="rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Trophy className="h-8 w-8" />
            </div>
            <h2 className="mt-5 text-3xl font-black">Quizen er ferdig!</h2>
            {ownScore ? <p className="mt-2 text-lg font-bold text-slate-700">Du fikk {ownScore.score} poeng og {ownScore.correct} riktige.</p> : null}
            <div className="mt-6 grid gap-2">
              {session.scores.slice(0, 5).map((score, index) => (
                <div key={score.participantId} className={["flex items-center justify-between rounded-2xl p-4", score.participantId === participantId ? "bg-emerald-50 ring-2 ring-emerald-200" : "bg-slate-50"].join(" ")}>
                  <div className="font-black">{index + 1}. {score.emoji ? `${score.emoji} ` : ""}{score.alias}</div>
                  <div className="font-black text-emerald-700">{score.score}</div>
                </div>
              ))}
            </div>
          </section>
        ) : session?.status === "lobby" ? (
          <section className="rounded-[2rem] border border-violet-100 bg-white p-8 text-center shadow-sm">
            <Clock3 className="mx-auto h-10 w-10 text-violet-700" />
            <h2 className="mt-4 text-3xl font-black">Du er med</h2>
            <p className="mt-2 text-slate-600">Venter på at host starter quizen.</p>
            <button onClick={() => setParticipantId("")} className="mt-5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold">Endre navn</button>
          </section>
        ) : question ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-500">
              <span>Spørsmål {(session?.currentIndex ?? 0) + 1} av {session?.questions.length ?? 0}</span>
              <span>{emoji} {alias}</span>
            </div>
            <h2 className="mt-4 text-3xl font-black leading-tight">{question.question}</h2>
            <div className="mt-6 grid gap-3">
              {question.options.map((option, index) => {
                const selected = choice === option;
                const correct = session?.showAnswer && index === question.correctIndex;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setChoice(option)}
                    disabled={session?.showAnswer}
                    className={["flex min-h-16 items-center justify-between rounded-2xl border px-4 py-3 text-left text-lg font-black", correct ? "border-emerald-300 bg-emerald-50 text-emerald-950" : selected ? "border-slate-950 bg-slate-950 text-white" : "bg-white hover:bg-slate-50"].join(" ")}
                  >
                    <span>{option}</span>
                    {correct ? <CheckCircle2 className="h-6 w-6 text-emerald-700" /> : null}
                  </button>
                );
              })}
            </div>
            {session?.showAnswer && question.explanation ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-950">{question.explanation}</div> : null}
            <button onClick={sendAnswer} disabled={busy || !choice || session?.showAnswer} className="mt-6 w-full rounded-2xl bg-emerald-600 px-5 py-4 text-base font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
              {sent ? "Svar sendt" : "Send svar"}
            </button>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Laster...</section>
        )}
      </div>
    </main>
  );
}
