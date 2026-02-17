// app/(app)/teacher/spaces/[spaceId]/lessons/[assignmentId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";

/* =========================
   Types
========================= */

type LessonDoc = {
  title?: string;
  description?: string;
  level?: string;
  language?: string;
  status?: string;
  createdAt?: unknown;
  updatedAt?: unknown;

  topic?: string;
  isActive?: boolean;
  tasks?: unknown;
};

type SourceType = "myContent" | "library";

type SpaceAssignmentDoc = {
  status?: "active" | "archived" | string;
  sourceType?: SourceType;
  sourceId?: string;
  title?: string;
  description?: string;
  level?: string;
  language?: string;
  createdAt?: unknown;
  assignedAt?: unknown;
  assignedByUid?: string;
};

type SubmissionDoc = {
  uid?: string;
  displayName?: string;
  createdAt?: unknown;
  status?: string;
  auth?: unknown;
  answers?: unknown;

  // some older shapes
  studentName?: unknown;
  name?: unknown;
  userName?: unknown;
};

type SpaceDocLite = {
  title?: string;
  ownerId?: string;
  code?: string;
  isOpen?: boolean;
  activeLessonId?: string;
  activeLessonTitle?: string;
};

type SpaceMemberDoc = {
  displayName?: string;
  name?: string;
  studentName?: string;
  role?: string;
};

/* =========================
   Helpers
========================= */

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Unknown error";
}

function formatMaybeDate(v: unknown) {
  try {
    if (!v) return "";
    const d: Date | null =
      v instanceof Date
        ? v
        : typeof (v as { toDate?: unknown })?.toDate === "function"
        ? (v as { toDate: () => Date }).toDate()
        : v instanceof Timestamp
        ? v.toDate()
        : null;
    return d ? d.toLocaleString() : "";
  } catch {
    return "";
  }
}

function getSubmissionUid(s: SubmissionDoc): string | null {
  if (typeof s.uid === "string" && s.uid.trim()) return s.uid.trim();

  // fallback: auth.uid
  const a = s.auth;
  if (a && typeof a === "object") {
    const uid = (a as { uid?: unknown }).uid;
    if (typeof uid === "string" && uid.trim()) return uid.trim();
  }
  return null;
}

