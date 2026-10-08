"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

type Interaction = { clientName: string; scope: string; csrf: string };

export default function OpenAIConnectionClient() {
  const locale = useLocale();
  const interaction = useSearchParams().get("interaction");
  const [user, setUser] = useState<User | null>(null);
  const [details, setDetails] = useState<Interaction | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const validInteraction = interaction && /^[A-Za-z0-9_-]{1,128}$/.test(interaction) ? interaction : null;
  const endpoint = validInteraction ? `/api/oauth/interaction/${validInteraction}` : null;
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!endpoint) return;
    let cancelled = false;
    fetch(endpoint, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Tilkoblingen er utløpt eller utilgjengelig. Start på nytt fra ChatGPT.");
        const data = await response.json() as Interaction;
        if (!cancelled) setDetails(data);
      }).catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Kunne ikke hente tilkoblingen."); });
    return () => { cancelled = true; };
  }, [endpoint]);

  async function submit(action: "approve" | "deny" | "revoke") {
    setBusy(true); setMessage("");
    try {
      const idToken = user && !user.isAnonymous ? await user.getIdToken(true) : undefined;
      const response = action === "revoke"
        ? await fetch("/api/integrations/openai/revoke", { method: "POST", headers: { Authorization: `Bearer ${idToken}` } })
        : await fetch(endpoint!, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, csrf: details?.csrf, ...(action === "approve" ? { idToken } : {}) }),
        });
      const data = await response.json() as { error?: string; redirectTo?: string };
      if (!response.ok) throw new Error(data.error ?? "Kunne ikke fullføre tilkoblingen.");
      if (data.redirectTo) {
        const url = new URL(data.redirectTo, window.location.origin);
        if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/oauth/")) throw new Error("Ugyldig returadresse.");
        window.location.assign(url.href);
      } else setMessage("Tilgangen til ChatGPT er tilbakekalt.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Kunne ikke fullføre tilkoblingen."); }
    finally { setBusy(false); }
  }

  const signedIn = user && !user.isAnonymous;
  const next = `/${locale}/integrations/openai${validInteraction ? `?interaction=${validInteraction}` : ""}`;
  return <main className="mx-auto max-w-lg space-y-5 p-8">
    <h1 className="text-2xl font-semibold">Koble 321school til ChatGPT</h1>
    <p>Privat prototype. Tillatelsen gjelder bare opprettelse av nye kladdeleksjoner i din egen My Content. Den gir ikke tilgang til å lese, publisere, dele, redigere eller slette innhold.</p>
    <p>Opprettelse skjer først når du ber ChatGPT om å lagre en ny kladdeleksjon i 321school.</p>
    {signedIn ? <p>321school-konto: <strong>{user.email ?? user.displayName ?? "Innlogget konto"}</strong></p>
      : <Link className="underline" href={`/${locale}/login?next=${encodeURIComponent(next)}`}>Logg inn med din eksisterende 321school-konto</Link>}
    {endpoint && details && <div className="flex gap-4">
      <button className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" disabled={!signedIn || busy} onClick={() => submit("approve")}>Tillat tilkobling</button>
      <button className="underline" disabled={busy} onClick={() => submit("deny")}>Avbryt</button>
    </div>}
    {!interaction && signedIn && <button className="underline" disabled={busy} onClick={() => submit("revoke")}>Tilbakekall ChatGPT-tilgang</button>}
    <p role="status" aria-live="polite">{message}</p>
  </main>;
}
