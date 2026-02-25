// app/[locale]/(app)/teacher/spaces/[spaceId]/lessons/[assignmentId]/page.tsx
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
import { useLocale, useTranslations } from "next-intl";

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

function errMsg(e: unknown, fallbackUnknown: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallbackUnknown;
}

function formatMaybeDate(v: unknown, locale: string): string {
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

    if (!d) return "";
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
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

function pickStudentNameFallback(
  s: SubmissionDoc,
  fallbackStudent: string,
  fallbackUnknown: string
): string {
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
  if (uid) return `${fallbackStudent} (${uid.slice(0, 6)}…)`;
  return fallbackUnknown;
}

function statusBadge(
  statusRaw: unknown,
  t: (k: string) => string,
  dash: string
): { label: string; cls: string } {
  const s = typeof statusRaw === "string" ? statusRaw.toLowerCase().trim() : "";
  if (s === "needs_work" || s === "needswork" || s === "need_work") {
    return {
      label: t("status.needsWork"),
      cls: "border-yellow-200 bg-yellow-50 text-yellow-900",
    };
  }
  if (s === "reviewed" || s === "approved" || s === "ok") {
    return {
      label: t("status.approved"),
      cls: "border-green-200 bg-green-50 text-green-900",
    };
  }
  return {
    label: typeof statusRaw === "string" && statusRaw ? statusRaw : dash,
    cls: "border-muted bg-background text-muted-foreground",
  };
}

async function resolveAssignedLesson(
  dbx: Firestore,
  spaceId: string,
  assignmentId: string
) {
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

/**
 * Locale-safe link helper:
 * - keeps absolute URLs unchanged
 * - prefixes "/{locale}" for internal paths that start with "/"
 * - avoids double-prefix if already "/en/..." or "/no/..."
 */
function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
}

/* =========================
   Page
========================= */

export default function TeacherSpaceAssignedTaskPage() {
  const router = useRouter();
  const locale = useLocale();

  const t = useTranslations("teacher.assignedTask");
  const tCommon = useTranslations("common");
  const tActions = useTranslations("actions");

  // Robust params typing (avoid red squiggles)
  const params = useParams();
  const rawSpaceId = (params as Record<string, string | string[] | undefined>)["spaceId"];
  const rawAssignmentId = (params as Record<string, string | string[] | undefined>)["assignmentId"];
  const spaceId = Array.isArray(rawSpaceId) ? rawSpaceId[0] : rawSpaceId;
  const assignmentId = Array.isArray(rawAssignmentId) ? rawAssignmentId[0] : rawAssignmentId;

  const backHref = useMemo(() => {
    if (!spaceId) return withLocale(locale, "/teacher/spaces");
    return withLocale(locale, `/teacher/spaces/${spaceId}`);
  }, [locale, spaceId]);

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

  const dash = tCommon("dash");
  const unknownErr = tCommon("unknownError");

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
      (snap) =>
        setSpace(snap.exists() ? ((snap.data() as DocumentData) as SpaceDocLite) : null),
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
      setError(errMsg(e, unknownErr));
      setLoadingLesson(false);
    });

    return () => {
      alive = false;
    };
  }, [spaceId, assignmentId, unknownErr]);

  // Load submissions list
  useEffect(() => {
    setLoadingSubs(true);
    setSubmissions([]);
    setError(null);

    if (!spaceId || !assignmentId) {
      setLoadingSubs(false);
      return;
    }

    const qy = query(
      collection(db, "spaces", spaceId, "lessons", assignmentId, "submissions"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, data: (d.data() as SubmissionDoc) ?? {} }));
        setSubmissions(rows);
        setLoadingSubs(false);
      },
      (err) => {
        setError(errMsg(err, unknownErr));
        setLoadingSubs(false);
      }
    );

    return () => unsub();
  }, [spaceId, assignmentId, unknownErr]);

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
              (typeof data.displayName === "string" && data.displayName.trim()
                ? data.displayName.trim()
                : null) ||
              (typeof data.name === "string" && data.name.trim() ? data.name.trim() : null) ||
              (typeof data.studentName === "string" && data.studentName.trim()
                ? data.studentName.trim()
                : null);

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

  const title = lesson?.title ?? assignment?.title ?? t("fallback.task");
  const desc = lesson?.description ?? assignment?.description ?? "";
  const level = lesson?.level ?? assignment?.level ?? "";
  const language = lesson?.language ?? assignment?.language ?? "";

  const ownerId = space?.ownerId ?? null;
  const isOwner = Boolean(uidNow && ownerId && uidNow === ownerId);
  void isOwner; // intentionally unused (Owner chip removed by request)

  return (
    <AuthGate requireRole="teacher">
      <main className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href={backHref} className="text-sm underline opacity-80">
            {t("actions.backToSpace")}
          </Link>

          <div className="text-sm text-muted-foreground">
            {space?.title ? (
              <span className="font-medium text-foreground">{space.title}</span>
            ) : null}
          </div>
        </div>

        {/* Task header */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">
            {loadingLesson ? tCommon("loading") : title}
          </h1>

          <div className="mt-1 text-sm text-muted-foreground">
            {t("header.subtitle")}
          </div>

          {!loadingLesson && !assignment ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("header.assignmentMissing")}{" "}
              <code>
                spaces/{spaceId}/lessons/{assignmentId}
              </code>
              .
            </p>
          ) : null}

          {!loadingLesson && assignment && !lesson ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("header.sourceMissing")}
              <br />
              sourceType: <code>{assignment.sourceType ?? dash}</code> · sourceId:{" "}
              <code>{assignment.sourceId ?? dash}</code>
            </p>
          ) : null}

          {desc ? <p className="mt-3 opacity-80">{desc}</p> : null}

          {/* Keep only useful chips (remove Status/Source/SourceId/Owner) */}
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {level ? (
              <span className="rounded-full border px-3 py-1 text-muted-foreground">
                {t("meta.level")}: {level}
              </span>
            ) : null}
            {language ? (
              <span className="rounded-full border px-3 py-1 text-muted-foreground">
                {t("meta.language")}: {language}
              </span>
            ) : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <b>{t("error.title")}:</b> {error}
            </div>
          ) : null}
        </div>

        {/* Submissions */}
        <div className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("submissions.title")}</h2>
            <span className="text-sm text-muted-foreground">
              {loadingSubs ? tCommon("loading") : `${submissions.length}`}
            </span>
          </div>

          {loadingSubs ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("submissions.loading")}
            </p>
          ) : submissions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("submissions.empty")}
            </p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {submissions.map((s) => {
                const uid = getSubmissionUid(s.data);
                const memberName = uid ? memberNames[uid] : null;

                const name =
                  memberName ||
                  pickStudentNameFallback(
                    s.data,
                    t("fallback.student"),
                    t("fallback.unknownStudent")
                  );

                const createdAt = formatMaybeDate(s.data.createdAt, locale) || dash;
                const badge = statusBadge(s.data.status, (k) => t(k), dash);

                const badgeSizeCls = "px-3 py-1.5 text-sm font-semibold"; // bigger than before

                const openHref = withLocale(
                  locale,
                  `/teacher/spaces/${spaceId}/lessons/${assignmentId}/submissions/${s.id}`
                );

                return (
                  <li key={s.id} className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-[220px]">
                        <div className="font-medium">{name}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {createdAt}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border ${badgeSizeCls} ${badge.cls}`}>
                          {badge.label}
                        </span>

                        {/* Open -> button */}
                        <button
                          type="button"
                          onClick={() => router.push(openHref)}
                          className="rounded-xl border px-4 py-2 text-sm hover:shadow-sm"
                        >
                          {tActions("open")}
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