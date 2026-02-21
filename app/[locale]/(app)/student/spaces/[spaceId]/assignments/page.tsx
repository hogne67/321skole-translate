// app/(app)/student/spaces/[spaceId]/lessons/[assignmentId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, type Firestore } from "firebase/firestore";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

function errMessage(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

type AssignmentDoc = {
  title?: string;
  description?: string;
  lessonId?: string; // hvis du peker til root lessons
  status?: string;
};

export default function StudentAssignmentPage() {
  const { spaceId, assignmentId } = useParams<{ spaceId: string; assignmentId: string }>();

  const [a, setA] = useState<AssignmentDoc | null>(null);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    setMissing(false);

    let unsub: (() => void) | null = null;

    try {
      const dbx = requireDb(db);
      const ref = doc(dbx, "spaces", spaceId, "lessons", assignmentId);

      unsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            setA(null);
            setMissing(true);
            return;
          }
          setA(snap.data() as AssignmentDoc);
        },
        (e) => setErr(errMessage(e, "Kunne ikke lese oppgaven"))
      );
    } catch (e: unknown) {
      setErr(errMessage(e, "Kunne ikke starte lytting"));
    }

    return () => {
      if (unsub) unsub();
    };
  }, [spaceId, assignmentId]);

  if (missing) {
    return (
      <div style={{ padding: 16 }}>
        <h1>Fant ikke oppgaven</h1>
        <div style={{ opacity: 0.75 }}>
          Oppgaven finnes ikke, eller du har ikke tilgang.
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href={`/student/spaces/${spaceId}`}>← Tilbake til klassen</Link>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: 16 }}>
        <h1>Kunne ikke åpne oppgaven</h1>
        <div style={{ color: "crimson", whiteSpace: "pre-wrap", marginTop: 8 }}>
          {err}
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href={`/student/spaces/${spaceId}`}>← Tilbake til klassen</Link>
        </div>
      </div>
    );
  }

  if (!a) return <div style={{ padding: 16 }}>Laster…</div>;

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>{a.title ?? "Oppgave"}</h1>
          <div style={{ opacity: 0.7 }}>
            <code>{assignmentId}</code>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href={`/student/spaces/${spaceId}`}>← Tilbake til klassen</Link>
        </div>
      </div>

      {a.description ? (
        <div style={{ marginTop: 12, opacity: 0.85, whiteSpace: "pre-wrap" }}>{a.description}</div>
      ) : (
        <div style={{ marginTop: 12, opacity: 0.75 }}>
          Ingen beskrivelse på denne oppgaven.
        </div>
      )}

      <div style={{ marginTop: 14, opacity: 0.75 }}>
        Neste: her kobler vi på “svar/innlevering” i
        <code> spaces/{spaceId}/lessons/{assignmentId}/submissions</code>.
      </div>
    </div>
  );
}