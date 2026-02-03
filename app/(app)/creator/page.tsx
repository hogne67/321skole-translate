// app/(app)/creator/page.tsx
"use client";

import Link from "next/link";
import AuthGate from "@/components/AuthGate";

export default function CreatorDashboardPage() {
  return (
    <AuthGate requireRole="creator">
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ margin: 0 }}>Creator Dashboard</h1>
        <p style={{ opacity: 0.8, marginTop: 8 }}>
          Her lager og administrerer du lessons. (MVP – vi bygger ut med statistikk og
          publisering etter hvert.)
        </p>

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Snarveier</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/creator/lessons">My lessons</Link>
              <Link href="/creator/lessons/new">+ New lesson</Link>

              {/* Midlertidig kompatibilitet, hvis dere fortsatt bruker disse */}
              <span style={{ opacity: 0.6 }}>·</span>
              <Link href="/producer/texts">Legacy: My content</Link>
              <Link href="/producer/texts/new">Legacy: Create new</Link>
            </div>
          </div>

          <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Neste steg</div>
            <ul style={{ margin: "6px 0 0 18px", opacity: 0.85 }}>
              <li>Flytte “My content” fra <code>/producer</code> til <code>/creator</code></li>
              <li>Legge til Creator-rolle i onboarding / søknad</li>
              <li>En “Publish”-flyt (draft → published)</li>
            </ul>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
