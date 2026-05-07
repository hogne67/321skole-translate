// \app\[locale]\(admin)\admin\page.tsx
// app/[locale]/(admin)/admin/page.tsx
"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { useUserProfile } from "@/lib/useUserProfile";

function Card({
  title,
  text,
  href,
}: {
  title: string;
  text: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: 16,
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "white",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 17 }}>{title}</div>
      <div style={{ marginTop: 8, opacity: 0.75, lineHeight: 1.45 }}>{text}</div>
    </Link>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontWeight: 700, opacity: 0.75 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

export default function AdminPage() {
  const { user, profile, loading } = useUserProfile();
  const locale = useLocale();

  if (loading) {
    return <main style={{ padding: 20 }}>Laster…</main>;
  }

  const isAdmin = profile?.roles?.admin === true;
  const role = String(profile?.role ?? "—");
  const adminLevel = String(profile?.adminLevel ?? "—");

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <section
        style={{
          padding: 18,
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "white",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>OVERSIKT</div>
        <h2 style={{ margin: "4px 0 0", fontSize: 26 }}>Admin dashboard</h2>
        <p style={{ marginTop: 10, opacity: 0.8, lineHeight: 1.5 }}>
          Dette området er skilt fra student- og lærerflyt, og brukes til kontroll,
          moderering, statistikk og drift.
        </p>

        <div
          style={{
            marginTop: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 999,
            fontWeight: 800,
            fontSize: 13,
            background: isAdmin ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.10)",
            color: isAdmin ? "rgb(21,128,61)" : "rgb(185,28,28)",
          }}
        >
          {isAdmin ? "Admin access aktiv" : "Ikke admin"}
        </div>
      </section>

      <section
        style={{
          padding: 18,
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "white",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Innlogget admin</h3>

        <div style={{ marginTop: 8 }}>
          <InfoRow label="Innlogget" value={user ? "Ja" : "Nei"} />
          <InfoRow label="UID" value={user?.uid ?? "—"} />
          <InfoRow label="Role" value={role} />
          <InfoRow label="Admin flag" value={String(profile?.roles?.admin ?? false)} />
          <InfoRow label="Teacher flag" value={String(profile?.roles?.teacher ?? false)} />
          <InfoRow label="Admin level" value={adminLevel} />
          <InfoRow label="Display name" value={String(profile?.displayName ?? "—")} />
          <InfoRow label="E-post" value={String(profile?.email ?? "—")} />
          <InfoRow label="Plan" value={String(profile?.plan ?? "—")} />
          <InfoRow label="Institution" value={String(profile?.institutionType ?? "—")} />
          <InfoRow label="Municipality" value={String(profile?.municipality ?? profile?.org?.municipality ?? "—")} />
        </div>
      </section>

      <section>
        <h3 style={{ margin: "0 0 10px" }}>Hurtigvalg</h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <Card
            href={`/${locale}/admin/review`}
            title="Moderation"
            text="Se ventende eller flagget innhold og godkjenn eller avvis."
          />
          <Card
            href={`/${locale}/admin/users`}
            title="Users"
            text="Se brukere, roller og senere kontrollfunksjoner."
          />
          <Card
            href={`/${locale}/admin/stats`}
            title="Stats"
            text="Åpne statistikk og plattformoversikt."
          />
          <Card
            href={`/${locale}/admin/trash`}
            title="Trash"
            text="Se slettede lessons og gjenopprett ved behov."
          />
          <Card
            href={`/${locale}/admin/billing`}
            title="Billing"
            text="Resync Stripe-abonnement og feilsøk betalinger."
          />
          <Card
            href={`/${locale}/admin/analytics`}
            title="Analytics"
            text="Resync Stripe-abonnement og feilsøk betalinger."
          />
          <Card
            href={`/${locale}/admin/communication`}
            title="Communication"
            text="Resync Stripe-abonnement og feilsøk betalinger."
          />
        </div>
      </section>
    </main>
  );
}