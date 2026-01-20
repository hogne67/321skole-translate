"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAuth } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";

type LessonDoc = {
  title?: string;
  level?: string;
  topic?: string;
  tags?: string[];
  estimatedMinutes?: number;
  tasks?: any[];
  status?: "draft" | "published";
};

type Submission = {
  id: string;
  userId: string;
  lessonId: string;
  taskId: string;
  taskType: string;
  answer?: any;
  createdAt?: any; // Firestore Timestamp
};

type MyLessonRow = {
  lessonId: string;
  title: string;
  level?: string;
  topic?: string;
  estimatedMinutes?: number;
  status?: string;

  submissionsCount: number;
  distinctTasksAnswered: number;
  totalTasks: number | null;

  lastCreatedAt: any | null; // Timestamp
};

function fmtDate(ts: any) {
  try {
    if (!ts) return "";
    // Firestore Timestamp has toDate()
    const d: Date = typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

export default function LearnerMyPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [lessonCache, setLessonCache] = useState<Record<string, LessonDoc | null>>(
    {}
  );

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

        // Hent mine submissions (nyeste først)
        const qy = query(
          collection(db, "submissions"),
          where("userId", "==", u),
          orderBy("createdAt", "desc"),
          limit(500) // juster senere ved behov (paging)
        );

        const snap = await getDocs(qy);
        if (!alive) return;

        const data = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as Submission[];

        setSubs(data);

        // Hent lesson-docs for unike lessonId
        const uniqueLessonIds = Array.from(
          new Set(data.map((s) => s.lessonId).filter(Boolean))
        );

        const cache: Record<string, LessonDoc | null> = {};
        await Promise.all(
          uniqueLessonIds.map(async (lessonId) => {
            try {
              const ls = await getDoc(doc(db, "lessons", lessonId));
              cache[lessonId] = ls.exists() ? (ls.data() as LessonDoc) : null;
            } catch {
              cache[lessonId] = null;
            }
          })
        );

        if (!alive) return;
        setLessonCache(cache);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Failed to load My page");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const rows: MyLessonRow[] = useMemo(() => {
    const byLesson = new Map<string, Submission[]>();
    for (const s of subs) {
      if (!s.lessonId) continue;
      const arr = byLesson.get(s.lessonId) ?? [];
      arr.push(s);
      byLesson.set(s.lessonId, arr);
    }

    const out: MyLessonRow[] = [];

    for (const [lessonId, items] of byLesson.entries()) {
      // items er allerede globalt sortert desc, men grouping kan blande litt:
      // finn latest createdAt
      let last = items[0]?.createdAt ?? null;
      for (const it of items) {
        if (it.createdAt && last && typeof it.createdAt?.seconds === "number" && typeof last?.seconds === "number") {
          if (it.createdAt.seconds > last.seconds) last = it.createdAt;
        } else if (it.createdAt && !last) {
          last = it.createdAt;
        }
      }

      const distinctTasks = new Set(items.map((x) => x.taskId).filter(Boolean)).size;

      const lesson = lessonCache[lessonId] ?? null;
      const totalTasks =
        Array.isArray(lesson?.tasks) ? lesson!.tasks!.length : null;

      out.push({
        lessonId,
        title: lesson?.title ?? "(Untitled lesson)",
        level: lesson?.level,
        topic: lesson?.topic,
        estimatedMinutes: lesson?.estimatedMinutes,
        status: lesson?.status,

        submissionsCount: items.length,
        distinctTasksAnswered: distinctTasks,
        totalTasks,

        lastCreatedAt: last,
      });
    }

    // sorter: sist jobbet først
    out.sort((a, b) => {
      const as = a.lastCreatedAt?.seconds ?? 0;
      const bs = b.lastCreatedAt?.seconds ?? 0;
      return bs - as;
    });

    return out;
  }, [subs, lessonCache]);

  if (loading) return <main style={{ padding: 20 }}>Loading…</main>;

  if (err) {
    return (
      <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900 }}>My</h1>
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
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900 }}>My</h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            uid: {uid ?? "—"} · {rows.length} lesson(s) started
          </div>
        </div>

        <Link
          href="/learner/library"
          style={{
            padding: "10px 14px",
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit",
            fontWeight: 800,
          }}
        >
          Browse library
        </Link>
      </div>

      <section style={{ marginTop: 16 }}>
        {rows.length === 0 ? (
          <p style={{ opacity: 0.75 }}>
            No activity yet. Start a lesson from the library.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {rows.map((r) => {
              const progress =
                r.totalTasks === null
                  ? `${r.distinctTasksAnswered} tasks answered`
                  : `${r.distinctTasksAnswered}/${r.totalTasks} tasks`;

              return (
                <div
                  key={r.lessonId}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 320 }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>
                      {r.title}
                    </div>

                    <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                      {r.level ? `Level: ${r.level}` : "Level: —"}
                      {r.topic ? ` · Topic: ${r.topic}` : ""}
                      {typeof r.estimatedMinutes === "number"
                        ? ` · ${r.estimatedMinutes} min`
                        : ""}
                    </div>

                    <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}>
                      <b>Progress:</b> {progress}
                      {" · "}
                      <b>Submissions:</b> {r.submissionsCount}
                      {r.lastCreatedAt ? ` · Last: ${fmtDate(r.lastCreatedAt)}` : ""}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Link
                      href={`/learner/my/${r.lessonId}`}
                      style={{
                        padding: "10px 14px",
                        border: "1px solid #ddd",
                        borderRadius: 10,
                        textDecoration: "none",
                        color: "inherit",
                        fontWeight: 700,
                        opacity: 0.9,
                      }}
                    >
                      Details
                    </Link>

                    <Link
                      href={`/learner/lesson/${r.lessonId}`}
                      style={{
                        padding: "10px 14px",
                        border: "1px solid #ddd",
                        borderRadius: 10,
                        textDecoration: "none",
                        color: "inherit",
                        fontWeight: 800,
                      }}
                    >
                      Continue
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
