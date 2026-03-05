// app/(app)/teacher/page.tsx
"use client";

import { DashboardIntro } from "@/components/DashboardIntro";
import { useUserProfile } from "@/lib/useUserProfile";

export default function TeacherPage() {
  const { user, loading } = useUserProfile();

  // TeacherLayout/AuthGate håndterer redirect hvis ikke innlogget / feil rolle.
  // Her trenger vi bare å gi DashboardIntro et korrekt flagg.
  const isAnon = Boolean(user?.isAnonymous);

  if (loading) return null;

  return (
    <main style={{ maxWidth: 900, margin: "10px auto", padding: 10 }}>
      <DashboardIntro userIsAnon={isAnon} />
    </main>
  );
}