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

function publicQuizCopy(locale: string) {
  if (locale === "en") {
    return {
      participantFallback: "Participant",
      fetchFailed: "Could not find the quiz session.",
      joinFailed: "Could not join.",
      answerFailed: "Could not send answer.",
      changeName: "Change name or group name",
      enterName: "Enter name or group name",
      resultListHint: "This is shown in the result list.",
      namePlaceholder: "For example: Team 3",
      saveName: "Save name",
      join: "Join",
      joined: "You are in",
      waitingHost: "Waiting for the host to start the quiz.",
      editName: "Change name",
      questionProgress: (current: number, total: number) => `Question ${current} of ${total}`,
      nextQuestion: "Next question",
      result: "Result",
      correctAnswer: "Correct answer",
      timeLeft: "Time left",
      resultsOnScreen: "Results are shown on the screen.",
      nextStartsSoon: "The next question starts soon.",
      answerSent: "Answer sent",
      sendAnswer: "Send answer",
      loading: "Loading...",
      winnerTitle: "Congratulations!",
      winnerText: (score: number) => `You won the quiz with ${score} points.`,
      winnerDetail: (correct: number) => `${correct} correct answers. Very well done.`,
      placeTitle: (rank: number) => `${rank}${rank === 1 ? "st" : rank === 2 ? "nd" : rank === 3 ? "rd" : "th"} place!`,
      scoreText: (score: number, correct: number) => `You got ${score} points and ${correct} correct.`,
      quizFinished: "The quiz is finished!",
    };
  }
  if (locale === "pt") {
    return {
      participantFallback: "Participante",
      fetchFailed: "Não encontramos a sessão do quiz.",
      joinFailed: "Não foi possível entrar.",
      answerFailed: "Não foi possível enviar a resposta.",
      changeName: "Alterar nome ou nome do grupo",
      enterName: "Escreva nome ou nome do grupo",
      resultListHint: "Isso aparece na lista de resultados.",
      namePlaceholder: "Por exemplo: Equipe 3",
      saveName: "Salvar nome",
      join: "Entrar",
      joined: "Você entrou",
      waitingHost: "Aguardando o anfitrião iniciar o quiz.",
      editName: "Alterar nome",
      questionProgress: (current: number, total: number) => `Pergunta ${current} de ${total}`,
      nextQuestion: "Próxima pergunta",
      result: "Resultado",
      correctAnswer: "Resposta correta",
      timeLeft: "Tempo restante",
      resultsOnScreen: "Os resultados aparecem na tela.",
      nextStartsSoon: "A próxima pergunta começa em breve.",
      answerSent: "Resposta enviada",
      sendAnswer: "Enviar resposta",
      loading: "Carregando...",
      winnerTitle: "Parabéns!",
      winnerText: (score: number) => `Você venceu o quiz com ${score} pontos.`,
      winnerDetail: (correct: number) => `${correct} respostas corretas. Muito bem.`,
      placeTitle: (rank: number) => `${rank}. lugar!`,
      scoreText: (score: number, correct: number) => `Você fez ${score} pontos e acertou ${correct}.`,
      quizFinished: "O quiz terminou!",
    };
  }
  return {
    participantFallback: "Deltaker",
    fetchFailed: "Fant ikke quizøkten.",
    joinFailed: "Kunne ikke bli med.",
    answerFailed: "Kunne ikke sende svar.",
    changeName: "Endre navn eller gruppenavn",
    enterName: "Skriv navn eller gruppenavn",
    resultListHint: "Dette vises i resultatlisten.",
    namePlaceholder: "F.eks. Team 3",
    saveName: "Lagre navn",
    join: "Bli med",
    joined: "Du er med",
    waitingHost: "Venter på at host starter quizen.",
    editName: "Endre navn",
    questionProgress: (current: number, total: number) => `Spørsmål ${current} av ${total}`,
    nextQuestion: "Neste spørsmål",
    result: "Resultat",
    correctAnswer: "Riktig svar",
    timeLeft: "Tid igjen",
    resultsOnScreen: "Resultat vises på skjermen.",
    nextStartsSoon: "Neste spørsmål starter straks.",
    answerSent: "Svar sendt",
    sendAnswer: "Send svar",
    loading: "Laster...",
    winnerTitle: "Gratulerer!",
    winnerText: (score: number) => `Du vant quizen med ${score} poeng.`,
    winnerDetail: (correct: number) => `${correct} riktige svar. Skikkelig godt jobbet.`,
    placeTitle: (rank: number) => `${rank}. plass!`,
    scoreText: (score: number, correct: number) => `Du fikk ${score} poeng og ${correct} riktige.`,
    quizFinished: "Quizen er ferdig!",
  };
}

