"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function QuizCodePage() {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale || "nb";
  const router = useRouter();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function joinByCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (normalized.length !== 6) {
      setError("Skriv inn koden på 6 tegn.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/quiz-sessions/by-code/${encodeURIComponent(normalized)}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { sessionId?: string; error?: string };
      if (!res.ok || !json.sessionId) throw new Error(json.error || "Fant ikke quizen.");
      router.push(`/${locale}/quiz/${json.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fant ikke quizen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-2xl flex-col justify-center">
        <div className="mb-8">
          <div className="text-sm font-black uppercase tracking-[0.22em] text-emerald-300">321quiz</div>
          <h1 className="mt-3 text-5xl font-black tracking-tight">Bli med i quiz</h1>
          <p className="mt-4 text-lg font-semibold text-slate-300">
            Skriv inn koden fra skjermen for å bli med.
          </p>
        </div>

        <form onSubmit={joinByCode} className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl">
          <label className="text-sm font-black uppercase tracking-[0.16em] text-slate-300" htmlFor="quiz-code">
            Quizkode
          </label>
          <input
            id="quiz-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
              setError("");
            }}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            className="mt-3 w-full rounded-2xl border border-white/15 bg-white px-5 py-5 text-center text-4xl font-black uppercase tracking-[0.22em] text-slate-950 outline-none focus:border-emerald-300"
            placeholder="ABC123"
            maxLength={6}
          />
          {error ? <div className="mt-3 rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-bold text-red-100">{error}</div> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-2xl bg-emerald-400 px-5 py-4 text-lg font-black text-slate-950 shadow-lg shadow-emerald-950/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Sjekker kode..." : "Bli med"}
          </button>
        </form>
      </div>
    </main>
  );
}
