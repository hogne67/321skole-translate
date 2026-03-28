// app/(app)/student/spaces/[spaceId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
  writeBatch,
  serverTimestamp,
  type Firestore,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { SpaceDoc } from "@/lib/spacesClient";
import { useUserProfile } from "@/lib/useUserProfile";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function errMessage(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

function isFsTimestampLike(x: unknown): x is { toMillis: () => number } {
  return (
    !!x &&
    typeof x === "object" &&
    "toMillis" in x &&
    typeof (x as { toMillis?: unknown }).toMillis === "function"
  );
}

function toMillisAny(x: unknown): number {
  if (isFsTimestampLike(x)) {
    try {
      const v = x.toMillis();
      if (typeof v === "number" && isFinite(v)) return v;
    } catch {
      //
    }
  }
  if (typeof x === "number" && isFinite(x)) return x;
  return 0;
}

function normalizeStatus(
  s: unknown
): "submitted" | "needs_work" | "approved" | "draft" | "unknown" {
  const v = String(s ?? "").toLowerCase().trim();
  if (v === "needs_work" || v === "needswork" || v === "needs-work") return "needs_work";
  if (v === "reviewed" || v === "approved" || v === "ok" || v === "passed" || v === "done") {
    return "approved";
  }
  if (v === "submitted" || v === "sent" || v === "delivered") return "submitted";
  if (v === "draft") return "draft";
  return "unknown";
}

function pillStyle(st: ReturnType<typeof normalizeStatus>) {
  if (st === "needs_work") {
    return {
      border: "1px solid rgba(245,158,11,0.60)",
      background: "rgba(245,158,11,0.18)",
      color: "rgba(180,83,9,1)",
    };
  }
  if (st === "approved") {
    return {
      border: "1px solid rgba(46,204,113,0.60)",
      background: "rgba(46,204,113,0.16)",
      color: "rgba(5,150,105,1)",
    };
  }
  if (st === "draft") {
    return {
      border: "1px solid rgba(99,102,241,0.40)",
      background: "rgba(99,102,241,0.12)",
      color: "rgba(67,56,202,1)",
    };
  }
  return {
    border: "1px solid rgba(0,0,0,0.22)",
    background: "rgba(0,0,0,0.04)",
    color: "rgba(0,0,0,0.70)",
  };
}

function StatusPill({
  status,
  label,
  hint,
}: {
  status: ReturnType<typeof normalizeStatus>;
  label: string;
  hint: string;
}) {
  return (
    <span
      title={hint}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 10px",
        borderRadius: 999,
        fontWeight: 900,
        fontSize: 12,
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...pillStyle(status),
      }}
    >
      {label}
    </span>
  );
}

type AssignmentDoc = {
  title?: string;
  description?: string;
  status?: string;
  archived?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  sourceId?: string;
  sourceType?: string;
  level?: string;
  language?: string;
  [k: string]: unknown;
};

function assignmentSnippet(d: AssignmentDoc) {
  const asRec: Record<string, unknown> = d;
  const s = safeString(d.description ?? asRec.summary ?? asRec.subtitle);
  if (!s) return null;
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
}

function isArchived(d: AssignmentDoc) {
  return d.archived === true || String(d.status ?? "").toLowerCase() === "archived";
}

type SpaceSubRow = {
  id: string;
  assignmentId: string;
  status: ReturnType<typeof normalizeStatus>;
  updatedAtMs: number;
  createdAtMs: number;
  title: string | null;
  level: string | null;
  language: string | null;
  hasTeacherMessage: boolean;
  studentArchived: boolean;
  studentArchivedAtMs: number;
};

