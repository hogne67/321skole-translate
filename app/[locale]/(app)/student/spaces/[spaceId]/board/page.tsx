// app/[locale]/(app)/student/spaces/[spaceId]/board/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db, auth } from "@/lib/firebase";
import { doc, getDocFromServer, onSnapshot, setDoc, serverTimestamp, type Firestore } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useUserProfile } from "@/lib/useUserProfile";
import { Clock3, MonitorPause } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

type BoardMode = "text" | "poll" | "wordwall" | "image" | "clock" | "quiz";
type NoteColor = "amber" | "emerald" | "sky" | "rose" | "violet";
type BoardQuizQuestion = {
  question?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  seconds?: number;
};

type StudentQuizAnswer = {
  choice: string;
  responseMs?: number | null;
  limitMs?: number | null;
};

const QUIZ_EMOJIS = ["😀", "😎", "🚀", "⭐", "🔥", "🧠", "🎯", "🏆"];

type BoardState = {
  active?: boolean;
  sessionId?: string;
  mode?: BoardMode | string;

  endsAt?: number | null;
  timerStartedAt?: number | null;
  timerTotalSec?: number | null;
  timerVisible?: boolean;

  clearedAt?: number | null;

  data?: {
    title?: string;
    prompt?: string;
    pollQuestion?: string;
    pollOptions?: string[];
    wordwallPrompt?: string;
    imagePrompt?: string;
    imageUrl?: string;
    clockTitle?: string;
    clockGoals?: string;
    clockTodos?: string;
    stopwatchStartedAt?: number | null;
    stopwatchElapsedMs?: number;
    stopwatchRunning?: boolean;
    quizTitle?: string;
    quizDescription?: string;
    quizQuestions?: BoardQuizQuestion[];
    quizCurrentIndex?: number;
    quizStarted?: boolean;
    quizShowAnswer?: boolean;
    quizFinished?: boolean;
  };
};

type UserProfileLike = {
  displayName?: string | null;
};

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalizeOptions(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 10);
}

