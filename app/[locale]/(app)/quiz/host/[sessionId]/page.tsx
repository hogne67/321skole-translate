"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { ArrowRight, CheckCircle2, Copy, Eye, ExternalLink, Play, RotateCcw, Trophy } from "lucide-react";

type HostQuestion = {
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
  totalMs: number;
  totalQuestions: number;
};

type SessionView = {
  id: string;
  code: string;
  status: "lobby" | "active" | "finished";
  mode: "manual" | "auto";
  title: string;
  description: string;
  imageUrl: string;
  currentIndex: number;
  showAnswer: boolean;
  answerSeconds: number;
  revealSeconds: number;
  resultsSeconds: number;
  nextSeconds: number;
  questions: HostQuestion[];
  participantCount: number;
  currentAnswerCount: number;
  counts: Record<string, number>;
  scores: ScoreRow[];
};

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
    mode: session.mode === "auto" ? "auto" : "manual",
    title: safeString(session.title, "321 quiz"),
    description: safeString(session.description),
    imageUrl: safeString(session.imageUrl),
    currentIndex: typeof session.currentIndex === "number" ? session.currentIndex : 0,
    showAnswer: session.showAnswer === true,
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
    participantCount: typeof session.participantCount === "number" ? session.participantCount : 0,
    currentAnswerCount: typeof session.currentAnswerCount === "number" ? session.currentAnswerCount : 0,
    counts: isRecord(session.counts) ? Object.fromEntries(Object.entries(session.counts).map(([key, count]) => [key, typeof count === "number" ? count : 0])) : {},
    scores: scores.filter(isRecord).map((score) => ({
      participantId: safeString(score.participantId),
      alias: safeString(score.alias, "Deltaker"),
      emoji: safeString(score.emoji),
      score: typeof score.score === "number" ? score.score : 0,
      correct: typeof score.correct === "number" ? score.correct : 0,
      answered: typeof score.answered === "number" ? score.answered : 0,
      totalMs: typeof score.totalMs === "number" ? score.totalMs : 0,
      totalQuestions: typeof score.totalQuestions === "number" ? score.totalQuestions : 0,
    })),
  };
}

