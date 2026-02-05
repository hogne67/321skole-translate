// app/(app)/creator/lessons/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type FirestoreError,
} from "firebase/firestore";

type FirestoreLikeTimestamp = {
  toDate?: () => Date;
};

type LessonRow = {
  id: string;
  title?: string;
  level?: string;
  language?: string;
  topic?: string;
  prompt?: string;
  textType?: string;
  texttype?: string; // legacy
  status?: string;
  updatedAt?: Timestamp | Date | FirestoreLikeTimestamp | null;
  createdAt?: Timestamp | Date | FirestoreLikeTimestamp | null;
  ownerId?: string;
};

function formatMaybeDate(v: LessonRow["updatedAt"] | LessonRow["createdAt"]) {
  try {
    if (!v) return "";
    const d: Date | null =
      v instanceof Date
        ? v
        : v instanceof Timestamp
          ? v.toDate()
          : typeof (v as FirestoreLikeTimestamp)?.toDate === "function"
            ? (v as FirestoreLikeTimestamp).toDate?.() ?? null
            : null;

    return d ? d.toLocaleString() : "";
  } catch {
    return "";
  }
}

function parseLessonRow(snap: QueryDocumentSnapshot<DocumentData>): LessonRow {
  const data = snap.data() as Partial<LessonRow>;
  return { id: snap.id, ...data };
}

function getFirestoreErrorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  if (e instanceof Error) return e.message;
  return "Kunne ikke lese lessons.";
}

export default function CreatorLessonsPage() {
  return (
    <AuthGate requireRole="creator">
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const { user } = useUserProfile();
  const [rows, setRows] = useState<LessonRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;

    setErr(null);

    const q = query(
      collection(db, "lessons"),
      where("ownerId", "==", user.uid),
      orderBy("updatedAt", "desc"),
      limit(200)
    );

    return onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map(parseLessonRow);
        setRows(next);
      },
      (e: FirestoreError) => {
        console.log("[CREATOR] lessons read ERROR =>", e.code, e.message, e);

        // Hvis noen docs mangler updatedAt vil Firestore klage ved orderBy.
        // Da kan vi bytte til createdAt/eller fjerne orderBy senere.
        setErr(getFirestoreErrorMessage(e));
      }
    );
  }, [user?.uid]);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>My lessons</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/creator">← Dashboard</Link>
          <Link href="/creator/lessons/new">+ New lesson</Link>
        </div>
      </div>

      <p style={{ opacity: 0.8, marginTop: 8 }}>
        Dette er dine draft-lessons i <code>lessons</code>. (Vi kobler editor og publish bedre etter
        hvert.)
      </p>

      {err && <div style={{ color: "crimson", marginTop: 10 }}>Feil: {err}</div>}

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {rows.map((r) => {
          const title = r.title || "(Uten tittel)";
          const updated = formatMaybeDate(r.updatedAt) || formatMaybeDate(r.createdAt);
          const textType = r.textType || r.texttype || "";
          const topic = r.topic || r.prompt || "";

          // Midlertidig: åpne legacy editor (dere har allerede dette i MVP)
          const legacyEditHref = `/producer/texts/${r.id}`;

          return (
            <div
              key={r.id}
              style={{
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{title}</div>
                  <div style={{ opacity: 0.75, marginTop: 4 }}>
                    {r.level ? (
                      <>
                        Nivå: <b>{r.level}</b>
                      </>
                    ) : null}
                    {r.language ? (
                      <>
                        {" "}
                        · Språk: <b>{r.language}</b>
                      </>
                    ) : null}
                    {textType ? (
                      <>
                        {" "}
                        · Type: <b>{textType}</b>
                      </>
                    ) : null}
                    {updated ? (
                      <>
                        {" "}
                        · Oppdatert: <b>{updated}</b>
                      </>
                    ) : null}
                  </div>

                  {topic && (
                    <div style={{ opacity: 0.8, marginTop: 6 }}>
                      Tema: {topic}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Link href={legacyEditHref}>Open (legacy editor)</Link>
                </div>
              </div>
            </div>
          );
        })}

        {rows.length === 0 && !err && (
          <div style={{ opacity: 0.75 }}>
            Ingen lessons ennå. Klikk <b>+ New lesson</b> for å lage din første.
          </div>
        )}
      </div>
    </div>
  );
}
