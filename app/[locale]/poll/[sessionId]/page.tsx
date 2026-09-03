"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type PollOption = { option: string; count: number };
type PollSession = {
  id: string;
  code: string;
  status: "ready" | "active" | "finished";
  question: string;
  options: PollOption[];
  timerSeconds: number | null;
  endsAt: number | null;
  total: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeSession(value: unknown): PollSession | null {
  if (!isRecord(value) || !isRecord(value.session)) return null;
  const session = value.session;
  return {
    id: safeString(session.id),
    code: safeString(session.code),
    status: session.status === "finished" ? "finished" : session.status === "ready" ? "ready" : "active",
    question: safeString(session.question, "Hva mener du?"),
    options: Array.isArray(session.options)
      ? session.options.filter(isRecord).map((item) => ({
        option: safeString(item.option),
        count: typeof item.count === "number" ? item.count : 0,
      })).filter((item) => item.option)
      : [],
    timerSeconds: typeof session.timerSeconds === "number" && session.timerSeconds > 0 ? session.timerSeconds : null,
    endsAt: typeof session.endsAt === "number" && session.endsAt > 0 ? session.endsAt : null,
    total: typeof session.total === "number" ? session.total : 0,
  };
}

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function PublicPollPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const storageKey = `pollParticipant:${sessionId}`;
  const voteKey = `pollVote:${sessionId}`;
  const [session, setSession] = useState<PollSession | null>(null);
  const [participantId, setParticipantId] = useState("");
  const [selected, setSelected] = useState("");
  const [savedChoice, setSavedChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch(`/api/poll-sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      setError(isRecord(data) && typeof data.error === "string" ? data.error : "Fant ikke avstemmingen.");
      return;
    }
    setSession(normalizeSession(data));
  }, [sessionId]);

  useEffect(() => {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) setParticipantId(existing);
    else {
      const next = crypto.randomUUID();
      window.localStorage.setItem(storageKey, next);
      setParticipantId(next);
    }
    const storedVote = window.localStorage.getItem(voteKey);
    if (storedVote) {
      setSelected(storedVote);
      setSavedChoice(storedVote);
    }
  }, [storageKey, voteKey]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1600);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const hasTimer = typeof session?.endsAt === "number";
  const pollIsReady = session?.status === "ready";
  const remaining = hasTimer ? Math.max(0, Math.ceil(((session?.endsAt ?? 0) - now) / 1000)) : null;
  const timeIsUp = hasTimer && remaining === 0;

  async function vote(choice: string) {
    if (!choice || !participantId || timeIsUp || pollIsReady) return;
    setSelected(choice);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/poll-sessions/${encodeURIComponent(sessionId)}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice, participantId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kunne ikke lagre stemmen.");
      window.localStorage.setItem(voteKey, choice);
      setSavedChoice(choice);
      setMessage("Stemmen er registrert.");
      await load();
    } catch (event) {
      setError(event instanceof Error ? event.message : "Kunne ikke lagre stemmen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-violet-50 px-4 py-6 text-slate-950">
      <div className="mx-auto max-w-2xl space-y-4">
        <section className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-sm">
          <div className="text-sm font-black uppercase tracking-[0.2em] text-violet-700">321school live</div>
          <h1 className="mt-3 text-3xl font-black leading-tight">{session?.question ?? "Avstemming"}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            {pollIsReady ? "Vent på at læreren starter avstemmingen." : "Velg ett alternativ. Du kan endre stemmen mens avstemmingen er åpen."}
          </p>
          {hasTimer ? (
            <div className={["mt-4 rounded-2xl border px-4 py-3 text-sm font-black", timeIsUp ? "border-rose-200 bg-rose-50 text-rose-700" : "border-violet-200 bg-violet-50 text-violet-900"].join(" ")}>
              {timeIsUp ? "Tiden er ute." : `Tid igjen: ${formatRemaining(remaining ?? 0)}`}
            </div>
          ) : null}
        </section>

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3">
            {(session?.options ?? []).map((item) => (
              <button
                key={item.option}
                type="button"
                onClick={() => void vote(item.option)}
                disabled={busy || session?.status === "finished" || timeIsUp || pollIsReady}
                className={["rounded-2xl border px-5 py-4 text-left text-lg font-black transition", selected === item.option ? "border-violet-600 bg-violet-100 text-violet-950" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50", "disabled:cursor-not-allowed disabled:opacity-60"].join(" ")}
              >
                {item.option}
              </button>
            ))}
          </div>
          {savedChoice ? <div className="mt-4 text-sm font-bold text-slate-600">Din stemme: {savedChoice}</div> : null}
        </section>
      </div>
    </main>
  );
}
