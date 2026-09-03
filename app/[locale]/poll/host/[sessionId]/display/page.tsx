"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Play, X } from "lucide-react";
import { auth } from "@/lib/firebase";

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

function pollCopy(locale: string) {
  if (locale === "en") {
    return {
      defaultQuestion: "What do you think?",
      fallbackTitle: "Poll",
      fetchFailed: "Could not load the poll.",
      code: "Code",
      brand: "321school poll",
      votes: (count: number) => `${count} ${count === 1 ? "vote" : "votes"}`,
      timeUp: "Time is up",
      timeLeft: "Time left",
      closeTitle: "Close big screen",
      join: "Join",
      goTo: "Go to",
      makingQr: "Making QR...",
      waitingVotes: "Waiting for votes...",
      studentHint: "Students use the code or QR.",
      readyTitle: "Ready to start",
      readyText: "Students can join now. Start when everyone is ready.",
      start: "Start poll",
      starting: "Starting...",
      startFailed: "Could not start the poll.",
    };
  }
  if (locale === "pt") {
    return {
      defaultQuestion: "O que você acha?",
      fallbackTitle: "Enquete",
      fetchFailed: "Não foi possível carregar a enquete.",
      code: "Código",
      brand: "321school enquete",
      votes: (count: number) => `${count} ${count === 1 ? "voto" : "votos"}`,
      timeUp: "O tempo acabou",
      timeLeft: "Tempo restante",
      closeTitle: "Fechar tela grande",
      join: "Entrar",
      goTo: "Ir para",
      makingQr: "Criando QR...",
      waitingVotes: "Aguardando votos...",
      studentHint: "Os alunos usam o código ou QR.",
      readyTitle: "Pronto para começar",
      readyText: "Os alunos podem entrar agora. Comece quando todos estiverem prontos.",
      start: "Iniciar votação",
      starting: "Iniciando...",
      startFailed: "Não foi possível iniciar a votação.",
    };
  }
  return {
    defaultQuestion: "Hva mener du?",
    fallbackTitle: "Avstemming",
    fetchFailed: "Kunne ikke hente avstemmingen.",
    code: "Kode",
    brand: "321school avstemming",
    votes: (count: number) => `${count} stemmer`,
    timeUp: "Tiden er ute",
    timeLeft: "Tid igjen",
    closeTitle: "Lukk storskjerm",
    join: "Bli med",
    goTo: "Gå til",
    makingQr: "Lager QR...",
    waitingVotes: "Venter på stemmer...",
    studentHint: "Elevene bruker kode eller QR.",
    readyTitle: "Klar til å starte",
    readyText: "Elevene kan bli med nå. Start når alle er klare.",
    start: "Start avstemming",
    starting: "Starter...",
    startFailed: "Kunne ikke starte avstemmingen.",
  };
}

