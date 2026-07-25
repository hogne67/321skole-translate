// app/[locale]/(app)/teacher/spaces/[spaceId]/lessons/[assignmentId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
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
  coverImageUrl?: string;
  imageUrl?: string;
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
  coverImageUrl?: string;
  imageUrl?: string;
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

function normalizeStatus(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase().trim() : "";
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
  const s = normalizeStatus(statusRaw);

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
  if (s === "submitted") {
    return {
      label: t("status.submitted"),
      cls: "border-blue-200 bg-blue-50 text-blue-900",
    };
  }
  if (s === "draft") {
    return {
      label: t("status.draft"),
      cls: "border-indigo-200 bg-indigo-50 text-indigo-900",
    };
  }

  return {
    label: typeof statusRaw === "string" && statusRaw ? statusRaw : dash,
    cls: "border-slate-300 bg-white text-slate-700",
  };
}

async function resolveAssignedLesson(dbx: Firestore, spaceId: string, assignmentId: string) {
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

  const t = useTranslations("assignedTask");
  const tCommon = useTranslations("common");

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
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [loadingLesson, setLoadingLesson] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dash = tCommon("dash");
  const unknownErr = tCommon("unknownError");

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), (u) => setAuthUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!spaceId) return;
    const ref = doc(db, "spaces", spaceId);
    return onSnapshot(
      ref,
      (snap) => setSpace(snap.exists() ? ((snap.data() as DocumentData) as SpaceDocLite) : null),
      (err) => console.log("[SPACE] read error", err)
    );
  }, [spaceId]);

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
        const rows = snap.docs
          .map((d) => ({ id: d.id, data: (d.data() as SubmissionDoc) ?? {} }))
          .filter((row) => normalizeStatus(row.data.status) !== "draft");

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
            // ignore
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
  const coverImageUrl = lesson?.coverImageUrl ?? lesson?.imageUrl ?? assignment?.coverImageUrl ?? assignment?.imageUrl ?? "";
  const sourceLabel =
    assignment?.sourceType === "library"
      ? t("meta.library")
      : assignment?.sourceType === "myContent"
        ? t("meta.myContent")
        : dash;

  const ownerId = space?.ownerId ?? null;
  const isOwner = Boolean(uidNow && ownerId && uidNow === ownerId);
  void isOwner;

  return (
    <AuthGate requireRole="teacher">
      <main className="mx-auto box-border w-full max-w-6xl min-w-0 space-y-3 sm:space-y-4">
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-50 p-3 shadow-md sm:p-5">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-500">{t("submissions.title")}</div>
              <h1 className="mt-1 break-words text-2xl font-semibold text-slate-900">
                {space?.title || t("fallback.space")}
              </h1>
            </div>

            <div className="flex w-full min-w-0 justify-start lg:w-auto lg:justify-end">
              <Link
                href={backHref}
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50 sm:w-auto"
              >
                {t("actions.backToSpace")}
              </Link>
            </div>
          </div>
        </div>

        {error ? (
          <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            <b>{t("error.title")}:</b> {error}
          </div>
        ) : null}

        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-100 p-3 shadow-md sm:p-5">
          <div className="grid min-w-0 gap-4 lg:grid-cols-[220px_1fr] lg:items-stretch">
            <div className="min-h-[150px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {coverImageUrl ? (
                <Image
                  src={coverImageUrl}
                  alt={title}
                  width={440}
                  height={300}
                  className="h-full min-h-[150px] w-full object-cover"
                />
              ) : (
                <div className="flex h-full min-h-[150px] items-center justify-center bg-gradient-to-br from-slate-900 to-slate-600 px-5 text-center text-4xl font-semibold text-white">
                  {(title || t("fallback.task")).slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-500">{t("header.taskInfo")}</div>
              <h2 className="mt-2 break-words text-2xl font-semibold text-slate-950">
                {loadingLesson ? tCommon("loading") : title}
              </h2>

              {!loadingLesson && !assignment ? (
                <p className="mt-3 break-words text-sm text-slate-600">
                  {t("header.assignmentMissing")}{" "}
                  <code>
                    spaces/{spaceId}/lessons/{assignmentId}
                  </code>
                  .
                </p>
              ) : null}

              {!loadingLesson && assignment && !lesson ? (
                <p className="mt-3 break-words text-sm text-slate-600">
                  {t("header.sourceMissing")}
                  <br />
                  sourceType: <code>{assignment.sourceType ?? dash}</code> · sourceId:{" "}
                  <code>{assignment.sourceId ?? dash}</code>
                </p>
              ) : null}

              {desc ? <p className="mt-3 break-words text-sm leading-6 text-slate-700">{desc}</p> : null}

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <InfoTile label={t("meta.level")} value={level || dash} />
                <InfoTile label={t("meta.language")} value={language || dash} />
                <InfoTile label={t("meta.source")} value={sourceLabel} />
              </div>
            </div>
          </div>
        </div>

        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-200 p-3 shadow-md sm:p-5">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-900">{t("submissions.title")}</div>
              <div className="mt-1 break-words text-sm text-slate-600">
                {loadingSubs ? tCommon("loading") : `${submissions.length}`}
              </div>
            </div>
          </div>

          {loadingSubs ? (
            <p className="mt-4 text-sm text-slate-600">{t("submissions.loading")}</p>
          ) : submissions.length === 0 ? (
            <div className="mt-4 rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-600 sm:p-4">
              {t("submissions.empty")}
            </div>
          ) : (
            <div className="mt-4 grid min-w-0 gap-3">
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

                const openHref = withLocale(
                  locale,
                  `/teacher/spaces/${spaceId}/lessons/${assignmentId}/submissions/${s.id}`
                );

                return (
                  <div
                    key={s.id}
                    className="box-border w-full min-w-0 max-w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm sm:p-4"
                  >
                    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="break-words font-semibold text-slate-900">{name}</div>
                        <div className="mt-1 break-words text-sm text-slate-600">{createdAt}</div>
                      </div>

                      <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:w-auto sm:grid-cols-[auto_auto] sm:items-center">
                        <span
                          className={`inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-sm font-semibold ${badge.cls}`}
                        >
                          {badge.label}
                        </span>

                        <button
                          type="button"
                          onClick={() => router.push(openHref)}
                          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                        >
                          {t("actions.openSubmission")}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </AuthGate>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}
