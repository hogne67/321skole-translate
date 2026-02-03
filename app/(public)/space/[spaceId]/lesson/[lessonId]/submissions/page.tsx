// app/(app)/teacher/spaces/[spaceId]/lessons/[lessonId]/submissions/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

type SubRow = {
  id: string;
  createdAt?: any;
  answers?: any;
  auth?: { isAnon: boolean; uid?: string; displayName?: string | null; email?: string | null };
  status?: "new" | "reviewed" | "needs_work";
  teacherFeedback?: { text?: string };
};

export default function TeacherSubmissionsPage() {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const { spaceId, lessonId } = useParams<{ spaceId: string; lessonId: string }>();

  const [filter, setFilter] = useState<"all" | "anon" | "signed">("all");
  const [rows, setRows] = useState<SubRow[]>([]);
  const [selected, setSelected] = useState<SubRow | null>(null);
  const [feedback, setFeedback] = useState("");
  const [status, setStatus] = useState<"new" | "reviewed" | "needs_work">("reviewed");

  useEffect(() => {
    const base = collection(db, "spaces", spaceId, "lessons", lessonId, "submissions");

    const q =
      filter === "all"
        ? query(base, orderBy("createdAt", "desc"))
        : filter === "anon"
          ? query(base, where("auth.isAnon", "==", true), orderBy("createdAt", "desc"))
          : query(base, where("auth.isAnon", "==", false), orderBy("createdAt", "desc"));

    return onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
  }, [spaceId, lessonId, filter]);

  async function saveFeedback() {
    if (!selected) return;

    await updateDoc(
      doc(db, "spaces", spaceId, "lessons", lessonId, "submissions", selected.id),
      {
        status,
        teacherFeedback: { text: feedback, updatedAt: serverTimestamp() },
      }
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1 style={{ marginBottom: 6 }}>Submissions</h1>
      <div style={{ opacity: 0.75, marginBottom: 12 }}>
        Space <code>{spaceId}</code> · Lesson <code>{lessonId}</code>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <label>Filter:</label>
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
          <option value="all">Alle</option>
          <option value="anon">Anon</option>
          <option value="signed">Innlogget</option>
        </select>
        <div style={{ opacity: 0.7 }}>Antall: {rows.length}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Liste</div>

          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setSelected(r);
                  setFeedback(r.teacherFeedback?.text ?? "");
                  setStatus((r.status as any) ?? "reviewed");
                }}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: selected?.id === r.id ? "rgba(0,0,0,0.04)" : "#fff",
                }}
              >
                <div style={{ fontWeight: 700, display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span>{r.auth?.isAnon ? "Anon" : (r.auth?.displayName || r.auth?.email || "Innlogget")}</span>
                  <span style={{ opacity: 0.7 }}>{r.status ?? "new"}</span>
                </div>
                <div style={{ opacity: 0.7, marginTop: 4 }}>
                  ID: <code>{r.id}</code>
                </div>
              </button>
            ))}

            {rows.length === 0 && <div style={{ opacity: 0.7 }}>Ingen submissions ennå.</div>}
          </div>
        </div>

        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Detalj</div>

          {!selected ? (
            <div style={{ opacity: 0.7 }}>Velg en submission fra lista.</div>
          ) : (
            <>
              <div style={{ opacity: 0.8, marginBottom: 8 }}>
                <b>Type:</b> {selected.auth?.isAnon ? "Anon" : "Innlogget"}
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Svar (raw)</div>
                <pre style={{ whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.03)", padding: 10, borderRadius: 10 }}>
{JSON.stringify(selected.answers ?? {}, null, 2)}
                </pre>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                <label>Status:</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
                  <option value="new">new</option>
                  <option value="reviewed">reviewed</option>
                  <option value="needs_work">needs_work</option>
                </select>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Feedback</div>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  style={{ width: "100%", minHeight: 140, padding: "10px 12px", borderRadius: 10 }}
                  placeholder="Skriv feedback til eleven..."
                />
              </div>

              <button onClick={saveFeedback} style={{ padding: "10px 14px", borderRadius: 10 }}>
                Save
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
