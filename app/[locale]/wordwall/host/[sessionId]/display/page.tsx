"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { X } from "lucide-react";

type WordwallWord = { word: string; count: number };
type WordwallSession = {
  id: string;
  code: string;
  status: "active" | "finished";
  prompt: string;
  motion: "calm" | "alive" | "energy";
  timerSeconds: number | null;
  endsAt: number | null;
  words: WordwallWord[];
  total: number;
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
    status: session.status === "finished" ? "finished" : "active",
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
      setError(isRecord(data) && typeof data.error === "string" ? data.error : "Kunne ikke hente ordsamlingen.");
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

  const words = session?.words.slice(0, 42) ?? [];
  const hasTimer = typeof session?.endsAt === "number" && typeof session.timerSeconds === "number";
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
            <div className="text-sm font-black uppercase tracking-[0.22em] text-sky-300">321school ordsamling</div>
            <h1 className="mt-3 max-w-5xl text-4xl font-black leading-tight">{session?.prompt ?? "Ordsamling"}</h1>
            <p className="mt-2 text-lg font-bold text-white/60">{session?.total ?? 0} ord sendt inn</p>
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
          </aside>

          <div className="relative min-h-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
            {hasTimer ? (
              <div className="absolute inset-x-6 top-5 h-3 overflow-hidden rounded-full bg-white/10">
                <div className={["h-full rounded-full transition-[width]", timerDone ? "bg-rose-400" : "bg-sky-300"].join(" ")} style={{ width: `${timerPct}%` }} />
              </div>
            ) : null}
            {words.length ? (
              <div className="flex h-full content-center items-center justify-center gap-x-8 gap-y-5 overflow-hidden p-4 text-center" style={{ flexWrap: "wrap" }}>
                {words.map((item, index) => (
                  <span
                    key={item.word}
                    className={[
                      wordSize(item.count),
                      motionClass(session?.motion ?? "alive", index),
                      "inline-block rounded-full px-4 py-2 font-black leading-none",
                      index % 3 === 0 ? "text-sky-200" : index % 3 === 1 ? "text-emerald-200" : "text-amber-200",
                    ].join(" ")}
                  >
                    {item.word}
                  </span>
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
