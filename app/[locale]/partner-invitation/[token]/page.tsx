"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useUserProfile } from "@/lib/useUserProfile";

export default function PartnerInvitationPage() {
  const locale = useLocale();
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useUserProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const nb = locale === "nb";
  const path = `/${locale}/partner-invitation/${token}`;
  async function accept() {
    if (!user) return;
    setBusy(true); setError("");
    try {
      await user.reload();
      const response = await fetch("/api/partner/invitation", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken(true)}` },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAccepted(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not accept invitation"); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 640, margin: "40px auto", padding: 24 }}>
    <h1>{nb ? "Velkommen som partner i 321skole" : "Welcome as a 321school partner"}</h1>
    <p>{nb ? "Vi inviterer deg fordi du har erfaring eller kompetanse som kan bidra til 321skole. Du kan dele innspill og bidra når det passer. Nettverket utvikles etter hvert som 321skole vokser." : "You are invited because your experience or expertise can help 321school. Share ideas and contribute when it suits you. The network will develop as 321school grows."}</p>
    <p>{nb ? "Logg inn eller opprett en konto med e-postadressen du ble invitert på, og bekreft e-postadressen. Du trenger ikke sende en søknad." : "Sign in or create an account with your invited email address and verify it. No application is needed."}</p>
    {error && <p role="alert">{error}</p>}
    {accepted ? <Link href={`/${locale}/partner`}>{nb ? "Åpne partnersiden" : "Open partner page"}</Link> : loading ? <p>…</p> : user && !user.isAnonymous ? <button disabled={busy} onClick={accept}>{busy ? "…" : nb ? "Bekreft partnerskapet" : "Accept partnership"}</button> : <Link href={`/${locale}/login?next=${encodeURIComponent(path)}`}>{nb ? "Logg inn / registrer deg" : "Sign in / register"}</Link>}
  </main>;
}
