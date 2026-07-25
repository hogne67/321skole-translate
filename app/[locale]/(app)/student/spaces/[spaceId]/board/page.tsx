// app/[locale]/(app)/student/spaces/[spaceId]/board/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp, type Firestore } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useUserProfile } from "@/lib/useUserProfile";
import { Clock3, MonitorPause } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

type BoardMode = "text" | "poll" | "wordwall";
type NoteColor = "amber" | "emerald" | "sky" | "rose" | "violet";

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
  const [textSetupDone, setTextSetupDone] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("boardTextSetupDone") === "true";
  });

  const [text, setText] = useState("");
  const [textSent, setTextSent] = useState(false);
  const [pollSent, setPollSent] = useState(false);
  const [wordwallSent, setWordwallSent] = useState(false);
  const [sentWordwallWords, setSentWordwallWords] = useState<string[]>([]);

  const [noteColor, setNoteColor] = useState<NoteColor>(() => {
    if (typeof window === "undefined") return "amber";
    const v = localStorage.getItem("boardNoteColor");
    return isNoteColor(v) ? v : "amber";
  });

  const [pollChoice, setPollChoice] = useState<string>("");

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
    if (typeof window !== "undefined") localStorage.setItem("boardGroupName", groupName);
  }, [groupName]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("boardTextSetupDone", textSetupDone ? "true" : "false");
  }, [textSetupDone]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("boardNoteColor", noteColor);
  }, [noteColor]);

  const active = state?.active === true;
  const sessionId = safeString(state?.sessionId);
  const uid = user?.uid ?? null;

  const mode: BoardMode =
    state?.mode === "poll" ? "poll" : state?.mode === "wordwall" ? "wordwall" : "text";

  useEffect(() => {
    setTextSent(false);
    setPollSent(false);
    setWordwallSent(false);
    setSentWordwallWords([]);
    setText("");
    setPollChoice("");
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

  const wordwallPrompt = safeString(state?.data?.wordwallPrompt) ?? t("wordwall.fallbackPrompt");

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
            {mode === "poll" ? (
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
                    <div className="text-sm font-medium text-muted-foreground">{t("tabs.question")}</div>
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

                    <div className="mt-8 text-sm font-medium text-muted-foreground">{title}</div>
                    <div className="mt-2 whitespace-pre-wrap text-3xl font-semibold leading-tight text-slate-950 md:text-4xl">{prompt}</div>

                    <div className="mt-7">
                      <label className="mb-2 block text-sm font-medium">{t("answer.label")}</label>
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="min-h-[220px] w-full rounded-2xl border px-4 py-3 text-base leading-7"
                        placeholder={t("answer.placeholder")}
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
