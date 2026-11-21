// app/(app)/student/spaces/[spaceId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, MessageSquare } from "lucide-react";
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
import { saveLastStudentSpaceId } from "@/lib/studentLastSpace";
import { getStudentSpaceMembership } from "@/lib/studentSpaceMembership";
import SpacePupilIdentity from "@/components/SpacePupilIdentity";
import { getSubmissionStatus } from "@/lib/submissions/status";

const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
const openTaskClass = `${actionClass} bg-emerald-800 text-white hover:bg-emerald-900`;
const secondaryAction = `${actionClass} border border-solid border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60`;
const taskCardClass = "min-w-0 rounded-xl border border-solid border-slate-200 bg-white p-4 shadow-sm";
const summaryClass = "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden";

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
      color: "rgba(146,64,14,1)",
    };
  }
  if (st === "approved") {
    return {
      border: "1px solid rgba(46,204,113,0.60)",
      background: "rgba(46,204,113,0.16)",
      color: "rgba(6,95,70,1)",
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
  studentMessage?: string;
  studentMessageUpdatedAt?: unknown;
  dueAt?: unknown;
  [k: string]: unknown;
};

type WritingActivityDoc = {
  title?: string;
  status?: string;
  genre?: string;
  level?: string;
  language?: string;
  theme?: string | null;
  progression?: string;
  aiPolicy?: { enabled?: boolean; maxUsesTotal?: number };
  assignedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type SpaceTaskItem =
  | { kind: "assignment"; id: string; data: AssignmentDoc }
  | { kind: "writing"; id: string; data: WritingActivityDoc };

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

type WritingSubRow = {
  id: string;
  activityId: string;
  status: string;
  updatedAtMs: number;
  createdAtMs: number;
  hasTeacherMessage: boolean;
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

function normalizeWritingStatus(value: unknown) {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "planning_submitted") return "planning_submitted";
  if (status === "planning_reviewed") return "planning_reviewed";
  if (status === "submitted") return "submitted";
  if (status === "reviewed" || status === "approved") return "reviewed";
  if (status === "needs_work") return "needs_work";
  if (status === "draft") return "draft";
  return status || "draft";
}

function writingStatusLabel(locale: string, status: string) {
  const nb = locale === "no" || locale === "nb";
  const pt = locale === "pt";
  if (status === "planning_submitted") return nb ? "Plan sendt" : pt ? "Plano enviado" : "Plan sent";
  if (status === "planning_reviewed") return nb ? "Plan vurdert" : pt ? "Plano revisto" : "Plan reviewed";
  if (status === "submitted") return nb ? "Sendt" : pt ? "Enviado" : "Submitted";
  if (status === "reviewed") return nb ? "Vurdert" : pt ? "Revisto" : "Reviewed";
  if (status === "needs_work") return nb ? "Må forbedres" : pt ? "Precisa melhorar" : "Needs work";
  if (status === "draft") return nb ? "Kladd" : pt ? "Rascunho" : "Draft";
  return status;
}

function writingStatusHint(locale: string, status: string) {
  const nb = locale === "no" || locale === "nb";
  const pt = locale === "pt";
  if (status === "draft") return nb ? "Kladd lagret" : pt ? "Rascunho salvo" : "Draft saved";
  if (status === "planning_submitted") return nb ? "Plan sendt til lærer" : pt ? "Plano enviado ao professor" : "Plan sent to teacher";
  if (status === "submitted") return nb ? "Tekst sendt til lærer" : pt ? "Texto enviado ao professor" : "Text sent to teacher";
  return "";
}

function writingSubRowFromData(
  id: string,
  activityId: string,
  data: Record<string, unknown>
): WritingSubRow {
  return {
    id,
    activityId,
    status: normalizeWritingStatus(data.status),
    updatedAtMs: toMillisAny(data.updatedAt) || toMillisAny(data.createdAt),
    createdAtMs: toMillisAny(data.createdAt),
    hasTeacherMessage: detectTeacherMessage(data),
  };
}

function spaceSubRowFromData(
  id: string,
  data: Record<string, unknown>,
  expectedSpaceId: string
): SpaceSubRow | null {
  if (safeString(data.spaceId) !== expectedSpaceId) return null;

  const assignmentId = safeString(data.assignmentId) ?? "";
  if (!assignmentId) return null;

  return {
    id,
    assignmentId,
    status: normalizeStatus(getSubmissionStatus(data)),
    updatedAtMs: toMillisAny(data.updatedAt) || toMillisAny(data.createdAt),
    createdAtMs: toMillisAny(data.createdAt),
    title: safeString(data.title) ?? null,
    level: safeString(data.level) ?? null,
    language: safeString(data.language) ?? null,
    hasTeacherMessage: detectTeacherMessage(data),
    studentArchived: data.studentArchived === true,
    studentArchivedAtMs: toMillisAny(data.studentArchivedAt),
  };
}

export default function StudentSpaceDetailPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const t = useTranslations("studentspaceDetail");
  const locale = useLocale();

  const { user } = useUserProfile();
  const uid = user?.uid ?? null;

  const [space, setSpace] = useState<SpaceDoc | null>(null);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<Array<{ id: string; data: AssignmentDoc }>>([]);
  const [assignErr, setAssignErr] = useState<string | null>(null);

  const [writingActivities, setWritingActivities] = useState<Array<{ id: string; data: WritingActivityDoc }>>([]);
  const [writingErr, setWritingErr] = useState<string | null>(null);

  const [subsLoading, setSubsLoading] = useState(true);
  const [subsErr, setSubsErr] = useState<string | null>(null);
  const [subs, setSubs] = useState<SpaceSubRow[]>([]);
  const [nestedSubs, setNestedSubs] = useState<SpaceSubRow[]>([]);
  const [writingSubs, setWritingSubs] = useState<WritingSubRow[]>([]);
  const [currentParticipantId, setCurrentParticipantId] = useState<string | null>(null);

  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);

  const dateLocale = useMemo(() => {
    if (locale === "no") return "nb-NO";
    if (locale === "en") return "en-GB";
    return locale;
  }, [locale]);

  useEffect(() => {
    if (spaceId) saveLastStudentSpaceId(spaceId);
  }, [spaceId]);

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

  function fmtDueDate(v: unknown) {
    try {
      if (!v || typeof v !== "object" || !("toDate" in v)) return null;

      const d = (v as { toDate: () => Date }).toDate();

      return new Intl.DateTimeFormat(dateLocale, {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return null;
    }
  }

  function dueStatus(v: unknown): "none" | "overdue" | "soon" | "ok" {
    try {
      if (!v || typeof v !== "object" || !("toDate" in v)) return "none";

      const d = (v as { toDate: () => Date }).toDate();
      const now = new Date();

      const diffMs = d.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffMs < 0) return "overdue";
      if (diffHours <= 48) return "soon";
      return "ok";
    } catch {
      return "none";
    }
  }

  function renderDueBadge(status: ReturnType<typeof dueStatus>) {
    if (status === "overdue") {
      return (
        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
          {t("due.overdue")}
        </span>
      );
    }

    if (status === "soon") {
      return (
        <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-xs font-semibold text-yellow-800">
          {t("due.soon")}
        </span>
      );
    }

    return null;
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
    setWritingErr(null);

    let unsub: (() => void) | null = null;
    try {
      const dbx = requireDb(db);
      const qy = query(collection(dbx, "spaces", spaceId, "writingActivities"), orderBy("updatedAt", "desc"));
      unsub = onSnapshot(
        qy,
        (snap) => {
          const out: Array<{ id: string; data: WritingActivityDoc }> = [];
          snap.forEach((d: QueryDocumentSnapshot<DocumentData>) =>
            out.push({ id: d.id, data: d.data() as WritingActivityDoc })
          );
          setWritingActivities(out);
        },
        (e: unknown) => setWritingErr(errMessage(e, t("errors.readWritingActivities")))
      );
    } catch (e: unknown) {
      setWritingErr(errMessage(e, t("errors.listenWritingActivitiesStart")));
    }

    return () => unsub?.();
  }, [spaceId, t]);

  useEffect(() => {
    setSubsErr(null);
    setArchiveMsg(null);

    if (!uid) {
      setSubsLoading(false);
      setSubs([]);
      setNestedSubs([]);
      setCurrentParticipantId(null);
      return () => { };
    }

    let unsub: (() => void) | null = null;
    let unsubs: Array<() => void> = [];
    let cancelled = false;
    setSubsLoading(true);

    try {
      const dbx = requireDb(db);

      const rowsFromSnapshot = (snap: { forEach: (cb: (d: QueryDocumentSnapshot<DocumentData>) => void) => void }) => {
        const out: SpaceSubRow[] = [];
        snap.forEach((d) => {
          const row = spaceSubRowFromData(d.id, ((d.data() as unknown) as Record<string, unknown>) ?? {}, spaceId);
          if (row) out.push(row);
        });

        return out;
      };

      const buckets = new Map<string, SpaceSubRow[]>();
      const applyBuckets = () => {
        const byId = new Map<string, SpaceSubRow>();
        for (const rows of buckets.values()) {
          for (const row of rows) byId.set(row.id, row);
        }
        const out = Array.from(byId.values()).sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
        setSubs(out);
        setSubsLoading(false);
      };

      const handleSnapshotError = (e: unknown) => {
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code?: unknown }).code ?? "error")
            : "error";
        setSubsErr(`${code}: ${errMessage(e, t("errors.readSubmissions"))}`);
        setSubsLoading(false);
      };

      const start = async () => {
        const membership = await getStudentSpaceMembership(dbx, spaceId, uid).catch(() => null);
        if (cancelled) return;

        const activeParticipantId = membership?.participantId || uid;
        setCurrentParticipantId(activeParticipantId);
        const queries = [
          {
            key: "uid",
            qy: query(collection(dbx, "spaceSubmissions"), where("spaceId", "==", spaceId), where("uid", "==", uid), limit(200)),
          },
        ];

        unsubs = queries.map(({ key, qy }) =>
          onSnapshot(
            qy,
            (snap) => {
              buckets.set(key, rowsFromSnapshot(snap));
              applyBuckets();
            },
            handleSnapshotError
          )
        );
      };

      void start();
      unsub = () => {
        cancelled = true;
        unsubs.forEach((fn) => fn());
      };
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

  useEffect(() => {
    setNestedSubs([]);

    if (!uid || !currentParticipantId || assignments.length === 0) {
      return () => { };
    }

    let cancelled = false;
    const buckets = new Map<string, SpaceSubRow>();
    const unsubs: Array<() => void> = [];

    try {
      const dbx = requireDb(db);
      const identityIds = Array.from(new Set([currentParticipantId, uid].filter(Boolean)));

      const applyBuckets = () => {
        if (cancelled) return;
        const out = Array.from(buckets.values()).sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
        setNestedSubs(out);
      };

      for (const assignment of assignments) {
        for (const identityId of identityIds) {
          const subId = `${spaceId}_${assignment.id}_${identityId}`;
          const ref = doc(dbx, "spaces", spaceId, "lessons", assignment.id, "submissions", subId);

          unsubs.push(
            onSnapshot(
              ref,
              (snap) => {
                if (!snap.exists()) {
                  buckets.delete(subId);
                  applyBuckets();
                  return;
                }

                const row = spaceSubRowFromData(
                  snap.id,
                  ((snap.data() as unknown) as Record<string, unknown>) ?? {},
                  spaceId
                );
                if (row) buckets.set(subId, row);
                else buckets.delete(subId);
                applyBuckets();
              },
              () => {
                buckets.delete(subId);
                applyBuckets();
              }
            )
          );
        }
      }
    } catch {
      setNestedSubs([]);
    }

    return () => {
      cancelled = true;
      unsubs.forEach((fn) => fn());
    };
  }, [spaceId, uid, currentParticipantId, assignments]);

  useEffect(() => {
    setWritingSubs([]);

    if (!uid || !currentParticipantId || writingActivities.length === 0) {
      return () => { };
    }

    let cancelled = false;
    const buckets = new Map<string, WritingSubRow>();
    const unsubs: Array<() => void> = [];

    try {
      const dbx = requireDb(db);
      const identityIds = Array.from(new Set([currentParticipantId, uid].filter(Boolean)));

      const applyBuckets = () => {
        if (cancelled) return;
        const out = Array.from(buckets.values()).sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
        setWritingSubs(out);
      };

      for (const activity of writingActivities) {
        for (const identityId of identityIds) {
          const subId = `${spaceId}_${activity.id}_${identityId}`;
          const ref = doc(dbx, "spaces", spaceId, "writingActivities", activity.id, "submissions", subId);

          unsubs.push(
            onSnapshot(
              ref,
              (snap) => {
                if (!snap.exists()) {
                  buckets.delete(subId);
                  applyBuckets();
                  return;
                }

                const row = writingSubRowFromData(
                  snap.id,
                  activity.id,
                  ((snap.data() as unknown) as Record<string, unknown>) ?? {}
                );
                buckets.set(subId, row);
                applyBuckets();
              },
              () => {
                buckets.delete(subId);
                applyBuckets();
              }
            )
          );
        }
      }
    } catch {
      setWritingSubs([]);
    }

    return () => {
      cancelled = true;
      unsubs.forEach((fn) => fn());
    };
  }, [spaceId, uid, currentParticipantId, writingActivities]);

  const sortedAssignments = useMemo(() => {
    return [...assignments].sort((a, b) => {
      const getDue = (d: unknown) => {
        if (!d || typeof d !== "object" || !("toDate" in d)) return null;
        return (d as { toDate: () => Date }).toDate().getTime();
      };

      const da = getDue(a.data.dueAt);
      const db = getDue(b.data.dueAt);

      const now = Date.now();

      const score = (time: number | null) => {
        if (!time) return 3;
        if (time < now) return 0;
        if (time - now < 48 * 60 * 60 * 1000) return 1;
        return 2;
      };

      const sa = score(da);
      const sb = score(db);

      if (sa !== sb) return sa - sb;

      return (db ?? 0) - (da ?? 0);
    });
  }, [assignments]);

  const sortedWritingActivities = useMemo(() => {
    return [...writingActivities].sort((a, b) => toMillisAny(b.data.assignedAt || b.data.createdAt) - toMillisAny(a.data.assignedAt || a.data.createdAt));
  }, [writingActivities]);

  const { activeTasks, archivedTasks } = useMemo(() => {
    const items: SpaceTaskItem[] = [
      ...sortedAssignments.map((assignment) => ({ kind: "assignment" as const, ...assignment })),
      ...sortedWritingActivities.map((activity) => ({ kind: "writing" as const, ...activity })),
    ];

    items.sort((a, b) => {
      const getDue = (v: unknown) => {
        if (!v || typeof v !== "object" || !("toDate" in v)) return null;
        return (v as { toDate: () => Date }).toDate().getTime();
      };

      const now = Date.now();
      const score = (item: SpaceTaskItem) => {
        if (item.kind !== "assignment") return 3;
        const time = getDue(item.data.dueAt);
        if (!time) return 3;
        if (time < now) return 0;
        if (time - now < 48 * 60 * 60 * 1000) return 1;
        return 2;
      };
      const dateOf = (item: SpaceTaskItem) => toMillisAny(item.data.updatedAt || item.data.assignedAt || item.data.createdAt);

      const sa = score(a);
      const sb = score(b);
      if (sa !== sb) return sa - sb;
      return dateOf(b) - dateOf(a);
    });

    const activeTasks: SpaceTaskItem[] = [];
    const archivedTasks: SpaceTaskItem[] = [];
    for (const task of items) {
      const archived = task.kind === "assignment"
        ? isArchived(task.data)
        : String(task.data.status ?? "").toLowerCase() === "archived";
      (archived ? archivedTasks : activeTasks).push(task);
    }
    return { activeTasks, archivedTasks };
  }, [sortedAssignments, sortedWritingActivities]);

  const latestByAssignment = useMemo(() => {
    const m = new Map<string, SpaceSubRow>();
    for (const r of [...subs, ...nestedSubs].sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0))) {
      if (!m.has(r.assignmentId)) m.set(r.assignmentId, r);
    }
    return m;
  }, [subs, nestedSubs]);

  const latestWritingByActivity = useMemo(() => {
    const m = new Map<string, WritingSubRow>();
    for (const r of [...writingSubs].sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0))) {
      if (!m.has(r.activityId)) m.set(r.activityId, r);
    }
    return m;
  }, [writingSubs]);

  const grouped = useMemo(() => {
    const out: Array<{ assignmentId: string; latest: SpaceSubRow }> = [];
    for (const [assignmentId, latest] of latestByAssignment.entries()) out.push({ assignmentId, latest });
    out.sort((a, b) => (b.latest.updatedAtMs || 0) - (a.latest.updatedAtMs || 0));
    return out;
  }, [latestByAssignment]);

  const archivedSubs = useMemo(() => grouped.filter((g) => g.latest.studentArchived === true), [grouped]);

  function metaForRow(r: SpaceSubRow | null) {
    if (!r) return null;
    const parts = [safeString(r.level), safeString(r.language)].filter(Boolean);
    return parts.length ? parts.join(" • ") : null;
  }

  const spaceCode = safeString(space?.code) ?? safeString(space?.joinCode);

  async function moveToArchive(row: SpaceSubRow) {
    if (!uid) return;
    const subId = row.id;
    setArchiveMsg(null);
    setArchivingId(subId);

    try {
      const dbx = requireDb(db);
      const nestedRef = doc(dbx, "spaces", spaceId, "lessons", row.assignmentId, "submissions", subId);

      const batch = writeBatch(dbx);
      batch.update(nestedRef, {
        studentArchived: true,
        studentArchivedAt: serverTimestamp(),
      });
      await batch.commit();

      try {
        const indexRef = doc(dbx, "spaceSubmissions", subId);
        const indexBatch = writeBatch(dbx);
        indexBatch.update(indexRef, {
          studentArchived: true,
          studentArchivedAt: serverTimestamp(),
        });
        await indexBatch.commit();
      } catch {
        // The nested submission drives the visible archive state for students.
      }

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

  async function restoreFromArchive(row: SpaceSubRow) {
    if (!uid) return;
    const subId = row.id;
    setArchiveMsg(null);
    setArchivingId(subId);

    try {
      const dbx = requireDb(db);
      const nestedRef = doc(dbx, "spaces", spaceId, "lessons", row.assignmentId, "submissions", subId);

      const batch = writeBatch(dbx);
      batch.update(nestedRef, {
        studentArchived: false,
        studentArchivedAt: null,
      });
      await batch.commit();

      try {
        const indexRef = doc(dbx, "spaceSubmissions", subId);
        const indexBatch = writeBatch(dbx);
        indexBatch.update(indexRef, {
          studentArchived: false,
          studentArchivedAt: null,
        });
        await indexBatch.commit();
      } catch {
        // The nested submission drives the visible archive state for students.
      }

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
      <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-3 sm:space-y-4">
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-white p-3 shadow-sm sm:p-5">
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
      <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-3 sm:space-y-4">
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-red-300 bg-red-50 p-3 shadow-sm sm:p-5">
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

  function renderTask(task: SpaceTaskItem) {
    const writing = task.kind === "writing" ? task.data : null;
    const lesson = task.kind === "assignment" ? task.data : null;
    const title = safeString(task.data.title) ?? t(writing ? "writingStation.fallbackTitle" : "all.untitled");
    const mine = lesson && uid ? latestByAssignment.get(task.id) : null;
    const mineWriting = writing && uid ? latestWritingByActivity.get(task.id) : null;
    const latest = mine ?? mineWriting;
    const latestDate = latest ? fmtDate(latest.updatedAtMs || latest.createdAtMs) : null;
    const status = mine
      ? { value: mine.status, ...statusUi(mine.status) }
      : mineWriting
        ? {
            value: normalizeStatus(mineWriting.status),
            label: writingStatusLabel(locale, mineWriting.status),
            hint: writingStatusHint(locale, mineWriting.status),
          }
        : null;
    const href = writing
      ? `/student/spaces/${spaceId}/writing/${task.id}`
      : `/student/spaces/${spaceId}/assignments/${task.id}${mine ? `?sid=${mine.id}` : ""}`;
    const note = lesson ? safeString(lesson.studentMessage) : null;
    const snippet = lesson ? assignmentSnippet(lesson) : null;
    const deadline = lesson ? fmtDueDate(lesson.dueAt) : null;
    const writingMeta = writing ? [
      safeString(writing.genre) ?? t("writingStation.genre.story"),
      safeString(writing.level),
      safeString(writing.language),
      safeString(writing.theme),
      fmtDate(toMillisAny(writing.assignedAt || writing.createdAt)),
    ].filter(Boolean).join(" · ") : null;

    return (
      <article key={`${task.kind}-${task.id}`} className={taskCardClass}>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <h3 className="m-0 break-words text-lg font-semibold text-slate-950">{title}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              {writing ? <span className="text-xs font-medium text-slate-600">{t("all.typeWriting")}</span> : null}
              {status ? (
                <StatusPill status={status.value} label={status.label} hint={status.hint} />
              ) : (
                <span className="text-sm text-slate-600">{t("all.notSubmitted")}</span>
              )}
              {latest?.hasTeacherMessage ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-900">
                  <MessageSquare aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  {t("all.message")}
                </span>
              ) : null}
            </div>
          </div>
          <Link href={href} aria-label={t("actions.openNamed", { title })} className={openTaskClass}>
            {t("actions.openTask")}
            <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          </Link>
        </div>

        {deadline ? (
          <p className="mb-0 mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
            <span className="font-semibold">{t("due.label")}</span>
            <span>{deadline}</span>
            {renderDueBadge(dueStatus(lesson?.dueAt))}
          </p>
        ) : null}

        {note ? (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="m-0 font-semibold">{t("all.teacherNote")}</p>
            <p className="mb-0 mt-1 whitespace-pre-wrap break-words">{note}</p>
          </div>
        ) : null}

        {writing || snippet || mine || latestDate ? (
          <details className="group/task-info mt-3 rounded-lg border border-solid border-slate-200 bg-slate-50">
            <summary className={summaryClass}>
              {t("all.details")}
              <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 group-open/task-info:rotate-180" />
            </summary>
            <div className="space-y-2 border-0 border-t border-solid border-slate-200 p-3 text-sm text-slate-700">
              {snippet ? <p className="m-0 whitespace-pre-wrap break-words">{snippet}</p> : null}
              {writing ? (
                <>
                  <p className="m-0 break-words">{writingMeta}</p>
                  <p className="m-0">{writing.aiPolicy?.enabled === false ? t("writingStation.ai.off") : t("writingStation.ai.on")}</p>
                </>
              ) : null}
              {latestDate ? <p className="m-0">{t("all.lastUpdated", { date: latestDate })}</p> : null}
              {mine ? (
                <button
                  type="button"
                  onClick={() => void moveToArchive(mine)}
                  disabled={archivingId === mine.id}
                  className={secondaryAction}
                  title={t("mine.archiveHint")}
                >
                  {archivingId === mine.id ? t("mine.archiving") : t("mine.moveToArchive")}
                </button>
              ) : null}
            </div>
          </details>
        ) : null}
      </article>
    );
  }

  const taskError = [assignErr, writingErr].filter(Boolean).join("\n");

  return (
    <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-4">
      <header className="space-y-3 rounded-2xl border border-solid border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <Link href="/student/spaces" className="inline-flex text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-950">
          {t("actions.backMySpacesShort")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0 min-w-0 flex-1 basis-60 break-words text-2xl font-semibold text-slate-950 sm:text-3xl">
            {safeString(space.title) ?? t("header.untitled")}
          </h1>
          {spaceCode ? (
            <p className="m-0 flex max-w-full flex-wrap items-center gap-x-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
              <span>{t("header.classCode")}</span>
              <b className="break-all font-mono text-slate-950">{spaceCode}</b>
            </p>
          ) : null}
        </div>
        <SpacePupilIdentity spaceId={spaceId} />
      </header>

      {archiveMsg ? (
        <p role="status" className="m-0 rounded-lg border border-solid border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          {archiveMsg}
        </p>
      ) : null}

      <section aria-labelledby="room-tasks-heading" className="space-y-3">
        <h2 id="room-tasks-heading" className="m-0 text-xl font-semibold text-slate-950">{t("all.title")}</h2>
        {taskError ? (
          <p role="alert" className="m-0 whitespace-pre-wrap rounded-xl bg-red-50 p-3 text-sm text-red-700">{taskError}</p>
        ) : activeTasks.length === 0 ? (
          <p className="m-0 rounded-xl border border-solid border-slate-200 bg-white p-4 text-sm text-slate-600">{t("all.none")}</p>
        ) : (
          <div className="grid min-w-0 gap-3">{activeTasks.map(renderTask)}</div>
        )}
      </section>

      {!taskError && archivedTasks.length > 0 ? (
        <details className="group/archive rounded-xl border border-solid border-slate-200 bg-white">
          <summary className={summaryClass}>
            {t("all.archivedTitle")}
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 group-open/archive:rotate-180" />
          </summary>
          <div className="grid min-w-0 gap-3 px-3 pb-3">{archivedTasks.map(renderTask)}</div>
        </details>
      ) : null}

      <details className="group/archive rounded-xl border border-solid border-slate-200 bg-white">
        <summary className={summaryClass}>
          {t("archive.title")}
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 group-open/archive:rotate-180" />
        </summary>
        <div className="px-3 pb-3">
          {!uid ? (
            <p className="m-0 text-sm text-slate-600">{t("archive.loginToSee")}</p>
          ) : subsLoading ? (
            <p role="status" className="m-0 text-sm text-slate-600">{t("loading")}</p>
          ) : subsErr ? (
            <p role="alert" className="m-0 whitespace-pre-wrap text-sm text-red-700">{subsErr}</p>
          ) : archivedSubs.length === 0 ? (
            <p className="m-0 text-sm text-slate-600">{t("archive.none")}</p>
          ) : (
            <div className="grid min-w-0 gap-3">
              {archivedSubs.map(({ assignmentId, latest: row }) => {
                const title = row.title ?? t("all.untitled");
                const href = `/student/spaces/${spaceId}/assignments/${assignmentId}?sid=${row.id}`;
                const date = fmtDate(row.studentArchivedAtMs || row.updatedAtMs || row.createdAtMs);
                const metadata = metaForRow(row);
                const ui = statusUi(row.status);

                return (
                  <article key={assignmentId} className={taskCardClass}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 basis-64">
                        <h3 className="m-0 break-words text-base font-semibold text-slate-950">{title}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          <StatusPill status={row.status} label={ui.label} hint={ui.hint} />
                          {row.hasTeacherMessage ? <span className="font-semibold text-emerald-900">{t("all.message")}</span> : null}
                          {metadata ? <span>{metadata}</span> : null}
                          {date ? <span>{date}</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={href} aria-label={t("actions.openNamed", { title })} className={secondaryAction}>
                          {t("actions.openTask")}
                        </Link>
                        <button
                          type="button"
                          onClick={() => void restoreFromArchive(row)}
                          disabled={archivingId === row.id}
                          className={secondaryAction}
                          title={t("archive.restoreHint")}
                        >
                          {archivingId === row.id ? t("archive.restoring") : t("archive.restore")}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