function normalizeWordwallWord(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[.,!?;:()[\]{}"'«»]+|[.,!?;:()[\]{}"'«»]+$/g, "")
    .slice(0, 60);
}

function isNoteColor(v: unknown): v is NoteColor {
  return v === "amber" || v === "emerald" || v === "sky" || v === "rose" || v === "violet";
}

function colorLabel(t: (key: string) => string, c: NoteColor) {
  switch (c) {
    case "amber":
      return t("sticky.colors.amber");
    case "emerald":
      return t("sticky.colors.emerald");
    case "sky":
      return t("sticky.colors.sky");
    case "rose":
      return t("sticky.colors.rose");
    case "violet":
      return t("sticky.colors.violet");
  }
}

function colorSwatchClass(c: NoteColor) {
  switch (c) {
    case "amber":
      return "bg-amber-300";
    case "emerald":
      return "bg-emerald-300";
    case "sky":
      return "bg-sky-300";
    case "rose":
      return "bg-rose-300";
    case "violet":
      return "bg-violet-300";
  }
}

function noteAccentClass(c: NoteColor) {
  switch (c) {
    case "amber":
      return "bg-amber-50 border-amber-200";
    case "emerald":
      return "bg-emerald-50 border-emerald-200";
    case "sky":
      return "bg-sky-50 border-sky-200";
    case "rose":
      return "bg-rose-50 border-rose-200";
    case "violet":
      return "bg-violet-50 border-violet-200";
  }
}

export default function StudentBoardPage() {
  const t = useTranslations("studentBoard");
  const locale = useLocale();

  const params = useParams<{ spaceId: string }>();
  const spaceId = params?.spaceId;

  const [user, setUser] = useState<User | null>(null);
  const { profile } = useUserProfile();

  const [state, setState] = useState<BoardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [groupName, setGroupName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("boardGroupName") ?? "";
  });
  const [quizEmoji, setQuizEmoji] = useState<string>(() => {
    if (typeof window === "undefined") return QUIZ_EMOJIS[0];
    const stored = localStorage.getItem("boardQuizEmoji");
    return stored && QUIZ_EMOJIS.includes(stored) ? stored : QUIZ_EMOJIS[0];
  });
  const [textSetupDone, setTextSetupDone] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("boardTextSetupDone") === "true";
  });
  const [quizSetupDone, setQuizSetupDone] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("boardQuizSetupDone") === "true";
  });

  const [text, setText] = useState("");
  const [textSent, setTextSent] = useState(false);
  const [pollSent, setPollSent] = useState(false);
  const [wordwallSent, setWordwallSent] = useState(false);
  const [sentWordwallWords, setSentWordwallWords] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const [noteColor, setNoteColor] = useState<NoteColor>(() => {
    if (typeof window === "undefined") return "amber";
    const v = localStorage.getItem("boardNoteColor");
    return isNoteColor(v) ? v : "amber";
  });

  const [pollChoice, setPollChoice] = useState<string>("");
  const [quizChoice, setQuizChoice] = useState<string>("");
  const [quizSentKey, setQuizSentKey] = useState<string>("");
  const [quizAnswers, setQuizAnswers] = useState<Record<number, StudentQuizAnswer>>({});

  const [wordwallWord, setWordwallWord] = useState("");

  const dbx = useMemo(() => requireDb(db), []);
  const stateRef = useMemo(
    () => (spaceId ? doc(dbx, "spaces", spaceId, "board", "state") : null),
    [dbx, spaceId]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!stateRef) return;

    setLoading(true);
    const unsub = onSnapshot(
      stateRef,
      (snap) => {
        const data = (snap.data() as BoardState | undefined) ?? null;
        setState(data);
        setErr(null);
        setLoading(false);
      },
      (e) => {
        setErr(e?.message ?? t("errors.fetchBoardFailed"));
        setLoading(false);
      }
    );

    return () => unsub();
  }, [stateRef, t]);

  useEffect(() => {
    if (!stateRef) return;
    const ref = stateRef;

    let cancelled = false;
    async function refreshFromServer() {
      try {
        const snap = await getDocFromServer(ref);
        if (cancelled) return;
        const data = (snap.data() as BoardState | undefined) ?? null;
        setState(data);
        setErr(null);
        setLoading(false);
      } catch {
        //
      }
    }

    void refreshFromServer();
    const interval = window.setInterval(refreshFromServer, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [stateRef]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("boardGroupName", groupName);
  }, [groupName]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("boardQuizEmoji", quizEmoji);
  }, [quizEmoji]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("boardTextSetupDone", textSetupDone ? "true" : "false");
  }, [textSetupDone]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("boardQuizSetupDone", quizSetupDone ? "true" : "false");
  }, [quizSetupDone]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("boardNoteColor", noteColor);
  }, [noteColor]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const active = state?.active === true;
  const sessionId = safeString(state?.sessionId);
  const uid = user?.uid ?? null;

  const rawMode = typeof state?.mode === "string" ? state.mode.trim().toLowerCase() : "";
  const mode: BoardMode =
    rawMode === "poll" ? "poll" : rawMode === "wordwall" ? "wordwall" : rawMode === "image" ? "image" : rawMode === "clock" ? "clock" : rawMode === "quiz" ? "quiz" : "text";

  useEffect(() => {
    setTextSent(false);
    setPollSent(false);
    setWordwallSent(false);
    setSentWordwallWords([]);
    setText("");
    setPollChoice("");
    setQuizChoice("");
    setQuizSentKey("");
    setQuizAnswers({});
    setQuizSetupDone(false);
    setWordwallWord("");
  }, [sessionId]);

  useEffect(() => {
    if (!spaceId || !sessionId || typeof window === "undefined") return;
    const raw = localStorage.getItem(`boardWordwallWords:${spaceId}:${sessionId}`);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSentWordwallWords(parsed.filter((word) => typeof word === "string" && word.trim()).slice(0, 12));
      }
    } catch {
      //
    }
  }, [spaceId, sessionId]);

  useEffect(() => {
    if (safeString(groupName)) return;
    const fallbackName =
      safeString((profile as UserProfileLike | null)?.displayName) ||
      safeString(user?.displayName);
    if (fallbackName) setGroupName(fallbackName);
  }, [groupName, profile, user?.displayName]);

  const displayNameForPreview =
    safeString(groupName) ||
    safeString((profile as UserProfileLike | null)?.displayName) ||
    safeString(user?.displayName) ||
    t("fallbackStudentName");
  const quizDisplayName = `${quizEmoji} ${displayNameForPreview}`;
  const quizNameReady = Boolean(safeString(groupName));

  async function sendText() {
    if (!spaceId || !sessionId || !user || !uid) return;

    const answerText = safeString(text);
    if (!answerText) return;

    const group = safeString(groupName);
    const token = await user.getIdToken();

    const res = await fetch(`/api/spaces/${encodeURIComponent(spaceId)}/board/text-response`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sessionId,
        displayName: displayNameForPreview,
        groupName: group,
        text: answerText,
        noteColor,
        responseType: mode === "image" ? "image" : "text",
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      throw new Error(typeof data.error === "string" ? data.error : "Could not save response");
    }

    setTextSent(true);
    setText("");
  }

  async function sendPoll() {
    if (!spaceId || !sessionId) return;

    const choice = safeString(pollChoice);
    if (!choice) return;

    const responseId = `${sessionId}_anon_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
    const ref = doc(dbx, "spaces", spaceId, "boardResponses", responseId);

    await setDoc(
      ref,
      {
        sessionId,
        pollChoice: choice,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    setPollSent(true);
  }

  async function sendQuizAnswer(questionIndex: number) {
    if (!spaceId || !sessionId || !user) return;
    const choice = safeString(quizChoice);
    if (!choice) return;

    const token = await user.getIdToken();
    const res = await fetch(`/api/spaces/${encodeURIComponent(spaceId)}/board/quiz-response`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sessionId,
        quizQuestionIndex: questionIndex,
        quizChoice: choice,
        displayName: displayNameForPreview,
        groupName: safeString(groupName),
        emoji: quizEmoji,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: unknown;
      quizResponseMs?: unknown;
      quizResponseLimitMs?: unknown;
    };
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Could not save quiz response");
    }

    setQuizSentKey(`${sessionId}:${questionIndex}`);
    setQuizAnswers((answers) => ({
      ...answers,
      [questionIndex]: {
        choice,
        responseMs: typeof data.quizResponseMs === "number" ? data.quizResponseMs : null,
        limitMs: typeof data.quizResponseLimitMs === "number" ? data.quizResponseLimitMs : null,
      },
    }));
  }

  async function sendWordwall() {
    if (!spaceId || !sessionId) return;

    const word = normalizeWordwallWord(wordwallWord);
    if (!word) return;

    const responseId = `${sessionId}_word_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
    const ref = doc(dbx, "spaces", spaceId, "boardResponses", responseId);

    await setDoc(
      ref,
      {
        sessionId,
        wordwallWord: word,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    setWordwallSent(true);
    setSentWordwallWords((words) => {
      const next = [word, ...words].slice(0, 12);
      if (typeof window !== "undefined") {
        localStorage.setItem(`boardWordwallWords:${spaceId}:${sessionId}`, JSON.stringify(next));
      }
      return next;
    });
    setWordwallWord("");
  }

  const title = safeString(state?.data?.title) ?? t("fallbackQuestionTitle");
  const prompt = safeString(state?.data?.prompt) ?? "";

  const pollQuestion = safeString(state?.data?.pollQuestion) ?? t("poll.fallbackQuestion");
  const pollOptions = normalizeOptions(state?.data?.pollOptions);
  const quizQuestions = Array.isArray(state?.data?.quizQuestions) ? state.data.quizQuestions : [];
  const quizIndex = Math.max(0, Math.min(quizQuestions.length - 1, typeof state?.data?.quizCurrentIndex === "number" ? state.data.quizCurrentIndex : 0));
  const quizQuestion = quizQuestions[quizIndex] ?? null;
  const quizStarted = state?.data?.quizStarted === true;
  const quizOptions = normalizeOptions(quizQuestion?.options);
  const quizSavedAnswer = quizAnswers[quizIndex];
  const quizSent = quizSentKey === `${sessionId}:${quizIndex}` || Boolean(quizSavedAnswer);
  const quizShowAnswer = state?.data?.quizShowAnswer === true;
  const quizFinished = state?.data?.quizFinished === true;
  const quizStats = calculateStudentQuizStats(quizQuestions, quizAnswers);
  const currentCorrectOption =
    quizQuestion && Array.isArray(quizQuestion.options) && typeof quizQuestion.correctIndex === "number"
      ? safeString(quizQuestion.options[quizQuestion.correctIndex])
      : null;
  const currentAnswerCorrect = quizShowAnswer && quizSavedAnswer && currentCorrectOption ? quizSavedAnswer.choice === currentCorrectOption : false;

  useEffect(() => {
    setQuizChoice(quizAnswers[quizIndex]?.choice ?? "");
  }, [quizAnswers, quizIndex, sessionId]);

  const wordwallPrompt = safeString(state?.data?.wordwallPrompt) ?? t("wordwall.fallbackPrompt");
  const imagePrompt = safeString(state?.data?.imagePrompt) ?? t("image.fallbackPrompt");
  const imageUrl = safeString(state?.data?.imageUrl);
  const clockTitle = safeString(state?.data?.clockTitle) ?? t("clock.fallbackTitle");
  const clockGoals = stripLegacyClockDefault(safeString(state?.data?.clockGoals));
  const clockTodos = stripLegacyClockDefault(safeString(state?.data?.clockTodos));
  const stopwatchElapsed = typeof state?.data?.stopwatchElapsedMs === "number" ? state.data.stopwatchElapsedMs : 0;
  const stopwatchStartedAt = typeof state?.data?.stopwatchStartedAt === "number" ? state.data.stopwatchStartedAt : null;
  const stopwatchMs = state?.data?.stopwatchRunning === true && stopwatchStartedAt ? stopwatchElapsed + Math.max(0, now - stopwatchStartedAt) : stopwatchElapsed;

  const liveBadgeText = loading
    ? t("loading")
    : active
      ? t("status.liveBoard")
      : t("status.notLive");

  return (
    <AuthGate>
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-4xl p-4">
          <div className="sticky top-0 z-10 -mx-4 border-b bg-background/80 px-4 py-3 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold">{t("title")}</h1>

                <div className="mt-1 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
                  <span
                    className={[
                      "h-2 w-2 rounded-full",
                      active ? "bg-emerald-500" : "bg-muted-foreground/40",
                    ].join(" ")}
                  />
                  <span className="text-muted-foreground">{liveBadgeText}</span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <LiveClock locale={locale} />
              </div>
            </div>

            {state?.timerVisible !== false && typeof state?.endsAt === "number" ? (
              <div className="mt-3">
                <TimerBarStudent
                  endsAt={state?.endsAt}
                  startedAt={state?.timerStartedAt}
                  totalSec={state?.timerTotalSec}
                />
              </div>
            ) : null}
          </div>

          {err && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          )}

          {loading ? (
            <div className="mt-4 rounded-xl border bg-background p-4 shadow-sm">
              <div className="text-sm text-muted-foreground">{t("loading")}</div>
            </div>
          ) : !active ? (
            <div className="mt-6 flex min-h-[420px] flex-col items-center justify-center rounded-2xl border bg-slate-50 px-6 py-12 text-center shadow-sm">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
                <MonitorPause className="h-8 w-8 text-slate-700" aria-hidden="true" />
              </div>
              <div className="mt-6 max-w-lg">
                <div className="text-2xl font-semibold text-slate-950">{t("waiting.title")}</div>
                <div className="mt-3 text-base leading-7 text-slate-600">{t("waiting.text")}</div>
              </div>
              <div className="mt-7 inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-medium text-slate-600">
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                {t("waiting.badge")}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border bg-background p-5 shadow-sm md:p-6">
            {mode === "clock" ? (
              <StudentClockView
                title={clockTitle}
                goals={clockGoals}
                todos={clockTodos}
                now={now}
                stopwatchMs={stopwatchMs}
                locale={locale}
                labels={{
                  week: t("clock.week"),
                  goals: t("clock.goalsTitle"),
                  todos: t("clock.todosTitle"),
                  stopwatch: t("clock.stopwatchTitle"),
                  noGoals: t("clock.noGoals"),
                  noTodos: t("clock.noTodos"),
                }}
              />
            ) : mode === "poll" ? (
              <>
                <div className="text-sm font-medium text-muted-foreground">{t("poll.choose")}</div>
                <div className="mt-2 text-2xl font-semibold leading-tight text-slate-950">{pollQuestion}</div>

                {pollOptions.length === 0 ? (
                  <div className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">{t("poll.noOptions")}</div>
                ) : (
                  <div className="mt-5 grid gap-3">
                    {pollOptions.map((opt) => {
                      const selected = pollChoice === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => setPollChoice(opt)}
                          className={[
                            "flex min-h-14 items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left text-base font-medium transition",
                            selected ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "bg-white hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <span>{opt}</span>
                          {selected ? <span className="rounded-full bg-white/15 px-2 py-1 text-xs">{t("poll.selected")}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {pollSent ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                      <div className="font-semibold">{t("poll.sentTitle")}</div>
                      <div className="mt-0.5">{t("poll.sent")}</div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground" />
                  )}
                  <button
                    onClick={sendPoll}
                    disabled={!safeString(pollChoice) || pollSent}
                    className={[
                      "rounded-xl px-5 py-3 text-sm font-semibold shadow-sm",
                      pollSent
                        ? "cursor-default bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
                        : "bg-emerald-600 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none",
                    ].join(" ")}
                  >
                    {pollSent ? t("poll.sentButton") : t("poll.send")}
                  </button>
                </div>

                <div className="mt-4 text-xs text-muted-foreground">
                  {t("poll.anonymousHint")}
                </div>
              </>
            ) : mode === "quiz" ? (
              <>
                <div className="text-sm font-medium text-muted-foreground">{safeString(state?.data?.quizTitle) ?? "Quiz"}</div>
                {!quizQuestion ? (
                  <div className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">{t("quiz.waiting")}</div>
                ) : !quizSetupDone || !quizNameReady ? (
                  <>
                    <div className="mt-2 text-3xl font-semibold leading-tight text-slate-950 md:text-4xl">{t("quiz.nameTitle")}</div>
                    <p className="mt-3 text-base text-slate-600">{t("quiz.nameText")}</p>
                    <div className="mt-7">
                      <label className="mb-2 block text-sm font-medium">{t("groupName.label")}</label>
                      <input
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className="w-full rounded-2xl border px-4 py-4 text-lg"
                        placeholder={t("quiz.namePlaceholder")}
                        autoFocus
                      />
                    </div>
                    <div className="mt-5">
                      <div className="mb-2 text-sm font-medium">{t("quiz.emojiLabel")}</div>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                        {QUIZ_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setQuizEmoji(emoji)}
                            className={[
                              "flex h-12 items-center justify-center rounded-2xl border text-2xl transition",
                              quizEmoji === emoji ? "border-slate-950 bg-slate-950 shadow-sm" : "bg-white hover:bg-slate-50",
                            ].join(" ")}
                            aria-label={emoji}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => setQuizSetupDone(true)}
                      disabled={!quizNameReady}
                      className="mt-7 w-full rounded-xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
                    >
                      {t("quiz.join")}
                    </button>
                  </>
                ) : !quizStarted ? (
                  <>
                    <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <div>
                        <span className="font-semibold text-slate-950">{quizDisplayName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQuizSetupDone(false)}
                        className="rounded-full border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {t("quiz.changeName")}
                      </button>
                    </div>
                    <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-6 text-violet-950">
                      <div className="text-2xl font-semibold">{t("quiz.readyTitle")}</div>
                      <div className="mt-2 text-base leading-7">{t("quiz.readyText")}</div>
                    </div>
                  </>
                ) : (
                  <>
                    {quizFinished ? (
                      <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 text-violet-950">
                        <div className="text-lg font-semibold">{t("quiz.finishedTitle")}</div>
                        <div className="mt-1 text-sm">{t("quiz.finishedText")}</div>
                      </div>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <div>
                        <span className="font-semibold text-slate-950">{quizDisplayName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQuizSetupDone(false)}
                        className="rounded-full border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {t("quiz.changeName")}
                      </button>
                    </div>
                    <div className="mt-2 text-2xl font-semibold leading-tight text-slate-950">{quizQuestion.question}</div>
                    <div className="mt-1 text-sm text-slate-500">{t("quiz.progress", { current: quizIndex + 1, total: quizQuestions.length })}</div>

                    <div className="mt-5 grid gap-3">
                      {quizOptions.map((opt, optionIndex) => {
                        const selected = quizChoice === opt;
                        const correct = quizShowAnswer && optionIndex === quizQuestion.correctIndex;
                        const wrongSelected = quizShowAnswer && selected && !correct;
                        return (
                          <button
                            key={`${opt}-${optionIndex}`}
                            onClick={() => setQuizChoice(opt)}
                            disabled={quizShowAnswer}
                            className={[
                              "flex min-h-14 items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left text-base font-medium transition",
                              correct
                                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                : wrongSelected
                                  ? "border-rose-200 bg-rose-50 text-rose-950"
                                  : selected
                                    ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                                    : "bg-white hover:bg-slate-50",
                            ].join(" ")}
                          >
                            <span>{opt}</span>
                            {correct ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900">{t("quiz.correct")}</span>
                            ) : wrongSelected ? (
                              <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-900">{t("quiz.yourAnswer")}</span>
                            ) : selected ? (
                              <span className="rounded-full bg-white/15 px-2 py-1 text-xs">{t("poll.selected")}</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>

                    {quizShowAnswer ? (
                      <div className={["mt-5 rounded-xl border px-4 py-3 text-sm font-medium", currentAnswerCorrect ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"].join(" ")}>
                        {quizSavedAnswer ? (currentAnswerCorrect ? t("quiz.correctFeedback") : t("quiz.wrongFeedback")) : t("quiz.noAnswerFeedback")}
                      </div>
                    ) : null}

                    {quizShowAnswer && safeString(quizQuestion.explanation) ? (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">{quizQuestion.explanation}</div>
                    ) : null}

                    {Object.keys(quizAnswers).length > 0 ? (
                      <div className="mt-5 rounded-2xl border bg-slate-50 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("quiz.yourResult")}</div>
                        <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold text-slate-800">
                          <span>{t("quiz.correctCount", { correct: quizStats.correct, total: quizStats.answered })}</span>
                          <span>{t("quiz.points", { points: quizStats.score })}</span>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      {quizSent ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                          <div className="font-semibold">{t("poll.sentTitle")}</div>
                          <div className="mt-0.5">{t("poll.sent")}</div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground" />
                      )}
                      <button
                        onClick={() => sendQuizAnswer(quizIndex)}
                        disabled={!safeString(quizChoice) || quizShowAnswer}
                        className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
                      >
                        {quizSent ? t("quiz.updateAnswer") : t("poll.send")}
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : mode === "wordwall" ? (
              <>
                <div className="text-sm font-medium text-muted-foreground">{t("tabs.wordwall")}</div>
                <div className="mt-2 text-3xl font-semibold leading-tight text-slate-950 md:text-4xl">{wordwallPrompt}</div>

                <div className="mt-7">
                  <label className="mb-2 block text-sm font-medium">{t("wordwall.label")}</label>
                  <input
                    value={wordwallWord}
                    onChange={(e) => setWordwallWord(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void sendWordwall();
                      }
                    }}
                    className="w-full rounded-2xl border px-4 py-4 text-xl font-semibold"
                    placeholder={t("wordwall.placeholder")}
                    maxLength={60}
                  />
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
                  <div className="rounded-2xl border bg-slate-50 p-5">
                    <div className="mb-2 text-sm font-medium text-slate-600">{t("wordwall.previewTitle")}</div>
                    <div className="text-3xl font-semibold leading-tight text-slate-950">
                      {safeString(normalizeWordwallWord(wordwallWord)) ?? t("wordwall.previewFallback")}
                    </div>
                  </div>

                  <button
                    onClick={sendWordwall}
                    disabled={!safeString(normalizeWordwallWord(wordwallWord))}
                    className="rounded-xl bg-emerald-600 px-6 py-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none md:min-w-36"
                  >
                    {t("wordwall.send")}
                  </button>
                </div>

                {wordwallSent ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                    {t("wordwall.sent")}
                  </div>
                ) : null}

                {sentWordwallWords.length > 0 ? (
                  <div className="mt-6">
                    <div className="mb-3 text-sm font-medium text-slate-700">{t("wordwall.yourWords")}</div>
                    <div className="flex flex-wrap gap-2">
                      {sentWordwallWords.map((word, index) => (
                        <span
                          key={`${word}-${index}`}
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-base font-semibold text-emerald-950"
                        >
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-6 text-xs text-muted-foreground">
                  {t("wordwall.anonymousHint")}
                </div>
              </>
            ) : (
              <>
                {!textSetupDone ? (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">{mode === "image" ? t("tabs.image") : t("tabs.question")}</div>
                    <div className="mt-2 text-3xl font-semibold leading-tight text-slate-950">{t("setup.title")}</div>
                    <div className="mt-2 text-base leading-7 text-slate-600">{t("setup.text")}</div>

                    <div className="mt-7 grid gap-5">
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">{t("groupName.label")}</label>
                        <input
                          value={groupName}
                          onChange={(e) => setGroupName(e.target.value)}
                          className="w-full rounded-xl border px-4 py-3 text-base"
                          placeholder={t("groupName.placeholder")}
                        />
                      </div>

                      <div>
                        <div className="mb-3 text-sm font-medium">{t("sticky.colorLabel")}</div>
                        <div className="flex flex-wrap gap-2">
                          {(["amber", "emerald", "sky", "rose", "violet"] as NoteColor[]).map((c) => {
                            const activeC = noteColor === c;
                            return (
                              <button
                                key={c}
                                onClick={() => setNoteColor(c)}
                                className={[
                                  "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                                  activeC ? "border-slate-950 bg-slate-950 text-white" : "bg-white hover:bg-slate-50",
                                ].join(" ")}
                                title={colorLabel(t, c)}
                              >
                                <span className={["h-3 w-3 rounded-full", colorSwatchClass(c)].join(" ")} />
                                {colorLabel(t, c)}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className={["rounded-2xl border p-5 shadow-sm", noteAccentClass(noteColor)].join(" ")}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-base font-semibold">{displayNameForPreview}</div>
                          <div className="text-[11px] text-muted-foreground">{t("sticky.previewTag")}</div>
                        </div>
                        <div className="mt-3 text-sm leading-relaxed">{t("sticky.previewFallback")}</div>
                      </div>

                      <button
                        onClick={() => setTextSetupDone(true)}
                        disabled={!safeString(groupName)}
                        className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
                      >
                        {t("setup.continue")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-3 text-sm">
                        <span className={["h-3 w-3 rounded-full", colorSwatchClass(noteColor)].join(" ")} />
                        <span className="font-semibold">{displayNameForPreview}</span>
                        <span className="text-slate-500">{colorLabel(t, noteColor)}</span>
                      </div>
                      <button
                        onClick={() => setTextSetupDone(false)}
                        className="rounded-full border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {t("setup.edit")}
                      </button>
                    </div>

                    {mode === "image" ? (
                      <div className="mt-7">
                        {imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageUrl} alt="" className="aspect-video w-full rounded-2xl border object-cover shadow-sm" />
                        ) : (
                          <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed bg-slate-50 text-sm text-slate-500">
                            {t("image.noImage")}
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div className="mt-8 text-sm font-medium text-muted-foreground">{mode === "image" ? t("tabs.image") : title}</div>
                    <div className="mt-2 whitespace-pre-wrap text-3xl font-semibold leading-tight text-slate-950 md:text-4xl">{mode === "image" ? imagePrompt : prompt}</div>

                    <div className="mt-7">
                      <label className="mb-2 block text-sm font-medium">{mode === "image" ? t("image.answerLabel") : t("answer.label")}</label>
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="min-h-[220px] w-full rounded-2xl border px-4 py-3 text-base leading-7"
                        placeholder={mode === "image" ? t("image.answerPlaceholder") : t("answer.placeholder")}
                      />

                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {textSent ? (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                            {t("answer.sent")}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground" />
                        )}
                        <button
                          onClick={sendText}
                          disabled={!uid || !sessionId || !safeString(text)}
                          className={[
                            "rounded-xl px-5 py-3 text-sm font-semibold",
                            textSent && !safeString(text)
                              ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
                              : "bg-emerald-600 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600",
                          ].join(" ")}
                        >
                          {textSent && !safeString(text) ? t("sent") : t("answer.send")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            </div>
          )}
        </div>
      </div>
    </AuthGate>
  );
}

function LiveClock({ locale }: { locale: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tmr = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tmr);
  }, []);

  const d = now;
  const date = new Intl.DateTimeFormat(locale, { weekday: "short", day: "2-digit", month: "short" }).format(d);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);

  return (
    <div className="rounded-xl border bg-background px-3 py-2 text-xs">
      <div className="text-muted-foreground">{date}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{time}</div>
    </div>
  );
}

function StudentAnalogClock({ now }: { now: number }) {
  const date = new Date(now);
  const seconds = date.getSeconds();
  const minutes = date.getMinutes();
  const hours = date.getHours() % 12;
  const secondDeg = seconds * 6;
  const minuteDeg = minutes * 6 + seconds * 0.1;
  const hourDeg = hours * 30 + minutes * 0.5;

  return (
    <div className="relative aspect-square w-full rounded-full border-8 border-slate-200 bg-white shadow-sm">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((tick) => (
        <div key={tick} className="absolute left-1/2 top-1/2 h-[45%] w-0.5 origin-bottom" style={{ transform: `translate(-50%, -100%) rotate(${tick * 30}deg)` }}>
          <div className={["mx-auto rounded-full bg-slate-400", tick % 3 === 0 ? "h-4 w-1.5" : "h-2.5 w-1"].join(" ")} />
        </div>
      ))}
      <div className="absolute left-1/2 top-1/2 h-[26%] w-2 origin-bottom rounded-full bg-slate-950" style={{ transform: `translate(-50%, -100%) rotate(${hourDeg}deg)` }} />
      <div className="absolute left-1/2 top-1/2 h-[36%] w-1.5 origin-bottom rounded-full bg-slate-950" style={{ transform: `translate(-50%, -100%) rotate(${minuteDeg}deg)` }} />
      <div className="absolute left-1/2 top-1/2 h-[39%] w-0.5 origin-bottom rounded-full bg-rose-500" style={{ transform: `translate(-50%, -100%) rotate(${secondDeg}deg)` }} />
      <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500 ring-4 ring-white" />
    </div>
  );
}

function StudentClockView({
  title,
  goals,
  todos,
  now,
  stopwatchMs,
  locale,
  labels,
}: {
  title: string;
  goals: string;
  todos: string;
  now: number;
  stopwatchMs: number;
  locale: string;
  labels: {
    week: string;
    goals: string;
    todos: string;
    stopwatch: string;
    noGoals: string;
    noTodos: string;
  };
}) {
  const date = new Date(now);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
  const day = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  const fullDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
  const goalLines = goals.split("\n").map((line) => line.trim()).filter(Boolean);
  const todoLines = todos.split("\n").map((line) => line.trim()).filter(Boolean);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-4">
      <div className="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
        <div className="mx-auto w-full max-w-[180px]">
          <StudentAnalogClock now={now} />
        </div>
        <div>
          <div className="text-sm font-semibold uppercase tracking-wide text-blue-700">{title}</div>
          <div className="mt-3 font-mono text-5xl font-black leading-none text-slate-950">{time}</div>
          <div className="mt-3 text-base font-semibold capitalize text-slate-700">
            {day} · {fullDate} · {labels.week} {isoWeekNumber(date)}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-blue-100 bg-white/85 p-4">
          <div className="text-sm font-bold uppercase tracking-wide text-blue-700">{labels.goals}</div>
          <div className="mt-3 space-y-2">
            {(goalLines.length ? goalLines : [labels.noGoals]).map((line, index) => (
              <div key={`${line}-${index}`} className="text-lg font-semibold leading-snug">{line}</div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-white/85 p-4">
          <div className="text-sm font-bold uppercase tracking-wide text-emerald-700">{labels.todos}</div>
          <div className="mt-3 space-y-2">
            {(todoLines.length ? todoLines : [labels.noTodos]).map((line, index) => (
              <div key={`${line}-${index}`} className="text-lg font-semibold leading-snug">{line}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white">
        <div className="text-sm font-bold uppercase tracking-wide text-emerald-300">{labels.stopwatch}</div>
        <div className="mt-2 font-mono text-4xl font-black">{formatDuration(stopwatchMs)}</div>
      </div>
    </div>
  );
}

function TimerBarStudent({
  endsAt,
  startedAt,
  totalSec,
}: {
  endsAt: unknown;
  startedAt: unknown;
  totalSec: unknown;
}) {
  const t = useTranslations("studentBoard");
  const [now, setNow] = useState(() => Date.now());
  const baselineRef = useRef<{ endsAtMs: number; startedAtMs: number; totalMs: number } | null>(null);

  useEffect(() => {
    const tmr = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(tmr);
  }, []);

  const endsAtMs = typeof endsAt === "number" ? endsAt : null;
  const startedAtMs = typeof startedAt === "number" ? startedAt : null;
  const total = typeof totalSec === "number" && totalSec > 0 ? totalSec : null;

  if (!endsAtMs) return null;

  let baseStarted = startedAtMs ?? null;
  let baseTotalMs = total ? total * 1000 : null;

  if ((!baseStarted || !baseTotalMs) && endsAtMs) {
    const prev = baselineRef.current;
    if (!prev || prev.endsAtMs !== endsAtMs) {
      const totalMs = Math.max(1000, endsAtMs - Date.now());
      baselineRef.current = { endsAtMs, startedAtMs: Date.now(), totalMs };
    }
    baseStarted = baselineRef.current?.startedAtMs ?? Date.now();
    baseTotalMs = baselineRef.current?.totalMs ?? Math.max(1000, endsAtMs - Date.now());
  }

  const remaining = Math.max(0, endsAtMs - now);
  const secondsLeft = Math.ceil(remaining / 1000);

  const elapsed = Math.max(0, now - (baseStarted ?? now));
  const pct = baseTotalMs ? Math.max(0, Math.min(100, (elapsed / baseTotalMs) * 100)) : 0;

  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{t("timer.title")}</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums">{secondsLeft}s</div>
        </div>
        <div className="text-xs text-muted-foreground">{t("timer.countingDown")}</div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-black transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function isoWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function stripLegacyClockDefault(value: string | null) {
  if (!value) return "";
  const normalized = value.trim().replace(/\r\n/g, "\n");
  if (normalized === "Vi kan beskrive hva vi ser.\nVi kan bruke hele setninger.") return "";
  if (normalized === "Se på bildet\nSkriv en setning\nDel med klassen") return "";
  if (normalized === "We can describe what we see.\nWe can use full sentences.") return "";
  if (normalized === "Look at the image\nWrite a sentence\nShare with the class") return "";
  if (normalized === "Podemos descrever o que vemos.\nPodemos usar frases completas.") return "";
  if (normalized === "Observar a imagem\nEscrever uma frase\nCompartilhar com a turma") return "";
  return value;
}

function calculateStudentQuizStats(questions: BoardQuizQuestion[], answers: Record<number, StudentQuizAnswer>) {
  let answered = 0;
  let correct = 0;
  let score = 0;

  for (const [key, answer] of Object.entries(answers)) {
    const index = Number(key);
    const question = Number.isInteger(index) ? questions[index] : null;
    if (!question || !Array.isArray(question.options)) continue;
    answered += 1;
    const correctIndex = typeof question.correctIndex === "number" ? question.correctIndex : -1;
    const correctOption = correctIndex >= 0 ? safeString(question.options[correctIndex]) : null;
    if (!correctOption || answer.choice !== correctOption) continue;
    const limitMs = typeof answer.limitMs === "number" && answer.limitMs > 0 ? answer.limitMs : typeof question.seconds === "number" && question.seconds > 0 ? question.seconds * 1000 : 60000;
    const responseMs = typeof answer.responseMs === "number" ? answer.responseMs : null;
    const speedBonus = responseMs !== null ? Math.max(0, Math.round(500 * (1 - Math.min(responseMs, limitMs) / limitMs))) : 0;
    correct += 1;
    score += 1000 + speedBonus;
  }

  return { answered, correct, score };
}
