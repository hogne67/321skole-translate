"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Download, Move, X } from "lucide-react";
import { auth } from "@/lib/firebase";

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

function wordSize(count: number) {
  if (count >= 8) return "text-7xl";
  if (count >= 5) return "text-6xl";
  if (count >= 3) return "text-5xl";
  if (count >= 2) return "text-4xl";
  return "text-3xl";
}

function motionClass(motion: WordwallSession["motion"], index: number) {
  if (motion === "calm") return "";
  if (motion === "energy") return index % 2 === 0 ? "animate-[wordFloat_2.6s_ease-in-out_infinite]" : "animate-[wordFloatAlt_2.2s_ease-in-out_infinite]";
  return index % 2 === 0 ? "animate-[wordFloat_5s_ease-in-out_infinite]" : "animate-[wordFloatAlt_4.5s_ease-in-out_infinite]";
}

function wordPosition(index: number, count: number, custom?: { x: number; y: number }): CSSProperties {
  if (custom) return { left: `${custom.x}%`, top: `${custom.y}%`, transform: "translate(-50%, -50%)" };
  const columns = 5;
  const col = index % columns;
  const row = Math.floor(index / columns);
  const rows = Math.max(1, Math.ceil(count / columns));
  const x = 10 + col * 20 + (row % 2 ? 7 : 0);
  const y = 16 + row * (68 / Math.max(1, rows));
  return { left: `${Math.min(90, x)}%`, top: `${Math.min(88, y)}%`, transform: "translate(-50%, -50%)" };
}

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function WordwallDisplayPage() {
  const params = useParams<{ locale: string; sessionId: string }>();
  const router = useRouter();
  const locale = params.locale;
  const sessionId = params.sessionId;
  const [session, setSession] = useState<WordwallSession | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [error, setError] = useState("");
  const [startBusy, setStartBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [wordPositions, setWordPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingWord, setDraggingWord] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/${locale}/wordwall/${sessionId}`;
  }, [locale, sessionId]);
  const liveUrlText = useMemo(() => {
    if (typeof window === "undefined") return "/live";
    return `${window.location.host}/live`;
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/wordwall-sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      setError(isRecord(data) && typeof data.error === "string" ? data.error : "Kunne ikke hente ordskyen.");
      return;
    }
    setSession(normalizeSession(data));
    setError("");
  }, [sessionId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1200);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!joinUrl) return;
    import("qrcode")
      .then((mod) => mod.default.toDataURL(joinUrl, { margin: 1, scale: 8 }))
      .then(setQrUrl)
      .catch(() => setQrUrl(""));
  }, [joinUrl]);

  function closeDisplay() {
    if (window.opener) {
      window.close();
      return;
    }
    router.push(`/${locale}/teacher/board`);
  }

  async function startWordwall() {
    if (startBusy || !session || session.status !== "lobby") return;
    const current = auth.currentUser;
    if (!current) {
      setError("Du må være innlogget for å starte.");
      return;
    }
    setStartBusy(true);
    setError("");
    try {
      const token = await current.getIdToken();
      const res = await fetch(`/api/wordwall-sessions/${encodeURIComponent(sessionId)}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "start" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kunne ikke starte ordskyen.");
      await load();
    } catch (event) {
      setError(event instanceof Error ? event.message : "Kunne ikke starte ordskyen.");
    } finally {
      setStartBusy(false);
    }
  }

  async function downloadPdf() {
    if (!session || printBusy) return;
    setPrintBusy(true);
    setError("");
    try {
      const generatedAt = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale === "pt" ? "pt-BR" : "nb-NO", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date());
      const res = await fetch("/api/pdf/board-wordwall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            title: "Ordsky",
            subtitle: session.prompt,
            prompt: session.prompt,
            generatedAt,
            responseCount: session.total,
            words: session.words,
            labels: {
              generatedAt: "Laget",
              prompt: "Oppgave",
              responses: "Svar",
              space: "Rom",
              featured: "Fokusord",
              pinned: "Markerte ord",
              allWords: "Alle ord",
              noWords: "Ingen ord ennå",
              site: "321school.com",
            },
          },
        }),
      });
      if (!res.ok) throw new Error("Kunne ikke lage PDF.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ordsky.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (event) {
      setError(event instanceof Error ? event.message : "Kunne ikke lage PDF.");
    } finally {
      setPrintBusy(false);
    }
  }

  function moveWord(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingWord || !moveMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(4, Math.min(96, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(6, Math.min(94, ((event.clientY - rect.top) / rect.height) * 100));
    setWordPositions((prev) => ({ ...prev, [draggingWord]: { x, y } }));
  }

  const words = session?.words.slice(0, 42) ?? [];
  const participants = session?.participants.slice(0, 48) ?? [];
  const isLobby = session?.status === "lobby";
  const hasTimer = session?.status === "active" && typeof session.endsAt === "number" && typeof session.timerSeconds === "number";
  const remaining = hasTimer ? Math.max(0, Math.ceil(((session?.endsAt ?? 0) - now) / 1000)) : null;
  const timerDone = hasTimer && remaining === 0;
  const timerPct = hasTimer && session?.timerSeconds ? Math.max(0, Math.min(100, (((session.timerSeconds - (remaining ?? 0)) / session.timerSeconds) * 100))) : 0;

  return (
    <main className="h-screen overflow-hidden bg-[#06131f] px-8 py-6 text-white">
      <div className="mx-auto flex h-full max-w-[1800px] flex-col">
        <header className="relative flex items-start justify-center gap-6 text-center">
          <div className="absolute left-0 top-0 rounded-2xl bg-white/10 px-5 py-3 text-left">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-white/50">Kode</div>
            <div className="text-3xl font-black tracking-[0.18em]">{session?.code || "------"}</div>
          </div>
          <div>
            <div className="text-sm font-black uppercase tracking-[0.22em] text-sky-300">321school ordsky</div>
            <h1 className="mt-3 max-w-5xl text-4xl font-black leading-tight">{session?.prompt ?? "Ordsky"}</h1>
            <p className="mt-2 text-lg font-bold text-white/60">
              {isLobby ? `${session?.participantCount ?? 0} deltakere klare` : `${session?.total ?? 0} ord sendt inn`}
            </p>
          </div>
          {hasTimer ? (
            <div className={["absolute right-16 top-0 rounded-2xl px-5 py-3 text-right", timerDone ? "bg-rose-500/20 text-rose-100" : "bg-white/10 text-white"].join(" ")}>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-white/50">{timerDone ? "Tiden er ute" : "Tid igjen"}</div>
              <div className="text-3xl font-black tabular-nums">{formatRemaining(remaining ?? 0)}</div>
            </div>
          ) : null}
          <button onClick={closeDisplay} className="absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/15" title="Lukk storskjerm">
            <X className="h-5 w-5" />
          </button>
        </header>

        {error ? <div className="mt-5 rounded-2xl bg-rose-500/20 p-4 font-bold text-rose-100">{error}</div> : null}

        <section className="grid min-h-0 flex-1 gap-6 py-6 xl:grid-cols-[minmax(260px,0.38fr)_minmax(0,1fr)]">
          <aside className="self-start rounded-[2rem] bg-white/[0.08] p-4">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-white/50">Bli med</div>
            <div className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white/80">
              Gå til {liveUrlText}
            </div>
            <div className="mt-3 inline-flex max-w-full rounded-[1.5rem] bg-white p-2">
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrUrl} alt="" className="block" style={{ width: "min(15rem, 26vw, 30vh)", height: "min(15rem, 26vw, 30vh)" }} />
              ) : (
                <div className="flex items-center justify-center text-slate-500" style={{ width: "min(15rem, 26vw, 30vh)", height: "min(15rem, 26vw, 30vh)" }}>Lager QR...</div>
              )}
            </div>
            {isLobby ? (
              <button
                type="button"
                onClick={() => void startWordwall()}
                disabled={startBusy}
                className="mt-4 w-full rounded-2xl bg-emerald-500 px-5 py-4 text-lg font-black text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50"
              >
                {startBusy ? "Starter..." : "Start ordsky"}
              </button>
            ) : null}
            {words.length ? (
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => setMoveMode((value) => !value)}
                  className={["inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black", moveMode ? "bg-sky-300 text-slate-950" : "bg-white/10 text-white hover:bg-white/15"].join(" ")}
                >
                  <Move className="h-4 w-4" aria-hidden="true" />
                  {moveMode ? "Flyttemodus på" : "Flytt ord"}
                </button>
                <button
                  type="button"
                  onClick={() => void downloadPdf()}
                  disabled={printBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 hover:bg-sky-100 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/50"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {printBusy ? "Lager PDF..." : "Skriv ut PDF"}
                </button>
              </div>
            ) : null}
          </aside>

          <div
            className="relative min-h-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-8"
            onPointerMove={moveWord}
            onPointerUp={() => setDraggingWord("")}
            onPointerCancel={() => setDraggingWord("")}
          >
            {hasTimer ? (
              <div className="absolute inset-x-6 top-5 h-3 overflow-hidden rounded-full bg-white/10">
                <div className={["h-full rounded-full transition-[width]", timerDone ? "bg-rose-400" : "bg-sky-300"].join(" ")} style={{ width: `${timerPct}%` }} />
              </div>
            ) : null}
            {isLobby ? (
              <div className="flex h-full items-center justify-center text-center">
                <div className="w-full max-w-5xl">
                  <div className="text-5xl font-black">Venter på deltakere...</div>
                  <p className="mt-3 text-xl font-bold text-white/60">Elevene skanner QR eller skriver kode. Start når klassen er klar.</p>
                  <div className="mt-6 inline-flex rounded-2xl bg-white/10 px-6 py-4 text-3xl font-black text-sky-200">
                    {session?.participantCount ?? 0} klare
                  </div>
                  {participants.length ? (
                    <div className="mt-8 flex max-h-[42vh] flex-wrap justify-center gap-3 overflow-hidden">
                      {participants.map((participant) => (
                        <div key={participant.id} className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-xl font-black text-white shadow-sm">
                          {participant.displayName}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : words.length ? (
              <div className="relative h-full overflow-hidden p-4 text-center">
                {words.map((item, index) => (
                  <button
                    key={item.word}
                    type="button"
                    onPointerDown={(event) => {
                      if (!moveMode) return;
                      event.preventDefault();
                      setDraggingWord(item.word);
                    }}
                    className={[
                      "absolute",
                      wordSize(item.count),
                      moveMode ? "cursor-grab ring-2 ring-white/30 active:cursor-grabbing" : motionClass(session?.motion ?? "alive", index),
                      "inline-block rounded-full px-4 py-2 font-black leading-none transition",
                      index % 3 === 0 ? "text-sky-200" : index % 3 === 1 ? "text-emerald-200" : "text-amber-200",
                    ].join(" ")}
                    style={wordPosition(index, words.length, wordPositions[item.word])}
                  >
                    {item.word}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <div className="text-5xl font-black">Venter på ord...</div>
                  <p className="mt-3 text-xl font-bold text-white/60">Elevene bruker kode eller QR.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
      <style jsx global>{`
        @keyframes wordFloat {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50% { transform: translateY(-10px) rotate(1deg); }
        }
        @keyframes wordFloatAlt {
          0%, 100% { transform: translateY(0) rotate(1deg); }
          50% { transform: translateY(9px) rotate(-1deg); }
        }
      `}</style>
    </main>
  );
}
