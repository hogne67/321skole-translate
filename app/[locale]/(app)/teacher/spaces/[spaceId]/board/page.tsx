// app/[locale]/(app)/teacher/spaces/[spaceId]/board/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, setDoc, serverTimestamp, type Firestore } from "firebase/firestore";
import { Clock, ExternalLink, MonitorUp, PauseCircle, Play, RotateCcw, Send, Square, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

type BoardMode = "text" | "poll" | "wordwall";
type NoteColor = "amber" | "emerald" | "sky" | "rose" | "violet";
type TabKey = "question" | "poll" | "wordwall";

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
  updatedAt?: unknown;
};

type BoardResponse = {
  sessionId?: string;

  uid?: string | null;
  displayName?: string | null;
  groupName?: string | null;
  text?: string;
  noteColor?: NoteColor | string;

  pollChoice?: string;
  wordwallWord?: string;

  createdAt?: unknown;
};

type WordwallItem = {
  key: string;
  word: string;
  count: number;
  latest: number;
};

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function newSessionId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isTimestampLike(v: unknown): v is { toMillis: () => number } {
  return !!v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis?: unknown }).toMillis === "function";
}

function toMillis(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (isTimestampLike(v)) {
    const ms = v.toMillis();
    return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function isNoteColor(v: unknown): v is NoteColor {
  return v === "amber" || v === "emerald" || v === "sky" || v === "rose" || v === "violet";
}

function accentFromNoteColor(c: NoteColor) {
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

function pickStickyAccent(seed: string) {
  const accents = [
    "bg-amber-50 border-amber-200",
    "bg-emerald-50 border-emerald-200",
    "bg-sky-50 border-sky-200",
    "bg-rose-50 border-rose-200",
    "bg-violet-50 border-violet-200",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return accents[h % accents.length];
}

function normalizeOptions(raw: string): string[] {
  const s = raw.replace(/\r\n/g, "\n");
  const parts = s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.slice(0, 10);
}

function normalizeWordwallWord(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[.,!?;:()[\]{}"'«»]+|[.,!?;:()[\]{}"'«»]+$/g, "");
}

function displayWordwallWord(input: string): string {
  if (!input) return "";
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function wordwallSizeClass(count: number, present: boolean): string {
  if (present) {
    if (count >= 8) return "text-6xl font-bold leading-tight";
    if (count >= 6) return "text-5xl font-bold leading-tight";
    if (count >= 4) return "text-4xl font-bold leading-tight";
    if (count >= 2) return "text-3xl font-semibold leading-tight";
    return "text-2xl font-semibold leading-tight";
  }

  if (count >= 8) return "text-5xl font-bold leading-tight";
  if (count >= 6) return "text-4xl font-bold leading-tight";
  if (count >= 4) return "text-3xl font-bold leading-tight";
  if (count >= 2) return "text-2xl font-semibold leading-tight";
  return "text-xl font-semibold leading-tight";
}

export default function TeacherBoardPage() {
  const t = useTranslations("teacherBoard");
  const locale = useLocale();

  const params = useParams<{ spaceId: string }>();
  const spaceId = params?.spaceId;

  const [state, setState] = useState<BoardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>("question");

  const present = false;
  const [showTimer, setShowTimer] = useState(true);

  const [title, setTitle] = useState<string>(() => t("defaults.title"));
  const [prompt, setPrompt] = useState<string>(() => t("defaults.prompt"));

  const [pollQuestion, setPollQuestion] = useState<string>(() => t("defaults.pollQuestion"));
  const [pollOptionsRaw, setPollOptionsRaw] = useState<string>(() => t("defaults.pollOptions"));

  const [wordwallPrompt, setWordwallPrompt] = useState<string>(() => t("defaults.wordwallPrompt"));

  const [responses, setResponses] = useState<Array<{ id: string; data: BoardResponse }>>([]);

  const dbx = useMemo(() => requireDb(db), []);
  const stateRef = useMemo(() => (spaceId ? doc(dbx, "spaces", spaceId, "board", "state") : null), [dbx, spaceId]);
  const responsesCol = useMemo(() => (spaceId ? collection(dbx, "spaces", spaceId, "boardResponses") : null), [dbx, spaceId]);

  const dirtyRef = useRef({ title: false, prompt: false, poll: false, wordwall: false });

  useEffect(() => {
    if (!dirtyRef.current.title) setTitle(t("defaults.title"));
    if (!dirtyRef.current.prompt) setPrompt(t("defaults.prompt"));
    if (!dirtyRef.current.poll) {
      setPollQuestion(t("defaults.pollQuestion"));
      setPollOptionsRaw(t("defaults.pollOptions"));
    }
    if (!dirtyRef.current.wordwall) setWordwallPrompt(t("defaults.wordwallPrompt"));
  }, [t]);

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

        if (!dirtyRef.current.title && data?.data?.title) setTitle(data.data.title);
        if (!dirtyRef.current.prompt && data?.data?.prompt) setPrompt(data.data.prompt);

        if (!dirtyRef.current.poll) {
          if (data?.data?.pollQuestion) setPollQuestion(data.data.pollQuestion);
          if (Array.isArray(data?.data?.pollOptions) && data.data.pollOptions.length > 0) {
            setPollOptionsRaw(data.data.pollOptions.join(", "));
          }
        }

        if (!dirtyRef.current.wordwall && data?.data?.wordwallPrompt) {
          setWordwallPrompt(data.data.wordwallPrompt);
        }
        if (typeof data?.timerVisible === "boolean") setShowTimer(data.timerVisible);
      },
      (e: unknown) => {
        const msg =
          e && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message ?? "") : "";
        setErr(msg || t("errors.fetchState"));
        setLoading(false);
      }
    );

    return () => unsub();
  }, [stateRef, t]);

  useEffect(() => {
    if (!responsesCol) return;

    const unsub = onSnapshot(
      responsesCol,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as BoardResponse }));
        setResponses(docs);
      },
      () => {}
    );

    return () => unsub();
  }, [responsesCol]);

  const activeSessionId = safeString(state?.sessionId);
  const active = state?.active === true;
  const clearedAt = typeof state?.clearedAt === "number" ? state.clearedAt : null;
  const filteredResponses = useMemo(() => {
    if (!activeSessionId) return [];
    const list = responses.filter((r) => r.data?.sessionId === activeSessionId);

    return list
      .filter((r) => {
        if (!clearedAt) return true;
        const ms = toMillis(r.data?.createdAt) ?? 0;
        return ms >= clearedAt;
      })
      .sort((a, b) => {
        const ams = toMillis(a.data?.createdAt) ?? 0;
        const bms = toMillis(b.data?.createdAt) ?? 0;
        return bms - ams;
      });
  }, [responses, activeSessionId, clearedAt]);

  const textResponses = useMemo(() => filteredResponses.filter((r) => safeString(r.data.text)), [filteredResponses]);
  const pollResponses = useMemo(() => filteredResponses.filter((r) => safeString(r.data.pollChoice)), [filteredResponses]);
  const wordwallResponses = useMemo(() => filteredResponses.filter((r) => safeString(r.data.wordwallWord)), [filteredResponses]);

  const pollCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of pollResponses) {
      const c = safeString(r.data.pollChoice);
      if (!c) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return counts;
  }, [pollResponses]);

  const wordwallItems = useMemo<WordwallItem[]>(() => {
    const map = new Map<string, WordwallItem>();

    for (const r of wordwallResponses) {
      const raw = safeString(r.data.wordwallWord);
      if (!raw) continue;

      const key = normalizeWordwallWord(raw);
      if (!key) continue;

      const created = toMillis(r.data.createdAt) ?? 0;
      const existing = map.get(key);

      if (existing) {
        existing.count += 1;
        if (created > existing.latest) existing.latest = created;
      } else {
        map.set(key, {
          key,
          word: displayWordwallWord(key),
          count: 1,
          latest: created,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.latest - a.latest;
    });
  }, [wordwallResponses]);

  async function startLiveNewSession() {
    if (!stateRef) return;
    const sessionId = newSessionId();

    await setDoc(
      stateRef,
      {
        active: true,
        sessionId,
        mode: "text",
        endsAt: null,
        timerStartedAt: null,
        timerTotalSec: null,
        timerVisible: showTimer,
        clearedAt: null,
        data: { title: safeString(title) ?? t("fallbacks.question"), prompt: safeString(prompt) ?? "" },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function stopLive() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      { active: false, endsAt: null, timerStartedAt: null, timerTotalSec: null, timerVisible: showTimer, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  async function pushTextSameSession() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      {
        active: true,
        mode: "text",
        timerVisible: showTimer,
        data: { title: safeString(title) ?? t("fallbacks.question"), prompt: safeString(prompt) ?? "" },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function pushPollSameSession() {
    if (!stateRef) return;
    const opts = normalizeOptions(pollOptionsRaw);
    await setDoc(
      stateRef,
      {
        active: true,
        mode: "poll",
        timerVisible: showTimer,
        data: {
          pollQuestion: safeString(pollQuestion) ?? t("defaults.pollTitle"),
          pollOptions: opts,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function startPollNewSession() {
    if (!stateRef) return;
    const sessionId = newSessionId();
    const opts = normalizeOptions(pollOptionsRaw);

    await setDoc(
      stateRef,
      {
        active: true,
        sessionId,
        mode: "poll",
        endsAt: null,
        timerStartedAt: null,
        timerTotalSec: null,
        timerVisible: showTimer,
        clearedAt: null,
        data: {
          pollQuestion: safeString(pollQuestion) ?? t("defaults.pollTitle"),
          pollOptions: opts,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function pushWordwallSameSession() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      {
        active: true,
        mode: "wordwall",
        timerVisible: showTimer,
        data: {
          wordwallPrompt: safeString(wordwallPrompt) ?? t("defaults.wordwallShortPrompt"),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function startWordwallNewSession() {
    if (!stateRef) return;
    const sessionId = newSessionId();

    await setDoc(
      stateRef,
      {
        active: true,
        sessionId,
        mode: "wordwall",
        endsAt: null,
        timerStartedAt: null,
        timerTotalSec: null,
        timerVisible: showTimer,
        clearedAt: null,
        data: {
          wordwallPrompt: safeString(wordwallPrompt) ?? t("defaults.wordwallShortPrompt"),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function startTimer(seconds: number) {
    if (!stateRef) return;
    const startedAt = Date.now();
    const endsAtMs = startedAt + seconds * 1000;
    await setDoc(
      stateRef,
      { endsAt: endsAtMs, timerStartedAt: startedAt, timerTotalSec: seconds, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  async function clearTimer() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      { endsAt: null, timerStartedAt: null, timerTotalSec: null, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  async function toggleTimerVisibility() {
    const next = !showTimer;
    setShowTimer(next);
    if (!stateRef) return;
    await setDoc(stateRef, { timerVisible: next, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function clearAnswersSoft() {
    if (!stateRef) return;
    await setDoc(stateRef, { clearedAt: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
  }

  async function showAnswersAgain() {
    if (!stateRef) return;
    await setDoc(stateRef, { clearedAt: null, updatedAt: serverTimestamp() }, { merge: true });
  }

  const boardTitle = safeString(state?.data?.title) ?? title;
  const boardPrompt = safeString(state?.data?.prompt) ?? prompt;
  const boardWordwallPrompt = safeString(state?.data?.wordwallPrompt) ?? wordwallPrompt;

  const noteCardClass = present
    ? "rounded-2xl border p-6 shadow-sm transition-transform hover:-translate-y-0.5"
    : "rounded-xl border p-3 shadow-sm transition-transform hover:-translate-y-0.5";

  const noteNameClass = present ? "text-base font-semibold" : "text-sm font-semibold";
  const noteTextClass = present ? "mt-3 whitespace-pre-wrap text-lg leading-relaxed" : "mt-2 whitespace-pre-wrap text-sm leading-relaxed";

  const responseGridClass = present ? "grid gap-6 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3";
  const tabLabel =
    tab === "poll" ? t("tabs.poll") : tab === "wordwall" ? t("tabs.wordwall") : t("tabs.question");
  const previewMode: BoardMode = tab === "poll" ? "poll" : tab === "wordwall" ? "wordwall" : "text";
  const liveAction =
    tab === "poll" ? pushPollSameSession : tab === "wordwall" ? pushWordwallSameSession : pushTextSameSession;
  const newRoundAction =
    tab === "poll" ? startPollNewSession : tab === "wordwall" ? startWordwallNewSession : startLiveNewSession;
  const responseCount = tab === "poll" ? pollResponses.length : tab === "wordwall" ? wordwallResponses.length : textResponses.length;
  const answersHidden = clearedAt !== null;
  const displayHref = spaceId ? `/${locale}/teacher/spaces/${spaceId}/board/display` : "#";

  return (
    <AuthGate>
      <div className={present ? "min-h-screen bg-zinc-950 text-zinc-50" : "min-h-screen bg-slate-50 text-foreground"}>
        <div className={present ? "mx-auto max-w-[1500px] p-5 pb-60 md:pb-32" : "mx-auto max-w-[1500px] p-4 pb-60 md:p-6 md:pb-32"}>
          <div
            className={[
              "sticky top-0 z-10 -mx-4 border-b px-4 py-4 backdrop-blur md:-mx-6 md:px-6",
              present ? "border-white/10 bg-zinc-950/90" : "border-slate-200 bg-white/90",
            ].join(" ")}
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold">{t("header.title")}</h1>
                  <span className={present ? "rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-zinc-200" : "rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white"}>
                    {present ? t("surface.live") : t("surface.work")}
                  </span>
                  {!loading ? (
                    <span
                      className={[
                        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs",
                        present ? "border-white/15 bg-white/5 text-zinc-300" : "border-slate-200 bg-white text-slate-600",
                      ].join(" ")}
                    >
                      <span className={["h-2 w-2 rounded-full", active ? "bg-emerald-500" : "bg-slate-400"].join(" ")} />
                      {active ? t("status.live") : t("status.notLive")}
                      {active ? ` • ${tabLabel}` : ""}
                    </span>
                  ) : null}
                </div>

                {!present ? <div className="mt-2 max-w-2xl text-sm text-slate-600">{t("surface.workHint")}</div> : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <TabButton active={tab === "question"} onClick={() => setTab("question")}>
                    {t("tabs.question")}
                  </TabButton>
                  <TabButton active={tab === "poll"} onClick={() => setTab("poll")}>
                    {t("tabs.poll")}
                  </TabButton>
                  <TabButton active={tab === "wordwall"} onClick={() => setTab("wordwall")}>
                    {t("tabs.wordwall")}
                  </TabButton>
                </div>
              </div>

              {!present ? (
                <div className="hidden xl:block">
                  <StudentScreenPreview
                    active={active}
                    mode={previewMode}
                    title={boardTitle}
                    prompt={boardPrompt}
                    pollQuestion={safeString(state?.data?.pollQuestion) ?? pollQuestion}
                    pollOptions={state?.data?.pollOptions ?? normalizeOptions(pollOptionsRaw)}
                    wordwallPrompt={boardWordwallPrompt}
                    compact
                  />
                </div>
              ) : null}
            </div>

            {showTimer ? (
              <div className="mt-3">
                <TimerBar
                  endsAt={state?.endsAt}
                  startedAt={state?.timerStartedAt}
                  totalSec={state?.timerTotalSec}
                  teacher
                  onStart={startTimer}
                  onClear={clearTimer}
                />
              </div>
            ) : null}
          </div>

          {err && <div className="mt-4 mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

          {tab === "poll" ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-12">
              {!present ? (
                <div className="space-y-4 lg:col-span-5">
                  <div className="rounded-xl border bg-background p-4 shadow-sm">
                    <div className="text-sm font-medium">{t("poll.setupTitle")}</div>
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("poll.questionLabel")}</label>
                        <input
                          value={pollQuestion}
                          onChange={(e) => {
                            dirtyRef.current.poll = true;
                            setPollQuestion(e.target.value);
                          }}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder={t("poll.questionPlaceholder")}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("poll.optionsLabel")}</label>
                        <textarea
                          value={pollOptionsRaw}
                          onChange={(e) => {
                            dirtyRef.current.poll = true;
                            setPollOptionsRaw(e.target.value);
                          }}
                          className="min-h-[110px] w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder={t("poll.optionsPlaceholder")}
                        />
                        <div className="mt-1 text-xs text-muted-foreground">{t("poll.optionsHint")}</div>
                      </div>

                      <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t("poll.anonymousHint")}</div>
                    </div>
                  </div>

                </div>
              ) : null}

              <div className={present ? "" : "lg:col-span-7"}>
                <div className={present ? "" : "rounded-xl border bg-background p-4 shadow-sm"}>
                  {present ? (
                    <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6">
                      <div className="text-sm font-medium uppercase tracking-wide text-emerald-300">{t("tabs.poll")}</div>
                      <div className="mt-2 text-3xl font-semibold leading-tight">{safeString(state?.data?.pollQuestion) ?? pollQuestion}</div>
                    </div>
                  ) : null}
                  <div className="mb-2 flex items-center justify-between">
                    <div className={present ? "text-base font-medium text-zinc-200" : "text-sm font-medium"}>{t("poll.resultsTitle")}</div>
                    <div className={present ? "text-sm text-zinc-400" : "text-sm text-muted-foreground"}>
                      {activeSessionId ? t("poll.responsesCount", { count: pollResponses.length }) : t("poll.noSession")}
                    </div>
                  </div>

                  {activeSessionId ? (
                    <div className="space-y-2">
                      {(state?.data?.pollOptions ?? normalizeOptions(pollOptionsRaw)).map((opt) => {
                        const count = pollCounts.get(opt) ?? 0;
                        const total = pollResponses.length || 1;
                        const pct = Math.round((count / total) * 100);
                        return (
                          <div key={opt} className={present ? "rounded-2xl border border-white/10 bg-white/5 p-4" : "rounded-lg border p-3"}>
                            <div className="flex items-center justify-between gap-2">
                              <div className={present ? "text-xl font-semibold" : "text-sm font-medium"}>{opt}</div>
                              <div className={present ? "text-lg tabular-nums text-zinc-300" : "text-sm tabular-nums text-muted-foreground"}>
                                {count} ({pct}%)
                              </div>
                            </div>
                            <div className={present ? "mt-3 h-4 w-full overflow-hidden rounded-full bg-white/10" : "mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"}>
                              <div className={present ? "h-full bg-emerald-400" : "h-full bg-black"} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">{t("poll.startHint")}</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "wordwall" ? (
            <div className={present ? "mt-4" : "mt-4 grid gap-4 xl:grid-cols-12"}>
              {!present ? (
                <div className="space-y-4 xl:col-span-4">
                  <div className="rounded-xl border bg-background p-5 shadow-sm">
                    <div className="mb-4">
                      <div className="text-sm font-semibold text-slate-950">{t("wordwall.setupTitle")}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-600">{t("wordwall.setupText")}</div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("wordwall.promptLabel")}</label>
                        <textarea
                          value={wordwallPrompt}
                          onChange={(e) => {
                            dirtyRef.current.wordwall = true;
                            setWordwallPrompt(e.target.value);
                          }}
                          className="min-h-[150px] w-full rounded-xl border px-3 py-2 text-sm leading-6"
                          placeholder={t("wordwall.promptPlaceholder")}
                        />
                      </div>

                      <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t("wordwall.anonymousHint")}</div>
                    </div>
                  </div>

                </div>
              ) : null}

              <div className={present ? "" : "xl:col-span-8"}>
                <div className={present ? "" : "overflow-hidden rounded-xl border bg-background shadow-sm"}>
                  {present ? (
                    <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6">
                      <div className="text-sm font-medium uppercase tracking-wide text-sky-300">{t("tabs.wordwall")}</div>
                      <div className="mt-2 text-3xl font-semibold leading-tight">{boardWordwallPrompt}</div>
                    </div>
                  ) : (
                    <div className="border-b bg-white px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-950">{t("wordwall.liveTitle")}</div>
                          <div className="mt-1 max-w-3xl text-lg font-semibold leading-7 text-slate-950">{boardWordwallPrompt}</div>
                        </div>
                        <div className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
                          {t("common.answers", { count: wordwallResponses.length })}
                        </div>
                      </div>
                    </div>
                  )}
                  {!activeSessionId ? (
                    <div className={present ? "text-sm text-muted-foreground" : "p-5 text-sm text-muted-foreground"}>{t("wordwall.noSession")}</div>
                  ) : wordwallItems.length === 0 ? (
                    <div className={present ? "text-sm text-muted-foreground" : "flex min-h-[360px] items-center justify-center p-5 text-center text-sm text-muted-foreground"}>{t("wordwall.noneYet")}</div>
                  ) : (
                    <div className={present ? "" : "max-h-[calc(100vh-300px)] min-h-[360px] overflow-auto bg-slate-50 p-6"}>
                      <div className={present ? "space-y-5" : "flex min-h-[300px] flex-wrap items-center justify-center gap-4"}>
                        {wordwallItems.map((item) => (
                          <div
                            key={item.key}
                            className={
                              present
                                ? "rounded-2xl border border-white/10 bg-white px-6 py-5 text-zinc-950 shadow-sm"
                                : "inline-flex items-center gap-2 rounded-2xl border bg-white px-5 py-4 text-slate-950 shadow-sm"
                            }
                          >
                            <div className={wordwallSizeClass(item.count, present)}>{item.word}</div>
                            {!present && item.count > 1 ? (
                              <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">x{item.count}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "question" ? (
            <div className={present ? "mt-4" : "mt-4 grid gap-4 lg:grid-cols-12"}>
              {!present ? (
                <div className="space-y-4 lg:col-span-5">
                  <div className="rounded-xl border bg-background p-4 shadow-sm">
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("fields.title.label")}</label>
                        <input
                          value={title}
                          onChange={(e) => {
                            dirtyRef.current.title = true;
                            setTitle(e.target.value);
                          }}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder={t("fields.title.placeholder")}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("fields.prompt.label")}</label>
                        <textarea
                          value={prompt}
                          onChange={(e) => {
                            dirtyRef.current.prompt = true;
                            setPrompt(e.target.value);
                          }}
                          className="min-h-[160px] w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder={t("fields.prompt.placeholder")}
                        />
                      </div>

                      <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t("control.contentHint")}</div>
                    </div>
                  </div>

                </div>
              ) : null}

              <div className={present ? "" : "lg:col-span-7"}>
                <div className={present ? "" : "rounded-xl border bg-background p-4 shadow-sm"}>
                  {present ? (
                    <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6">
                      <div className="text-sm font-medium uppercase tracking-wide text-amber-300">{boardTitle}</div>
                      <div className="mt-2 whitespace-pre-wrap text-3xl font-semibold leading-tight">{boardPrompt}</div>
                    </div>
                  ) : null}
                  {!activeSessionId ? (
                    <div className="text-sm text-muted-foreground">{t("responses.noSession")}</div>
                  ) : textResponses.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t("responses.noneYet")}</div>
                  ) : (
                    <div className={present ? "" : "lg:max-h-[calc(100vh-360px)] lg:overflow-auto"}>
                      <div className={responseGridClass}>
                        {textResponses.map((r) => {
                          const name = safeString(r.data.displayName) ?? safeString(r.data.groupName) ?? t("responses.unknown");
                          const text = safeString(r.data.text) ?? "";
                          const chosen = isNoteColor(r.data.noteColor) ? r.data.noteColor : null;
                          const accent = chosen ? accentFromNoteColor(chosen) : pickStickyAccent(r.id);

                          return (
                            <div key={r.id} className={[noteCardClass, accent].join(" ")}>
                              <div className="flex items-start justify-between gap-2">
                                <div className={noteNameClass}>{name}</div>
                                {!present ? <div className="text-[11px] text-muted-foreground">{r.id.slice(-8)}</div> : null}
                              </div>
                              <div className={noteTextClass}>{text}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20">
          <div
            className={[
              "flex w-full flex-col gap-3 border-t p-3 shadow-2xl backdrop-blur md:flex-row md:items-center md:justify-between md:px-6",
              present ? "border-white/10 bg-zinc-900/95 text-zinc-50" : "border-slate-200 bg-white/95 text-slate-950",
            ].join(" ")}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div
                className={[
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
                  active ? "bg-emerald-600 text-white" : present ? "bg-white/10 text-zinc-200" : "bg-slate-100 text-slate-700",
                ].join(" ")}
              >
                <span className={["h-2.5 w-2.5 rounded-full", active ? "bg-white" : "bg-slate-400"].join(" ")} />
                {active ? t("status.live") : t("status.notLive")}
              </div>

              <div className="min-w-0">
                <div className={present ? "text-xs font-medium uppercase tracking-wide text-zinc-400" : "text-xs font-medium uppercase tracking-wide text-slate-500"}>
                  {t("control.title")}
                </div>
                <div className="truncate text-sm font-medium">
                  {tabLabel} · {t("common.answers", { count: responseCount })}
                </div>
              </div>

              {answersHidden ? (
                <div className={present ? "rounded-full bg-amber-400/15 px-3 py-1.5 text-xs font-semibold text-amber-200" : "rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800"}>
                  {t("control.answersHidden")}
                </div>
              ) : null}
            </div>

            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
              {!active ? (
                <button
                  onClick={newRoundAction}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  {t("actions.startLive")}
                </button>
              ) : (
                <button
                  onClick={stopLive}
                  className={present ? "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10" : "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"}
                >
                  <Square className="h-4 w-4" aria-hidden="true" />
                  {t("actions.stop")}
                </button>
              )}

              <button
                onClick={liveAction}
                className={present ? "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45" : "inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {t("actions.updateBoard")}
              </button>

              <button
                onClick={newRoundAction}
                className={present ? "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45" : "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {t("actions.newRound")}
              </button>

              <button
                onClick={answersHidden ? showAnswersAgain : clearAnswersSoft}
                disabled={!activeSessionId}
                className={present ? "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45" : "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"}
              >
                {answersHidden ? <Users className="h-4 w-4" aria-hidden="true" /> : <PauseCircle className="h-4 w-4" aria-hidden="true" />}
                {answersHidden ? t("actions.showAnswers") : t("actions.clearAnswers")}
              </button>

              <button
                onClick={toggleTimerVisibility}
                className={present ? "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10" : "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"}
                title={t("timer.toggleTitle")}
              >
                <Clock className="h-4 w-4" aria-hidden="true" />
                {showTimer ? t("actions.hideTimer") : t("actions.showTimer")}
              </button>

              <Link
                href={displayHref}
                target="_blank"
                rel="noreferrer"
                className={present ? "inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200" : "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {t("actions.display")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1.5 text-sm font-medium",
        active ? "border-black bg-black text-white" : "bg-background hover:bg-muted",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function StudentScreenPreview({
  active,
  mode,
  title,
  prompt,
  pollQuestion,
  pollOptions,
  wordwallPrompt,
  compact = false,
}: {
  active: boolean;
  mode: BoardMode;
  title: string;
  prompt: string;
  pollQuestion: string;
  pollOptions: string[];
  wordwallPrompt: string;
  compact?: boolean;
}) {
  const t = useTranslations("teacherBoard");

  return (
    <div className={compact ? "rounded-xl border bg-background p-2 text-left shadow-sm" : "rounded-xl border bg-background p-4 shadow-sm"}>
      <div className="overflow-hidden rounded-xl border bg-slate-950 text-white shadow-inner">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <div className="truncate text-[11px] font-semibold text-zinc-200">{t("studentPreview.title")}</div>
          </div>
          <div className={active ? "rounded-full bg-emerald-400/15 px-2 py-1 text-[11px] font-semibold text-emerald-200" : "rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-zinc-300"}>
            {active ? t("studentPreview.live") : t("studentPreview.notLive")}
          </div>
        </div>

        <div className={compact ? "min-h-[116px] p-3" : "min-h-[210px] p-4"}>
          {!active ? (
            <div className={compact ? "flex min-h-[92px] items-center gap-3" : "flex min-h-[178px] flex-col items-center justify-center text-center"}>
              <MonitorUp className={compact ? "h-6 w-6 shrink-0 text-zinc-400" : "h-8 w-8 text-zinc-400"} aria-hidden="true" />
              <div className={compact ? "min-w-0" : ""}>
                <div className={compact ? "truncate text-sm font-semibold" : "mt-4 text-base font-semibold"}>{t("studentPreview.waitingTitle")}</div>
                <div className={compact ? "mt-1 line-clamp-2 text-xs leading-5 text-zinc-400" : "mt-2 max-w-[260px] text-xs leading-5 text-zinc-400"}>{t("studentPreview.waitingText")}</div>
              </div>
            </div>
          ) : mode === "poll" ? (
            <div>
              <div className={compact ? "line-clamp-2 text-sm font-semibold leading-snug" : "text-base font-semibold leading-snug"}>{pollQuestion}</div>
              <div className={compact ? "mt-3 grid gap-1.5" : "mt-4 grid gap-2"}>
                {pollOptions.slice(0, compact ? 3 : 4).map((opt) => (
                  <div key={opt} className={compact ? "truncate rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs" : "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"}>
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          ) : mode === "wordwall" ? (
            <div>
              <div className={compact ? "line-clamp-2 text-sm font-semibold leading-snug" : "text-base font-semibold leading-snug"}>{wordwallPrompt}</div>
              <div className={compact ? "mt-3 truncate rounded-md border border-white/15 bg-white px-2 py-1.5 text-xs text-slate-400" : "mt-5 rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-400"}>{t("studentPreview.wordPlaceholder")}</div>
              <div className={compact ? "mt-2 inline-flex rounded-md bg-emerald-500 px-2 py-1.5 text-xs font-medium text-white" : "mt-4 inline-flex rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white"}>{t("studentPreview.sendWord")}</div>
            </div>
          ) : (
            <div>
              <div className={compact ? "truncate text-sm font-semibold leading-snug" : "text-base font-semibold leading-snug"}>{title}</div>
              <div className={compact ? "mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-zinc-300" : "mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300"}>{prompt}</div>
              <div className={compact ? "mt-3 truncate rounded-md border border-white/15 bg-white px-2 py-1.5 text-xs text-slate-400" : "mt-5 rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-400"}>{t("studentPreview.textPlaceholder")}</div>
              <div className={compact ? "mt-2 inline-flex rounded-md bg-emerald-500 px-2 py-1.5 text-xs font-medium text-white" : "mt-4 inline-flex rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white"}>{t("studentPreview.sendText")}</div>
            </div>
          )}
        </div>
      </div>

      {!compact ? <div className="mt-2 text-xs text-muted-foreground">{t("studentPreview.hint")}</div> : null}
    </div>
  );
}

function TimerBar({
  endsAt,
  startedAt,
  totalSec,
  teacher,
  onStart,
  onClear,
}: {
  endsAt: unknown;
  startedAt: unknown;
  totalSec: unknown;
  teacher?: boolean;
  onStart?: (seconds: number) => void;
  onClear?: () => void;
}) {
  const t = useTranslations("teacherBoard");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tmr = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(tmr);
  }, []);

  const endsAtMs = typeof endsAt === "number" ? endsAt : null;
  const startedAtMs = typeof startedAt === "number" ? startedAt : null;
  const total = typeof totalSec === "number" && totalSec > 0 ? totalSec : null;

  const remainingMs = endsAtMs ? Math.max(0, endsAtMs - now) : 0;
  const secondsLeft = endsAtMs ? Math.ceil(remainingMs / 1000) : 0;

  let pct: number | null = null;
  if (endsAtMs && startedAtMs && total) {
    const elapsed = Math.max(0, now - startedAtMs);
    const totalMs = total * 1000;
    pct = Math.max(0, Math.min(100, (elapsed / totalMs) * 100));
  }

  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{t("timer.title")}</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums">{endsAtMs ? `${secondsLeft}s` : "—"}</div>
        </div>

        {teacher ? (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => onStart?.(30)} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
              30s
            </button>
            <button onClick={() => onStart?.(60)} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
              60s
            </button>
            <button onClick={() => onStart?.(120)} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
              120s
            </button>
            <button onClick={() => onClear?.()} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
              {t("timer.stop")}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        {endsAtMs ? <div className="h-full bg-black transition-[width]" style={{ width: `${pct ?? 0}%` }} /> : <div className="h-full w-0" />}
      </div>
    </div>
  );
}
