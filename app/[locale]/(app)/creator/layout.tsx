// app/(app)/creator/layout.tsx
"use client";

import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale } from "next-intl";

export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  // Må være innlogget for å komme inn i creator-området (men vi bruker ikke approved-status)
  return (
    <AuthGate>
      <Inner>{children}</Inner>
    </AuthGate>
  );
}

function Inner({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useUserProfile();
  const locale = useLocale();

  if (loading) return null;
  if (!user) return null;

  // Anon skal ikke inn her
  if (user.isAnonymous) {
    return (
      <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Creator</h1>
        <p style={{ opacity: 0.85 }}>Du må være innlogget (ikke anonym) for å bruke Creator.</p>
        <Link href={`/${locale}/login`}>Gå til login</Link>
      </main>
    );
  }

  // Creator-tilgang (uten teacherStatus):
  // - role === "creator" (ny modell)
  // - eller legacy roles.creator === true
  // - eller teacher får creator automatisk (policy)
  const role = String(profile?.role ?? "").toLowerCase();

  const legacyCreator = profile?.roles?.creator === true;
  const legacyTeacher = profile?.roles?.teacher === true;

  const isTeacher = role === "teacher" || legacyTeacher;
  const isCreator = role === "creator" || legacyCreator || isTeacher; // teacher -> creator UI automatisk

  if (!isCreator) {
    return (
      <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Creator</h1>
        <p style={{ opacity: 0.85 }}>
          Du har ikke Creator-tilgang ennå.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          {/* Hvis dere fortsatt har creator-apply: */}
          <Link href={`/${locale}/apply/creator`}>Søk om creator</Link>

          {/* Praktiske tilbakeveier */}
          <Link href={`/${locale}/student`}>Student</Link>
          <Link href={`/${locale}/teacher`}>Teacher</Link>
        </div>

        <p style={{ marginTop: 14, opacity: 0.75, fontSize: 12 }}>
          (Hvis Creator ikke skal brukes videre, kan dette området fjernes.)
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
