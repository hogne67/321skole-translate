"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Pause, Play, RotateCcw, Square, X } from "lucide-react";

function copyFor(locale: string) {
  if (locale === "en") {
    return {
      eyebrow: "321school timer",
      ready: "Ready",
      timeLeft: "Time left",
      done: "Time is up",
      stopped: "Stopped",
      pause: "Pause",
      resume: "Continue",
      stop: "Stop",
      reset: "Reset",
      close: "Close",
    };
  }
  if (locale === "pt") {
    return {
      eyebrow: "321school timer",
      ready: "Pronto",
      timeLeft: "Tempo restante",
      done: "Tempo esgotado",
      stopped: "Parado",
      pause: "Pausar",
      resume: "Continuar",
      stop: "Parar",
      reset: "Reiniciar",
      close: "Fechar",
    };
  }
  return {
    eyebrow: "321school timer",
    ready: "Klar",
    timeLeft: "Tid igjen",
    done: "Tiden er ute",
    stopped: "Stoppet",
    pause: "Pause",
    resume: "Fortsett",
    stop: "Stopp",
    reset: "Nullstill",
    close: "Lukk",
  };
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function initialSeconds(value: string | null) {
  const seconds = Math.trunc(Number(value));
  if (!Number.isFinite(seconds)) return 60;
  return Math.max(5, Math.min(60 * 60, seconds));
}

export default function TimerDisplayPage() {
  const params = useParams<{ locale: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = params.locale || "nb";
  const t = copyFor(locale);
  const totalSeconds = useMemo(() => initialSeconds(searchParams.get("seconds")), [searchParams]);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [stopped, setStopped] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 250);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = pausedAt ? pausedAt - startedAt : Date.now() - startedAt;
  const remaining = stopped ? 0 : Math.max(0, totalSeconds - Math.floor(elapsed / 1000));
  const done = remaining <= 0;
  const pct = stopped ? 100 : Math.max(0, Math.min(100, ((totalSeconds - remaining) / totalSeconds) * 100));
  const statusText = stopped ? t.stopped : done ? t.done : t.timeLeft;

  function pauseOrResume() {
    if (done || stopped) return;
    if (pausedAt) {
      const pauseLength = Date.now() - pausedAt;
      setStartedAt((value) => value + pauseLength);
      setPausedAt(null);
      return;
    }
    setPausedAt(Date.now());
  }

  function reset() {
    setStartedAt(Date.now());
    setPausedAt(null);
    setStopped(false);
  }

  function closeDisplay() {
    if (window.opener) {
      window.close();
      return;
    }
    router.push(`/${locale}/teacher/board`);
  }

  return (
    <main className="h-screen overflow-hidden bg-[#090b10] px-8 py-6 text-white">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col">
        <header className="relative text-center">
          <div className="text-sm font-black uppercase tracking-[0.24em] text-amber-300">{t.eyebrow}</div>
          <div className="mt-2 text-2xl font-black text-white/65">{totalSeconds}s</div>
          <button
            type="button"
            onClick={closeDisplay}
            className="absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/15"
            title={t.close}
            aria-label={t.close}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <section className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
          <div className={["text-xl font-black uppercase tracking-[0.2em]", done || stopped ? "text-rose-300" : "text-white/55"].join(" ")}>
            {statusText}
          </div>
          <div className={["mt-5 font-black tabular-nums leading-none tracking-tight", done || stopped ? "text-rose-300" : "text-white"].join(" ")} style={{ fontSize: "clamp(7rem, 24vw, 22rem)" }}>
            {formatSeconds(remaining)}
          </div>
          <div className="mt-8 h-8 w-full max-w-5xl overflow-hidden rounded-full bg-white/10">
            <div className={["h-full rounded-full transition-[width]", done || stopped ? "bg-rose-400" : "bg-amber-300"].join(" ")} style={{ width: `${pct}%` }} />
          </div>
        </section>

        <footer className="flex flex-wrap justify-center gap-3 pt-5">
          <button
            type="button"
            onClick={pauseOrResume}
            disabled={done || stopped}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pausedAt ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            {pausedAt ? t.resume : t.pause}
          </button>
          <button
            type="button"
            onClick={() => setStopped(true)}
            disabled={stopped}
            className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Square className="h-5 w-5" />
            {t.stop}
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-5 py-3 font-black text-white hover:bg-white/15"
          >
            <RotateCcw className="h-5 w-5" />
            {t.reset}
          </button>
        </footer>
      </div>
    </main>
  );
}
