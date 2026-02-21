// app/[locale]/(app)/teacher/spaces/[spaceId]/board/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { useTranslations } from "next-intl";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

type BoardMode = "text";

type BoardState = {
  active?: boolean;
  sessionId?: string;
  mode?: BoardMode | string;

  // vi bruker numbers (ms) for enkel nedtelling/filtrering
  endsAt?: number | null;
  clearedAt?: number | null;

  data?: {
    title?: string;
    prompt?: string;
  };
  updatedAt?: unknown;
};

type BoardResponse = {
  sessionId?: string;
  uid?: string | null;
  displayName?: string | null;
  groupName?: string | null;
  text?: string;
  createdAt?: unknown;
};

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function newSessionId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toMillis(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // Firestore Timestamp has toMillis()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maybe = v as any;
  if (maybe && typeof maybe.toMillis === "function") return maybe.toMillis();
  return null;
}

export default function TeacherBoardPage() {
  const t = useTranslations("teacherBoard");

  const params = useParams<{ spaceId: string }>();
  const spaceId = params?.spaceId;

  const [state, setState] = useState<BoardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState<string>(() => t("defaults.title"));
  const [prompt, setPrompt] = useState<string>(() => t("defaults.prompt"));

  const [responses, setResponses] = useState<Array<{ id: string; data: BoardResponse }>>([]);

  const dbx = useMemo(() => requireDb(db), []);
  const stateRef = useMemo(
    () => (spaceId ? doc(dbx, "spaces", spaceId, "board", "state") : null),
    [dbx, spaceId]
  );
  const responsesCol = useMemo(
    () => (spaceId ? collection(dbx, "spaces", spaceId, "boardResponses") : null),
    [dbx, spaceId]
  );

  // Unngå å overskrive input hvis læreren har begynt å skrive
  const dirtyRef = useRef({ title: false, prompt: false });

  // Hvis locale byttes og feltene ikke er "dirty", oppdater default tekst
  useEffect(() => {
    if (!dirtyRef.current.title) setTitle(t("defaults.title"));
    if (!dirtyRef.current.prompt) setPrompt(t("defaults.prompt"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

        // Prefill editor fra state, men bare hvis feltet ikke er "dirty"
        if (!dirtyRef.current.title && data?.data?.title) setTitle(data.data.title);
        if (!dirtyRef.current.prompt && data?.data?.prompt) setPrompt(data.data.prompt);
      },
      (e) => {
        setErr(e?.message ?? t("errors.fetchState"));
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
      () => {
        // ignorer stille her – state-feil er viktigst
      }
    );

    return () => unsub();
  }, [responsesCol]);

  const activeSessionId = safeString(state?.sessionId);
  const active = state?.active === true;
  const clearedAt = typeof state?.clearedAt === "number" ? state!.clearedAt : null;

  const filteredResponses = useMemo(() => {
    if (!activeSessionId) return [];

    const list = responses.filter((r) => r.data?.sessionId === activeSessionId);

    const withTime = list
      .map((r) => ({ ...r, _ms: toMillis(r.data?.createdAt) ?? 0 }))
      .filter((r) => (clearedAt ? r._ms >= clearedAt : true))
      .sort((a, b) => b._ms - a._ms);

    return withTime.map(({ _ms, ...rest }) => rest);
  }, [responses, activeSessionId, clearedAt]);

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
        clearedAt: null, // ny runde = vis alt i ny session
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
      { active: false, endsAt: null, updatedAt: serverTimestamp() },
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

  async function startTimer(seconds: number) {
    if (!stateRef) return;
    const endsAtMs = Date.now() + seconds * 1000;

    await setDoc(
      stateRef,
      { endsAt: endsAtMs, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  async function clearTimer() {
    if (!stateRef) return;
    await setDoc(stateRef, { endsAt: null, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function clearAnswersSoft() {
    if (!stateRef) return;
    // myk tømming: vi setter et tidspunkt; UI filtrerer bort eldre svar
    await setDoc(
      stateRef,
      { clearedAt: Date.now(), updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  async function showAnswersAgain() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      { clearedAt: null, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  return (
    <AuthGate>
      <div className="mx-auto max-w-5xl p-4">
        <div className="mb-4">
          <h1 className="text-xl font-semibold">{t("header.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("header.subtitle")}</p>
        </div>

        {err && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Controls */}
          <div className="rounded-xl border bg-background p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{t("status.label")}</div>
                <div className="text-sm text-muted-foreground">
                  {loading ? t("common.loading") : active ? t("status.live") : t("status.notLive")}
                  {activeSessionId ? ` • ${t("status.session")}: ${activeSessionId.slice(0, 8)}…` : ""}
                </div>
              </div>

              <div className="flex gap-2">
                {!active ? (
                  <button
                    onClick={startLiveNewSession}
                    className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white"
                  >
                    {t("actions.startLive")}
                  </button>
                ) : (
                  <button
                    onClick={stopLive}
                    className="rounded-lg border px-3 py-2 text-sm font-medium"
                  >
                    {t("actions.stop")}
                  </button>
                )}
              </div>
            </div>

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
                  className="min-h-[120px] w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder={t("fields.prompt.placeholder")}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={pushTextSameSession}
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                >
                  {t("actions.updateBoard")}
                </button>

                <button
                  onClick={startLiveNewSession}
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                >
                  {t("actions.newRound")}
                </button>

                <button
                  onClick={clearAnswersSoft}
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                >
                  {t("actions.clearAnswers")}
                </button>

                <button
                  onClick={showAnswersAgain}
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                >
                  {t("actions.showAnswers")}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => startTimer(60)}
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                >
                  {t("timer.set", { seconds: 60 })}
                </button>

                <button
                  onClick={() => startTimer(120)}
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                >
                  {t("timer.set", { seconds: 120 })}
                </button>

                <button
                  onClick={clearTimer}
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                >
                  {t("timer.clear")}
                </button>
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded-xl border bg-background p-4 shadow-sm">
            <div className="mb-2 text-sm font-medium">{t("preview.title")}</div>
            <div className="rounded-lg border p-3">
              <div className="text-base font-semibold">
                {safeString(state?.data?.title) ?? title}
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {safeString(state?.data?.prompt) ?? prompt}
              </div>

              <Countdown endsAt={state?.endsAt} label={t("countdown.label")} />
            </div>
          </div>
        </div>

        {/* Responses */}
        <div className="mt-4 rounded-xl border bg-background p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">{t("responses.title")}</div>
            <div className="text-sm text-muted-foreground">
              {activeSessionId ? t("responses.count", { count: filteredResponses.length }) : t("responses.hint")}
            </div>
          </div>

          {activeSessionId && clearedAt ? (
            <div className="mb-3 rounded-lg border bg-muted p-3 text-sm">
              {t("responses.clearedPrefix")}{" "}
              <span className="font-medium">{t("actions.showAnswers")}</span>{" "}
              {t("responses.clearedSuffix")}
            </div>
          ) : null}

          {!activeSessionId ? (
            <div className="text-sm text-muted-foreground">{t("responses.noSession")}</div>
          ) : filteredResponses.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("responses.noneYet")}</div>
          ) : (
            <div className="space-y-2">
              {filteredResponses.map((r) => (
                <div key={r.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      {safeString(r.data.displayName) ??
                        safeString(r.data.groupName) ??
                        t("responses.unknown")}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.id.slice(-8)}</div>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-sm">
                    {safeString(r.data.text) ?? ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AuthGate>
  );
}

function Countdown({ endsAt, label }: { endsAt: unknown; label: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const endsAtMs = typeof endsAt === "number" ? endsAt : null;
  if (!endsAtMs) return null;

  const remaining = Math.max(0, endsAtMs - now);
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="mt-3 flex items-center justify-between rounded-lg bg-muted px-3 py-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="text-sm tabular-nums">{seconds}s</div>
    </div>
  );
}