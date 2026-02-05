// app/(app)/student/results/page.tsx
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
  type Timestamp,
  type DocumentData,
} from "firebase/firestore";

type SubmissionRow = {
  id: string;
  lessonId: string;
  status?: "draft" | "submitted";
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
  feedback?: string;
};

type LessonMeta = {
  title?: string;
  level?: string;
  topic?: string;
};

type SubmissionDoc = {
  uid?: string;
  lessonId?: string;
  status?: "draft" | "submitted";
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
  feedback?: string;
};

type LessonDoc = {
  title?: string;
  level?: string;
  topic?: string;
};

function asSubmissionDoc(data: DocumentData): SubmissionDoc {
  const d = data as Partial<SubmissionDoc>;
  return {
    uid: typeof d.uid === "string" ? d.uid : undefined,
    lessonId: typeof d.lessonId === "string" ? d.lessonId : undefined,
    status: d.status === "draft" || d.status === "submitted" ? d.status : undefined,
    updatedAt: d.updatedAt,
    createdAt: d.createdAt,
    feedback: typeof d.feedback === "string" ? d.feedback : undefined,
  };
}

function asLessonDoc(data: DocumentData): LessonDoc {
  const d = data as Partial<LessonDoc>;
  return {
    title: typeof d.title === "string" ? d.title : undefined,
    level: typeof d.level === "string" ? d.level : undefined,
    topic: typeof d.topic === "string" ? d.topic : undefined,
  };
}

function formatDate(ts?: Timestamp) {
  if (!ts) return "";
  try {
    return ts.toDate().toLocaleString();
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
    return Array.from(new Set(rows.map((r) => r.lessonId))).filter((x) => x && x.trim().length > 0);
  }, [rows]);

  // 1) ensure user + load submissions
  useEffect(() => {
    let alive = true;

    const run = async () => {
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
        } catch {
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

        const list: SubmissionRow[] = snap.docs
          .map((d) => {
            const data = asSubmissionDoc(d.data());
            return {
              id: d.id,
              lessonId: data.lessonId ?? "",
              status: data.status,
              updatedAt: data.updatedAt,
              createdAt: data.createdAt,
              feedback: data.feedback,
            };
          })
          .filter((r) => r.lessonId.trim().length > 0);

        setRows(list);
      } catch (e: unknown) {
        if (!alive) return;
        const msg = (e as { message?: unknown })?.message;
        setErr(typeof msg === "string" ? msg : "Could not load results");
      }

      if (alive) setLoading(false);
    };

    run();
    return () => {
      alive = false;
    };
  }, []);

  // 2) load lesson metadata for each lessonId (simple cache)
  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (lessonIds.length === 0) return;

      const missing = lessonIds.filter((id) => !lessonsById[id]);
      if (missing.length === 0) return;

      const updates: Record<string, LessonMeta> = {};

      for (const id of missing) {
        try {
          // NB: du brukte "lessons" her. Hvis dine metadata ligger i "published_lessons",
          // bytt til doc(db, "published_lessons", id)
          const snap = await getDoc(doc(db, "lessons", id));
          if (!alive) return;

          if (snap.exists()) {
            const data = asLessonDoc(snap.data());
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
    };

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
          <div style={{ opacity: 0.75, fontSize: 13 }}>{uid ? `User: ${uid.slice(0, 8)}…` : ""}</div>
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

                  {hasFeedback && r.feedback ? (
                    <div style={{ marginTop: 8, opacity: 0.85, fontSize: 13 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Latest feedback (preview)</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>
                        {r.feedback.slice(0, 220)}
                        {r.feedback.length > 220 ? "…" : ""}
                      </div>
                    </div>
                  ) : null}
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
