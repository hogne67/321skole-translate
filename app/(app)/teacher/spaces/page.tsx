// app/(app)/teacher/spaces/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import type { SpaceDoc } from "@/lib/spacesClient";

type Row = { id: string; data: SpaceDoc };

export default function TeacherSpacesPage() {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <TeacherSpacesInner />
    </AuthGate>
  );
}

function TeacherSpacesInner() {
  const { user } = useUserProfile();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, "spaces"),
      where("ownerId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(q, (snap) => {
      const next: Row[] = snap.docs.map((d) => ({ id: d.id, data: d.data() as SpaceDoc }));
      setRows(next);
    });
  }, [user?.uid]);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Teacher Spaces</h1>
        <Link href="/teacher/spaces/new">+ New space</Link>
      </div>

      <p style={{ opacity: 0.8 }}>
        Spaces er klasser du kan dele oppgaver i via lenke eller kode.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{r.data.title}</div>
                <div style={{ opacity: 0.75 }}>Kode: <b>{r.data.code}</b> · Åpen: {r.data.isOpen ? "Ja" : "Nei"}</div>
              </div>
              <Link href={`/teacher/spaces/${r.id}`}>Open</Link>
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div style={{ opacity: 0.75 }}>
            Ingen spaces ennå. Lag en med “New space”.
          </div>
        )}
      </div>
    </div>
  );
}
