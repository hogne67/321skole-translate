"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getAuth } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";

type Lesson = {
  title?: string;
  level?: string;
  topic?: string;
};

type Submission = {
  id: string;
  userId: string;
  lessonId: string;
  taskId: string;
  taskType: string;
  answer?: any;
  createdAt?: any;
};

export default function LearnerMyLessonPage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = params.lessonId;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      try {
        await ensureAnonymousUser();
        const u = getAuth().currentUser?.uid ?? null;
        if (!u) throw new Error("No auth uid");
        if (!alive) return;
        setUid(u);

        // Lesson (for title)
        const lessonSnap = await getDoc(doc(db, "lessons", lessonId));
        if (!alive) return;
        setLesson(lessonSnap.exists() ? (lessonSnap.data() as Lesson) : null);

        // Mine submissions for denne lesson
        const qy = query(
          collection(db, "submissions"),
          where("userId", "==", u),
          where("lessonId", "==", lessonId),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(qy);
        if (!alive) return;

        const data = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as Submission[];

        setSubs(data);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Failed to load");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [lessonId]);

  const groupedByTask = useMemo(() => {
    const m = new Map<string, Submission[]>();
    for (const s of subs) {
      const arr = m.get(s.taskId) ?? [];
      arr.push(s);
      m.set(s.taskId, arr);
    }
    return m;
  }, [subs]);

  if (loading) return <main style={{ padding: 20 }}>Loading…</main>;

  if (err) {
    return (
      <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 900 }}>My answers</h1>
        <div
          style={{
            marginTop: 12,
            border: "1px solid #f3b4b4",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 800 }}>Error</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{err}</pre>
        </div>

        <div style={{ marginTop: 12 }}>
          <Link href="/learner/library">← Back to library</Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <Link href="/learner/library">← Back to library</Link>
          <h1 style={{ fontSize: 26, fontWeight: 900, marginTop: 10 }}>
            My answers
          </h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {lesson?.title ?? "(Lesson)"} · uid: {uid ?? "—"}
          </div>
        </div>

        <Link
          href={`/learner/lesson/${lessonId}`}
          style={{
            padding: "10px 14px",
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit",
            fontWeight: 800,
          }}
        >
          Continue lesson
        </Link>
      </div>

      <section style={{ marginTop: 16 }}>
        {subs.length === 0 ? (
          <p style={{ opacity: 0.75 }}>No submissions yet for this lesson.</p>
        ) : (
          <>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              {subs.length} submissions · {groupedByTask.size} tasks answered
            </div>

            <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
              {Array.from(groupedByTask.entries()).map(([taskId, items]) => (
                <div
                  key={taskId}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 900 }}>Task: {taskId}</div>
                  <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>
                    {items.length} attempt(s) · latest type: {items[0]?.taskType}
                  </div>

                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer" }}>Show attempts</summary>
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      {items.map((s) => (
                        <div
                          key={s.id}
                          style={{
                            border: "1px solid #eee",
                            borderRadius: 10,
                            padding: 10,
                          }}
                        >
                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                            submissionId: {s.id}
                          </div>
                          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                            {typeof s.answer === "string"
                              ? s.answer
                              : JSON.stringify(s.answer, null, 2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
