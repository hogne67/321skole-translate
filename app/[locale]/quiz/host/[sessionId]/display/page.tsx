"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { ArrowRight, Eye, Pause, Play, RotateCcw, X, Trophy } from "lucide-react";

type Question = {
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
  totalQuestions: number;
};

type QuizParticipant = {
  id: string;
  alias: string;
  emoji: string;
};

type SessionView = {
  id: string;
  code: string;
  status: "lobby" | "active" | "finished";
  mode: "manual" | "auto";
  title: string;
  description: string;
  currentIndex: number;
  showAnswer: boolean;
  questionStartedAt: number | null;
  answerShownAt: number | null;
  phase: "answer" | "reveal" | "results" | "next";
  phaseStartedAt: number | null;
  answerSeconds: number;
  revealSeconds: number;
  resultsSeconds: number;
  nextSeconds: number;
  questions: Question[];
  participantCount: number;
  participants: QuizParticipant[];
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
  const participants = Array.isArray(session.participants) ? session.participants : [];
  return {
    id: safeString(session.id),
    code: safeString(session.code),
    status: session.status === "active" || session.status === "finished" ? session.status : "lobby",
    mode: session.mode === "auto" ? "auto" : "manual",
    title: safeString(session.title, "321 quiz"),
    description: safeString(session.description),
    currentIndex: typeof session.currentIndex === "number" ? session.currentIndex : 0,
    showAnswer: session.showAnswer === true,
    questionStartedAt: typeof session.questionStartedAt === "number" ? session.questionStartedAt : null,
    answerShownAt: typeof session.answerShownAt === "number" ? session.answerShownAt : null,
    phase: session.phase === "reveal" || session.phase === "results" || session.phase === "next" ? session.phase : "answer",
    phaseStartedAt: typeof session.phaseStartedAt === "number" ? session.phaseStartedAt : null,
    answerSeconds: typeof session.answerSeconds === "number" ? session.answerSeconds : 30,
    revealSeconds: typeof session.revealSeconds === "number" ? session.revealSeconds : 20,
    resultsSeconds: typeof session.resultsSeconds === "number" ? session.resultsSeconds : 20,
    nextSeconds: typeof session.nextSeconds === "number" ? session.nextSeconds : 5,
    questions: questions.filter(isRecord).map((q) => ({
      question: safeString(q.question),
      options: Array.isArray(q.options) ? q.options.map((item) => safeString(item)).filter(Boolean) : [],
      correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : undefined,
      explanation: safeString(q.explanation),
    })),
    participantCount: typeof session.participantCount === "number" ? session.participantCount : 0,
    participants: participants.filter(isRecord).map((participant) => ({
      id: safeString(participant.id),
      alias: safeString(participant.alias, "Deltaker"),
      emoji: safeString(participant.emoji),
    })).filter((participant) => participant.id && participant.alias),
    currentAnswerCount: typeof session.currentAnswerCount === "number" ? session.currentAnswerCount : 0,
    counts: isRecord(session.counts) ? Object.fromEntries(Object.entries(session.counts).map(([key, count]) => [key, typeof count === "number" ? count : 0])) : {},
    scores: scores.filter(isRecord).map((score) => ({
      participantId: safeString(score.participantId),
      alias: safeString(score.alias, "Deltaker"),
      emoji: safeString(score.emoji),
      score: typeof score.score === "number" ? score.score : 0,
      correct: typeof score.correct === "number" ? score.correct : 0,
      totalQuestions: typeof score.totalQuestions === "number" ? score.totalQuestions : 0,
    })),
  };
}

