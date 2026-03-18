// app/[locale]/(app)/student/spaces/[spaceId]/board/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp, type Firestore } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale, useTranslations } from "next-intl";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

type BoardMode = "text" | "poll" | "wordwall";
type NoteColor = "amber" | "emerald" | "sky" | "rose" | "violet";
type TabKey = "question" | "notes" | "poll" | "wordwall";

type BoardState = {
  active?: boolean;
  sessionId?: string;
  mode?: BoardMode | string;

  endsAt?: number | null;
  timerStartedAt?: number | null;
  timerTotalSec?: number | null;

  clearedAt?: number | null;

  data?: {
    // text mode
    title?: string;
    prompt?: string;

    // poll mode
    pollQuestion?: string;
    pollOptions?: string[];

    // wordwall mode
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

function colorLabel(c: NoteColor) {
  switch (c) {
    case "amber":
      return "Gul";
    case "emerald":
      return "Grønn";
    case "sky":
      return "Blå";
    case "rose":
      return "Rosa";
    case "violet":
      return "Lilla";
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
  const t = useTranslations("student.board");
  const locale = useLocale();

  const params = useParams<{ spaceId: string }>();
  const spaceId = params?.spaceId;

  const [user, setUser] = useState<User | null>(null);
  const profile = useUserProfile() as UserProfileLike | null;

  const [state, setState] = useState<BoardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>("question");

  const [groupName, setGroupName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("boardGroupName") ?? "";
  });

  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);

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
    if (typeof window !== "undefined") localStorage.setItem("boardNoteColor", noteColor);
  }, [noteColor]);

  const active = state?.active === true;
  const sessionId = safeString(state?.sessionId);
  const uid = user?.uid ?? null;

  const mode: BoardMode =
    state?.mode === "poll" ? "poll" : state?.mode === "wordwall" ? "wordwall" : "text";

  useEffect(() => {
    setSent(null);
    setText("");
    setPollChoice("");
    setWordwallWord("");
  }, [sessionId]);

  useEffect(() => {
    if (!active) return;
    if (mode === "poll") setTab("poll");
    else if (mode === "wordwall") setTab("wordwall");
    else setTab("question");
  }, [active, mode]);

  const displayNameForPreview =
    safeString(profile?.displayName) ||
    safeString(user?.displayName) ||
    safeString(groupName) ||
    t("fallbackStudentName");

  async function sendText() {
    if (!spaceId || !sessionId || !uid) return;

    const responseId = `${sessionId}_${uid}`;
    const ref = doc(dbx, "spaces", spaceId, "boardResponses", responseId);

    await setDoc(
      ref,
      {
        sessionId,
        uid,
        displayName: displayNameForPreview,
        groupName: safeString(groupName),
        text: safeString(text) ?? "",
        noteColor,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    setSent(t("sent"));
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

    setSent("Takk! Stemmen din er sendt.");
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

    setSent("Takk! Ordet ditt er sendt.");
    setWordwallWord("");
  }

  const title = safeString(state?.data?.title) ?? t("fallbackQuestionTitle");
  const prompt = safeString(state?.data?.prompt) ?? "";

  const pollQuestion = safeString(state?.data?.pollQuestion) ?? "Hva mener du?";
  const pollOptions = normalizeOptions(state?.data?.pollOptions);

  const wordwallPrompt = safeString(state?.data?.wordwallPrompt) ?? "Skriv ett ord.";

  const liveBadgeText = loading
    ? t("loading")
    : active
      ? `LIVE${sessionId ? ` • session: ${sessionId.slice(0, 8)}…` : ""} • mode: ${mode}`
      : "Ikke live";

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
              <TabButton active={tab === "wordwall"} onClick={() => setTab("wordwall")}>
                Wordwall
              </TabButton>
            </div>

            {typeof state?.endsAt === "number" ? (
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

          <div className="mt-4 rounded-xl border bg-background p-4 shadow-sm">
            {loading ? (
              <div className="text-sm text-muted-foreground">{t("loading")}</div>
            ) : !active ? (
              <div className="text-sm text-muted-foreground">{t("inactive")}</div>
            ) : tab === "notes" ? (
              <StudentNotesPanel />
            ) : tab === "poll" ? (
              <>
                <div className="text-base font-semibold">{pollQuestion}</div>

                {pollOptions.length === 0 ? (
                  <div className="mt-2 text-sm text-muted-foreground">Ingen svaralternativer enda.</div>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {pollOptions.map((opt) => {
                      const selected = pollChoice === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => setPollChoice(opt)}
                          className={[
                            "rounded-lg border px-3 py-2 text-left text-sm",
                            selected ? "bg-black text-white border-black" : "hover:bg-muted",
                          ].join(" ")}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">{sent ?? ""}</div>
                  <button
                    onClick={sendPoll}
                    disabled={!safeString(pollChoice)}
                    className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Send stemme
                  </button>
                </div>

                <div className="mt-2 text-xs text-muted-foreground">
                  Stemmen din er anonym (vi lagrer ikke navn/uid).
                </div>
              </>
            ) : tab === "wordwall" ? (
              <>
                <div className="text-base font-semibold">{wordwallPrompt}</div>

                <div className="mt-4">
                  <label className="mb-1 block text-sm font-medium">Ditt ord</label>
                  <input
                    value={wordwallWord}
                    onChange={(e) => setWordwallWord(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void sendWordwall();
                      }
                    }}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="Skriv ett ord eller et kort uttrykk"
                    maxLength={60}
                  />
                </div>

                <div className="mt-3 rounded-xl border bg-muted/40 p-4">
                  <div className="mb-2 text-sm font-medium">Forhåndsvisning</div>
                  <div className="text-2xl font-semibold leading-tight">
                    {safeString(normalizeWordwallWord(wordwallWord)) ?? "Ordet ditt vises her…"}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">{sent ?? ""}</div>
                  <button
                    onClick={sendWordwall}
                    disabled={!safeString(normalizeWordwallWord(wordwallWord))}
                    className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Send ord
                  </button>
                </div>

                <div className="mt-2 text-xs text-muted-foreground">
                  Wordwall er anonym. Vi lagrer bare ordet og ikke navn eller uid.
                </div>
              </>
            ) : (
              <>
                <div className="text-base font-semibold">{title}</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{prompt}</div>

                <div className="mt-4 grid gap-2">
                  <label className="text-sm font-medium">{t("groupName.label")}</label>
                  <input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder={t("groupName.placeholder")}
                  />
                </div>

                <div className="mt-4">
                  <div className="mb-2 text-sm font-medium">Sticky note-farge</div>
                  <div className="flex flex-wrap gap-2">
                    {(["amber", "emerald", "sky", "rose", "violet"] as NoteColor[]).map((c) => {
                      const activeC = noteColor === c;
                      return (
                        <button
                          key={c}
                          onClick={() => setNoteColor(c)}
                          className={[
                            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                            activeC ? "border-black" : "hover:bg-muted",
                          ].join(" ")}
                          title={colorLabel(c)}
                        >
                          <span className={["h-3 w-3 rounded-full", colorSwatchClass(c)].join(" ")} />
                          {colorLabel(c)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-1 block text-sm font-medium">{t("answer.label")}</label>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="min-h-[140px] w-full rounded-lg border px-3 py-2 text-sm"
                        placeholder={t("answer.placeholder")}
                      />

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="text-sm text-muted-foreground">{sent ?? ""}</div>
                        <button
                          onClick={sendText}
                          disabled={!uid || !sessionId || !safeString(text)}
                          className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {t("answer.send")}
                        </button>
                      </div>
                    </div>

                    <div className="md:pt-[2px]">
                      <div className="mb-2 text-sm font-medium">Forhåndsvisning</div>

                      <div className={["rounded-2xl border p-4 shadow-sm", noteAccentClass(noteColor)].join(" ")}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold">{displayNameForPreview}</div>
                          <div className="text-[11px] text-muted-foreground">sticky</div>
                        </div>

                        <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                          {safeString(text) ?? "Skriv et svar for å se lappen…"}
                        </div>

                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className={["h-2.5 w-2.5 rounded-full", colorSwatchClass(noteColor)].join(" ")} />
                          <span>{colorLabel(noteColor)}</span>
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-muted-foreground">
                        Dette er slik lappen vises i lærerens tavle.
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AuthGate>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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

function StudentNotesPanel() {
  const [text, setText] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("studentBoardNotes") ?? "";
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("studentBoardNotes", text);
  }, [text]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Notatblokk (lokal)</div>
        <button
          onClick={() => setText("")}
          className="rounded-md border px-2.5 py-1.5 text-xs font-medium"
          title="Viskelær / tøm"
        >
          Viskelær
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[260px] w-full rounded-lg border px-3 py-2 text-sm"
        placeholder="Skriv notater her… (lagres bare på denne enheten)"
      />

      <div className="mt-2 text-xs text-muted-foreground">Bare for deg – ingen andre ser dette.</div>
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

function TimerBarStudent({
  endsAt,
  startedAt,
  totalSec,
}: {
  endsAt: unknown;
  startedAt: unknown;
  totalSec: unknown;
}) {
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
          <div className="text-xs font-medium text-muted-foreground">Timer</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums">{secondsLeft}s</div>
        </div>
        <div className="text-xs text-muted-foreground">Teller ned…</div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-black transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}