export default function QuizHostPage() {
  const params = useParams<{ locale: string; sessionId: string }>();
  const locale = params.locale;
  const sessionId = params.sessionId;
  const [user, setUser] = useState<User | null>(getAuth().currentUser);
  const [session, setSession] = useState<SessionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [answerSeconds, setAnswerSeconds] = useState(30);
  const [revealSeconds, setRevealSeconds] = useState(20);
  const [resultsSeconds, setResultsSeconds] = useState(20);
  const [nextSeconds, setNextSeconds] = useState(5);

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/${locale}/quiz/${sessionId}`;
  }, [locale, sessionId]);

  const displayUrl = useMemo(() => `/${locale}/quiz/host/${sessionId}/display`, [locale, sessionId]);

  const load = useCallback(async () => {
    const current = getAuth().currentUser;
    if (!current) return;
    const token = await current.getIdToken();
    const res = await fetch(`/api/quiz-sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      setError(isRecord(data) && typeof data.error === "string" ? data.error : "Kunne ikke hente økten.");
      return;
    }
    const nextSession = normalizeSession(data);
    setSession(nextSession);
    if (nextSession?.status === "lobby") {
      setAnswerSeconds(nextSession.answerSeconds);
      setRevealSeconds(nextSession.revealSeconds);
      setResultsSeconds(nextSession.resultsSeconds);
      setNextSeconds(nextSession.nextSeconds);
    }
    setError(null);
  }, [sessionId]);

  useEffect(() => onAuthStateChanged(getAuth(), setUser), []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1400);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!joinUrl) return;
    import("qrcode")
      .then((mod) => mod.default.toDataURL(joinUrl, { margin: 1, scale: 7 }))
      .then(setQrUrl)
      .catch(() => setQrUrl(""));
  }, [joinUrl]);

  async function control(action: string, mode?: "manual" | "auto") {
    const current = getAuth().currentUser;
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const token = await current.getIdToken();
      const res = await fetch(`/api/quiz-sessions/${encodeURIComponent(sessionId)}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, mode, answerSeconds, revealSeconds, resultsSeconds, nextSeconds }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kunne ikke styre økten.");
      await load();
    } catch (event) {
      setError(event instanceof Error ? event.message : "Kunne ikke styre økten.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  const question = session?.questions[session.currentIndex] ?? null;
  const totalAnswers = session?.currentAnswerCount ?? 0;

  if (!user) {
    return <main className="mx-auto max-w-4xl px-4 py-8 text-slate-700">Logg inn for å styre quizøkten.</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link href={`/${locale}/content`} className="text-sm font-black text-violet-700">Mitt innhold</Link>
              <p className="mt-4 text-sm font-black uppercase tracking-[0.2em] text-violet-700">Quizøkt</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">{session?.title ?? "Quiz"}</h1>
              {session?.description ? <p className="mt-3 max-w-2xl text-slate-600">{session.description}</p> : null}
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Deltakerkode</div>
              <div className="mt-1 text-4xl font-black tracking-[0.18em]">{session?.code || "------"}</div>
              <button onClick={copyLink} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black hover:bg-slate-50">
                <Copy className="h-4 w-4" />
                {copied ? "Kopiert" : "Kopier lenke"}
              </button>
            </div>
          </div>
        </header>

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div> : null}

        <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Inviter deltakere</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Del koden, QR-koden eller lenken. Deltakere trenger ikke konto.</p>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrUrl} alt="" className="mx-auto h-56 w-56" />
              ) : (
                <div className="flex h-56 items-center justify-center text-sm text-slate-500">Lager QR...</div>
              )}
            </div>
            <div className="mt-4 break-all rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">{joinUrl}</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Stat label="Deltakere" value={String(session?.participantCount ?? 0)} />
              <Stat label="Svar nå" value={String(session?.currentAnswerCount ?? 0)} />
            </div>
          </aside>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            {session?.status === "finished" ? (
              <Scoreboard scores={session.scores} />
            ) : session?.status === "lobby" ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <p className="text-sm font-black uppercase tracking-[0.2em] text-violet-700">Klar til start</p>
                <h2 className="mt-3 text-4xl font-black">Vent til deltakerne er inne</h2>
                <p className="mt-3 max-w-xl text-slate-600">Når du starter, får deltakerne første spørsmål på egen skjerm.</p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <button onClick={() => control("start", "manual")} disabled={busy} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-4 font-black text-white hover:bg-slate-800 disabled:opacity-50">
                    <Play className="h-5 w-5" />
                    Start manuelt
                  </button>
                  <button onClick={() => control("start", "auto")} disabled={busy} className="inline-flex items-center gap-2 rounded-2xl bg-violet-700 px-6 py-4 font-black text-white hover:bg-violet-800 disabled:opacity-50">
                    <Play className="h-5 w-5" />
                    Start auto
                  </button>
                  <Link href={displayUrl} target="_blank" className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-6 py-4 font-black text-slate-950 hover:bg-slate-50">
                    <ExternalLink className="h-5 w-5" />
                    Visningsskjerm
                  </Link>
                </div>
                <TimingControls
                  answerSeconds={answerSeconds}
                  revealSeconds={revealSeconds}
                  resultsSeconds={resultsSeconds}
                  nextSeconds={nextSeconds}
                  setAnswerSeconds={setAnswerSeconds}
                  setRevealSeconds={setRevealSeconds}
                  setResultsSeconds={setResultsSeconds}
                  setNextSeconds={setNextSeconds}
                  onSave={() => control("settings")}
                  disabled={busy}
                />
              </div>
            ) : session && question ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-violet-700">Spørsmål {session.currentIndex + 1} av {session.questions.length}</p>
                    <h2 className="mt-2 text-3xl font-black leading-tight">{question.question}</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => control("showAnswer")} disabled={busy || session.showAnswer} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-black text-violet-800 disabled:opacity-40">
                      <Eye className="h-4 w-4" />
                      Vis svar
                    </button>
                    <button onClick={() => control("next")} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40">
                      Neste
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-3">
                  {question.options.map((option, optionIndex) => {
                    const count = session.counts[option] ?? 0;
                    const pct = Math.round((count / (totalAnswers || 1)) * 100);
                    const correct = session.showAnswer && optionIndex === question.correctIndex;
                    return (
                      <div key={option} className={["rounded-2xl border p-4", correct ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"].join(" ")}>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 text-xl font-black">
                            {correct ? <CheckCircle2 className="h-6 w-6 text-emerald-700" /> : null}
                            {option}
                          </div>
                          <div className="text-lg font-black">{count} · {pct}%</div>
                        </div>
                        <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
                          <div className={["h-full rounded-full", correct ? "bg-emerald-500" : "bg-violet-400"].join(" ")} style={{ width: `${pct}%` }} />
                        </div>
                        {correct && question.explanation ? <p className="mt-3 text-sm font-semibold leading-6 text-emerald-950">{question.explanation}</p> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-8 text-slate-600">Laster quiz...</div>
            )}
          </section>
        </section>

        <div className="flex justify-end gap-2">
          <button onClick={() => control("reset")} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black hover:bg-slate-50 disabled:opacity-50">
            <RotateCcw className="h-4 w-4" />
            Nullstill økt
          </button>
          <button onClick={() => control("finish")} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">
            <Trophy className="h-4 w-4" />
            Avslutt og vis resultat
          </button>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-bold text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
}

function TimingControls({
  answerSeconds,
  revealSeconds,
  resultsSeconds,
  nextSeconds,
  setAnswerSeconds,
  setRevealSeconds,
  setResultsSeconds,
  setNextSeconds,
  onSave,
  disabled,
}: {
  answerSeconds: number;
  revealSeconds: number;
  resultsSeconds: number;
  nextSeconds: number;
  setAnswerSeconds: (value: number) => void;
  setRevealSeconds: (value: number) => void;
  setResultsSeconds: (value: number) => void;
  setNextSeconds: (value: number) => void;
  onSave: () => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-8 w-full max-w-3xl rounded-[2rem] border border-slate-200 bg-slate-50 p-4 text-left">
      <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Tider for visning</div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ChoiceGroup label="Svarfrist" value={answerSeconds} values={[15, 30, 60]} suffix="sek" onChange={setAnswerSeconds} />
        <ChoiceGroup label="Riktig svar" value={revealSeconds} values={[10, 20, 30]} suffix="sek" onChange={setRevealSeconds} />
        <ChoiceGroup label="Resultat" value={resultsSeconds} values={[10, 20, 30]} suffix="sek" onChange={setResultsSeconds} />
        <ChoiceGroup label="Nedtelling" value={nextSeconds} values={[5, 10]} suffix="sek" onChange={setNextSeconds} />
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black hover:bg-slate-100 disabled:opacity-50"
      >
        Lagre tider
      </button>
    </div>
  );
}

function ChoiceGroup({
  label,
  value,
  values,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  values: number[];
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-3">
      <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={[
              "rounded-xl border px-3 py-2 text-sm font-black",
              value === item ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
            ].join(" ")}
          >
            {item} {suffix}
          </button>
        ))}
      </div>
    </div>
  );
}

function Scoreboard({ scores }: { scores: ScoreRow[] }) {
  return (
    <div>
      <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">Sluttresultat</p>
      <h2 className="mt-2 text-4xl font-black">Quizen er ferdig!</h2>
      <div className="mt-8 grid gap-3">
        {scores.length ? scores.slice(0, 10).map((score, index) => (
          <div key={score.participantId} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="min-w-0 text-xl font-black">
              {index + 1}. {score.emoji ? `${score.emoji} ` : ""}{score.alias}
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-emerald-700">{score.score}</div>
              <div className="text-xs font-bold text-slate-500">{score.correct} riktige</div>
            </div>
          </div>
        )) : <div className="rounded-2xl bg-slate-50 p-6 text-slate-600">Ingen svar ennå.</div>}
      </div>
    </div>
  );
}
