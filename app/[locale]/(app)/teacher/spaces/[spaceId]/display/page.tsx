// app/[locale]/(app)/teacher/spaces/[spaceId]/display/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock, ExternalLink, FileText, MonitorUp, PenLine, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { useUserProfile } from "@/lib/useUserProfile";

type AccessState = "checking" | "allowed" | "denied";
type SourceType = "myContent" | "library";

type AssignmentDoc = {
  status?: "active" | "archived" | string;
  sourceType?: SourceType;
  title?: string;
  level?: string;
  language?: string;
  assignedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  studentMessage?: string;
  dueAt?: unknown;
};

type WritingActivityDoc = {
  status?: "assigned" | "archived" | "draft" | string;
  title?: string;
  genre?: string;
  level?: string;
  language?: string;
  theme?: string | null;
  assignedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type SpaceDocLite = {
  title?: unknown;
  ownerId?: unknown;
};

type SubmissionSummary = {
  total: number;
  newCount: number;
  reviewed: number;
};

type SpaceDisplayTask =
  | { kind: "assignment"; id: string; data: AssignmentDoc }
  | { kind: "writing"; id: string; data: WritingActivityDoc };

type SubmissionData = { status?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readIsAdmin(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  const roles = profile.roles;
  return isRecord(roles) && roles.admin === true;
}

function normalizeStatus(statusRaw: unknown): string {
  return typeof statusRaw === "string" ? statusRaw.toLowerCase().trim() : "";
}

function isReviewedStatus(statusRaw: unknown): boolean {
  const status = normalizeStatus(statusRaw);
  return status === "reviewed" || status === "approved" || status === "ok" || status === "needs_work" || status === "needswork";
}

function isVisibleSubmissionStatus(statusRaw: unknown): boolean {
  return normalizeStatus(statusRaw) !== "draft";
}

function toMillis(value: unknown): number {
  try {
    if (!value) return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const d: Date | null =
      value instanceof Date
        ? value
        : isRecord(value) && typeof value.toDate === "function"
          ? (value as { toDate: () => Date }).toDate()
          : value instanceof Timestamp
            ? value.toDate()
            : null;
    return d ? d.getTime() : 0;
  } catch {
    return 0;
  }
}

function formatDate(value: unknown, locale: string): string {
  try {
    const millis = toMillis(value);
    if (!millis) return "";
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(millis));
  } catch {
    return "";
  }
}

function withLocale(locale: string, href: string): string {
  if (!href.startsWith("/")) return href;
  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "nb" || seg === "pt") return href;
  return `/${locale}${href}`;
}

function taskDate(task: SpaceDisplayTask): number {
  return toMillis(task.data.assignedAt || task.data.createdAt || task.data.updatedAt);
}

function emptySummary(): SubmissionSummary {
  return { total: 0, newCount: 0, reviewed: 0 };
}

function summaryFromSubmissions(docs: SubmissionData[]): SubmissionSummary {
  let total = 0;
  let newCount = 0;
  let reviewed = 0;

  for (const data of docs) {
    if (!isVisibleSubmissionStatus(data.status)) continue;
    total += 1;
    if (isReviewedStatus(data.status)) reviewed += 1;
    else newCount += 1;
  }

  return { total, newCount, reviewed };
}

function statusTone(summary: SubmissionSummary): string {
  if (summary.total === 0) return "border-slate-600 bg-slate-800 text-slate-100";
  if (summary.newCount > 0) return "border-amber-300 bg-amber-200 text-amber-950";
  return "border-emerald-300 bg-emerald-200 text-emerald-950";
}

