// app/[locale]/(app)/parent/spaces/[spaceId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import FamilyDeviceAccessPanel from "@/components/child/FamilyDeviceAccessPanel";
import { childRoomHref } from "@/lib/familyDevice";
import { isDelivered } from "@/lib/familyAssignments";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, BookOpen, Plus } from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Firestore,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import type { FamilyGoalProgress } from "@/lib/parentGoals";
import type { SpaceDoc } from "@/lib/spacesClient";
import { canShareContentToParentSpace } from "@/lib/spaceSharing";
import { hasParentFeedback, needsParentReply } from "@/lib/parentFeedback";

type TFn = ReturnType<typeof useTranslations>;

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
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

type AssignmentDoc = {
  title?: string;
  description?: string;
  summary?: string;
  subtitle?: string;
  status?: string;
  archived?: boolean;
  archivedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  sourceId?: string;
  sourceType?: string;
  level?: string;
  language?: string;
  [k: string]: unknown;
};

type ParentSpaceSubmissionDoc = {
  uid?: string;
  status?: string;
  aiFeedback?: string | null;
  auto?: {
    score?: number;
    maxScore?: number;
    correctCount?: number;
    totalAutoGraded?: number;
  };
  [k: string]: unknown;
};

type ParentReviewDoc = {
  uid?: string;
  comment?: string;
  stars?: number;
  updatedAt?: unknown;
};

type AssignmentStatusMeta = {
  hasSubmission: boolean;
  isChildWork: boolean;
  submissionStatus: string | null;
  hasAiFeedback: boolean;
  autoSummary: string | null;
  hasParentReview: boolean;
  reviewLoaded: boolean;
  reviewStars: number | null;
};

function needsFeedback(meta?: AssignmentStatusMeta | null): boolean {
  return !!meta?.reviewLoaded && needsParentReply(meta.submissionStatus, meta.isChildWork, meta.hasParentReview);
}

function assignmentSnippet(d: AssignmentDoc) {
  const asRec: Record<string, unknown> = d;
  const s = safeString(d.description ?? asRec.summary ?? asRec.subtitle);
  if (!s) return null;
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

function isArchived(d: AssignmentDoc) {
  return d.archived === true || String(d.status ?? "").toLowerCase() === "archived";
}

function buildParentSubmissionId(spaceId: string, assignmentId: string, uid: string) {
  return `${spaceId}_${assignmentId}_${uid}`;
}

function renderAutoSummary(auto: ParentSpaceSubmissionDoc["auto"]): string | null {
  if (!auto) return null;

  const score = safeNumber(auto.score);
  const maxScore = safeNumber(auto.maxScore);
  if (score !== null && maxScore !== null && maxScore > 0) return `${score}/${maxScore}`;

  const correct = safeNumber(auto.correctCount);
  const total = safeNumber(auto.totalAutoGraded);
  if (correct !== null && total !== null && total > 0) return `${correct}/${total}`;

  return null;
}

function statusLabel(status: string | null, t: TFn) {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return t("status.notStarted");
  if (s === "draft") return t("status.draft");
  if (s === "submitted") return t("status.submitted");
  if (s === "needs_work") return t("status.needsWork");
  if (s === "reviewed" || s === "approved") return t("status.reviewed");
  return s;
}

function statusTone(status: string | null): "neutral" | "good" | "warn" {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "submitted" || s === "reviewed" || s === "approved") return "good";
  if (s === "draft" || s === "needs_work") return "warn";
  return "neutral";
}

function kindLabel(kind: string | null, t: TFn) {
  if (kind === "family") return t("kinds.family");
  if (kind === "parent_group") return t("kinds.parentGroup");
  return t("kinds.other");
}

