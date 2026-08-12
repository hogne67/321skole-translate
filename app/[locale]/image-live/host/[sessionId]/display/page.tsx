"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Download, Eye, EyeOff, GripVertical, Pin, Star, X } from "lucide-react";
import { auth } from "@/lib/firebase";

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

function noteClass(index: number) {
  if (index % 4 === 0) return "bg-amber-100 text-amber-950";
  if (index % 4 === 1) return "bg-emerald-100 text-emerald-950";
  if (index % 4 === 2) return "bg-sky-100 text-sky-950";
  return "bg-violet-100 text-violet-950";
}

export default function ImageActivityDisplayPage() {
  const params = useParams<{ locale: string; sessionId: string }>();
  const router = useRouter();
  const locale = params.locale;
  const sessionId = params.sessionId;
  const [session, setSession] = useState<ImageSession | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [error, setError] = useState("");
  const [startBusy, setStartBusy] = useState(false);
  const [showImage, setShowImage] = useState(true);
  const [moveMode, setMoveMode] = useState(false);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState("");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [featuredId, setFeaturedId] = useState("");
  const [printBusy, setPrintBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [liveUrlText, setLiveUrlText] = useState("/live");

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/${locale}/image-live/${sessionId}`;
  }, [locale, sessionId]);
  const load = useCallback(async () => {
    const res = await fetch(`/api/image-sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      setError(isRecord(data) && typeof data.error === "string" ? data.error : "Kunne ikke hente bildeaktiviteten.");
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

  useEffect(() => {
    setLiveUrlText(`${window.location.host}/live`);
  }, []);

  function closeDisplay() {
    if (window.opener) {
      window.close();
      return;
    }
    router.push(`/${locale}/teacher/board`);
  }

  async function startImageActivity() {
    setStartBusy(true);
    setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Logg inn som lærer for å starte aktiviteten.");
      const res = await fetch(`/api/image-sessions/${encodeURIComponent(sessionId)}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "start" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kunne ikke starte bildeaktiviteten.");
      await load();
    } catch (event) {
      setError(event instanceof Error ? event.message : "Kunne ikke starte bildeaktiviteten.");
    } finally {
      setStartBusy(false);
    }
  }

  const responses = useMemo(() => session?.submissions.slice(0, 18) ?? [], [session?.submissions]);
  const participants = session?.participants ?? [];
  const isLobby = session?.status === "lobby";
  const hasTimer = typeof session?.endsAt === "number" && typeof session.timerSeconds === "number";
  const remaining = hasTimer ? Math.max(0, Math.ceil(((session?.endsAt ?? 0) - now) / 1000)) : null;
  const timerDone = hasTimer && remaining === 0;
  const timerPct = hasTimer && session?.timerSeconds ? Math.max(0, Math.min(100, (((session.timerSeconds - (remaining ?? 0)) / session.timerSeconds) * 100))) : 0;
  const orderedResponses = useMemo(() => {
    const order = new Map(orderIds.map((id, index) => [id, index]));
    return [...responses].sort((a, b) => {
      const ai = order.has(a.id) ? order.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = order.has(b.id) ? order.get(b.id)! : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return b.createdAt - a.createdAt;
    });
  }, [orderIds, responses]);

  useEffect(() => {
    setOrderIds((current) => {
      const existing = new Set(current);
      const incoming = responses.map((item) => item.id);
      const next = [...current.filter((id) => incoming.includes(id)), ...incoming.filter((id) => !existing.has(id))];
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [responses]);

  function togglePinned(id: string) {
    setPinnedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [id, ...current].slice(0, 8));
  }

  function moveResponse(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    setOrderIds((current) => {
      const next = current.filter((id) => id !== draggingId);
      const targetIndex = Math.max(0, next.indexOf(targetId));
      next.splice(targetIndex, 0, draggingId);
      return next;
    });
    setDraggingId("");
  }

  async function printImageActivity() {
    if (!session || printBusy) return;
    setPrintBusy(true);
    setError("");
    try {
      const response = await fetch("/api/pdf/board-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            title: session.prompt || "Bildeaktivitet",
            subtitle: "Svar fra live bildeaktivitet",
            prompt: session.prompt,
            imageUrl: session.imageUrl,
            generatedAt: new Date().toLocaleString(locale === "nb" ? "nb-NO" : locale === "pt" ? "pt-BR" : "en-GB"),
            responseCount: session.total,
            sentences: orderedResponses.map((item, index) => ({
              id: item.id,
              name: item.displayName || `Svar ${index + 1}`,
              text: item.text,
              pinned: pinnedIds.includes(item.id),
              featured: featuredId === item.id,
            })),
            labels: {
              generatedAt: "Laget",
              prompt: "Oppgave",
              responses: "Svar",
              space: "Rom",
              featured: "Markert svar",
              pinned: "Holdte svar",
              allSentences: "Alle svar",
              noSentences: "Ingen svar enda",
              site: "321school",
            },
          },
        }),
      });
      const blob = await response.blob();
      if (!response.ok) throw new Error("Kunne ikke lage PDF.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "bildeaktivitet.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (event) {
      setError(event instanceof Error ? event.message : "Kunne ikke lage PDF.");
    } finally {
      setPrintBusy(false);
    }
  }

  return (
    <main className="h-screen overflow-hidden bg-[#07130f] px-8 py-6 text-white">
      <div className="mx-auto flex h-full max-w-[1800px] flex-col">
        <header className="relative flex items-start justify-center gap-6 text-center">
          <div className="absolute left-0 top-0 rounded-2xl bg-white/10 px-5 py-3 text-left">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-white/50">Kode</div>
            <div className="text-3xl font-black tracking-[0.18em]">{session?.code || "------"}</div>
          </div>
          <div>
            <div className="text-sm font-black uppercase tracking-[0.22em] text-emerald-300">321school bildeaktivitet</div>
            <h1 className="mt-3 max-w-5xl text-4xl font-black leading-tight">{session?.prompt ?? "Bildeaktivitet"}</h1>
            <p className="mt-2 text-lg font-bold text-white/60">
              {isLobby ? `${session?.participantCount ?? 0} deltakere klare` : `${session?.total ?? 0} svar sendt inn`}
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

        <section className="grid min-h-0 flex-1 gap-6 py-6 xl:grid-cols-[minmax(260px,0.32fr)_minmax(0,0.9fr)_minmax(360px,0.55fr)]">
          <aside className="self-start rounded-[2rem] bg-white/[0.08] p-4">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-white/50">Bli med</div>
            <div className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white/80">
              Gå til {liveUrlText}
            </div>
            <div className="mt-3 inline-flex max-w-full rounded-[1.5rem] bg-white p-2">
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrUrl} alt="" className="block" style={{ width: "min(15rem, 24vw, 28vh)", height: "min(15rem, 24vw, 28vh)" }} />
              ) : (
                <div className="flex items-center justify-center text-slate-500" style={{ width: "min(15rem, 24vw, 28vh)", height: "min(15rem, 24vw, 28vh)" }}>Lager QR...</div>
              )}
            </div>
          </aside>

          <div className="relative min-h-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-4">
            {!isLobby ? (
              <div className="absolute right-5 top-5 z-20 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowImage((value) => !value)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-black/45 px-4 py-2 text-sm font-black text-white backdrop-blur hover:bg-black/60"
                >
                  {showImage ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showImage ? "Skjul bilde" : "Vis bilde"}
                </button>
                <button
                  type="button"
                  onClick={() => setMoveMode((value) => !value)}
                  className={["inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black backdrop-blur", moveMode ? "bg-amber-300 text-amber-950" : "bg-black/45 text-white hover:bg-black/60"].join(" ")}
                >
                  <GripVertical className="h-4 w-4" />
                  Flytt svar
                </button>
                <button
                  type="button"
                  onClick={() => void printImageActivity()}
                  disabled={printBusy || !orderedResponses.length}
                  className="inline-flex items-center gap-2 rounded-2xl bg-black/45 px-4 py-2 text-sm font-black text-white backdrop-blur hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  {printBusy ? "Lager..." : "Skriv ut"}
                </button>
              </div>
            ) : null}
            {hasTimer ? (
              <div className="absolute inset-x-6 top-5 z-10 h-3 overflow-hidden rounded-full bg-black/30">
                <div className={["h-full rounded-full transition-[width]", timerDone ? "bg-rose-400" : "bg-emerald-300"].join(" ")} style={{ width: `${timerPct}%` }} />
              </div>
            ) : null}
            {isLobby ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="text-5xl font-black">Bildeaktiviteten er klar</div>
                <p className="mt-3 max-w-2xl text-xl font-bold text-white/60">Elevene skriver navn og trykker klar. Start når alle er med.</p>
                <button
                  type="button"
                  onClick={() => void startImageActivity()}
                  disabled={startBusy}
                  className="mt-8 rounded-3xl bg-emerald-500 px-10 py-5 text-2xl font-black text-white shadow-2xl shadow-emerald-950/30 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-500"
                >
                  {startBusy ? "Starter..." : "Start bildeaktivitet"}
                </button>
              </div>
            ) : showImage && session?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.imageUrl} alt="" className="h-full w-full rounded-[1.5rem] object-contain" />
            ) : !showImage ? (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <div className="text-5xl font-black">Bildet er skjult</div>
                  <p className="mt-3 max-w-2xl text-xl font-bold text-white/60">Elevenes bilde står fortsatt fast. Her kan dere fokusere på svarene.</p>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-3xl font-black text-white/50">Venter på bilde...</div>
            )}
          </div>

          <div className="min-h-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            {isLobby ? (
              participants.length ? (
                <div className="grid max-h-full grid-cols-2 gap-3 overflow-hidden">
                  {participants.map((item, index) => (
                    <div key={item.id} className={["rounded-3xl px-5 py-4 text-xl font-black leading-snug shadow-lg", noteClass(index)].join(" ")}>
                      {item.displayName}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-center">
                  <div>
                    <div className="text-5xl font-black">Venter på deltakere...</div>
                    <p className="mt-3 text-xl font-bold text-white/60">Elevene bruker kode eller QR.</p>
                  </div>
                </div>
              )
            ) : orderedResponses.length ? (
              <div className="grid max-h-full gap-3 overflow-hidden">
                {orderedResponses.map((item, index) => {
                  const pinned = pinnedIds.includes(item.id);
                  const featured = featuredId === item.id;
                  return (
                  <div
                    key={item.id}
                    draggable={moveMode}
                    onDragStart={() => setDraggingId(item.id)}
                    onDragOver={(event) => {
                      if (moveMode) event.preventDefault();
                    }}
                    onDrop={() => moveResponse(item.id)}
                    className={[
                      "group rounded-3xl px-5 py-4 text-xl font-black leading-snug shadow-lg",
                      featured || pinned ? "bg-amber-200 text-amber-950 ring-4 ring-amber-300/60" : noteClass(index),
                      moveMode ? "cursor-move" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span>{item.text}</span>
                      <span className="flex shrink-0 gap-1 opacity-90">
                        <button
                          type="button"
                          onClick={() => setFeaturedId((current) => current === item.id ? "" : item.id)}
                          className={["inline-flex h-9 w-9 items-center justify-center rounded-full", featured ? "bg-amber-500 text-white" : "bg-white/70 text-slate-800"].join(" ")}
                          title="Marker svar"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePinned(item.id)}
                          className={["inline-flex h-9 w-9 items-center justify-center rounded-full", pinned ? "bg-slate-950 text-white" : "bg-white/70 text-slate-800"].join(" ")}
                          title="Hold svar"
                        >
                          <Pin className="h-4 w-4" />
                        </button>
                      </span>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <div className="text-5xl font-black">Venter på svar...</div>
                  <p className="mt-3 text-xl font-bold text-white/60">Elevene bruker kode eller QR.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
