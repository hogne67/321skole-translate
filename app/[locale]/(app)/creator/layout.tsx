// app/(app)/creator/layout.tsx
"use client";

import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";

export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  // Må være innlogget for å komme inn i creator-området
  return (
    <AuthGate>
      <Inner>{children}</Inner>
    </AuthGate>
  );
}

function Inner({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useUserProfile();

  if (loading) return null;
  if (!user) return null;

  // Anon skal ikke inn her
  if (user.isAnonymous) {
    return (
      <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Creator</h1>
        <p style={{ opacity: 0.85 }}>Du må være innlogget (ikke anonym) for å bruke Creator.</p>
        <Link href="/login">Gå til login</Link>
      </main>
    );
  }

  // Creator-tilgang:
  // - eksplisitt creator
  // - eller teacher approved (du sa lærer har creator automatisk)
  const isCreator =
    profile?.roles?.creator === true ||
    (profile?.roles?.teacher === true && profile?.teacherStatus === "approved");

  if (!isCreator) {
    return (
      <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Creator</h1>
        <p style={{ opacity: 0.85 }}>
          Du har ikke Creator-tilgang ennå. Du kan søke her:
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          <Link href="/apply/creator">Søk om creator</Link>

          {/* Praktiske tilbakeveier */}
          <Link href="/student">Student</Link>
          <Link href="/teacher">Teacher</Link>
        </div>

        <p style={{ marginTop: 14, opacity: 0.75, fontSize: 12 }}>
          (Når du er godkjent, får du tilgang automatisk.)
        </p>
      </main>
    );
  }

  // Har tilgang → bare render children. AppShell tar meny + ramme.
  return <>{children}</>;
}