function pickStudentNameFallback(s: SubmissionDoc): string {
  const candidates = [
    s.displayName,
    typeof s.studentName === "string" ? s.studentName : undefined,
    typeof s.name === "string" ? s.name : undefined,
    typeof s.userName === "string" ? s.userName : undefined,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  const uid = getSubmissionUid(s);
  if (uid) return `Student (${uid.slice(0, 6)}…)`;
  return "Unknown student";
}

function statusBadge(statusRaw: unknown): { label: string; cls: string } {
  const s = typeof statusRaw === "string" ? statusRaw.toLowerCase().trim() : "";
  if (s === "needs_work" || s === "needswork" || s === "need_work") {
    return { label: "Needs work", cls: "border-yellow-200 bg-yellow-50 text-yellow-900" };
  }
  if (s === "reviewed" || s === "approved" || s === "ok") {
    return { label: "Approved", cls: "border-green-200 bg-green-50 text-green-900" };
  }
  return {
    label: typeof statusRaw === "string" && statusRaw ? statusRaw : "—",
    cls: "border-muted bg-background text-muted-foreground",
  };
}

async function resolveAssignedLesson(dbx: Firestore, spaceId: string, assignmentId: string) {
  // 1) assignment doc under spaces/{spaceId}/lessons/{assignmentId}
  const assignRef = doc(dbx, "spaces", spaceId, "lessons", assignmentId);
  const assignSnap = await getDoc(assignRef);

  if (!assignSnap.exists()) {
    return {
      kind: "no-assignment" as const,
      assignment: null as SpaceAssignmentDoc | null,
      lesson: null as LessonDoc | null,
      lessonId: null as string | null,
    };
  }

  const assignment = (assignSnap.data() as SpaceAssignmentDoc) ?? {};
  const sourceType = assignment.sourceType;
  const sourceId = typeof assignment.sourceId === "string" ? assignment.sourceId : "";

  if (!sourceType || !sourceId) {
    return {
      kind: "assignment-missing-source" as const,
      assignment,
      lesson: null as LessonDoc | null,
      lessonId: null as string | null,
    };
  }

  // 2) load source doc
  const colName = sourceType === "myContent" ? "lessons" : "published_lessons";
  const lessonRef = doc(dbx, colName, sourceId);
  const lessonSnap = await getDoc(lessonRef);

  if (!lessonSnap.exists()) {
    return {
      kind: "source-not-found" as const,
      assignment,
      lesson: null as LessonDoc | null,
      lessonId: null as string | null,
    };
  }

  return {
    kind: "ok" as const,
    assignment,
    lessonId: sourceId,
    lesson: (lessonSnap.data() as LessonDoc) ?? {},
  };
}

/* =========================
   Page
========================= */

export default function TeacherSpaceAssignedTaskPage() {
  const router = useRouter();
  const params = useParams<{ spaceId: string; assignmentId: string }>();
  const spaceId = params?.spaceId ?? "";
  const assignmentId = params?.assignmentId ?? "";

  const backHref = useMemo(() => (spaceId ? `/teacher/spaces/${spaceId}` : "/teacher/spaces"), [spaceId]);

  const [authUser, setAuthUser] = useState<User | null>(null);
  const uidNow = authUser?.uid ?? null;

  const [space, setSpace] = useState<SpaceDocLite | null>(null);

  const [lesson, setLesson] = useState<LessonDoc | null>(null);
  const [assignment, setAssignment] = useState<SpaceAssignmentDoc | null>(null);

  const [submissions, setSubmissions] = useState<Array<{ id: string; data: SubmissionDoc }>>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({}); // uid -> displayName
  const [loadingLesson, setLoadingLesson] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track auth user (uid)
  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), (u) => setAuthUser(u));
    return () => unsub();
  }, []);

  // Load space doc (for title/owner)
  useEffect(() => {
    if (!spaceId) return;
    const ref = doc(db, "spaces", spaceId);
    return onSnapshot(
      ref,
      (snap) => setSpace(snap.exists() ? ((snap.data() as DocumentData) as SpaceDocLite) : null),
      (err) => console.log("[SPACE] read error", err)
    );
  }, [spaceId]);

  // Load assignment + source lesson
  useEffect(() => {
    let alive = true;
    setError(null);
    setLoadingLesson(true);
    setLesson(null);
    setAssignment(null);

    if (!spaceId || !assignmentId) {
      setLoadingLesson(false);
      return;
    }

    (async () => {
      const res = await resolveAssignedLesson(db, spaceId, assignmentId);
      if (!alive) return;

      setAssignment(res.assignment ?? null);
      setLesson(res.lesson ?? null);
      setLoadingLesson(false);
    })().catch((e) => {
      if (!alive) return;
      setError(errMsg(e));
      setLoadingLesson(false);
    });

    return () => {
      alive = false;
    };
  }, [spaceId, assignmentId]);

  // Load submissions list
  useEffect(() => {
    setLoadingSubs(true);
    setSubmissions([]);
    setError(null);

    if (!spaceId || !assignmentId) {
      setLoadingSubs(false);
      return;
    }

    const qy = query(collection(db, "spaces", spaceId, "lessons", assignmentId, "submissions"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, data: (d.data() as SubmissionDoc) ?? {} }));
        setSubmissions(rows);
        setLoadingSubs(false);
      },
      (err) => {
        setError(errMsg(err));
        setLoadingSubs(false);
      }
    );

    return () => unsub();
  }, [spaceId, assignmentId]);

  // Resolve displayName from spaceMembers for submissions (uid -> displayName)
  useEffect(() => {
    let alive = true;
    if (!spaceId) return;

    const uids = Array.from(
      new Set(
        submissions
          .map((s) => getSubmissionUid(s.data))
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      )
    );

    const missing = uids.filter((uid) => !memberNames[uid]);
    if (missing.length === 0) return;

    (async () => {
      const pairs: Array<[string, string]> = [];

      await Promise.all(
        missing.map(async (uid) => {
          try {
            const msId = `${spaceId}_${uid}`;
            const snap = await getDoc(doc(db, "spaceMembers", msId));
            if (!snap.exists()) return;

            const data = (snap.data() as SpaceMemberDoc) ?? {};
            const name =
              (typeof data.displayName === "string" && data.displayName.trim() ? data.displayName.trim() : null) ||
              (typeof data.name === "string" && data.name.trim() ? data.name.trim() : null) ||
              (typeof data.studentName === "string" && data.studentName.trim() ? data.studentName.trim() : null);

            if (name) pairs.push([uid, name]);
          } catch {
            // ignore name lookup failures
          }
        })
      );

      if (!alive) return;

      if (pairs.length > 0) {
        setMemberNames((prev) => {
          const next = { ...prev };
          for (const [uid, name] of pairs) next[uid] = name;
          return next;
        });
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, submissions]);

  const title = lesson?.title ?? assignment?.title ?? "Task";
  const desc = lesson?.description ?? assignment?.description ?? "";
  const level = lesson?.level ?? assignment?.level ?? "";
  const language = lesson?.language ?? assignment?.language ?? "";

  const ownerId = space?.ownerId ?? null;
  const isOwner = Boolean(uidNow && ownerId && uidNow === ownerId);

  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <main className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href={backHref} className="text-sm underline opacity-80">
            ← Back to space
          </Link>

          <div className="text-sm text-muted-foreground">
            {space?.title ? <span className="font-medium text-foreground">{space.title}</span> : null}
          </div>
        </div>

        {/* Task header */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">{loadingLesson ? "Loading…" : title}</h1>

          <div className="mt-1 text-sm text-muted-foreground">This is the assigned task view. Submissions are listed below.</div>

          {!loadingLesson && !assignment ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Could not find assignment in <code>spaces/{spaceId}/lessons/{assignmentId}</code>.
            </p>
          ) : null}

          {!loadingLesson && assignment && !lesson ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Assignment exists, but the source lesson could not be found/read.
              <br />
              sourceType: <code>{assignment.sourceType ?? "—"}</code> · sourceId: <code>{assignment.sourceId ?? "—"}</code>
            </p>
          ) : null}

          {desc ? <p className="mt-3 opacity-80">{desc}</p> : null}

          {/* Keep only useful chips (remove Status/Source/SourceId/Owner) */}
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {level ? <span className="rounded-full border px-3 py-1 text-muted-foreground">Level: {level}</span> : null}
            {language ? <span className="rounded-full border px-3 py-1 text-muted-foreground">Language: {language}</span> : null}
            {/* (optional) keep Owner? user asked to remove it, so we do not show it */}
            {isOwner ? null : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <b>Error:</b> {error}
            </div>
          ) : null}
        </div>

        {/* Submissions */}
        <div className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Submissions</h2>
            <span className="text-sm text-muted-foreground">{loadingSubs ? "Loading…" : `${submissions.length}`}</span>
          </div>

          {loadingSubs ? (
            <p className="mt-3 text-sm text-muted-foreground">Fetching submissions…</p>
          ) : submissions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No submissions yet.</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {submissions.map((s) => {
                const uid = getSubmissionUid(s.data);
                const memberName = uid ? memberNames[uid] : null;
                const name = memberName || pickStudentNameFallback(s.data);

                const createdAt = formatMaybeDate(s.data.createdAt) || "—";
                const badge = statusBadge(s.data.status);

                const badgeSizeCls = "px-3 py-1.5 text-sm font-semibold"; // bigger than before

                return (
                  <li key={s.id} className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-[220px]">
                        <div className="font-medium">{name}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{createdAt}</div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border ${badgeSizeCls} ${badge.cls}`}>{badge.label}</span>

                        {/* Open -> button */}
                        <button
                          type="button"
                          onClick={() => router.push(`/teacher/spaces/${spaceId}/lessons/${assignmentId}/submissions/${s.id}`)}
                          className="rounded-xl border px-4 py-2 text-sm hover:shadow-sm"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </AuthGate>
  );
}