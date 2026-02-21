// app/(app)/creator/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import {DashboardIntro} from "@/components/DashboardIntro";

export default function CreatorDashboardPage() {
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
    <AuthGate requireRole="creator">
      <main style={{ maxWidth: 920, margin: "10px auto", padding: 16 }}>
        {/* Felles dashboard-intro */}
        <DashboardIntro userIsAnon={isAnon} />

        <h1 style={{ marginTop: 0 }}>Creator dashboard</h1>
        <p style={{ opacity: 0.8, marginTop: 8 }}>
          Her lager og administrerer du lessons. (MVP – vi bygger ut med statistikk og
          publisering etter hvert.)
        </p>

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div
            style={{
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Snarveier</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/creator/lessons">My lessons</Link>
              <Link href="/creator/lessons/new">+ New lesson</Link>

              {/* Midlertidig kompatibilitet */}
              <span style={{ opacity: 0.6 }}>·</span>
              <Link href="/producer/texts">Legacy: My content</Link>
              <Link href="/producer/texts/new">Legacy: Create new</Link>
            </div>
          </div>

          <div
            style={{
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Neste steg</div>
            <ul style={{ margin: "6px 0 0 18px", opacity: 0.85 }}>
              <li>
                Flytte “My content” fra <code>/producer</code> til{" "}
                <code>/creator</code>
              </li>
              <li>Legge til Creator-rolle i onboarding / søknad</li>
              <li>En “Publish”-flyt (draft → published)</li>
            </ul>
          </div>
        </div>
      </main>
    </AuthGate>
  );
}