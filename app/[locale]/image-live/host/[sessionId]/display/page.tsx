"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { X } from "lucide-react";

type ImageSubmission = { id: string; text: string; displayName: string; createdAt: number };
type ImageSession = {
  id: string;
  code: string;
  status: "active" | "finished";
  prompt: string;
  imageUrl: string;
  timerSeconds: number | null;
  endsAt: number | null;
  submissions: ImageSubmission[];
  total: number;
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
    status: session.status === "finished" ? "finished" : "active",
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
  const [now, setNow] = useState(() => Date.now());

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/${locale}/image-live/${sessionId}`;
  }, [locale, sessionId]);
  const liveUrlText = useMemo(() => {
    if (typeof window === "undefined") return "/live";
    return `${window.location.host}/live`;
  }, []);

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

  function closeDisplay() {
    if (window.opener) {
      window.close();
      return;
    }
    router.push(`/${locale}/teacher/board`);
  }

  const responses = session?.submissions.slice(0, 18) ?? [];
  const hasTimer = typeof session?.endsAt === "number" && typeof session.timerSeconds === "number";
  const remaining = hasTimer ? Math.max(0, Math.ceil(((session?.endsAt ?? 0) - now) / 1000)) : null;
  const timerDone = hasTimer && remaining === 0;
  const timerPct = hasTimer && session?.timerSeconds ? Math.max(0, Math.min(100, (((session.timerSeconds - (remaining ?? 0)) / session.timerSeconds) * 100))) : 0;

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
            <p className="mt-2 text-lg font-bold text-white/60">{session?.total ?? 0} svar sendt inn</p>
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
            {hasTimer ? (
              <div className="absolute inset-x-6 top-5 z-10 h-3 overflow-hidden rounded-full bg-black/30">
                <div className={["h-full rounded-full transition-[width]", timerDone ? "bg-rose-400" : "bg-emerald-300"].join(" ")} style={{ width: `${timerPct}%` }} />
              </div>
            ) : null}
            {session?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.imageUrl} alt="" className="h-full w-full rounded-[1.5rem] object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center text-3xl font-black text-white/50">Venter på bilde...</div>
            )}
          </div>

          <div className="min-h-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            {responses.length ? (
              <div className="grid max-h-full gap-3 overflow-hidden">
                {responses.map((item, index) => (
                  <div key={item.id} className={["rounded-3xl px-5 py-4 text-xl font-black leading-snug shadow-lg", noteClass(index)].join(" ")}>
                    {item.text}
                  </div>
                ))}
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
