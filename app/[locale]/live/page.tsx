"use client";

import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

function copyFor(locale: string) {
  if (locale === "pt") {
    return {
      eyebrow: "321school live",
      title: "Entrar em atividade ao vivo",
      text: "Digite o código da tela. Funciona para quiz, votação, nuvem de palavras e atividade com imagem.",
      label: "Código",
      invalid: "Digite o código de 6 caracteres.",
      missing: "Nenhuma atividade ao vivo encontrada com esse código.",
      checking: "Verificando código...",
      submit: "Entrar",
      hint: "Você também pode escanear o QR code na tela.",
    };
  }
  if (locale === "nb") {
    return {
      eyebrow: "321school live",
      title: "Bli med på liveaktivitet",
      text: "Skriv inn koden fra skjermen. Fungerer for quiz, avstemming, ordsamling og bildeaktivitet.",
      label: "Kode",
      invalid: "Skriv inn koden på 6 tegn.",
      missing: "Fant ingen liveaktivitet med denne koden.",
      checking: "Sjekker kode...",
      submit: "Bli med",
      hint: "Du kan også skanne QR-koden på skjermen.",
    };
  }
  return {
    eyebrow: "321school live",
    title: "Join live activity",
    text: "Enter the code from the screen. Works for quiz, poll, word collection and image activity.",
    label: "Code",
    invalid: "Enter the 6-character code.",
    missing: "No live activity found with that code.",
    checking: "Checking code...",
    submit: "Join",
    hint: "You can also scan the QR code on the screen.",
  };
}

export default function LiveCodePage() {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale || "en";
  const router = useRouter();
  const t = useMemo(() => copyFor(locale), [locale]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function joinByCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (normalized.length !== 6) {
      setError(t.invalid);
      return;
    }

    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/live/by-code/${encodeURIComponent(normalized)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { sessionId?: string; type?: string; error?: string };
      if (!res.ok || !json.sessionId) throw new Error(json.error || t.missing);
      if (json.type === "wordwall") {
        router.push(`/${locale}/wordwall/${json.sessionId}`);
        return;
      }
      if (json.type === "image") {
        router.push(`/${locale}/image-live/${json.sessionId}`);
        return;
      }
      if (json.type === "poll") {
        router.push(`/${locale}/poll/${json.sessionId}`);
        return;
      }
      router.push(`/${locale}/quiz/${json.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.missing);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-2xl flex-col justify-center">
        <div className="mb-8">
          <div className="text-sm font-black uppercase tracking-[0.22em] text-sky-300">{t.eyebrow}</div>
          <h1 className="mt-3 text-5xl font-black tracking-tight">{t.title}</h1>
          <p className="mt-4 text-lg font-semibold leading-7 text-slate-300">{t.text}</p>
        </div>

        <form onSubmit={joinByCode} className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl">
          <label className="text-sm font-black uppercase tracking-[0.16em] text-slate-300" htmlFor="live-code">
            {t.label}
          </label>
          <input
            id="live-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
              setError("");
            }}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            className="mt-3 w-full rounded-2xl border border-white/15 bg-white px-5 py-5 text-center text-4xl font-black uppercase tracking-[0.22em] text-slate-950 outline-none focus:border-sky-300"
            placeholder="ABC123"
            maxLength={6}
            autoFocus
          />
          {error ? <div className="mt-3 rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-bold text-red-100">{error}</div> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-2xl bg-sky-300 px-5 py-4 text-lg font-black text-slate-950 shadow-lg shadow-sky-950/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? t.checking : t.submit}
          </button>
          <p className="mt-4 text-center text-sm font-semibold text-slate-300">{t.hint}</p>
        </form>
      </div>
    </main>
  );
}
