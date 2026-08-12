"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type WordwallWord = { word: string; count: number };
type WordwallParticipant = { id: string; displayName: string };
type WordwallSession = {
  id: string;
  code: string;
  status: "lobby" | "active" | "finished";
  prompt: string;
  motion: "calm" | "alive" | "energy";
  timerSeconds: number | null;
  endsAt: number | null;
  words: WordwallWord[];
  total: number;
  participantCount: number;
  participants: WordwallParticipant[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeSession(value: unknown): WordwallSession | null {
  if (!isRecord(value) || !isRecord(value.session)) return null;
  const session = value.session;
  return {
    id: safeString(session.id),
    code: safeString(session.code),
    status: session.status === "finished" ? "finished" : session.status === "active" ? "active" : "lobby",
    prompt: safeString(session.prompt, "Skriv ett ord som passer."),
    motion: session.motion === "calm" || session.motion === "energy" ? session.motion : "alive",
    timerSeconds: typeof session.timerSeconds === "number" && session.timerSeconds > 0 ? session.timerSeconds : null,
    endsAt: typeof session.endsAt === "number" && session.endsAt > 0 ? session.endsAt : null,
    words: Array.isArray(session.words)
      ? session.words.filter(isRecord).map((word) => ({
        word: safeString(word.word),
        count: typeof word.count === "number" ? word.count : 1,
      })).filter((word) => word.word)
      : [],
    total: typeof session.total === "number" ? session.total : 0,
    participantCount: typeof session.participantCount === "number" ? session.participantCount : 0,
    participants: Array.isArray(session.participants)
      ? session.participants.filter(isRecord).map((participant) => ({
        id: safeString(participant.id),
        displayName: safeString(participant.displayName, "Deltaker"),
      })).filter((participant) => participant.id)
      : [],
  };
}

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function PublicWordwallPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const storageKey = `wordwallParticipant:${sessionId}`;
  const nameStorageKey = "wordwallDisplayName";
  const [session, setSession] = useState<WordwallSession | null>(null);
  const [participantId, setParticipantId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nameSent, setNameSent] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [word, setWord] = useState("");
  const [sentWords, setSentWords] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch(`/api/wordwall-sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      setError(isRecord(data) && typeof data.error === "string" ? data.error : "Fant ikke ordskyen.");
      return;
    }
    setSession(normalizeSession(data));
  }, [sessionId]);

  useEffect(() => {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) {
      setParticipantId(existing);
      return;
    }
    const next = crypto.randomUUID();
    window.localStorage.setItem(storageKey, next);
    setParticipantId(next);
  }, [storageKey]);

  useEffect(() => {
    setDisplayName(window.localStorage.getItem(nameStorageKey) || "");
  }, [nameStorageKey]);

  const joinWithName = useCallback(async (showMessage = true) => {
    const name = displayName.trim().replace(/\s+/g, " ").slice(0, 32);
    if (!participantId || !name) return;
    setJoinBusy(true);
    setError("");
    try {
      window.localStorage.setItem(nameStorageKey, name);
      const res = await fetch(`/api/wordwall-sessions/${encodeURIComponent(sessionId)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, displayName: name }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kunne ikke sende navnet.");
      setNameSent(true);
      if (showMessage) setMessage("Navnet ditt vises på storskjermen. Du er klar.");
      await load();
    } catch (event) {
      setError(event instanceof Error ? event.message : "Kunne ikke sende navnet.");
    } finally {
      setJoinBusy(false);
    }
  }, [displayName, load, nameStorageKey, participantId, sessionId]);

  useEffect(() => {
    if (!participantId || !nameSent) return;
    const timer = window.setInterval(() => void joinWithName(false), 10000);
    return () => window.clearInterval(timer);
  }, [joinWithName, nameSent, participantId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1600);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const previewWords = useMemo(() => session?.words.slice(0, 8) ?? [], [session?.words]);
  const hasTimer = typeof session?.endsAt === "number";
  const remaining = hasTimer ? Math.max(0, Math.ceil(((session?.endsAt ?? 0) - now) / 1000)) : null;
  const timeIsUp = hasTimer && remaining === 0;

  async function submit() {
    const clean = word.trim();
    if (!clean || !participantId || timeIsUp || session?.status !== "active") return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/wordwall-sessions/${encodeURIComponent(sessionId)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: clean, participantId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kunne ikke sende ordet.");
      setSentWords((words) => [clean, ...words].slice(0, 8));
      setWord("");
      setMessage("Ordet er sendt.");
      await load();
    } catch (event) {
      setError(event instanceof Error ? event.message : "Kunne ikke sende ordet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-sky-50 px-4 py-6 text-slate-950">
      <div className="mx-auto max-w-2xl space-y-4">
        <section className="rounded-[2rem] border border-sky-100 bg-white p-6 shadow-sm">
          <div className="text-sm font-black uppercase tracking-[0.2em] text-sky-700">321school live</div>
          <h1 className="mt-3 text-3xl font-black leading-tight">{session?.prompt ?? "Ordsky"}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">Skriv ett ord eller en kort frase. Ordskyen er anonym.</p>
          {session?.status === "lobby" ? (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-black text-sky-900">
              Du er med. Vent til læreren starter ordskyen.
            </div>
          ) : null}
          {hasTimer ? (
            <div className={["mt-4 rounded-2xl border px-4 py-3 text-sm font-black", timeIsUp ? "border-rose-200 bg-rose-50 text-rose-700" : "border-sky-200 bg-sky-50 text-sky-900"].join(" ")}>
              {timeIsUp ? "Tiden er ute." : `Tid igjen: ${formatRemaining(remaining ?? 0)}`}
            </div>
          ) : null}
        </section>

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}

        {session?.status === "lobby" ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <label className="text-sm font-black text-slate-700">Navnet ditt på skjermen</label>
            <input
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value.slice(0, 32));
                setNameSent(false);
                setMessage("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void joinWithName();
              }}
              className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-4 text-xl font-black outline-none focus:border-sky-500"
              placeholder="Skriv fornavn..."
              maxLength={32}
              autoFocus
            />
            <button
              type="button"
              onClick={() => void joinWithName()}
              disabled={joinBusy || !displayName.trim()}
              className="mt-4 w-full rounded-2xl bg-emerald-700 px-5 py-4 text-base font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {joinBusy ? "Sender..." : "Jeg er klar"}
            </button>
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
              <div className="text-2xl font-black text-emerald-900">{displayName.trim() || "Klar"}</div>
              <p className="mt-1 text-sm font-semibold text-emerald-800">
                {nameSent ? "Du er klar. Vent til læreren starter." : "Trykk Jeg er klar for å vise navnet ditt."}
              </p>
            </div>
          </section>
        ) : (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <label className="text-sm font-black text-slate-700">Ditt ord</label>
          <input
            value={word}
            onChange={(event) => setWord(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-4 text-2xl font-black outline-none focus:border-sky-500"
            placeholder="Skriv her..."
            maxLength={42}
            autoFocus
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !word.trim() || session?.status !== "active" || timeIsUp}
            className="mt-4 w-full rounded-2xl bg-sky-700 px-5 py-4 text-base font-black text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            Send ord
          </button>
        </section>
        )}

        {sentWords.length ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-black text-slate-700">Dine sendte ord</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {sentWords.map((item, index) => (
                <span key={`${item}-${index}`} className="rounded-full bg-sky-100 px-3 py-1.5 text-sm font-black text-sky-900">{item}</span>
              ))}
            </div>
          </section>
        ) : null}

        {previewWords.length ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-black text-slate-700">Ord som vokser nå</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {previewWords.map((item) => (
                <span key={item.word} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-black text-slate-700">{item.word} {item.count > 1 ? `×${item.count}` : ""}</span>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
