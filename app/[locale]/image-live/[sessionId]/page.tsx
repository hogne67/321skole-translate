"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type ImageSubmission = { id: string; text: string; displayName: string; createdAt: number };
type ImageParticipant = { id: string; displayName: string; updatedAt: number };
type ImageSession = {
  id: string;
  code: string;
  status: "lobby" | "active" | "finished";
  prompt: string;
  imageUrl: string;
  timerSeconds: number | null;
  endsAt: number | null;
  submissions: ImageSubmission[];
  total: number;
  participants: ImageParticipant[];
  participantCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeSession(value: unknown): ImageSession | null {
  if (!isRecord(value) || !isRecord(value.session)) return null;
  const session = value.session;
  return {
    id: safeString(session.id),
    code: safeString(session.code),
    status: session.status === "finished" ? "finished" : session.status === "active" ? "active" : "lobby",
    prompt: safeString(session.prompt, "Se på bildet og skriv hva du legger merke til."),
    imageUrl: safeString(session.imageUrl),
    timerSeconds: typeof session.timerSeconds === "number" && session.timerSeconds > 0 ? session.timerSeconds : null,
    endsAt: typeof session.endsAt === "number" && session.endsAt > 0 ? session.endsAt : null,
    submissions: Array.isArray(session.submissions)
      ? session.submissions.filter(isRecord).map((item) => ({
        id: safeString(item.id),
        text: safeString(item.text),
        displayName: safeString(item.displayName),
        createdAt: typeof item.createdAt === "number" ? item.createdAt : 0,
      })).filter((item) => item.text)
      : [],
    total: typeof session.total === "number" ? session.total : 0,
    participants: Array.isArray(session.participants)
      ? session.participants.filter(isRecord).map((item) => ({
        id: safeString(item.id),
        displayName: safeString(item.displayName),
        updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : 0,
      })).filter((item) => item.displayName)
      : [],
    participantCount: typeof session.participantCount === "number" ? session.participantCount : 0,
  };
}

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function PublicImageActivityPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const storageKey = `imageActivityParticipant:${sessionId}`;
  const nameStorageKey = "imageActivityDisplayName";
  const [session, setSession] = useState<ImageSession | null>(null);
  const [participantId, setParticipantId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nameSent, setNameSent] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [text, setText] = useState("");
  const [sentTexts, setSentTexts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch(`/api/image-sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      setError(isRecord(data) && typeof data.error === "string" ? data.error : "Fant ikke bildeaktiviteten.");
      return;
    }
    setSession(normalizeSession(data));
  }, [sessionId]);

  useEffect(() => {
    setDisplayName(window.localStorage.getItem(nameStorageKey) ?? "");
    const existing = window.localStorage.getItem(storageKey);
    if (existing) {
      setParticipantId(existing);
      return;
    }
    const next = crypto.randomUUID();
    window.localStorage.setItem(storageKey, next);
    setParticipantId(next);
  }, [nameStorageKey, storageKey]);

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
  const remaining = hasTimer ? Math.max(0, Math.ceil(((session?.endsAt ?? 0) - now) / 1000)) : null;
  const timeIsUp = hasTimer && remaining === 0;
  const latestResponses = useMemo(() => session?.submissions.slice(0, 5) ?? [], [session?.submissions]);
  const isLobby = session?.status === "lobby";

  const joinWithName = useCallback(async () => {
    if (!participantId) return;
    const cleanName = displayName.trim().slice(0, 32);
    if (cleanName) window.localStorage.setItem(nameStorageKey, cleanName);
    setJoinBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/image-sessions/${encodeURIComponent(sessionId)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, displayName: cleanName || "Klar" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kunne ikke melde deg på.");
      setNameSent(true);
      await load();
    } catch (event) {
      setError(event instanceof Error ? event.message : "Kunne ikke melde deg på.");
    } finally {
      setJoinBusy(false);
    }
  }, [displayName, load, nameStorageKey, participantId, sessionId]);

  useEffect(() => {
    if (!isLobby || !nameSent || !participantId) return;
    const timer = window.setInterval(() => void joinWithName(), 10000);
    return () => window.clearInterval(timer);
  }, [isLobby, joinWithName, nameSent, participantId]);

  async function submit() {
    const clean = text.trim();
    if (!clean || !participantId || timeIsUp) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/image-sessions/${encodeURIComponent(sessionId)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, participantId, displayName: displayName.trim().slice(0, 32) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kunne ikke sende svaret.");
      setSentTexts((items) => [clean, ...items].slice(0, 5));
      setText("");
      setMessage("Svaret er sendt.");
      await load();
    } catch (event) {
      setError(event instanceof Error ? event.message : "Kunne ikke sende svaret.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-emerald-50 px-4 py-6 text-slate-950">
      <div className="mx-auto max-w-2xl space-y-4">
        <section className="overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-sm">
          {session?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.imageUrl} alt="" className="aspect-video w-full object-cover" />
          ) : null}
          <div className="p-6">
            <div className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">321school live</div>
            <h1 className="mt-3 text-3xl font-black leading-tight">{session?.prompt ?? "Bildeaktivitet"}</h1>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              {isLobby ? "Skriv navnet ditt og trykk klar. Læreren starter når alle er med." : "Skriv et kort svar. Svarene vises anonymt på skjermen."}
            </p>
            {hasTimer ? (
              <div className={["mt-4 rounded-2xl border px-4 py-3 text-sm font-black", timeIsUp ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-900"].join(" ")}>
                {timeIsUp ? "Tiden er ute." : `Tid igjen: ${formatRemaining(remaining ?? 0)}`}
              </div>
            ) : null}
          </div>
        </section>

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}

        {isLobby ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <label className="text-sm font-black text-slate-700">Navn</label>
            <input
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setNameSent(false);
              }}
              className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-4 text-lg font-bold outline-none focus:border-emerald-500"
              placeholder="Skriv navnet ditt"
              maxLength={32}
              autoFocus
            />
            <button
              type="button"
              onClick={() => void joinWithName()}
              disabled={joinBusy || !participantId}
              className="mt-4 w-full rounded-2xl bg-emerald-700 px-5 py-4 text-base font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {nameSent ? "Du er klar" : "Jeg er klar"}
            </button>
            <p className="mt-3 text-center text-sm font-bold text-slate-500">
              {nameSent ? "Vent på at læreren starter bildeaktiviteten." : "Navnet vises bare mens dere gjør dere klare."}
            </p>
          </section>
        ) : (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <label className="text-sm font-black text-slate-700">Ditt svar</label>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="mt-3 min-h-36 w-full resize-none rounded-2xl border border-slate-300 px-4 py-4 text-lg font-bold leading-7 outline-none focus:border-emerald-500"
            placeholder="Skriv her..."
            maxLength={360}
            autoFocus
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !text.trim() || session?.status === "finished" || timeIsUp}
            className="mt-4 w-full rounded-2xl bg-emerald-700 px-5 py-4 text-base font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            Send svar
          </button>
        </section>
        )}

        {!isLobby && sentTexts.length ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-black text-slate-700">Dine sendte svar</div>
            <div className="mt-3 space-y-2">
              {sentTexts.map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-950">{item}</div>
              ))}
            </div>
          </section>
        ) : null}

        {!isLobby && latestResponses.length ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-black text-slate-700">Svar som kommer inn</div>
            <div className="mt-3 space-y-2">
              {latestResponses.map((item) => (
                <div key={item.id} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">{item.text}</div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
