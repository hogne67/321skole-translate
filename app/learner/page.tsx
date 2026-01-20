// app/learner/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  documentId,
} from "firebase/firestore";

type Lesson = {
  id: string;
  title: string;
  level?: string;
  topic?: string;
  status?: "draft" | "published";
};

type Submission = {
  id: string;
  lessonId: string;
  uid: string;
  updatedAt?: any; // Firestore Timestamp
  createdAt?: any; // Firestore Timestamp
};

function formatWhen(ts: any) {
  try {
    if (!ts) return "";
    const d: Date =
      typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ✅ JUSTER DENNE hvis din learner-lesson route er annerledes
function lessonHref(lessonId: string) {
  return `/learner/lesson/my/${lessonId}`;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function LearnerDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [lessonsById, setLessonsById] = useState<Record<string, Lesson>>({});
  const [error, setError] = useState<string | null>(null);

  // Deriver “recent” basert på submissions
  const recentLessonIds = useMemo(() => {
    const ids: string[] = [];
    for (const s of submissions) {
      if (s.lessonId && !ids.includes(s.lessonId)) ids.push(s.lessonId);
      if (ids.length >= 5) break;
    }
    return ids;
  }, [submissions]);

  const continueLessonId = useMemo(() => {
    return submissions?.[0]?.lessonId ?? null;
  }, [submissions]);

  const continueLesson = continueLessonId
    ? lessonsById[continueLessonId]
    : null;

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const user = await ensureAnonymousUser();
        if (!alive) return;
        setUid(user.uid);

        // 1) Hent submissions (nyeste først)
        // Forutsetter fields: uid, updatedAt (eller createdAt), lessonId
        // Hvis du kun har createdAt, bytt orderBy til createdAt.
        const subQ = query(
          collection(db, "submissions"),
          where("uid", "==", user.uid),
          orderBy("updatedAt", "desc"),
          limit(20)
        );

        let subSnap;
        try {
          subSnap = await getDocs(subQ);
        } catch (e) {
          // Fallback hvis noen submissions mangler updatedAt: prøv createdAt
          const subQ2 = query(
            collection(db, "submissions"),
            where("uid", "==", user.uid),
            orderBy("createdAt", "desc"),
            limit(20)
          );
          subSnap = await getDocs(subQ2);
        }

        if (!alive) return;

        const subs: Submission[] = subSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            lessonId: data.lessonId,
            uid: data.uid,
            updatedAt: data.updatedAt,
            createdAt: data.createdAt,
          };
        });

        setSubmissions(subs);

        // 2) Finn unike lessonIds fra submissions (opp til 10–20)
        const uniqueLessonIds = Array.from(
          new Set(subs.map((s) => s.lessonId).filter(Boolean))
        ).slice(0, 20);

        // 3) Hent lessons i batches (in-query max 10)
        const lessonsMap: Record<string, Lesson> = {};
        const batches = chunk(uniqueLessonIds, 10);

        for (const ids of batches) {
          const lq = query(
            collection(db, "lessons"),
            where(documentId(), "in", ids)
          );
          const ls = await getDocs(lq);
          for (const docSnap of ls.docs) {
            const data = docSnap.data() as any;
            lessonsMap[docSnap.id] = {
              id: docSnap.id,
              title: data.title ?? "(Untitled)",
              level: data.level,
              topic: data.topic,
              status: data.status,
            };
          }
        }

        // 4) Hvis noen lessons ikke ble hentet (f.eks. slettet), prøv enkeltvis
        for (const id of uniqueLessonIds) {
          if (!lessonsMap[id]) {
            const one = await getDoc(doc(db, "lessons", id));
            if (one.exists()) {
              const data = one.data() as any;
              lessonsMap[id] = {
                id,
                title: data.title ?? "(Untitled)",
                level: data.level,
                topic: data.topic,
                status: data.status,
              };
            }
          }
        }

        if (!alive) return;
        setLessonsById(lessonsMap);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message ?? "Noe gikk galt");
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

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Learner Dashboard</h1>
          <p className="text-sm text-gray-600">
            {uid ? `User: ${uid.slice(0, 8)}…` : "Initializing user…"}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/learner/browse"
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Browse
          </Link>
          <Link
            href="/learner/my"
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
          >
            My
          </Link>
          {continueLessonId && (
            <Link
              href={lessonHref(continueLessonId)}
              className="rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90"
            >
              Resume
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-4">
        {/* Continue */}
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Continue</h2>
            {loading && <span className="text-xs text-gray-500">Loading…</span>}
          </div>

          {!loading && !continueLessonId && (
            <p className="mt-2 text-sm text-gray-600">
              Ingen aktivitet enda. Start en lesson fra <span className="font-medium">Browse</span>.
            </p>
          )}

          {!loading && continueLessonId && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="text-sm text-gray-600">
                {continueLesson ? (
                  <>
                    <div className="font-medium text-gray-900">
                      {continueLesson.title}
                    </div>
                    <div className="text-xs text-gray-500">
                      {continueLesson.level ? `Level: ${continueLesson.level}` : ""}
                      {continueLesson.level && continueLesson.topic ? " • " : ""}
                      {continueLesson.topic ? `Topic: ${continueLesson.topic}` : ""}
                    </div>
                  </>
                ) : (
                  <div className="text-gray-700">
                    Lesson: <span className="font-mono">{continueLessonId}</span>
                  </div>
                )}
              </div>

              <Link
                href={lessonHref(continueLessonId)}
                className="inline-flex w-fit rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90"
              >
                Continue
              </Link>
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            {!loading && submissions.length > 0 && (
              <span className="text-xs text-gray-500">
                {submissions.length} submissions
              </span>
            )}
          </div>

          {loading && (
            <p className="mt-2 text-sm text-gray-600">Henter aktivitet…</p>
          )}

          {!loading && submissions.length === 0 && (
            <p className="mt-2 text-sm text-gray-600">
              Her kommer de 5 siste lessonene du har jobbet med.
            </p>
          )}

          {!loading && submissions.length > 0 && (
            <div className="mt-3 divide-y rounded-xl border">
              {recentLessonIds.map((lessonId) => {
                const lesson = lessonsById[lessonId];
                const sub = submissions.find((s) => s.lessonId === lessonId);
                const when = formatWhen(sub?.updatedAt ?? sub?.createdAt);

                return (
                  <div key={lessonId} className="flex items-center justify-between p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {lesson?.title ?? `Lesson ${lessonId}`}
                      </div>
                      <div className="text-xs text-gray-500">
                        {lesson?.level ? `Level: ${lesson.level}` : ""}
                        {lesson?.level && lesson?.topic ? " • " : ""}
                        {lesson?.topic ? `Topic: ${lesson.topic}` : ""}
                        {(lesson?.level || lesson?.topic) && when ? " • " : ""}
                        {when ? `Last: ${when}` : ""}
                      </div>
                    </div>

                    <Link
                      href={lessonHref(lessonId)}
                      className="ml-3 rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
                    >
                      Open
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick note */}
        <div className="rounded-2xl border p-4 text-sm text-gray-600">
          MVP v1 bruker kun <span className="font-mono">submissions</span> +{" "}
          <span className="font-mono">lessons</span>. Neste naturlige steg etter dette
          er “Started lessons”-seksjon og filtrering (published-only).
        </div>
      </div>
    </div>
  );
}