function Badge({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const styles =
    tone === "good"
      ? {
        border: "rgba(16,185,129,0.40)",
        bg: "rgba(16,185,129,0.10)",
        color: "rgba(5,150,105,1)",
      }
      : tone === "warn"
        ? {
          border: "rgba(245,158,11,0.40)",
          bg: "rgba(245,158,11,0.10)",
          color: "rgba(180,83,9,1)",
        }
        : {
          border: "rgba(0,0,0,0.14)",
          bg: "rgba(0,0,0,0.04)",
          color: "rgba(0,0,0,0.78)",
        };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${styles.border}`,
        background: styles.bg,
        color: styles.color,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

export default function ParentSpaceDetailPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const t = useTranslations("parentSpaceDetail");
  const locale = useLocale();

  const tx = useMemo(
    () => (key: string, fallback: string) => {
      try {
        return t(key as never);
      } catch {
        return fallback;
      }
    },
    [t]
  );

  const [user, setUser] = useState<User | null>(null);

  const [space, setSpace] = useState<SpaceDoc | null>(null);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<Array<{ id: string; data: AssignmentDoc }>>([]);
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const [archiveBusyId, setArchiveBusyId] = useState<string | null>(null);

  const [statusMap, setStatusMap] = useState<Record<string, AssignmentStatusMeta>>({});
  const [goalSummary, setGoalSummary] = useState<{ spaceId: string; uid: string; goals: FamilyGoalProgress[] } | null>(null);
  const [goalRevision, setGoalRevision] = useState(0);
  const [goalLoadFailed, setGoalLoadFailed] = useState(false);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTargetCount, setGoalTargetCount] = useState("3");
  const [goalReward, setGoalReward] = useState("");
  const [goalBusy, setGoalBusy] = useState(false);
  const [goalMsg, setGoalMsg] = useState<string | null>(null);
  const [rewardBusyId, setRewardBusyId] = useState<string | null>(null);
  const [rewardError, setRewardError] = useState<{ goalId: string; rewardGivenAt?: number } | null>(null);
  const goalsApi = "/api/parent/spaces/" + encodeURIComponent(spaceId) + "/goals";

  const collatorLocale = useMemo(() => (locale === "no" ? "nb" : "en"), [locale]);

  function titleOfAssignment(d: AssignmentDoc, id: string) {
    return safeString(d.title) ?? id;
  }

  async function archiveAssignment(assignmentId: string) {
    setArchiveBusyId(assignmentId);
    setAssignErr(null);

    try {
      const dbx = requireDb(db);
      await updateDoc(doc(dbx, "spaces", spaceId, "lessons", assignmentId), {
        archived: true,
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (e: unknown) {
      setAssignErr(errMessage(e, tx("errors.archiveAssignment", "Could not archive assignment.")));
    } finally {
      setArchiveBusyId(null);
    }
  }

  async function createGoal() {
    if (!user?.uid) {
      setGoalMsg(t("goals.loginRequired"));
      return;
    }

    const title = goalTitle.trim();
    const targetCount = Number(goalTargetCount);
    const reward = goalReward.trim();

    if (!title) {
      setGoalMsg(t("goals.titleRequired"));
      return;
    }

    if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 100) {
      setGoalMsg(t("goals.targetInvalid"));
      return;
    }

    setGoalBusy(true);
    setGoalMsg(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch(goalsApi, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ title, targetCount, reward }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(t("goals.saveFailed"));

      setGoalTitle("");
      setGoalTargetCount("3");
      setGoalReward("");
      setGoalMsg(t("goals.saved"));
      setGoalRevision((revision) => revision + 1);
    } catch (e: unknown) {
      setGoalMsg(errMessage(e, t("goals.saveFailed")));
    } finally {
      setGoalBusy(false);
    }
  }

  async function updateRewardStatus(goalId: string, currentRewardGivenAt?: number) {
    if (!user || rewardBusyId) return;
    setRewardBusyId(goalId);
    setRewardError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(goalsApi, {
        method: "PATCH",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ goalId, given: currentRewardGivenAt === undefined, expectedRewardGivenAt: currentRewardGivenAt }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(t("goals.rewardStatusFailed"));
      const { rewardGivenAt }: { rewardGivenAt: number | null } = await response.json();
      setGoalSummary((current) => current?.spaceId === spaceId && current.uid === user.uid ? {
        ...current,
        goals: current.goals.map((goal) => goal.id === goalId
          ? { ...goal, data: { ...goal.data, rewardGivenAt: rewardGivenAt ?? undefined } }
          : goal),
      } : current);
    } catch {
      setRewardError({ goalId, rewardGivenAt: currentRewardGivenAt });
    } finally {
      setGoalRevision((revision) => revision + 1);
      setRewardBusyId(null);
    }
  }

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

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
      setErr(errMessage(e, tx("errors.listenStart", "Could not start space listener.")));
    }

    return () => unsub?.();
  }, [spaceId, t, tx]);

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

          snap.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
            out.push({ id: d.id, data: d.data() as AssignmentDoc });
          });

          out.sort((a, b) =>
            titleOfAssignment(a.data, a.id).localeCompare(
              titleOfAssignment(b.data, b.id),
              collatorLocale
            )
          );

          setAssignments(out);
        },
        (e: unknown) =>
          setAssignErr(errMessage(e, t("errors.readAssignments")))
      );
    } catch (e: unknown) {
      setAssignErr(
        errMessage(e, tx("errors.listenAssignmentsStart", "Could not start assignments listener."))
      );
    }

    return () => unsub?.();
  }, [spaceId, collatorLocale, t, tx]);

  useEffect(() => {
    if (!user) return;
    const refresh = () => setGoalRevision((revision) => revision + 1);
    const unsubscribe = db ? onSnapshot(collection(db, "spaces", spaceId, "goals"), refresh, () => {}) : undefined;
    window.addEventListener("focus", refresh);
    return () => {
      unsubscribe?.();
      window.removeEventListener("focus", refresh);
    };
  }, [spaceId, user]);

  useEffect(() => {
    if (!user?.uid || assignments.length === 0) {
      setStatusMap({});
      return;
    }

    const dbx = requireDb(db);
    const unsubs: Array<() => void> = [];
    const nextMap: Record<string, AssignmentStatusMeta> = {};

    function patch(id: string, patchObj: Partial<AssignmentStatusMeta>) {
      const prev = nextMap[id] ?? {
        hasSubmission: false,
        isChildWork: false,
        submissionStatus: null,
        hasAiFeedback: false,
        autoSummary: null,
        hasParentReview: false,
        reviewLoaded: false,
        reviewStars: null,
      };

      nextMap[id] = { ...prev, ...patchObj };
      setStatusMap((old) => ({
        ...old,
        [id]: nextMap[id],
      }));
    }

    for (const item of assignments) {
      const assignmentId = item.id;
      const submissionId = buildParentSubmissionId(spaceId, assignmentId, user.uid);

      const unsubSubmission = onSnapshot(
        doc(dbx, "spaces", spaceId, "lessons", assignmentId, "submissions", submissionId),
        (snap) => {
          if (!snap.exists()) {
            patch(assignmentId, {
              hasSubmission: false,
              isChildWork: false,
              submissionStatus: null,
              hasAiFeedback: false,
              autoSummary: null,
            });
            return;
          }

          const data = snap.data() as ParentSpaceSubmissionDoc;
          patch(assignmentId, {
            hasSubmission: true,
            isChildWork: data.isChildPortal === true,
            submissionStatus: safeString(data.status),
            hasAiFeedback: !!safeString(data.aiFeedback),
            autoSummary: renderAutoSummary(data.auto),
          });
        },
        () => { }
      );

      const unsubReview = onSnapshot(
        doc(dbx, "spaces", spaceId, "lessons", assignmentId, "parentReviews", user.uid),
        (snap) => {
          if (!snap.exists()) {
            patch(assignmentId, {
              hasParentReview: false,
              reviewLoaded: true,
              reviewStars: null,
            });
            return;
          }

          const data = snap.data() as ParentReviewDoc;
          patch(assignmentId, {
            hasParentReview: hasParentFeedback(data),
            reviewLoaded: true,
            reviewStars: safeNumber(data.stars),
          });
        },
        () => { }
      );

      unsubs.push(unsubSubmission, unsubReview);
    }

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [assignments, spaceId, user?.uid]);

  const deliveryKey = useMemo(() => assignments
    .filter(({ id }) => isDelivered(statusMap[id]?.submissionStatus))
    .map(({ id, data }) => id + ":" + isArchived(data))
    .join("|"), [assignments, statusMap]);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const debounce = window.setTimeout(async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(goalsApi, {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Goals unavailable");
        const { goals }: { goals: FamilyGoalProgress[] } = await response.json();
        if (!controller.signal.aborted) {
          setGoalSummary({ spaceId, uid: user.uid, goals });
          setGoalLoadFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) setGoalLoadFailed(true);
      }
    }, 150);
    return () => {
      window.clearTimeout(debounce);
      controller.abort();
    };
  }, [user, goalsApi, spaceId, goalRevision, deliveryKey]);

  const activeAssignments = useMemo(
    () => assignments.filter((x) => !isArchived(x.data)).sort((a, b) =>
      Number(needsFeedback(statusMap[b.id])) - Number(needsFeedback(statusMap[a.id]))),
    [assignments, statusMap]
  );

  const archivedAssignments = useMemo(
    () => assignments.filter((x) => isArchived(x.data)),
    [assignments]
  );

  const spaceRec: Record<string, unknown> = isRecord(space) ? (space as Record<string, unknown>) : {};
  const spaceTitle = safeString(spaceRec.title) ?? tx("header.untitled", "Untitled space");
  const spaceCode = safeString(spaceRec.code);
  const spaceKind = safeString(spaceRec.kind);
  const canAssign = !!user && canShareContentToParentSpace(spaceRec, user.uid);
  const addAssignmentHref = "/content?familyRoom=" + encodeURIComponent(spaceId);
  const activeGoalId = safeString(spaceRec.activeGoalId);
  const roomGoalSummary = goalSummary?.spaceId === spaceId && goalSummary.uid === user?.uid ? goalSummary : null;
  const goals = roomGoalSummary?.goals ?? [];
  const activeGoal =
    (activeGoalId ? goals.find((goal) => goal.id === activeGoalId && goal.data.status === "active") : null) ??
    goals.find((goal) => goal.data.status === "active") ??
    null;
  const completedRewards = goals.filter(({ data }) => data.status === "completed" && data.reward)
    .sort((a, b) => (b.data.completedAt ?? b.data.updatedAt ?? 0) - (a.data.completedAt ?? a.data.updatedAt ?? 0));

  function renderAssignmentCard(it: { id: string; data: AssignmentDoc }, archivedSection = false) {
    const title = titleOfAssignment(it.data, it.id);
    const snippet = assignmentSnippet(it.data);
    const href = `/parent/spaces/${spaceId}/assignments/${it.id}`;
    const meta = statusMap[it.id] ?? null;
    const readyForFeedback = !archivedSection && needsFeedback(meta);
    const busy = archiveBusyId === it.id;

    return (
      <div
        key={it.id}
        className="box-border w-full min-w-0 max-w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm sm:p-4"
      >
        <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="break-words text-base font-semibold text-slate-900">
              {title}{" "}
              {archivedSection ? (
                <span className="text-sm font-medium text-slate-500">
                  {tx("all.archivedTag", "(archived)")}
                </span>
              ) : null}
            </div>

            {safeString(it.data.level) || safeString(it.data.language) ? (
              <div className="mt-2 text-sm text-slate-600">
                {[safeString(it.data.level), safeString(it.data.language)].filter(Boolean).join(" • ")}
              </div>
            ) : null}

            {meta ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge
                  text={readyForFeedback ? t("status.readyForFeedback") : statusLabel(meta.submissionStatus, t)}
                  tone={readyForFeedback ? "warn" : statusTone(meta.submissionStatus)}
                />
                {meta.autoSummary ? (
                  <Badge text={t("badges.auto", { value: meta.autoSummary })} tone="neutral" />
                ) : null}
                {meta.hasAiFeedback ? <Badge text={t("badges.aiFeedback")} tone="good" /> : null}
                {meta.hasParentReview ? (
                  <Badge
                    text={
                      meta.reviewStars
                        ? t("badges.parentReviewWithStars", { stars: meta.reviewStars })
                        : t("badges.parentReview")
                    }
                    tone="good"
                  />
                ) : null}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge text={t("status.notStarted")} tone="neutral" />
              </div>
            )}

            {snippet ? (
              <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{snippet}</div>
            ) : null}
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row xl:flex-col">
            <Link
              href={readyForFeedback ? href + "#parent-review" : href}
              className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white no-underline hover:bg-slate-800 sm:w-auto"
            >
              {readyForFeedback ? t("actions.respond") : t("actions.open")}
            </Link>

            {!archivedSection ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => archiveAssignment(it.id)}
                className="inline-flex w-full items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {busy ? tx("actions.archiving", "Archiving…") : tx("actions.archive", "Archive")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (missing) {
    return (
      <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-3 sm:space-y-4">
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-white p-3 shadow-sm sm:p-5">
          <h1 className="m-0 text-xl font-semibold text-slate-900">
            {tx("missing.title", "Space not found")}
          </h1>
          <div className="mt-2 text-sm text-slate-600">
            {tx("missing.subtitle", "This space does not exist or is unavailable.")}
          </div>
          <div className="mt-4">
            <Link href="/parent/spaces" className="text-sm font-medium text-slate-700 underline underline-offset-4">
              {tx("actions.backToMySpaces", "Back to my spaces")}
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
          <h1 className="m-0 text-xl font-semibold text-slate-900">
            {tx("error.title", "Something went wrong")}
          </h1>
          <div className="mt-3 whitespace-pre-wrap text-sm text-red-700">{err}</div>
          <div className="mt-4">
            <Link href="/parent/spaces" className="text-sm font-medium text-slate-700 underline underline-offset-4">
              {tx("actions.backToMySpaces", "Back to my spaces")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!space) {
    return <div className="w-full py-4 text-sm text-slate-600">{tx("loading", "Loading…")}</div>;
  }

  return (
    <main className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-3 sm:space-y-4">
      <Link href="/parent/spaces" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900 hover:underline">
        <ArrowLeft size={16} aria-hidden="true" />
        {t("actions.backToMySpaces")}
      </Link>
      <header className="box-border w-full min-w-0 rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 shadow-sm sm:p-6">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-1 mt-0 text-sm font-semibold text-emerald-800">{kindLabel(spaceKind, t)}</p>
            <h1 className="m-0 break-words text-3xl font-extrabold tracking-tight text-emerald-950">{spaceTitle}</h1>

            {spaceCode ? (
              <div className="mt-1 break-words text-sm text-slate-600">
                {tx("header.code", "Code")}: <b>{spaceCode}</b>
              </div>
            ) : null}
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row lg:w-auto lg:justify-end">
            {canAssign ? (
              <Link href={addAssignmentHref} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-emerald-900">
                <Plus size={17} aria-hidden="true" />
                {t("actions.addAssignment")}
              </Link>
            ) : null}

            <Link href={childRoomHref(spaceId, undefined, true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-950 no-underline hover:bg-emerald-50">
              <BookOpen size={17} aria-hidden="true" />
              {t("childRoomCard.button")}
            </Link>
          </div>
        </div>
      </header>

      {user && spaceKind === "family" && canAssign ? (
        <FamilyDeviceAccessPanel key={spaceId + user.uid} spaceId={spaceId} user={user} />
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <h2 className="m-0 text-lg font-bold text-slate-900">{t("all.title")}</h2>
        {assignErr ? (
          <p role="alert" className="mb-0 mt-4 whitespace-pre-wrap text-sm text-red-700">{assignErr}</p>
        ) : activeAssignments.length === 0 ? (
          <p className="mb-0 mt-4 rounded-xl border border-dashed border-emerald-200 bg-white p-4 text-sm leading-6 text-slate-700">
            {t(canAssign ? "all.firstAssignment" : "all.none")}
          </p>
        ) : (
          <div className="mt-4 grid min-w-0 gap-3">
            {activeAssignments.map((item) => renderAssignmentCard(item))}
          </div>
        )}
      </section>

      <section className="box-border w-full min-w-0 max-w-full rounded-2xl border border-sky-200 bg-sky-50 p-3 shadow-sm sm:p-5" aria-labelledby="family-goals">
        <h2 id="family-goals" className="m-0 text-lg font-bold text-sky-950">{t("goals.sectionTitle")}</h2>
        {goalLoadFailed ? <p role="alert" className="mb-0 mt-2 text-sm font-semibold text-red-800">{t("goals.readFailed")}</p> : null}

        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          {activeGoal ? (
            <div className="rounded-xl border border-sky-200 bg-white p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge text={t("goals.active")} tone="good" />
                {typeof activeGoal.data.targetCount === "number" ? (
                  <Badge
                    text={t("goals.tasksCount", { count: activeGoal.data.targetCount })}
                    tone="neutral"
                  />
                ) : null}
              </div>

              <div className="mt-3 break-words text-lg font-black text-slate-900">
                {activeGoal.data.title}
              </div>

              {safeString(activeGoal.data.description) ? (
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {safeString(activeGoal.data.description)}
                </div>
              ) : null}
              {safeString(activeGoal.data.reward) ? (
                <div className="mt-3 break-words text-sm leading-6 text-sky-950">
                  <span className="font-bold">{t("goals.agreedReward")}</span>
                  <p className="m-0">{activeGoal.data.reward}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-sky-200 bg-white p-3 text-sm leading-6 text-sky-900 sm:p-4">
              {roomGoalSummary ? t("goals.empty") : goalLoadFailed ? null : t("goals.loading")}
            </div>
          )}

          <form
            className="rounded-xl border border-sky-200 bg-white p-3 sm:p-4"
            onSubmit={(e) => {
              e.preventDefault();
              createGoal();
            }}
          >
            <label htmlFor="family-goal-title" className="block text-sm font-bold text-slate-700">
              {t("goals.newGoal")}
            </label>

            <input
              id="family-goal-title"
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              placeholder={t("goals.placeholder")}
              maxLength={120}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
            />

            <label htmlFor="family-goal-target" className="mt-3 block text-sm font-bold text-slate-700">
              {t("goals.targetLabel")}
            </label>

            <input
              id="family-goal-target"
              type="number"
              min={1}
              max={100}
              value={goalTargetCount}
              onChange={(e) => setGoalTargetCount(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
            />

            <label htmlFor="family-goal-reward" className="mt-3 block text-sm font-bold text-slate-700">
              {t("goals.rewardLabel")}
            </label>
            <input
              id="family-goal-reward"
              value={goalReward}
              onChange={(e) => setGoalReward(e.target.value)}
              placeholder={t("goals.rewardPlaceholder")}
              maxLength={160}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
            />
            <p className="mb-0 mt-2 text-sm leading-5 text-slate-600">{t("goals.countsNewDeliveries")}</p>

            <button
              type="submit"
              disabled={goalBusy}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {goalBusy ? t("goals.saving") : t("goals.save")}
            </button>

            {goalMsg ? <p role="status" className="mb-0 mt-3 text-sm font-semibold text-slate-600">{goalMsg}</p> : null}
          </form>
        </div>

        {completedRewards.length > 0 ? (
          <div className="mt-5">
            <h3 className="m-0 text-base font-bold text-sky-950">{t("goals.completedRewards")}</h3>
            <ul className="m-0 mt-2 grid list-none gap-2 p-0">
              {completedRewards.map(({ id, data }) => (
                <li key={id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-sky-200 bg-white p-3 sm:p-4">
                  <div className="min-w-0">
                    <p className="m-0 break-words font-bold text-slate-900">{data.title}</p>
                    <p className="mb-0 mt-1 break-words text-sm leading-6 text-slate-700">{data.reward}</p>
                    {rewardError?.goalId === id && rewardError.rewardGivenAt === data.rewardGivenAt ? (
                      <p role="alert" className="mb-0 mt-1 text-sm text-red-800">{t("goals.rewardStatusFailed")}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {data.rewardGivenAt ? <span role="status"><Badge text={t("goals.rewardGiven")} tone="good" /></span> : null}
                    <button
                      type="button"
                      aria-label={t(data.rewardGivenAt ? "goals.undoRewardFor" : "goals.markRewardFor", { goal: data.title })}
                      disabled={!!rewardBusyId}
                      onClick={() => void updateRewardStatus(id, data.rewardGivenAt)}
                      className="inline-flex min-h-11 items-center rounded-xl border border-emerald-700 bg-white px-3 py-2 text-sm font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-60"
                    >
                      {rewardBusyId === id ? t("goals.saving") : t(data.rewardGivenAt ? "goals.undoReward" : "goals.markRewardGiven")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {archivedAssignments.length > 0 ? (
        <details className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <summary className="cursor-pointer font-semibold text-slate-900">{t("archive.title")}</summary>
          <div className="mt-4 grid min-w-0 gap-3">
            {archivedAssignments.map((it) => renderAssignmentCard(it, true))}
          </div>
        </details>
      ) : null}
    </main>
  );
}