export default function TeacherSpaceDisplayPage() {
  return (
    <AuthGate requireRole="teacher">
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const t = useTranslations("spaceDetail");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const params = useParams<{ spaceId: string }>();
  const spaceId = params.spaceId;
  const { user, profile, loading } = useUserProfile();

  const [space, setSpace] = useState<SpaceDocLite | null>(null);
  const [access, setAccess] = useState<AccessState>("checking");
  const [accessReason, setAccessReason] = useState("");
  const [assignments, setAssignments] = useState<Array<{ id: string; data: AssignmentDoc }>>([]);
  const [writingActivities, setWritingActivities] = useState<Array<{ id: string; data: WritingActivityDoc }>>([]);
  const [summaries, setSummaries] = useState<Record<string, SubmissionSummary>>({});
  const [readError, setReadError] = useState<string | null>(null);

  const isAdmin = useMemo(() => readIsAdmin(profile), [profile]);

  useEffect(() => {
    return onSnapshot(doc(db, "spaces", spaceId), (snap) => {
      setSpace(snap.exists() ? ((snap.data() as SpaceDocLite) ?? {}) : null);
    });
  }, [spaceId]);

  useEffect(() => {
    let alive = true;

    async function run() {
      if (loading) return;

      if (!user?.uid) {
        setAccess("denied");
        setAccessReason(t("access.mustBeSignedIn"));
        return;
      }

      if (!space) return;

      setAccess("checking");
      setAccessReason("");

      try {
        if (isAdmin || space.ownerId === user.uid) {
          if (!alive) return;
          setAccess("allowed");
          return;
        }

        const memberSnap = await getDoc(doc(db, "spaceMembers", `${spaceId}_${user.uid}`));
        if (!alive) return;
        if (memberSnap.exists()) {
          setAccess("allowed");
        } else {
          setAccess("denied");
          setAccessReason(t("access.notMember"));
        }
      } catch (error) {
        if (!alive) return;
        setAccess("denied");
        setAccessReason(error instanceof Error ? error.message : t("access.verifyFailed"));
      }
    }

    run();

    return () => {
      alive = false;
    };
  }, [isAdmin, loading, space, spaceId, t, user?.uid]);

  useEffect(() => {
    if (access !== "allowed") return;

    const qy = query(collection(db, "spaces", spaceId, "lessons"), orderBy("assignedAt", "desc"));
    return onSnapshot(
      qy,
      (snap) => {
        setAssignments(snap.docs.map((item) => ({ id: item.id, data: (item.data() as AssignmentDoc) ?? {} })));
      },
      (error) => setReadError(error instanceof Error ? error.message : t("display.readFailed"))
    );
  }, [access, spaceId, t]);

  useEffect(() => {
    if (access !== "allowed") return;

    const qy = query(collection(db, "spaces", spaceId, "writingActivities"), orderBy("assignedAt", "desc"));
    return onSnapshot(
      qy,
      (snap) => {
        setWritingActivities(snap.docs.map((item) => ({ id: item.id, data: (item.data() as WritingActivityDoc) ?? {} })));
      },
      (error) => setReadError(error instanceof Error ? error.message : t("display.readFailed"))
    );
  }, [access, spaceId, t]);

  const visibleTasks = useMemo<SpaceDisplayTask[]>(() => {
    const next: SpaceDisplayTask[] = [
      ...assignments
        .filter((assignment) => assignment.data.status !== "archived")
        .map((assignment) => ({ kind: "assignment" as const, ...assignment })),
      ...writingActivities
        .filter((activity) => activity.data.status !== "archived" && activity.data.status !== "draft")
        .map((activity) => ({ kind: "writing" as const, ...activity })),
    ];

    return next.sort((a, b) => taskDate(b) - taskDate(a));
  }, [assignments, writingActivities]);

  useEffect(() => {
    if (access !== "allowed") return;
    const unsubs: Unsubscribe[] = [];

    for (const task of visibleTasks) {
      const key = `${task.kind}:${task.id}`;
      const ref =
        task.kind === "assignment"
          ? collection(db, "spaces", spaceId, "lessons", task.id, "submissions")
          : collection(db, "spaces", spaceId, "writingActivities", task.id, "submissions");
      const qy = query(ref, orderBy(task.kind === "assignment" ? "createdAt" : "updatedAt", "desc"), limit(200));

      unsubs.push(
        onSnapshot(
          qy,
          (snap) => {
            const docs = snap.docs.map((item) => (item.data() as SubmissionData) ?? {});
            setSummaries((current) => ({ ...current, [key]: summaryFromSubmissions(docs) }));
          },
          () => {
            setSummaries((current) => ({ ...current, [key]: emptySummary() }));
          }
        )
      );
    }

    setSummaries((current) => {
      const allowed = new Set(visibleTasks.map((task) => `${task.kind}:${task.id}`));
      const next: Record<string, SubmissionSummary> = {};
      for (const [key, value] of Object.entries(current)) {
        if (allowed.has(key)) next[key] = value;
      }
      return next;
    });

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [access, spaceId, visibleTasks]);

  const totals = useMemo(
    () =>
      visibleTasks.reduce(
        (acc, task) => {
          const summary = summaries[`${task.kind}:${task.id}`] ?? emptySummary();
          acc.submissions += summary.total;
          acc.newCount += summary.newCount;
          acc.reviewed += summary.reviewed;
          return acc;
        },
        { submissions: 0, newCount: 0, reviewed: 0 }
      ),
    [summaries, visibleTasks]
  );

  if (loading || access === "checking") {
    return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">{tCommon("loading")}</main>;
  }

  if (access === "denied") {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
        <section className="max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h1 className="text-2xl font-semibold">{t("denied.title")}</h1>
          <p className="mt-2 text-slate-300">{accessReason || t("denied.subtitle")}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col px-6 py-5 lg:px-10">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-sky-200">
              <MonitorUp className="h-5 w-5" aria-hidden="true" />
              {t("display.eyebrow")}
            </div>
            <h1 className="mt-2 break-words text-4xl font-semibold text-white lg:text-6xl">
              {typeof space?.title === "string" && space.title.trim() ? space.title : t("checking.title")}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={withLocale(locale, `/teacher/spaces/${spaceId}`)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
            >
              {t("actions.back")}
            </Link>
            <div className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-400 bg-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-950">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              {t("display.safeMode")}
            </div>
          </div>
        </header>

        {readError ? (
          <div className="mt-5 rounded-xl border border-red-400 bg-red-950 px-4 py-3 text-sm text-red-100">{readError}</div>
        ) : null}

        <section className="grid gap-3 py-5 sm:grid-cols-3">
          <StatCard icon={<FileText className="h-7 w-7" aria-hidden="true" />} label={t("display.stats.tasks")} value={visibleTasks.length} />
          <StatCard icon={<ExternalLink className="h-7 w-7" aria-hidden="true" />} label={t("display.stats.submissions")} value={totals.submissions} />
          <StatCard icon={<CheckCircle2 className="h-7 w-7" aria-hidden="true" />} label={t("display.stats.toReview")} value={totals.newCount} />
        </section>

        {visibleTasks.length === 0 ? (
          <section className="grid flex-1 place-items-center rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-2xl font-semibold text-slate-200">
            {t("display.empty")}
          </section>
        ) : (
          <section className="grid flex-1 auto-rows-fr gap-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleTasks.map((task) => {
              const summary = summaries[`${task.kind}:${task.id}`] ?? emptySummary();
              const title = task.data.title?.trim() || (task.kind === "writing" ? t("writingStation.fallbackTitle") : t("display.fallbackTask"));
              const meta = [
                task.kind === "writing" ? t("badges.writing") : task.data.sourceType === "library" ? t("labels.library") : t("labels.myContent"),
                task.data.level,
                task.data.language,
                task.kind === "writing" ? task.data.theme : undefined,
              ].filter(Boolean);
              const due = task.kind === "assignment" ? formatDate(task.data.dueAt, locale) : "";
              const assigned = formatDate(task.data.assignedAt || task.data.createdAt, locale);

              return (
                <article
                  key={`${task.kind}:${task.id}`}
                  className="flex min-h-[270px] flex-col rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-300 text-sky-950">
                      {task.kind === "writing" ? <PenLine className="h-7 w-7" aria-hidden="true" /> : <FileText className="h-7 w-7" aria-hidden="true" />}
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${statusTone(summary)}`}>
                      {summary.newCount > 0
                        ? t("display.status.toReview", { n: summary.newCount })
                        : summary.total > 0
                          ? t("display.status.ready")
                          : t("display.status.waiting")}
                    </span>
                  </div>

                  <h2 className="mt-4 break-words text-2xl font-semibold leading-tight text-white lg:text-3xl">{title}</h2>
                  <div className="mt-2 break-words text-base text-slate-300">{meta.join(" · ")}</div>

                  {task.kind === "assignment" && task.data.studentMessage ? (
                    <p className="mt-4 line-clamp-3 rounded-xl border border-amber-300 bg-amber-100 px-4 py-3 text-lg font-medium leading-snug text-amber-950">
                      {task.data.studentMessage}
                    </p>
                  ) : null}

                  <div className="mt-auto grid gap-3 pt-5 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
                      <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("display.labels.submissions")}</div>
                      <div className="mt-1 text-3xl font-semibold">{summary.total}</div>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
                        <Clock className="h-4 w-4" aria-hidden="true" />
                        {due ? t("due.label") : t("display.labels.assigned")}
                      </div>
                      <div className="mt-1 break-words text-base font-semibold text-slate-100">{due || assigned || t("display.noDate")}</div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

function StatCard(props: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex min-h-24 items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900 px-5 py-4">
      <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-sky-200">{props.icon}</div>
      <div>
        <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">{props.label}</div>
        <div className="text-4xl font-semibold text-white">{props.value}</div>
      </div>
    </div>
  );
}