function normalizeSession(value: unknown, defaultQuestion: string): PollSession | null {
  if (!isRecord(value) || !isRecord(value.session)) return null;
  const session = value.session;
  return {
    id: safeString(session.id),
    code: safeString(session.code),
    status: session.status === "finished" ? "finished" : session.status === "ready" ? "ready" : "active",
    question: safeString(session.question, defaultQuestion),
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

function barColor(index: number) {
  if (index % 4 === 0) return "bg-violet-300";
  if (index % 4 === 1) return "bg-sky-300";
  if (index % 4 === 2) return "bg-emerald-300";
  return "bg-amber-300";
}

export default function PollDisplayPage() {
  const params = useParams<{ locale: string; sessionId: string }>();
  const router = useRouter();
  const locale = params.locale;
  const copy = useMemo(() => pollCopy(locale), [locale]);
  const sessionId = params.sessionId;
  const [session, setSession] = useState<PollSession | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/${locale}/poll/${sessionId}`;
  }, [locale, sessionId]);
  const liveUrlText = useMemo(() => {
    if (typeof window === "undefined") return "/live";
    return `${window.location.host}/live`;
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/poll-sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      setError(isRecord(data) && typeof data.error === "string" ? data.error : copy.fetchFailed);
      return;
    }
    setSession(normalizeSession(data, copy.defaultQuestion));
    setError("");
  }, [copy.defaultQuestion, copy.fetchFailed, sessionId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1000);
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

  async function startPoll() {
    if (starting) return;
    const current = auth.currentUser;
    if (!current) {
      setError(copy.startFailed);
      return;
    }

    setStarting(true);
    setError("");
    try {
      const token = await current.getIdToken();
      const res = await fetch(`/api/poll-sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : copy.startFailed);
      await load();
    } catch (event) {
      setError(event instanceof Error ? event.message : copy.startFailed);
    } finally {
      setStarting(false);
    }
  }

  const options = session?.options ?? [];
  const total = session?.total ?? 0;
  const isReady = session?.status === "ready";
  const hasTimer = !isReady && typeof session?.endsAt === "number" && typeof session.timerSeconds === "number";
  const remaining = hasTimer ? Math.max(0, Math.ceil(((session?.endsAt ?? 0) - now) / 1000)) : null;
  const timerDone = hasTimer && remaining === 0;
  const timerPct = hasTimer && session?.timerSeconds ? Math.max(0, Math.min(100, (((session.timerSeconds - (remaining ?? 0)) / session.timerSeconds) * 100))) : 0;

  return (
    <main className="h-screen overflow-hidden bg-[#100a22] px-8 py-6 text-white">
      <div className="mx-auto flex h-full max-w-[1800px] flex-col">
        <header className="relative flex items-start justify-center gap-6 text-center">
          <div className="absolute left-0 top-0 rounded-2xl bg-white/10 px-5 py-3 text-left">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-white/50">{copy.code}</div>
            <div className="text-3xl font-black tracking-[0.18em]">{session?.code || "------"}</div>
          </div>
          <div>
            <div className="text-sm font-black uppercase tracking-[0.22em] text-violet-300">{copy.brand}</div>
            <h1 className="mt-3 max-w-5xl text-4xl font-black leading-tight">{session?.question ?? copy.fallbackTitle}</h1>
            <p className="mt-2 text-lg font-bold text-white/60">{copy.votes(total)}</p>
          </div>
          {hasTimer ? (
            <div className={["absolute right-16 top-0 rounded-2xl px-5 py-3 text-right", timerDone ? "bg-rose-500/20 text-rose-100" : "bg-white/10 text-white"].join(" ")}>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-white/50">{timerDone ? copy.timeUp : copy.timeLeft}</div>
              <div className="text-3xl font-black tabular-nums">{formatRemaining(remaining ?? 0)}</div>
            </div>
          ) : null}
          <button onClick={closeDisplay} className="absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/15" title={copy.closeTitle}>
            <X className="h-5 w-5" />
          </button>
        </header>

        {error ? <div className="mt-5 rounded-2xl bg-rose-500/20 p-4 font-bold text-rose-100">{error}</div> : null}

        <section className="grid min-h-0 flex-1 gap-6 py-6 xl:grid-cols-[minmax(260px,0.34fr)_minmax(0,1fr)]">
          <aside className="self-start rounded-[2rem] bg-white/[0.08] p-4">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-white/50">{copy.join}</div>
            <div className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white/80">
              {copy.goTo} {liveUrlText}
            </div>
            <div className="mt-3 inline-flex max-w-full rounded-[1.5rem] bg-white p-2">
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrUrl} alt="" className="block" style={{ width: "min(15rem, 26vw, 30vh)", height: "min(15rem, 26vw, 30vh)" }} />
              ) : (
                <div className="flex items-center justify-center text-slate-500" style={{ width: "min(15rem, 26vw, 30vh)", height: "min(15rem, 26vw, 30vh)" }}>{copy.makingQr}</div>
              )}
            </div>
          </aside>

          <div className="relative min-h-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
            {hasTimer ? (
              <div className="absolute inset-x-6 top-5 h-3 overflow-hidden rounded-full bg-white/10">
                <div className={["h-full rounded-full transition-[width]", timerDone ? "bg-rose-400" : "bg-violet-300"].join(" ")} style={{ width: `${timerPct}%` }} />
              </div>
            ) : null}
            {isReady ? (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <div className="text-5xl font-black">{copy.readyTitle}</div>
                  <p className="mt-3 text-xl font-bold text-white/60">{copy.readyText}</p>
                  <button
                    type="button"
                    onClick={() => void startPoll()}
                    disabled={starting}
                    className="mt-8 inline-flex items-center justify-center gap-3 rounded-2xl bg-violet-300 px-10 py-5 text-2xl font-black text-slate-950 shadow-lg shadow-violet-950/30 hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Play className="h-7 w-7" />
                    {starting ? copy.starting : copy.start}
                  </button>
                </div>
              </div>
            ) : options.length ? (
              <div className="flex h-full flex-col justify-center gap-5 pt-4">
                {options.map((item, index) => {
                  const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                  return (
                    <div key={item.option} className="rounded-[1.5rem] bg-white/10 p-5">
                      <div className="flex items-center justify-between gap-6">
                        <div className="min-w-0 text-3xl font-black">{item.option}</div>
                        <div className="shrink-0 text-4xl font-black tabular-nums">{pct}%</div>
                      </div>
                      <div className="mt-4 h-8 overflow-hidden rounded-full bg-black/30">
                        <div className={["h-full rounded-full transition-[width]", barColor(index)].join(" ")} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-2 text-lg font-bold text-white/60">{copy.votes(item.count)}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <div className="text-5xl font-black">{copy.waitingVotes}</div>
                  <p className="mt-3 text-xl font-bold text-white/60">{copy.studentHint}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
