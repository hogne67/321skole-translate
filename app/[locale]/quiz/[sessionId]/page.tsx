"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Award, CheckCircle2, Clock3, Medal, Trophy } from "lucide-react";

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
  questionStartedAt: number | null;
  phase: "answer" | "reveal" | "results" | "next";
  phaseStartedAt: number | null;
  answerSeconds: number;
  revealSeconds: number;
  resultsSeconds: number;
  nextSeconds: number;
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
    questionStartedAt: typeof session.questionStartedAt === "number" ? session.questionStartedAt : null,
    phase: session.phase === "reveal" || session.phase === "results" || session.phase === "next" ? session.phase : "answer",
    phaseStartedAt: typeof session.phaseStartedAt === "number" ? session.phaseStartedAt : null,
    answerSeconds: typeof session.answerSeconds === "number" ? session.answerSeconds : 30,
    revealSeconds: typeof session.revealSeconds === "number" ? session.revealSeconds : 20,
    resultsSeconds: typeof session.resultsSeconds === "number" ? session.resultsSeconds : 20,
    nextSeconds: typeof session.nextSeconds === "number" ? session.nextSeconds : 5,
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
  const [now, setNow] = useState(() => Date.now());

  const question = session?.questions[session.currentIndex] ?? null;
  const currentKey = session ? `${session.id}:${session.currentIndex}` : "";
  const sent = sentKey === currentKey;
  const ownScore = useMemo(() => session?.scores.find((score) => score.participantId === participantId) ?? null, [participantId, session?.scores]);
  const ownRank = useMemo(() => {
    if (!participantId || !session?.scores.length) return null;
    const index = session.scores.findIndex((score) => score.participantId === participantId);
    return index >= 0 ? index + 1 : null;
  }, [participantId, session?.scores]);
  const secondsLeft = useMemo(() => {
    if (!session || session.status !== "active") return null;
    const startedAt = session.phaseStartedAt || session.questionStartedAt;
    if (!startedAt) return null;
    const total = session.phase === "next"
      ? session.nextSeconds
      : session.phase === "results"
        ? session.resultsSeconds
        : session.phase === "reveal"
          ? session.revealSeconds
          : session.answerSeconds;
    return Math.max(0, total - Math.floor((now - startedAt) / 1000));
  }, [now, session]);

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
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

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
            <PersonalResult rank={ownRank} score={ownScore} />
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
            {secondsLeft !== null ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between text-base font-black text-slate-700">
                  <span>{session?.phase === "next" ? "Neste spørsmål" : session?.phase === "results" ? "Resultat" : session?.phase === "reveal" ? "Riktig svar" : "Tid igjen"}</span>
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-white">{secondsLeft}s</span>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-white">
                  <div
                    className={[
                      "h-full rounded-full",
                      session?.phase === "next" ? "bg-violet-500" : session?.phase === "results" ? "bg-amber-400" : "bg-emerald-500",
                    ].join(" ")}
                    style={{
                      width: `${Math.max(0, Math.min(100, (((session?.phase === "next" ? session.nextSeconds : session?.phase === "results" ? session.resultsSeconds : session?.phase === "reveal" ? session.revealSeconds : session?.answerSeconds ?? 30) - secondsLeft) / Math.max(1, session?.phase === "next" ? session.nextSeconds : session?.phase === "results" ? session.resultsSeconds : session?.phase === "reveal" ? session.revealSeconds : session?.answerSeconds ?? 30)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
            {session?.phase === "results" ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-950">
                Resultat vises på skjermen.
              </div>
            ) : null}
            {session?.phase === "next" ? (
              <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-black text-violet-950">
                Neste spørsmål starter straks.
              </div>
            ) : null}
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

function PersonalResult({ rank, score }: { rank: number | null; score: ScoreRow | null }) {
  if (rank === 1 && score) {
    return (
      <div className="relative overflow-hidden rounded-[2rem] border border-amber-200 bg-amber-50 p-6 text-center">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-amber-200/60" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-emerald-200/50" />
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-300 text-slate-950 shadow-lg">
          <Trophy className="h-10 w-10" />
        </div>
        <h2 className="relative mt-5 text-4xl font-black">Gratulerer!</h2>
        <p className="relative mt-2 text-lg font-black text-amber-950">
          Du vant quizen med {score.score} poeng.
        </p>
        <p className="relative mt-1 text-sm font-bold text-slate-700">
          {score.correct} riktige svar. Skikkelig godt jobbet.
        </p>
      </div>
    );
  }

  if (rank && rank <= 3 && score) {
    return (
      <div className="rounded-[2rem] border border-violet-200 bg-violet-50 p-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-200 text-violet-950">
          <Medal className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-3xl font-black">{rank}. plass!</h2>
        <p className="mt-2 text-lg font-bold text-slate-700">
          Du fikk {score.score} poeng og {score.correct} riktige.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-emerald-100 bg-white p-1 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Award className="h-8 w-8" />
      </div>
      <h2 className="mt-5 text-3xl font-black">Quizen er ferdig!</h2>
      {score ? (
        <p className="mt-2 text-lg font-bold text-slate-700">
          Du fikk {score.score} poeng og {score.correct} riktige.
        </p>
      ) : null}
    </div>
  );
}
