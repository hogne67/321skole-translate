// app/(app)/admin/page.tsx
"use client";

import { useEffect, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import {DashboardIntro} from "@/components/DashboardIntro";

export default function AdminPage() {
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

      <h2 style={{ marginTop: 0 }}>Admin</h2>
      <p style={{ opacity: 0.8 }}>
        Administrasjon, kvalitetssikring og godkjenninger.
      </p>

      <ul style={{ marginTop: 12 }}>
        <li>Submissions (QA / feedback)</li>
        <li>Teacher-godkjenninger (kommer)</li>
        <li>Brukere og roller (kommer)</li>
      </ul>
    </main>
  );
}