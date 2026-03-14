// app\[locale]\(app)\parent\page.tsx
"use client";

import { useEffect, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { DashboardIntro } from "@/components/DashboardIntro";

export default function ParentPage() {
  const [isAnon, setIsAnon] = useState(true);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const user = await ensureAnonymousUser();
        if (!alive) return;
        setIsAnon(Boolean(user.isAnonymous));
      } catch {
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
    <main style={{ maxWidth: 1100, margin: "14px auto", padding: 12 }}>
      <DashboardIntro userIsAnon={isAnon} />
    </main>
  );
}