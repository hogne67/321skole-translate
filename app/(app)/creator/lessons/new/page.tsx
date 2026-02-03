// app/(app)/creator/lessons/new/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";

export default function CreatorNewLessonPage() {
  return (
    <AuthGate requireRole="creator">
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const router = useRouter();

  useEffect(() => {
    // Midlertidig: bruk eksisterende editor/flyt
    router.replace("/producer/texts/new");
  }, [router]);

  return <div style={{ padding: 16, opacity: 0.8 }}>Åpner editor…</div>;
}
