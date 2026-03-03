"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, setDoc, serverTimestamp, type Firestore } from "firebase/firestore";
import { useLocale, useTranslations } from "next-intl";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

type BoardMode = "text" | "poll";
type NoteColor = "amber" | "emerald" | "sky" | "rose" | "violet";
type TabKey = "question" | "notes" | "poll";

type BoardState = {
  active?: boolean;
  sessionId?: string;
  mode?: BoardMode | string;

  // timer
  endsAt?: number | null;
  timerStartedAt?: number | null;
  timerTotalSec?: number | null;

  clearedAt?: number | null;

  // shared payload
  data?: {
    title?: string; // for text
    prompt?: string; // for text

    pollQuestion?: string;
    pollOptions?: string[];
  };
  updatedAt?: unknown;
};

type BoardResponse = {
  sessionId?: string;

  // text mode
  uid?: string | null;
  displayName?: string | null;
  groupName?: string | null;
  text?: string;
  noteColor?: NoteColor | string;

  // poll mode (anonymous)
  pollChoice?: string;

  createdAt?: unknown;
};

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function newSessionId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isTimestampLike(v: unknown): v is { toMillis: () => number } {
  return (
    !!v &&
    typeof v === "object" &&
    "toMillis" in v &&
    typeof (v as { toMillis?: unknown }).toMillis === "function"
  );
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

export default function TeacherBoardPage() {
  const t = useTranslations("teacherBoard");
  const locale = useLocale();

  const params = useParams<{ spaceId: string }>();
  const spaceId = params?.spaceId;

  const [state, setState] = useState<BoardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Tabs
  const [tab, setTab] = useState<TabKey>("question");

  // Fullscreen support
  const fsRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Presentation mode
  const [present, setPresent] = useState(false);

  // Timer UI toggle
  const [showTimer, setShowTimer] = useState(true);

  // Text editor
  const [title, setTitle] = useState<string>(() => t("defaults.title"));
  const [prompt, setPrompt] = useState<string>(() => t("defaults.prompt"));

  // Poll editor
  const [pollQuestion, setPollQuestion] = useState<string>("Hva mener du?");
  const [pollOptionsRaw, setPollOptionsRaw] = useState<string>("Ja, Nei, Vet ikke");

  const [responses, setResponses] = useState<Array<{ id: string; data: BoardResponse }>>([]);

  const dbx = useMemo(() => requireDb(db), []);
  const stateRef = useMemo(() => (spaceId ? doc(dbx, "spaces", spaceId, "board", "state") : null), [dbx, spaceId]);
  const responsesCol = useMemo(
    () => (spaceId ? collection(dbx, "spaces", spaceId, "boardResponses") : null),
    [dbx, spaceId]
  );

  // Don’t overwrite teacher edits if dirty
  const dirtyRef = useRef({ title: false, prompt: false, poll: false });

  useEffect(() => {
    if (!dirtyRef.current.title) setTitle(t("defaults.title"));
    if (!dirtyRef.current.prompt) setPrompt(t("defaults.prompt"));
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

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function toggleFullscreen() {
    const el = fsRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // ignore fullscreen errors
      }
  }

  const activeSessionId = safeString(state?.sessionId);
  const active = state?.active === true;
  const clearedAt = typeof state?.clearedAt === "number" ? state.clearedAt : null;
  const mode: BoardMode = (state?.mode === "poll" ? "poll" : "text") as BoardMode;

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

  const pollCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of pollResponses) {
      const c = safeString(r.data.pollChoice);
      if (!c) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return counts;
  }, [pollResponses]);

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
      { active: false, endsAt: null, timerStartedAt: null, timerTotalSec: null, updatedAt: serverTimestamp() },
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
        data: {
          pollQuestion: safeString(pollQuestion) ?? "Poll",
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
        clearedAt: null,
        data: {
          pollQuestion: safeString(pollQuestion) ?? "Poll",
          pollOptions: opts,
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

  const noteCardClass = present
    ? "rounded-2xl border p-6 shadow-sm transition-transform hover:-translate-y-0.5"
    : "rounded-xl border p-3 shadow-sm transition-transform hover:-translate-y-0.5";

  const noteNameClass = present ? "text-base font-semibold" : "text-sm font-semibold";
  const noteTextClass = present
    ? "mt-3 whitespace-pre-wrap text-lg leading-relaxed"
    : "mt-2 whitespace-pre-wrap text-sm leading-relaxed";

  const notesGridClass = present
    ? "grid gap-6 sm:grid-cols-2 xl:grid-cols-3"
    : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <AuthGate>
      <div ref={fsRef} className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-6xl p-4">
          {/* Header */}
          <div className="sticky top-0 z-10 -mx-4 border-b bg-background/80 px-4 py-3 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold">{t("header.title")}</h1>

                {!loading && (
                  <div className="mt-1 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
                    <span
                      className={[
                        "h-2 w-2 rounded-full",
                        active ? "bg-emerald-500" : "bg-muted-foreground/40",
                      ].join(" ")}
                    />
                    <span className="text-muted-foreground">
                      {active ? "LIVE" : "Ikke live"}
                      {activeSessionId ? ` • session: ${activeSessionId.slice(0, 8)}…` : ""}
                      {mode ? ` • mode: ${mode}` : ""}
                    </span>
                  </div>
                )}

                {/* Buttons row moved up */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!active ? (
                    <button onClick={startLiveNewSession} className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white">
                      {t("actions.startLive")}
                    </button>
                  ) : (
                    <button onClick={stopLive} className="rounded-lg border px-3 py-2 text-sm font-medium">
                      {t("actions.stop")}
                    </button>
                  )}

                  <button onClick={() => setPresent((v) => !v)} className="rounded-lg border px-3 py-2 text-sm font-medium">
                    {present ? "Vis kontrollpanel" : "Presentasjon"}
                  </button>

                  <button onClick={toggleFullscreen} className="rounded-lg border px-3 py-2 text-sm font-medium">
                    {isFullscreen ? "Avslutt fullskjerm" : "Fullskjerm"}
                  </button>

                  <button
                    onClick={() => setShowTimer((v) => !v)}
                    className="rounded-lg border px-3 py-2 text-sm font-medium"
                    title="Vis/skjul timerlinja"
                  >
                    {showTimer ? "Skjul timer" : "Vis timer"}
                  </button>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <LiveClock locale={locale} />
              </div>
            </div>

            {/* Tabs */}
            <div className="mt-3 flex flex-wrap gap-2">
              <TabButton active={tab === "question"} onClick={() => setTab("question")}>
                Dagens spørsmål
              </TabButton>
              <TabButton active={tab === "notes"} onClick={() => setTab("notes")}>
                Notatblokk
              </TabButton>
              <TabButton active={tab === "poll"} onClick={() => setTab("poll")}>
                Poll
              </TabButton>
            </div>

            {/* Timer bar under menu (toggleable) */}
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

          {err && (
            <div className="mt-4 mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
          )}

          {/* Content */}
          {tab === "notes" ? <TeacherNotesPanel /> : null}

          {tab === "poll" ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-12">
              {!present ? (
                <div className="lg:col-span-5 space-y-4">
                  <div className="rounded-xl border bg-background p-4 shadow-sm">
                    <div className="text-sm font-medium">Poll-oppsett</div>
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium">Spørsmål</label>
                        <input
                          value={pollQuestion}
                          onChange={(e) => {
                            dirtyRef.current.poll = true;
                            setPollQuestion(e.target.value);
                          }}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder="Skriv poll-spørsmål…"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">Svaralternativer</label>
                        <textarea
                          value={pollOptionsRaw}
                          onChange={(e) => {
                            dirtyRef.current.poll = true;
                            setPollOptionsRaw(e.target.value);
                          }}
                          className="min-h-[110px] w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder="Ja, Nei, Vet ikke … (komma eller linjeskift)"
                        />
                        <div className="mt-1 text-xs text-muted-foreground">
                          Tips: skriv med komma eller linjeskift. Maks 10 alternativer.
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button onClick={pushPollSameSession} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
                          Oppdater poll
                        </button>

                        <button onClick={startPollNewSession} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
                          Ny poll-runde
                        </button>

                        <button onClick={clearAnswersSoft} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
                          Tøm svar
                        </button>

                        <button onClick={showAnswersAgain} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
                          Vis svar
                        </button>
                      </div>

                      <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                        Poll-svar er anonyme: vi lagrer ikke navn/uid.
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-background p-4 shadow-sm">
                    <div className="text-sm font-medium">Forhåndsvisning</div>
                    <div className="mt-2 rounded-lg border p-3">
                      <div className="text-base font-semibold">{safeString(state?.data?.pollQuestion) ?? pollQuestion}</div>
                      <div className="mt-2 grid gap-2">
                        {(state?.data?.pollOptions ?? normalizeOptions(pollOptionsRaw)).map((opt) => (
                          <div key={opt} className="rounded-lg border px-3 py-2 text-sm">
                            {opt}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className={present ? "" : "lg:col-span-7"}>
                <div className={present ? "" : "rounded-xl border bg-background p-4 shadow-sm"}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-medium">Poll-resultater</div>
                    <div className="text-sm text-muted-foreground">{activeSessionId ? `${pollResponses.length} svar` : "Ingen aktiv session"}</div>
                  </div>

                  {activeSessionId ? (
                    <div className="space-y-2">
                      {(state?.data?.pollOptions ?? normalizeOptions(pollOptionsRaw)).map((opt) => {
                        const count = pollCounts.get(opt) ?? 0;
                        const total = pollResponses.length || 1;
                        const pct = Math.round((count / total) * 100);
                        return (
                          <div key={opt} className="rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium">{opt}</div>
                              <div className="text-sm tabular-nums text-muted-foreground">
                                {count} ({pct}%)
                              </div>
                            </div>
                            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div className="h-full bg-black" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Start en poll for å se resultater.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "question" ? (
            <div className={present ? "mt-4" : "mt-4 grid gap-4 lg:grid-cols-12"}>
              {!present ? (
                <div className="lg:col-span-5 space-y-4">
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

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button onClick={pushTextSameSession} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
                          {t("actions.updateBoard")}
                        </button>
                        <button onClick={startLiveNewSession} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
                          {t("actions.newRound")}
                        </button>
                        <button onClick={clearAnswersSoft} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
                          {t("actions.clearAnswers")}
                        </button>
                        <button onClick={showAnswersAgain} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
                          {t("actions.showAnswers")}
                        </button>
                      </div>

                      <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                        “Oppdater tavla” bruker samme runde. “Ny runde” lager ny session og nullstiller svar.
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-background p-4 shadow-sm">
                    <div className="mb-2 text-sm font-medium">{t("preview.title")}</div>
                    <div className="rounded-lg border p-3">
                      <div className="text-base font-semibold">{boardTitle}</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{boardPrompt}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className={present ? "" : "lg:col-span-7"}>
                <div className={present ? "" : "rounded-xl border bg-background p-4 shadow-sm"}>
                  {!activeSessionId ? (
                    <div className="text-sm text-muted-foreground">{t("responses.noSession")}</div>
                  ) : textResponses.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t("responses.noneYet")}</div>
                  ) : (
                    <div className={present ? "" : "lg:max-h-[calc(100vh-360px)] lg:overflow-auto"}>
                      <div className={notesGridClass}>
                        {textResponses.map((r) => {
                          const name =
                            safeString(r.data.displayName) ?? safeString(r.data.groupName) ?? t("responses.unknown");
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
        active ? "bg-black text-white border-black" : "bg-background hover:bg-muted",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function TeacherNotesPanel() {
  const [text, setText] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("teacherBoardNotes") ?? "";
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("teacherBoardNotes", text);
  }, [text]);

  return (
    <div className="mt-4 rounded-xl border bg-background p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Notatblokk (lokal)</div>
        <button onClick={() => setText("")} className="rounded-md border px-2.5 py-1.5 text-xs font-medium" title="Viskelær / tøm">
          Viskelær
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[260px] w-full rounded-lg border px-3 py-2 text-sm"
        placeholder="Skriv notater her… (lagres ikke i Firestore)"
      />
      <div className="mt-2 text-xs text-muted-foreground">Dette er bare for deg på denne maskinen (lokal lagring). Ingen elever ser dette.</div>
    </div>
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
          <div className="text-xs font-medium text-muted-foreground">Timer</div>
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
              Stopp
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