function normalizeSession(value: unknown, participantFallback: string): SessionView | null {
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
      alias: safeString(score.alias, participantFallback),
      emoji: safeString(score.emoji),
      score: typeof score.score === "number" ? score.score : 0,
      correct: typeof score.correct === "number" ? score.correct : 0,
      answered: typeof score.answered === "number" ? score.answered : 0,
    })),
  };
}

export default function PublicQuizSessionPage() {
  const params = useParams<{ locale: string; sessionId: string }>();
  const locale = params.locale;
  const copy = useMemo(() => publicQuizCopy(locale), [locale]);
  const sessionId = params.sessionId;
  const storageKey = `quizSessionParticipant:${sessionId}`;

  const [session, setSession] = useState<SessionView | null>(null);
  const [alias, setAlias] = useState("");
  const [emoji, setEmoji] = useState("😀");
  const [participantId, setParticipantId] = useState("");
  const [editingIdentity, setEditingIdentity] = useState(false);
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
      setError(isRecord(data) && typeof data.error === "string" ? data.error : copy.fetchFailed);
      return;
    }
    setSession(normalizeSession(data, copy.participantFallback));
    setError(null);
  }, [copy.fetchFailed, copy.participantFallback, sessionId]);

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
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : copy.joinFailed);
      const nextId = safeString(data.participantId);
      setParticipantId(nextId);
      window.localStorage.setItem(storageKey, JSON.stringify({ participantId: nextId, alias, emoji }));
      setEditingIdentity(false);
    } catch (event) {
      setError(event instanceof Error ? event.message : copy.joinFailed);
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
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : copy.answerFailed);
      setSentKey(currentKey);
      await load();
    } catch (event) {
      setError(event instanceof Error ? event.message : copy.answerFailed);
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

        {!participantId || editingIdentity ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-3xl font-black">{participantId ? copy.changeName : copy.enterName}</h2>
            <p className="mt-2 text-slate-600">{copy.resultListHint}</p>
            <input
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              className="mt-6 w-full rounded-2xl border border-slate-300 px-4 py-4 text-xl font-bold outline-none focus:border-violet-500"
              placeholder={copy.namePlaceholder}
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
              {participantId ? copy.saveName : copy.join}
            </button>
          </section>
        ) : session?.status === "finished" ? (
          <section className="rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-sm">
            <PersonalResult rank={ownRank} score={ownScore} copy={copy} />
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
            <h2 className="mt-4 text-3xl font-black">{copy.joined}</h2>
            <p className="mt-2 text-slate-600">{copy.waitingHost}</p>
            <button onClick={() => setEditingIdentity(true)} className="mt-5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold">{copy.editName}</button>
          </section>
        ) : question ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-500">
              <span>{copy.questionProgress((session?.currentIndex ?? 0) + 1, session?.questions.length ?? 0)}</span>
              <span>{emoji} {alias}</span>
            </div>
            {secondsLeft !== null ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between text-base font-black text-slate-700">
                  <span>{session?.phase === "next" ? copy.nextQuestion : session?.phase === "results" ? copy.result : session?.phase === "reveal" ? copy.correctAnswer : copy.timeLeft}</span>
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
                {copy.resultsOnScreen}
              </div>
            ) : null}
            {session?.phase === "next" ? (
              <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-black text-violet-950">
                {copy.nextStartsSoon}
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
              {sent ? copy.answerSent : copy.sendAnswer}
            </button>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">{copy.loading}</section>
        )}
      </div>
    </main>
  );
}

function PersonalResult({ rank, score, copy }: { rank: number | null; score: ScoreRow | null; copy: ReturnType<typeof publicQuizCopy> }) {
  if (rank === 1 && score) {
    return (
      <div className="relative overflow-hidden rounded-[2rem] border border-amber-200 bg-amber-50 p-6 text-center">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-amber-200/60" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-emerald-200/50" />
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-300 text-slate-950 shadow-lg">
          <Trophy className="h-10 w-10" />
        </div>
        <h2 className="relative mt-5 text-4xl font-black">{copy.winnerTitle}</h2>
        <p className="relative mt-2 text-lg font-black text-amber-950">
          {copy.winnerText(score.score)}
        </p>
        <p className="relative mt-1 text-sm font-bold text-slate-700">
          {copy.winnerDetail(score.correct)}
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
        <h2 className="mt-5 text-3xl font-black">{copy.placeTitle(rank)}</h2>
        <p className="mt-2 text-lg font-bold text-slate-700">
          {copy.scoreText(score.score, score.correct)}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-emerald-100 bg-white p-1 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Award className="h-8 w-8" />
      </div>
      <h2 className="mt-5 text-3xl font-black">{copy.quizFinished}</h2>
      {score ? (
        <p className="mt-2 text-lg font-bold text-slate-700">
          {copy.scoreText(score.score, score.correct)}
        </p>
      ) : null}
    </div>
  );
}
