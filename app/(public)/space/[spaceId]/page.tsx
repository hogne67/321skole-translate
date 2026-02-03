// app/(public)/space/[spaceId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import type { SpaceDoc } from "@/lib/spacesClient";

export default function SpaceLandingPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [space, setSpace] = useState<SpaceDoc | null>(null);

  useEffect(() => {
    const ref = doc(db, "spaces", spaceId);
    return onSnapshot(ref, (snap) => setSpace(snap.exists() ? (snap.data() as SpaceDoc) : null));
  }, [spaceId]);

  if (!space) return <div style={{ padding: 16 }}>Laster…</div>;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1 style={{ marginBottom: 6 }}>{space.title}</h1>
      <div style={{ opacity: 0.75, marginBottom: 14 }}>
        Du er inne i en klasse. Læreren deler en lenke til oppgaven (lesson).
      </div>

      <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Hvordan åpner jeg oppgaven?</div>
        <p style={{ marginTop: 0, opacity: 0.8 }}>
          Du må ha en lenke som ser slik ut:
          <br />
          <code>/space/{spaceId}/lesson/{"{lessonId}"}</code>
        </p>
        <p style={{ marginTop: 0, opacity: 0.8 }}>
          (I neste runde lager vi “aktiv oppgave” her.)
        </p>
      </div>

      <div style={{ marginTop: 12, opacity: 0.7 }}>
        Har du fått en “lessonId”? Da kan du teste ved å lime inn URL-en læreren sendte.
      </div>
    </div>
  );
}