function detectTeacherMessage(data: Record<string, unknown>) {
  const tf = isRecord(data.teacherFeedback) ? data.teacherFeedback : null;
  if (tf && isRecord(tf)) {
    const t = safeString(tf.text ?? tf.message ?? tf.comment ?? tf.body ?? tf.note);
    if (t) return true;
    const updatedAtMs = toMillisAny(tf.updatedAt);
    if (updatedAtMs > 0) return true;
  }

  const t2 = safeString(data.teacherText ?? data.feedback);
  if (t2) return true;

  const updatedAtMs2 = toMillisAny(data.teacherFeedbackUpdatedAt);
  return updatedAtMs2 > 0;
}

export default function StudentSpaceDetailPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const t = useTranslations("student.spaceDetail");
  const locale = useLocale();

  const { user } = useUserProfile();
  const uid = user?.uid ?? null;

  const [space, setSpace] = useState<SpaceDoc | null>(null);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<Array<{ id: string; data: AssignmentDoc }>>([]);
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [subsLoading, setSubsLoading] = useState(true);
  const [subsErr, setSubsErr] = useState<string | null>(null);
  const [subs, setSubs] = useState<SpaceSubRow[]>([]);

  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);

  const dateLocale = useMemo(() => {
    if (locale === "no") return "nb-NO";
    if (locale === "en") return "en-GB";
    return locale;
  }, [locale]);

  function fmtDate(ms: number) {
    if (!ms || !isFinite(ms)) return null;
    try {
      const d = new Date(ms);
      return new Intl.DateTimeFormat(dateLocale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return null;
    }
  }

  function statusUi(st: ReturnType<typeof normalizeStatus>) {
    switch (st) {
      case "submitted":
        return { label: t("status.submitted"), hint: t("statusHints.submitted") };
      case "needs_work":
        return { label: t("status.needsWork"), hint: t("statusHints.needsWork") };
      case "approved":
        return { label: t("status.approved"), hint: t("statusHints.approved") };
      case "draft":
        return { label: t("status.draft"), hint: t("statusHints.draft") };
      default:
        return { label: t("status.unknown"), hint: "" };
    }
  }

  useEffect(() => {
    setErr(null);
    setMissing(false);

    let unsub: (() => void) | null = null;
    try {
      const dbx = requireDb(db);
      unsub = onSnapshot(
        doc(dbx, "spaces", spaceId),
        (snap) => {
          if (!snap.exists()) {
            setSpace(null);
            setMissing(true);
            return;
          }
          setMissing(false);
          setSpace(snap.data() as SpaceDoc);
        },
        (e: unknown) => setErr(errMessage(e, t("errors.readSpace")))
      );
    } catch (e: unknown) {
      setErr(errMessage(e, t("errors.listenStart")));
    }
    return () => unsub?.();
  }, [spaceId, t]);

  useEffect(() => {
    setAssignErr(null);

    let unsub: (() => void) | null = null;
    try {
      const dbx = requireDb(db);
      const qy = query(collection(dbx, "spaces", spaceId, "lessons"), orderBy("updatedAt", "desc"));
      unsub = onSnapshot(
        qy,
        (snap) => {
          const out: Array<{ id: string; data: AssignmentDoc }> = [];
          snap.forEach((d: QueryDocumentSnapshot<DocumentData>) =>
            out.push({ id: d.id, data: d.data() as AssignmentDoc })
          );
          setAssignments(out);
        },
        (e: unknown) => setAssignErr(errMessage(e, t("errors.readAssignments")))
      );
    } catch (e: unknown) {
      setAssignErr(errMessage(e, t("errors.listenAssignmentsStart")));
    }

    return () => unsub?.();
  }, [spaceId, t]);

  useEffect(() => {
    setSubsErr(null);
    setArchiveMsg(null);

    if (!uid) {
      setSubsLoading(false);
      setSubs([]);
      return () => {};
    }

    let unsub: (() => void) | null = null;
    setSubsLoading(true);

    try {
      const dbx = requireDb(db);

      const qy = query(
        collection(dbx, "spaceSubmissions"),
        where("spaceId", "==", spaceId),
        where("uid", "==", uid),
        orderBy("updatedAt", "desc"),
        limit(200)
      );

      unsub = onSnapshot(
        qy,
        (snap) => {
          const out: SpaceSubRow[] = [];
          snap.forEach((d) => {
            const data = ((d.data() as unknown) as Record<string, unknown>) ?? {};
            const assignmentId = safeString(data.assignmentId) ?? "";
            if (!assignmentId) return;

            const updatedAtMs = toMillisAny(data.updatedAt) || toMillisAny(data.createdAt);
            const createdAtMs = toMillisAny(data.createdAt);

            const studentArchived = data.studentArchived === true;
            const studentArchivedAtMs = toMillisAny(data.studentArchivedAt);

            out.push({
              id: d.id,
              assignmentId,
              status: normalizeStatus(data.status),
              updatedAtMs,
              createdAtMs,
              title: safeString(data.title) ?? null,
              level: safeString(data.level) ?? null,
              language: safeString(data.language) ?? null,
              hasTeacherMessage: detectTeacherMessage(data),
              studentArchived,
              studentArchivedAtMs,
            });
          });

          out.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
          setSubs(out);
          setSubsLoading(false);
        },
        (e: unknown) => {
          const code =
            e && typeof e === "object" && "code" in e
              ? String((e as { code?: unknown }).code ?? "error")
              : "error";
          setSubsErr(`${code}: ${errMessage(e, t("errors.readSubmissions"))}`);
          setSubsLoading(false);
        }
      );
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: unknown }).code ?? "error")
          : "error";
      setSubsErr(`${code}: ${errMessage(e, t("errors.listenStart"))}`);
      setSubsLoading(false);
    }

    return () => unsub?.();
  }, [spaceId, uid, t]);

  const activeAssignmentId = useMemo(() => (space?.activeLessonId ?? null) as string | null, [space]);

  const activeAssignmentDoc = useMemo(() => {
    if (!activeAssignmentId) return null;
    return assignments.find((a) => a.id === activeAssignmentId)?.data ?? null;
  }, [assignments, activeAssignmentId]);

  const visibleAssignments = useMemo(
    () => (showArchived ? assignments : assignments.filter((x) => !isArchived(x.data))),
    [assignments, showArchived]
  );

  const latestByAssignment = useMemo(() => {
    const m = new Map<string, SpaceSubRow>();
    for (const r of subs) {
      if (!m.has(r.assignmentId)) m.set(r.assignmentId, r);
    }
    return m;
  }, [subs]);

  const grouped = useMemo(() => {
    const out: Array<{ assignmentId: string; latest: SpaceSubRow }> = [];
    for (const [assignmentId, latest] of latestByAssignment.entries()) out.push({ assignmentId, latest });
    out.sort((a, b) => (b.latest.updatedAtMs || 0) - (a.latest.updatedAtMs || 0));
    return out;
  }, [latestByAssignment]);

  const activeSubs = useMemo(() => grouped.filter((g) => g.latest.studentArchived !== true), [grouped]);
  const archivedSubs = useMemo(() => grouped.filter((g) => g.latest.studentArchived === true), [grouped]);

  function titleFor(assignmentId: string) {
    const s = latestByAssignment.get(assignmentId);
    return s?.title ?? assignmentId;
  }

  function metaForRow(r: SpaceSubRow | null) {
    if (!r) return null;
    const parts = [safeString(r.level), safeString(r.language)].filter(Boolean);
    return parts.length ? parts.join(" • ") : null;
  }

  const activeMine = useMemo(() => {
    if (!activeAssignmentId) return null;
    return latestByAssignment.get(activeAssignmentId) ?? null;
  }, [activeAssignmentId, latestByAssignment]);

  const shouldShowActiveAssignment = useMemo(() => {
    if (!activeAssignmentId) return false;
    if (!uid) return true;
    return !activeMine;
  }, [activeAssignmentId, uid, activeMine]);

  const activeAssignmentHref = activeAssignmentId
    ? `/student/spaces/${spaceId}/assignments/${activeAssignmentId}`
    : null;

  const spaceRec: Record<string, unknown> = isRecord(space) ? (space as Record<string, unknown>) : {};
  const spaceCode = safeString(spaceRec.code);
  const activeLessonTitleFromSpace = safeString(spaceRec.activeLessonTitle);

  async function moveToArchive(subId: string) {
    if (!uid) return;
    setArchiveMsg(null);
    setArchivingId(subId);

    try {
      const dbx = requireDb(db);
      const ref = doc(dbx, "spaceSubmissions", subId);

      const batch = writeBatch(dbx);
      batch.update(ref, {
        studentArchived: true,
        studentArchivedAt: serverTimestamp(),
      });
      await batch.commit();

      setArchiveMsg(t("toast.movedToArchive"));
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code?: unknown }).code ?? "error") : "error";
      setArchiveMsg(`${code}: ${errMessage(e, t("errors.archiveMove"))}`);
    } finally {
      setArchivingId(null);
      setTimeout(() => setArchiveMsg(null), 2500);
    }
  }

  async function restoreFromArchive(subId: string) {
    if (!uid) return;
    setArchiveMsg(null);
    setArchivingId(subId);

    try {
      const dbx = requireDb(db);
      const ref = doc(dbx, "spaceSubmissions", subId);

      const batch = writeBatch(dbx);
      batch.update(ref, {
        studentArchived: false,
        studentArchivedAt: null,
      });
      await batch.commit();

      setArchiveMsg(t("toast.restored"));
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code?: unknown }).code ?? "error") : "error";
      setArchiveMsg(`${code}: ${errMessage(e, t("errors.archiveRestore"))}`);
    } finally {
      setArchivingId(null);
      setTimeout(() => setArchiveMsg(null), 2500);
    }
  }

  if (missing) {
    return (
      <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-4">
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
          <h1 className="m-0 text-xl font-semibold text-slate-900">{t("missing.title")}</h1>
          <div className="mt-2 text-sm text-slate-600">{t("missing.subtitle")}</div>
          <div className="mt-4">
            <Link href="/student/spaces" className="text-sm font-medium text-slate-700 underline underline-offset-4">
              {t("actions.backToMySpaces")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-4">
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-red-300 bg-red-50 p-5 shadow-sm">
          <h1 className="m-0 text-xl font-semibold text-slate-900">{t("error.title")}</h1>
          <div className="mt-3 whitespace-pre-wrap text-sm text-red-700">{err}</div>
          <div className="mt-4">
            <Link href="/student/spaces" className="text-sm font-medium text-slate-700 underline underline-offset-4">
              {t("actions.backToMySpaces")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!space) return <div className="w-full py-4 text-sm text-slate-600">{t("loading")}</div>;

  return (
    <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-4">
      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 break-words text-2xl font-semibold text-slate-900">
              {safeString(space.title) ?? safeString(spaceRec.title) ?? t("header.untitled")}
            </h1>
            <div className="mt-2 break-words text-sm text-slate-600">
              {t("header.classCode")}: <b>{spaceCode ?? "—"}</b>
            </div>
          </div>

          <div className="flex w-full min-w-0 justify-start lg:w-auto lg:justify-end">
            <Link
              href="/student/spaces"
              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50 sm:w-auto"
            >
              {t("actions.backMySpacesShort")}
            </Link>
          </div>
        </div>
      </div>

      {archiveMsg ? (
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-700 shadow-sm">
          {archiveMsg}
        </div>
      ) : null}

      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-md sm:p-5">
        <div className="text-base font-semibold text-slate-900">{t("active.title")}</div>

        {activeAssignmentId && shouldShowActiveAssignment && activeAssignmentHref ? (
          <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
            <div className="break-words text-lg font-semibold text-slate-900">
              {activeLessonTitleFromSpace ??
                safeString(activeAssignmentDoc?.title) ??
                titleFor(activeAssignmentId)}
            </div>

            {safeString(activeAssignmentDoc?.level) || safeString(activeAssignmentDoc?.language) ? (
              <div className="mt-2 text-sm text-slate-600">
                {[safeString(activeAssignmentDoc?.level), safeString(activeAssignmentDoc?.language)]
                  .filter(Boolean)
                  .join(" • ")}
              </div>
            ) : null}

            <div className="mt-4">
              <Link
                href={activeAssignmentHref}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white no-underline hover:bg-slate-800"
              >
                {t("active.open")}
              </Link>
            </div>

            <div className="mt-3 text-sm text-slate-500">{t("active.hint")}</div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-600">{t("active.none")}</div>
        )}
      </div>

      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-200 p-4 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900">{t("mine.title")}</div>
            <div className="mt-1 text-sm text-slate-600">{t("mine.subtitle")}</div>
          </div>

          <button
            type="button"
            onClick={() => location.reload()}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            {t("mine.refresh")}
          </button>
        </div>

        {!uid ? (
          <div className="mt-4 text-sm text-slate-600">{t("mine.loginToSee")}</div>
        ) : subsLoading ? (
          <div className="mt-4 text-sm text-slate-600">{t("loading")}</div>
        ) : subsErr ? (
          <div className="mt-4 whitespace-pre-wrap text-sm text-red-700">{subsErr}</div>
        ) : activeSubs.length === 0 ? (
          <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-600">
            {t("mine.none")}
          </div>
        ) : (
          <div className="mt-4 grid min-w-0 gap-3">
            {activeSubs.map((g) => {
              const r = g.latest;
              const href = `/student/spaces/${spaceId}/assignments/${g.assignmentId}?sid=${r.id}`;
              const dateStr = fmtDate(r.updatedAtMs || r.createdAtMs);
              const ui = statusUi(r.status);

              return (
                <div
                  key={g.assignmentId}
                  className="box-border w-full min-w-0 max-w-full rounded-xl border border-slate-300 bg-white p-4 shadow-sm"
                >
                  <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-base font-semibold text-slate-900">
                        {r.title ?? titleFor(g.assignmentId)}
                      </div>

                      {metaForRow(r) ? (
                        <div className="mt-2 text-sm text-slate-600">{metaForRow(r)}</div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusPill status={r.status} label={ui.label} hint={ui.hint} />
                        {dateStr ? <span className="text-xs text-slate-500">{dateStr}</span> : null}
                        {r.hasTeacherMessage ? (
                          <span className="text-xs font-medium text-slate-700">{t("mine.teacherMessage")}</span>
                        ) : null}
                      </div>

                      {r.status === "needs_work" ? (
                        <div className="mt-3 text-sm text-slate-700">{t("mine.openForImprovement")}</div>
                      ) : null}
                    </div>

                    <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:w-auto xl:min-w-[320px]">
                      {r.status === "approved" ? (
                        <button
                          type="button"
                          onClick={() => moveToArchive(r.id)}
                          disabled={archivingId === r.id}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                          title={t("mine.archiveHint")}
                        >
                          {archivingId === r.id ? t("mine.archiving") : t("mine.moveToArchive")}
                        </button>
                      ) : (
                        <div className="hidden sm:block" />
                      )}

                      <Link
                        href={href}
                        className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white no-underline hover:bg-slate-800"
                      >
                        {t("actions.open")}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-md sm:p-5">
        <div className="text-base font-semibold text-slate-900">{t("archive.title")}</div>

        {!uid ? (
          <div className="mt-4 text-sm text-slate-600">{t("archive.loginToSee")}</div>
        ) : subsLoading ? (
          <div className="mt-4 text-sm text-slate-600">{t("loading")}</div>
        ) : archivedSubs.length === 0 ? (
          <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-600">
            {t("archive.none")}
          </div>
        ) : (
          <div className="mt-4 grid min-w-0 gap-3">
            {archivedSubs.map((g) => {
              const r = g.latest;
              const href = `/student/spaces/${spaceId}/assignments/${g.assignmentId}?sid=${r.id}`;
              const dateStr = fmtDate(r.studentArchivedAtMs || r.updatedAtMs || r.createdAtMs);
              const ui = statusUi(r.status);

              return (
                <div
                  key={g.assignmentId}
                  className="box-border w-full min-w-0 max-w-full rounded-xl border border-slate-300 bg-white p-4 shadow-sm"
                >
                  <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-base font-semibold text-slate-900">
                        {r.title ?? titleFor(g.assignmentId)}
                      </div>

                      {metaForRow(r) ? (
                        <div className="mt-2 text-sm text-slate-600">{metaForRow(r)}</div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusPill status={r.status} label={ui.label} hint={ui.hint} />
                        {dateStr ? <span className="text-xs text-slate-500">{dateStr}</span> : null}
                        {r.hasTeacherMessage ? (
                          <span className="text-xs font-medium text-slate-700">{t("archive.message")}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:w-auto xl:min-w-[320px]">
                      <button
                        type="button"
                        onClick={() => restoreFromArchive(r.id)}
                        disabled={archivingId === r.id}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                        title={t("archive.restoreHint")}
                      >
                        {archivingId === r.id ? t("archive.restoring") : t("archive.restore")}
                      </button>

                      <Link
                        href={href}
                        className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white no-underline hover:bg-slate-800"
                      >
                        {t("actions.open")}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-200 p-4 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-base font-semibold text-slate-900">{t("all.title")}</div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            {t("all.showArchived")}
          </label>
        </div>

        {assignErr ? (
          <div className="mt-4 whitespace-pre-wrap text-sm text-red-700">{assignErr}</div>
        ) : visibleAssignments.length === 0 ? (
          <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-600">
            {t("all.none")}
          </div>
        ) : (
          <div className="mt-4 grid min-w-0 gap-3">
            {visibleAssignments.map((it) => {
              const title = safeString(it.data.title) ?? it.id;
              const snippet = assignmentSnippet(it.data);
              const archived = isArchived(it.data);

              const mine = uid ? latestByAssignment.get(it.id) : null;

              const href = mine
                ? `/student/spaces/${spaceId}/assignments/${it.id}?sid=${mine.id}`
                : `/student/spaces/${spaceId}/assignments/${it.id}`;

              const mineUi = mine ? statusUi(mine.status) : null;
              const mineDate = mine ? fmtDate(mine.updatedAtMs || mine.createdAtMs) : null;

              return (
                <div
                  key={it.id}
                  className="box-border w-full min-w-0 max-w-full rounded-xl border border-slate-300 bg-white p-4 shadow-sm"
                >
                  <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-base font-semibold text-slate-900">
                        {title}{" "}
                        {archived ? (
                          <span className="text-sm font-medium text-slate-500">{t("all.archivedTag")}</span>
                        ) : null}
                      </div>

                      {mine ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-500">{t("all.yourStatus")}</span>
                          <StatusPill status={mine.status} label={mineUi!.label} hint={mineUi!.hint} />
                          {mine.hasTeacherMessage ? (
                            <span className="text-xs font-medium text-slate-700">{t("all.message")}</span>
                          ) : null}
                          {mineDate ? <span className="text-xs text-slate-500">{mineDate}</span> : null}
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-slate-500">{t("all.notSubmitted")}</div>
                      )}

                      {snippet ? (
                        <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{snippet}</div>
                      ) : null}
                    </div>

                    <div className="w-full min-w-0 sm:w-auto">
                      <Link
                        href={href}
                        className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white no-underline hover:bg-slate-800 sm:w-auto"
                      >
                        {t("actions.open")}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}