export default function QuizSessionDisplayPage() {
  const params = useParams<{ locale: string; sessionId: string }>();
  const router = useRouter();
  const locale = params.locale;
  const sessionId = params.sessionId;
  const [user, setUser] = useState<User | null>(getAuth().currentUser);
  const [session, setSession] = useState<SessionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [answerSeconds, setAnswerSeconds] = useState(30);
  const [revealSeconds, setRevealSeconds] = useState(20);
  const [resultsSeconds, setResultsSeconds] = useState(20);
  const [nextSeconds, setNextSeconds] = useState(5);
  const [timingDirty, setTimingDirty] = useState(false);

  const question = session?.questions[session.currentIndex] ?? null;
  const totalAnswers = session?.currentAnswerCount ?? 0;
  const nextDisplayAction = useMemo(() => {
    if (!session) return "next";
    const isLastQuestion = session.currentIndex + 1 >= session.questions.length;
    if (session.phase === "reveal") return "showResults";
    if (session.phase === "results") return isLastQuestion ? "finish" : "countdown";
    if (session.phase === "next") return "next";
    return isLastQuestion && session.showAnswer ? "showResults" : "next";
  }, [session]);

  const nextDisplayLabel = useMemo(() => {
    if (!session) return "Neste";
    if (nextDisplayAction === "showResults") return "Vis resultat";
    if (nextDisplayAction === "finish") return "Avslutt quiz";
    if (nextDisplayAction === "countdown") return "Neste spørsmål";
    return "Neste";
  }, [nextDisplayAction, session]);

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/${locale}/quiz/${sessionId}`;
  }, [locale, sessionId]);
  const liveUrlText = useMemo(() => {
    if (typeof window === "undefined") return "/live";
    return `${window.location.host}/live`;
  }, []);

  const secondsLeft = useMemo(() => {
    if (!session || session.status !== "active") return null;
    const startedAt = session.phaseStartedAt || (session.showAnswer ? session.answerShownAt : session.questionStartedAt);
    if (!startedAt) return null;
    const total = session.phase === "next"
      ? session.nextSeconds
      : session.phase === "results"
        ? session.resultsSeconds
        : session.phase === "reveal"
          ? session.revealSeconds
          : session.answerSeconds;
    return Math.max(0, total - Math.floor((Date.now() - startedAt) / 1000));
  }, [session]);

  const load = useCallback(async () => {
    const current = getAuth().currentUser ?? user;
    if (!current) return;
    const token = await current.getIdToken();
    const res = await fetch(`/api/quiz-sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      setError(isRecord(data) && typeof data.error === "string" ? data.error : "Kunne ikke hente økten.");
      return;
    }
    const nextSession = normalizeSession(data);
    setSession(nextSession);
    if (nextSession?.status === "lobby" && !timingDirty) {
      setAnswerSeconds(nextSession.answerSeconds);
      setRevealSeconds(nextSession.revealSeconds);
      setResultsSeconds(nextSession.resultsSeconds);
      setNextSeconds(nextSession.nextSeconds);
    }
    setError("");
  }, [sessionId, timingDirty, user]);

  useEffect(() => onAuthStateChanged(getAuth(), setUser), []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 900);
    return () => window.clearInterval(timer);
  }, [load]);

  const control = useCallback(async (action: string, mode?: "manual" | "auto") => {
    const current = getAuth().currentUser ?? user;
    if (!current) {
      setError("Logg inn for å styre quizøkten.");
      return;
    }
    setBusy(true);
    setError("");
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
      if (action === "settings" || action === "start") setTimingDirty(false);
    } catch (event) {
      setError(event instanceof Error ? event.message : "Kunne ikke styre økten.");
    } finally {
      setBusy(false);
    }
  }, [answerSeconds, load, nextSeconds, resultsSeconds, revealSeconds, sessionId, user]);

  useEffect(() => {
    if (!joinUrl) return;
    import("qrcode")
      .then((mod) => mod.default.toDataURL(joinUrl, { margin: 1, scale: 8 }))
      .then(setQrUrl)
      .catch(() => setQrUrl(""));
  }, [joinUrl]);

  function closeDisplay() {
    if (window.opener) {
      window.close();
      return;
    }
    router.push(`/${locale}/content`);
  }

  useEffect(() => {
    if (!session || session.mode !== "auto" || session.status !== "active" || busy) return;
    if (session.phase === "answer" && session.phaseStartedAt && Date.now() - session.phaseStartedAt >= session.answerSeconds * 1000) {
      void control("showAnswer");
      return;
    }
    if (session.phase === "reveal" && session.phaseStartedAt && Date.now() - session.phaseStartedAt >= session.revealSeconds * 1000) {
      void control("showResults");
      return;
    }
    if (session.phase === "results" && session.phaseStartedAt && Date.now() - session.phaseStartedAt >= session.resultsSeconds * 1000) {
      void control(session.currentIndex + 1 >= session.questions.length ? "finish" : "countdown");
      return;
    }
    if (session.phase === "next" && session.phaseStartedAt && Date.now() - session.phaseStartedAt >= session.nextSeconds * 1000) {
      void control("next");
    }
  }, [busy, control, session]);

  if (!user) {
    return <main className="min-h-screen bg-[#08090b] p-10 text-white">Logg inn for å vise quiz.</main>;
  }

  return (
    <main className="h-screen overflow-hidden bg-[#08090b] px-8 py-6 text-white">
      <div className="mx-auto flex h-full max-w-[1800px] flex-col">
        <header className="relative flex items-start justify-center gap-6 text-center">
          {session?.status !== "lobby" ? (
            <div className="absolute left-0 top-0 rounded-2xl bg-white/10 px-5 py-3 text-left">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-white/50">Kode</div>
              <div className="text-3xl font-black tracking-[0.18em]">{session?.code || "------"}</div>
            </div>
          ) : null}

          <div>
            <div className="text-sm font-black uppercase tracking-[0.22em] text-emerald-300">321skole quiz</div>
            <div className="mt-2 text-2xl font-bold text-white/90">Storskjermvisning</div>
          </div>

          <button onClick={closeDisplay} className="absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/15" title="Lukk storskjerm">
            <X className="h-5 w-5" />
          </button>
        </header>

        {error ? <div className="mt-5 rounded-2xl bg-rose-500/20 p-4 font-bold text-rose-100">{error}</div> : null}

        {session?.status === "finished" ? (
          <Finished scores={session.scores} />
        ) : session?.status === "active" && question ? (
          <div className="mt-8 flex min-h-0 flex-1 flex-col">
            {session.phase === "results" ? (
              <CleanResultsScene scores={session.scores} secondsLeft={secondsLeft ?? session.resultsSeconds} total={session.resultsSeconds} />
            ) : session.phase === "next" ? (
              <CleanNextScene secondsLeft={secondsLeft ?? session.nextSeconds} total={session.nextSeconds} />
            ) : (
              <>
                <div className="flex items-start justify-between gap-8">
                  <div>
                    <div className="text-sm font-black uppercase tracking-[0.22em] text-violet-300">{session.title}</div>
                    <div className="mt-2 text-xl font-bold text-white/65">Spørsmål {session.currentIndex + 1} av {session.questions.length} · {totalAnswers} svar</div>
                    <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[1.05] tracking-tight">{question.question}</h1>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {session.mode === "manual" ? (
                      <button onClick={() => control("showAnswer")} disabled={busy || session.showAnswer} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-300 px-5 py-4 font-black text-slate-950 disabled:opacity-40">
                        <Eye className="h-5 w-5" />
                        Vis svar
                      </button>
                    ) : null}
                    <button onClick={() => control(nextDisplayAction)} disabled={busy} className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-5 py-4 font-black disabled:opacity-40">
                      {nextDisplayLabel}
                      <ArrowRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {secondsLeft !== null ? (
                  <TimerLine
                    secondsLeft={secondsLeft}
                    total={session.phase === "reveal" ? session.revealSeconds : session.answerSeconds}
                    label={session.phase === "reveal" ? "Forklaring" : "Tid igjen"}
                  />
                ) : null}

                <div className="mt-6 grid min-h-0 gap-4 overflow-hidden">
                  {question.options.map((option, index) => {
                    const count = session.counts[option] ?? 0;
                    const pct = Math.round((count / (totalAnswers || 1)) * 100);
                    const correct = session.showAnswer && index === question.correctIndex;
                    return (
                      <div key={option} className={["rounded-[1.5rem] p-5", correct ? "bg-emerald-300 text-slate-950" : "bg-white/[0.07] text-white"].join(" ")}>
                        <div className="flex items-center justify-between gap-5 text-2xl font-black">
                          <div className="flex items-center gap-4">
                            {correct ? <span className="rounded-full bg-slate-950 px-4 py-2 text-lg text-white">Riktig</span> : null}
                            {option}
                          </div>
                          <div>{count} · {pct}%</div>
                        </div>
                        <div className="mt-4 h-4 overflow-hidden rounded-full bg-black/20">
                          <div className={["h-full rounded-full", correct ? "bg-slate-950" : "bg-violet-400"].join(" ")} style={{ width: `${pct}%` }} />
                        </div>
                        {correct && question.explanation ? <div className="mt-4 max-w-4xl text-xl font-bold leading-snug">{question.explanation}</div> : null}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <Lobby
            session={session}
            answerSeconds={answerSeconds}
            revealSeconds={revealSeconds}
            resultsSeconds={resultsSeconds}
            nextSeconds={nextSeconds}
            setAnswerSeconds={(value) => { setTimingDirty(true); setAnswerSeconds(value); }}
            setRevealSeconds={(value) => { setTimingDirty(true); setRevealSeconds(value); }}
            setResultsSeconds={(value) => { setTimingDirty(true); setResultsSeconds(value); }}
            setNextSeconds={(value) => { setTimingDirty(true); setNextSeconds(value); }}
            onStartManual={() => control("start", "manual")}
            onStartAuto={() => control("start", "auto")}
            onSave={() => control("settings")}
            busy={busy}
            timingDirty={timingDirty}
            qrUrl={qrUrl}
            liveUrlText={liveUrlText}
          />
        )}

        <footer className="mt-auto flex justify-center gap-2 pt-5">
          {session?.status !== "lobby" ? (
            <button onClick={() => control("reset")} disabled={busy} className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-5 py-3 font-black disabled:opacity-40">
              <RotateCcw className="h-5 w-5" />
              Nullstill
            </button>
          ) : null}
          {session?.status === "active" ? (
            <button onClick={() => control("finish")} disabled={busy} className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-5 py-3 font-black disabled:opacity-40">
              <Pause className="h-5 w-5" />
              Avslutt
            </button>
          ) : null}
        </footer>
      </div>
    </main>
  );
}

function Lobby({
  session,
  answerSeconds,
  revealSeconds,
  resultsSeconds,
  nextSeconds,
  setAnswerSeconds,
  setRevealSeconds,
  setResultsSeconds,
  setNextSeconds,
  onStartManual,
  onStartAuto,
  onSave,
  busy,
  timingDirty,
  qrUrl,
  liveUrlText,
}: {
  session: SessionView | null;
  answerSeconds: number;
  revealSeconds: number;
  resultsSeconds: number;
  nextSeconds: number;
  setAnswerSeconds: (value: number) => void;
  setRevealSeconds: (value: number) => void;
  setResultsSeconds: (value: number) => void;
  setNextSeconds: (value: number) => void;
  onStartManual: () => void;
  onStartAuto: () => void;
  onSave: () => void;
  busy: boolean;
  timingDirty: boolean;
  qrUrl: string;
  liveUrlText: string;
}) {
  const participants = session?.participants.slice(0, 60) ?? [];

  return (
    <section className="flex min-h-0 flex-1 items-center py-3">
      <div className="grid w-full min-h-0 gap-5 xl:grid-cols-[minmax(260px,0.78fr)_minmax(0,1.4fr)]">
        <div className="min-w-0 rounded-[2rem] bg-white/[0.08] p-4">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-white/50">Deltakerkode</div>
          <div className="mt-2 font-black tracking-[0.16em] text-white" style={{ fontSize: "clamp(2.7rem, 7vw, 4.5rem)", lineHeight: 1 }}>{session?.code || "------"}</div>
          <div className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white/80">
            Gå til {liveUrlText}
          </div>

          <div className="mt-4 inline-flex max-w-full rounded-[1.5rem] bg-white p-2">
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrUrl}
                alt=""
                className="mx-auto block"
                style={{ width: "min(18rem, 32vw, 32vh)", height: "min(18rem, 32vw, 32vh)" }}
              />
            ) : (
              <div
                className="flex items-center justify-center text-slate-500"
                style={{ width: "min(18rem, 32vw, 32vh)", height: "min(18rem, 32vw, 32vh)" }}
              >
                Lager QR...
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col justify-center text-center">
          <div className="text-sm font-black uppercase tracking-[0.24em] text-violet-300">Klar til livequiz</div>
          <h1 className="mt-4 text-6xl font-black tracking-tight">{session?.title ?? "Quiz"}</h1>
          <div className="mx-auto mt-5 flex flex-wrap justify-center gap-3">
            <div className="rounded-full bg-white/10 px-5 py-2 text-xl font-black">{session?.questions.length ?? 0} spørsmål</div>
            <div className="rounded-full bg-emerald-300 px-5 py-2 text-xl font-black text-slate-950">{session?.participantCount ?? 0} deltakere klare</div>
          </div>

          <div className="mx-auto mt-6 w-full max-w-4xl rounded-[1.5rem] bg-white/[0.07] p-4">
            {participants.length ? (
              <div className="flex max-h-[24vh] flex-wrap justify-center gap-2 overflow-hidden">
                {participants.map((participant) => (
                  <div key={participant.id} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-lg font-black text-white shadow-sm">
                    {participant.emoji ? `${participant.emoji} ` : ""}{participant.alias}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-5 text-xl font-black text-white/55">
                Venter på deltakere...
              </div>
            )}
          </div>

          <div className="mx-auto mt-6 grid w-full max-w-3xl gap-2 rounded-[1.5rem] bg-white/10 p-4 sm:grid-cols-2">
            <DarkChoiceGroup label="Svarfrist" value={answerSeconds} values={[15, 30, 60]} onChange={setAnswerSeconds} />
            <DarkChoiceGroup label="Riktig svar" value={revealSeconds} values={[10, 20, 30]} onChange={setRevealSeconds} />
            <DarkChoiceGroup label="Resultat" value={resultsSeconds} values={[10, 20, 30]} onChange={setResultsSeconds} />
            <DarkChoiceGroup label="Nedtelling" value={nextSeconds} values={[5, 10]} onChange={setNextSeconds} />
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button onClick={onSave} disabled={busy || !timingDirty} className="rounded-2xl bg-white/10 px-5 py-3 text-base font-black disabled:opacity-40">Lagre tider</button>
            <button onClick={onStartManual} disabled={busy} className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-xl font-black text-slate-950 disabled:opacity-40">
              <Play className="h-5 w-5" />
              Start manuelt
            </button>
            <button onClick={onStartAuto} disabled={busy} className="inline-flex items-center gap-2 rounded-2xl bg-violet-300 px-6 py-3 text-xl font-black text-slate-950 disabled:opacity-40">
              <Play className="h-5 w-5" />
              Start auto
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function DarkChoiceGroup({ label, value, values, onChange }: { label: string; value: number; values: number[]; onChange: (value: number) => void }) {
  return (
    <div className="rounded-2xl bg-black/20 p-3 text-left">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/50">{label}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((item) => (
          <button key={item} onClick={() => onChange(item)} className={["rounded-xl px-3 py-2 text-sm font-black", value === item ? "bg-emerald-300 text-slate-950" : "bg-white/10 text-white hover:bg-white/15"].join(" ")}>
            {item} sek
          </button>
        ))}
      </div>
    </div>
  );
}

function TimerLine({ secondsLeft, total, label }: { secondsLeft: number; total: number; label: string }) {
  const pct = Math.max(0, Math.min(100, ((total - secondsLeft) / Math.max(1, total)) * 100));
  const color = pct > 75 ? "bg-rose-400" : pct > 50 ? "bg-amber-300" : "bg-emerald-400";
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between text-lg font-black">
        <span className="uppercase tracking-[0.14em] text-white/55">{label}</span>
        <span>{secondsLeft}s</span>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-white/15">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TopResults({ scores }: { scores: ScoreRow[] }) {
  const top = scores.slice(0, 3);
  return (
    <section className="mt-5 rounded-[1.5rem] bg-white/[0.08] p-5">
      <div className="text-sm font-black uppercase tracking-[0.2em] text-amber-300">Resultat så langt</div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {top.length ? top.map((score, index) => (
          <div key={score.participantId} className={["rounded-2xl p-4", index === 0 ? "bg-amber-300 text-slate-950" : "bg-white/10"].join(" ")}>
            <div className="text-sm font-black opacity-70">{index + 1}. plass</div>
            <div className="mt-1 truncate text-2xl font-black">{score.emoji ? `${score.emoji} ` : ""}{score.alias}</div>
            <div className="mt-1 text-xl font-black">{score.score} poeng</div>
          </div>
        )) : <div className="text-xl font-bold text-white/60">Ingen svar ennå.</div>}
      </div>
    </section>
  );
}

function CleanResultsScene({ scores, secondsLeft, total }: { scores: ScoreRow[]; secondsLeft: number; total: number }) {
  return (
    <section className="flex flex-1 flex-col justify-center">
      <div className="text-center">
        <div className="text-sm font-black uppercase tracking-[0.24em] text-amber-300">Resultat så langt</div>
        <h1 className="mt-4 text-6xl font-black">Topp 3</h1>
      </div>
      <TopResults scores={scores} />
      <div className="mt-8">
        <TimerLine secondsLeft={secondsLeft} total={total} label="Videre om" />
      </div>
    </section>
  );
}

function CleanNextScene({ secondsLeft, total }: { secondsLeft: number; total: number }) {
  return (
    <section className="flex flex-1 flex-col justify-center">
      <NextCountdown secondsLeft={secondsLeft} />
      <div className="mt-8">
        <TimerLine secondsLeft={secondsLeft} total={total} label="Neste spørsmål" />
      </div>
    </section>
  );
}

function NextCountdown({ secondsLeft }: { secondsLeft: number }) {
  return (
    <section className="mx-auto flex w-full max-w-5xl items-center justify-between rounded-[2rem] bg-violet-300 px-10 py-10 text-slate-950">
      <div>
        <div className="text-sm font-black uppercase tracking-[0.2em] opacity-70">Neste spørsmål</div>
        <div className="mt-2 text-5xl font-black">Gjør dere klare</div>
      </div>
      <div className="text-8xl font-black tabular-nums">{secondsLeft}</div>
    </section>
  );
}

function Finished({ scores }: { scores: ScoreRow[] }) {
  return (
    <section className="flex flex-1 items-center justify-center py-12">
      <div className="w-full max-w-5xl text-center">
        <Trophy className="mx-auto h-20 w-20 text-amber-300" />
        <h1 className="mt-5 text-7xl font-black">Quizen er ferdig!</h1>
        <div className="mt-10 grid gap-4">
          {scores.slice(0, 5).map((score, index) => (
            <div key={score.participantId} className={["flex items-center justify-between rounded-[2rem] px-8 py-6 text-left", index === 0 ? "bg-amber-300 text-slate-950" : "bg-white/10"].join(" ")}>
              <div className="text-4xl font-black">{index + 1}. {score.emoji ? `${score.emoji} ` : ""}{score.alias}</div>
              <div className="text-right">
                <div className="text-4xl font-black">{score.score}</div>
                <div className="text-lg font-bold opacity-70">{score.correct} riktige</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
