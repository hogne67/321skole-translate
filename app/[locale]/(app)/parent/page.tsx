// app/(app)/parent/page.tsx
"use client";

import { useEffect, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import {DashboardIntro} from "@/components/DashboardIntro";

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
    <main style={{ maxWidth: 900, margin: "10px auto", padding: 10 }}>
      <DashboardIntro userIsAnon={isAnon} />

      <h2 style={{ marginTop: 0 }}>Kommer snart</h2>
      <p style={{ opacity: 0.8 }}>
        Parent-delen bygger vi når vi har koblet barn ↔ forelder.
      </p>
    </main>
  );
}