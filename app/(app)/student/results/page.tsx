"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
} from "firebase/firestore";

type SubmissionRow = {
  id: string;
  lessonId: string;
  status?: "draft" | "submitted";
  updatedAt?: any;
  createdAt?: any;
  feedback?: string;
};

type LessonMeta = {
  title?: string;
  level?: string;
  topic?: string;
};

function formatDate(ts: any) {
  // Firestore Timestamp has toDate()
  try {
    const d: Date | undefined = ts?.toDate?.();
    if (!d) return "";
    return d.toLocaleString();
  } catch {
    return "";
  }
}

export default function StudentResultsPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [lessonsById, setLessonsById] = useState<Record<string, LessonMeta>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const lessonIds = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.lessonId))).filter(Boolean);
  }, [rows]);

  // 1) ensure user + load submissions
  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErr(null);

      try {
        const user = await ensureAnonymousUser();
        if (!alive) return;
        setUid(user.uid);

        // newest first
        const q1 = query(
          collection(db, "submissions"),
          where("uid", "==", user.uid),
          orderBy("updatedAt", "desc"),
          limit(200)
        );

        let snap;
        try {
          snap = await getDocs(q1);
        } catch (e) {
          // fallback if some docs lack updatedAt or index differs
          const q2 = query(
            collection(db, "submissions"),
            where("uid", "==", user.uid),
            orderBy("createdAt", "desc"),
            limit(200)
          );
          snap = await getDocs(q2);
        }

        if (!alive) return;

        const list: SubmissionRow[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            lessonId: String(data.lessonId || ""),
            status: data.status,
            updatedAt: data.updatedAt,
            createdAt: data.createdAt,
            feedback: typeof data.feedback === "string" ? data.feedback : undefined,
          };
        });

        setRows(list);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Could not load results");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, []);

  // 2) load lesson metadata for each lessonId (simple cache)
  useEffect(() => {
    let alive = true;

    async function run() {
      if (lessonIds.length === 0) return;

      const missing = lessonIds.filter((id) => !lessonsById[id]);
      if (missing.length === 0) return;

      const updates: Record<string, LessonMeta> = {};

      for (const id of missing) {
        try {
          const snap = await getDoc(doc(db, "lessons", id));
          if (!alive) return;

          if (snap.exists()) {
            const data = snap.data() as any;
            updates[id] = {
              title: data.title,
              level: data.level,
              topic: data.topic,
            };
          } else {
            updates[id] = { title: "(Lesson not found)" };
          }
        } catch {
          updates[id] = { title: "(Could not load lesson)" };
        }
      }

      if (!alive) return;
      setLessonsById((prev) => ({ ...prev, ...updates }));
    }

    run();
    return () => {
      alive = false;
    };
  }, [lessonIds, lessonsById]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ marginTop: 0 }}>My results</h3>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            {uid ? `User: ${uid.slice(0, 8)}…` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/student">Dashboard</Link>
          <Link href="/student/browse">Browse</Link>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {loading && <p>Loading…</p>}
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      {!loading && !err && rows.length === 0 && (
        <div style={{ opacity: 0.8 }}>
          <p>No submissions yet.</p>
          <Link href="/student/browse">Go to Browse</Link>
        </div>
      )}

      {!loading && !err && rows.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          {rows.map((r) => {
            const meta = lessonsById[r.lessonId] || {};
            const when = r.updatedAt ?? r.createdAt;
            const hasFeedback = !!r.feedback;

            return (
              <div
                key={r.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 260 }}>
                  <div style={{ fontWeight: 700 }}>
                    {meta.title || "(Untitled lesson)"}
                    {hasFeedback && (
                      <span
                        style={{
                          marginLeft: 10,
                          fontSize: 12,
                          padding: "2px 8px",
                          border: "1px solid #ddd",
                          borderRadius: 999,
                          opacity: 0.8,
                        }}
                      >
                        Feedback
                      </span>
                    )}
                  </div>

                  <div style={{ opacity: 0.75, fontSize: 13, marginTop: 4 }}>
                    {meta.level ? `Level: ${meta.level}` : ""}
                    {meta.level && meta.topic ? " • " : ""}
                    {meta.topic ? `Topic: ${meta.topic}` : ""}
                  </div>

                  <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
                    Status: {r.status ?? "—"}
                    {when ? ` • Updated: ${formatDate(when)}` : ""}
                  </div>

                  {hasFeedback && (
                    <div style={{ marginTop: 8, opacity: 0.85, fontSize: 13 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Latest feedback (preview)</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>
                        {r.feedback!.slice(0, 220)}
                        {r.feedback!.length > 220 ? "…" : ""}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Link
                    href={`/student/lesson/${r.lessonId}`}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 10,
                      padding: "8px 12px",
                      background: "white",
                      textDecoration: "none",
                    }}
                  >
                    Open
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
