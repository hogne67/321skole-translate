// app/(app)/creator/layout.tsx
"use client";

import Link from "next/link";
import SectionShell from "@/components/SectionShell";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";

export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  // 1) Må være innlogget (ikke anon) for å komme inn i creator-området i det hele tatt
  //    (AuthGate uten requireRole sørger for login, men tillater ikke anon bootstrap her)
  return (
    <AuthGate>
      <Inner>{children}</Inner>
    </AuthGate>
  );
}

function Inner({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useUserProfile();

  // Helt basic loader
  if (loading) return null;

  // Hvis ikke innlogget: AuthGate sender til login, men fallback:
  if (!user) return null;

  // Anon skal aldri inn i creator
  if (user.isAnonymous) {
    return (
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Creator</h1>
        <p style={{ opacity: 0.85 }}>
          Du må være innlogget (ikke anonym) for å bruke Creator.
        </p>
        <Link href="/login">Gå til login</Link>
      </div>
    );
  }

  const roles = (profile as any)?.roles as any | undefined;
  const isCreator = roles?.creator === true;

  // Ikke creator: vis “gate” med CTA til søknad
  if (!isCreator) {
    return (
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Creator</h1>
        <p style={{ opacity: 0.85 }}>
          Du har ikke Creator-tilgang ennå. Du kan søke her:
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          <Link href="/apply/creator">Søk om creator</Link>

          {/* Praktiske tilbakeveier */}
          <Link href="/teacher">Teacher</Link>
          <Link href="/student">Student</Link>
        </div>

        <p style={{ marginTop: 14, opacity: 0.75, fontSize: 12 }}>
          (Når du er godkjent, får du tilgang automatisk.)
        </p>
      </div>
    );
  }

  // Creator: normal shell
  return (
    <SectionShell
      title="Creator"
      subtitle="Lag og administrer innhold."
      items={[
        { href: "/creator", label: "Dashboard" },
        { href: "/creator/lessons", label: "My lessons" },
        { href: "/creator/lessons/new", label: "+ New lesson" },

        // Midlertidig kompatibilitet
        { href: "/producer/texts", label: "Legacy: My content" },
      ]}
    >
      {children}
    </SectionShell>
  );
}
