// app/(app)/teacher/page.tsx
"use client";

import { useEffect, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import {DashboardIntro} from "@/components/DashboardIntro";

export default function TeacherPage() {
  const [isAnon, setIsAnon] = useState(true);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const user = await ensureAnonymousUser();
        if (!alive) return;
        setIsAnon(Boolean(user.isAnonymous));
      } catch {
        // Hvis noe feiler, behold default (anon)
        if (!alive) return;
        setIsAnon(true);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main style={{ maxWidth: 900, margin: "10px auto", padding: 10 }}>
      <DashboardIntro userIsAnon={isAnon} />

    </main>
  );
}