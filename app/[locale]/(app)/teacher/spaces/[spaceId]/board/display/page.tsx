// app/[locale]/(app)/teacher/spaces/[spaceId]/board/display/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, type Firestore } from "firebase/firestore";
import { Clock, Maximize2, Minimize2, MonitorUp } from "lucide-react";
import { useTranslations } from "next-intl";

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

type BoardResponse = {
  sessionId?: string;
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
      return "bg-amber-100 border-amber-200 text-amber-950";
    case "emerald":
      return "bg-emerald-100 border-emerald-200 text-emerald-950";
    case "sky":
      return "bg-sky-100 border-sky-200 text-sky-950";
    case "rose":
      return "bg-rose-100 border-rose-200 text-rose-950";
    case "violet":
      return "bg-violet-100 border-violet-200 text-violet-950";
  }
}

function pickStickyAccent(seed: string) {
  const accents = [
    "bg-amber-100 border-amber-200 text-amber-950",
    "bg-emerald-100 border-emerald-200 text-emerald-950",
    "bg-sky-100 border-sky-200 text-sky-950",
    "bg-rose-100 border-rose-200 text-rose-950",
    "bg-violet-100 border-violet-200 text-violet-950",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return accents[h % accents.length];
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

function wordwallTextSize(count: number) {
  if (count >= 8) return "text-8xl";
  if (count >= 5) return "text-7xl";
  if (count >= 3) return "text-6xl";
  if (count >= 2) return "text-5xl";
  return "text-4xl";
}

export default function TeacherBoardDisplayPage() {
  const t = useTranslations("teacherBoard");
  const params = useParams<{ spaceId: string }>();
  const spaceId = params?.spaceId;

  const [state, setState] = useState<BoardState | null>(null);
  const [responses, setResponses] = useState<Array<{ id: string; data: BoardResponse }>>([]);
  const [loading, setLoading] = useState(true);
  const screenRef = useRef<HTMLElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const dbx = useMemo(() => requireDb(db), []);
  const stateRef = useMemo(() => (spaceId ? doc(dbx, "spaces", spaceId, "board", "state") : null), [dbx, spaceId]);
  const responsesCol = useMemo(() => (spaceId ? collection(dbx, "spaces", spaceId, "boardResponses") : null), [dbx, spaceId]);

  useEffect(() => {
    if (!stateRef) return;
    setLoading(true);
    return onSnapshot(
      stateRef,
      (snap) => {
        setState((snap.data() as BoardState | undefined) ?? null);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [stateRef]);

  useEffect(() => {
    if (!responsesCol) return;
    return onSnapshot(responsesCol, (snap) => {
      setResponses(snap.docs.map((d) => ({ id: d.id, data: d.data() as BoardResponse })));
    });
  }, [responsesCol]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    const el = screenRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      //
    }
  }

  const active = state?.active === true;
  const activeSessionId = safeString(state?.sessionId);
  const clearedAt = typeof state?.clearedAt === "number" ? state.clearedAt : null;
  const mode: BoardMode = state?.mode === "poll" ? "poll" : state?.mode === "wordwall" ? "wordwall" : "text";

  const filteredResponses = useMemo(() => {
    if (!activeSessionId) return [];
    return responses
      .filter((r) => r.data.sessionId === activeSessionId)
      .filter((r) => {
        if (!clearedAt) return true;
        return (toMillis(r.data.createdAt) ?? 0) >= clearedAt;
      })
      .sort((a, b) => (toMillis(b.data.createdAt) ?? 0) - (toMillis(a.data.createdAt) ?? 0));
  }, [activeSessionId, clearedAt, responses]);

  const textResponses = useMemo(() => filteredResponses.filter((r) => safeString(r.data.text)), [filteredResponses]);
  const pollResponses = useMemo(() => filteredResponses.filter((r) => safeString(r.data.pollChoice)), [filteredResponses]);
  const wordwallResponses = useMemo(() => filteredResponses.filter((r) => safeString(r.data.wordwallWord)), [filteredResponses]);

  const pollOptions = Array.isArray(state?.data?.pollOptions) ? state.data.pollOptions.filter((x) => safeString(x)) : [];
  const pollCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of pollResponses) {
      const choice = safeString(r.data.pollChoice);
      if (choice) counts.set(choice, (counts.get(choice) ?? 0) + 1);
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
      const latest = toMillis(r.data.createdAt) ?? 0;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if (latest > existing.latest) existing.latest = latest;
      } else {
        map.set(key, { key, word: displayWordwallWord(key), count: 1, latest });
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.count !== a.count ? b.count - a.count : b.latest - a.latest));
  }, [wordwallResponses]);

  const title = safeString(state?.data?.title) ?? t("defaults.title");
  const prompt = safeString(state?.data?.prompt) ?? "";
  const pollQuestion = safeString(state?.data?.pollQuestion) ?? t("defaults.pollQuestion");
  const wordwallPrompt = safeString(state?.data?.wordwallPrompt) ?? t("defaults.wordwallPrompt");
  const answersHidden = clearedAt !== null;

  return (
    <AuthGate>
      <main ref={screenRef} className="min-h-screen bg-zinc-950 text-white">
        <div className="flex min-h-screen flex-col px-8 py-8 md:px-14 md:py-10">
          <header className="flex items-start justify-between gap-6">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">{t("display.brand")}</div>
              <div className="mt-2 text-xl text-zinc-300">{active ? t("display.live") : t("display.waitingStatus")}</div>
            </div>
            <div className="flex items-start gap-3">
              {state?.timerVisible !== false ? (
                <DisplayTimer endsAt={state?.endsAt} startedAt={state?.timerStartedAt} totalSec={state?.timerTotalSec} />
              ) : null}
              <button
                onClick={toggleFullscreen}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                title={isFullscreen ? t("display.exitFullscreen") : t("display.fullscreen")}
              >
                {isFullscreen ? <Minimize2 className="h-5 w-5" aria-hidden="true" /> : <Maximize2 className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
          </header>

          <section className="flex flex-1 items-center py-10">
            {loading ? (
              <WaitingDisplay title={t("display.loading")} text={t("display.waitingText")} />
            ) : !active ? (
              <WaitingDisplay title={t("display.waitingTitle")} text={t("display.waitingText")} />
            ) : mode === "poll" ? (
              <PollDisplay
                question={pollQuestion}
                options={pollOptions}
                counts={pollCounts}
                total={pollResponses.length}
                answersHidden={answersHidden}
                hiddenText={t("display.previousAnswersHidden")}
                noOptionsText={t("display.noOptions")}
              />
            ) : mode === "wordwall" ? (
              <WordwallDisplay
                prompt={wordwallPrompt}
                items={wordwallItems}
                answersHidden={answersHidden}
                hiddenText={t("display.previousWordsHidden")}
                noWordsText={t("display.noWords")}
              />
            ) : (
              <TextDisplay
                title={title}
                prompt={prompt}
                responses={textResponses}
                answersHidden={answersHidden}
                hiddenText={t("display.previousAnswersHidden")}
                noResponsesText={t("display.noResponses")}
                unknownStudentText={t("display.unknownStudent")}
              />
            )}
          </section>
        </div>
      </main>
    </AuthGate>
  );
}

function WaitingDisplay({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10">
        <MonitorUp className="h-12 w-12 text-emerald-300" aria-hidden="true" />
      </div>
      <h1 className="mt-8 text-5xl font-semibold leading-tight md:text-7xl">{title}</h1>
      <p className="mt-6 text-2xl leading-relaxed text-zinc-300">{text}</p>
    </div>
  );
}

function TextDisplay({
  title,
  prompt,
  responses,
  answersHidden,
  hiddenText,
  noResponsesText,
  unknownStudentText,
}: {
  title: string;
  prompt: string;
  responses: Array<{ id: string; data: BoardResponse }>;
  answersHidden: boolean;
  hiddenText: string;
  noResponsesText: string;
  unknownStudentText: string;
}) {
  return (
    <div className="w-full">
      <div className="max-w-5xl">
        <div className="text-lg font-semibold uppercase tracking-[0.16em] text-amber-300">{title}</div>
        <h1 className="mt-4 whitespace-pre-wrap text-4xl font-semibold leading-tight md:text-6xl">{prompt}</h1>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {responses.length === 0 ? (
          <EmptyLiveState text={answersHidden ? hiddenText : noResponsesText} />
        ) : (
          responses.slice(0, 12).map((r) => {
            const name = safeString(r.data.displayName) ?? safeString(r.data.groupName) ?? unknownStudentText;
            const text = safeString(r.data.text) ?? "";
            const accent = isNoteColor(r.data.noteColor) ? accentFromNoteColor(r.data.noteColor) : pickStickyAccent(r.id);
            return (
              <div key={r.id} className={["rounded-3xl border p-6 shadow-sm", accent].join(" ")}>
                <div className="text-lg font-semibold">{name}</div>
                <div className="mt-4 whitespace-pre-wrap text-2xl leading-relaxed">{text}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PollDisplay({
  question,
  options,
  counts,
  total,
  answersHidden,
  hiddenText,
  noOptionsText,
}: {
  question: string;
  options: string[];
  counts: Map<string, number>;
  total: number;
  answersHidden: boolean;
  hiddenText: string;
  noOptionsText: string;
}) {
  return (
    <div className="w-full">
      <h1 className="max-w-6xl text-5xl font-semibold leading-tight md:text-7xl">{question}</h1>
      {answersHidden ? <div className="mt-6 inline-flex rounded-full bg-amber-400/15 px-5 py-2 text-xl font-semibold text-amber-200">{hiddenText}</div> : null}
      <div className="mt-12 grid gap-5">
        {options.length === 0 ? (
          <div className="text-3xl text-zinc-300">{noOptionsText}</div>
        ) : (
          options.map((opt) => {
            const count = counts.get(opt) ?? 0;
            const pct = Math.round((count / (total || 1)) * 100);
            return (
              <div key={opt} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-end justify-between gap-6">
                  <div className="text-3xl font-semibold md:text-4xl">{opt}</div>
                  <div className="text-3xl font-semibold tabular-nums text-emerald-300">
                    {count} · {pct}%
                  </div>
                </div>
                <div className="mt-5 h-6 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-400 transition-[width]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function WordwallDisplay({
  prompt,
  items,
  answersHidden,
  hiddenText,
  noWordsText,
}: {
  prompt: string;
  items: WordwallItem[];
  answersHidden: boolean;
  hiddenText: string;
  noWordsText: string;
}) {
  return (
    <div className="w-full">
      <h1 className="max-w-6xl text-5xl font-semibold leading-tight md:text-7xl">{prompt}</h1>
      {answersHidden ? <div className="mt-6 inline-flex rounded-full bg-amber-400/15 px-5 py-2 text-xl font-semibold text-amber-200">{hiddenText}</div> : null}
      <div className="mt-12 flex flex-wrap items-center gap-5">
        {items.length === 0 ? (
          <EmptyLiveState text={answersHidden ? hiddenText : noWordsText} />
        ) : (
          items.slice(0, 30).map((item) => (
            <div key={item.key} className="rounded-3xl bg-white px-7 py-5 text-zinc-950 shadow-sm">
              <span className={[wordwallTextSize(item.count), "font-bold leading-none"].join(" ")}>{item.word}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmptyLiveState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-2xl text-zinc-300">
      {text}
    </div>
  );
}

function DisplayTimer({
  endsAt,
  startedAt,
  totalSec,
}: {
  endsAt: unknown;
  startedAt: unknown;
  totalSec: unknown;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tmr = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(tmr);
  }, []);

  const endsAtMs = typeof endsAt === "number" ? endsAt : null;
  const startedAtMs = typeof startedAt === "number" ? startedAt : null;
  const total = typeof totalSec === "number" && totalSec > 0 ? totalSec : null;

  if (!endsAtMs) return null;

  const remainingMs = Math.max(0, endsAtMs - now);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const pct =
    startedAtMs && total
      ? Math.max(0, Math.min(100, ((now - startedAtMs) / (total * 1000)) * 100))
      : 0;

  return (
    <div className="min-w-[260px] rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-4">
        <Clock className="h-7 w-7 text-emerald-300" aria-hidden="true" />
        <div className="text-5xl font-semibold tabular-nums">{secondsLeft}s</div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-emerald-400 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
