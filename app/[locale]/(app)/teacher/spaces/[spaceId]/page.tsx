// app/[locale]/(app)/teacher/spaces/[spaceId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
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
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import type { SpaceDoc } from "@/lib/spacesClient";
import { setSpaceOpen } from "@/lib/spacesClient";
import { useLocale, useTranslations } from "next-intl";

type AccessState = "checking" | "allowed" | "denied";
type SourceType = "myContent" | "library";

type AssignmentDoc = {
  status: "active" | "archived";
  sourceType: SourceType;
  sourceId: string;
  title: string;
  level?: string;
  language?: string;
  createdAt?: unknown;
  assignedAt?: unknown;
  assignedByUid?: string;
  updatedAt?: unknown;
  studentMessage?: string;
  studentMessageUpdatedAt?: unknown;
  dueAt?: unknown;
};

type AssignmentRow = { id: string; data: AssignmentDoc };

type WritingActivityDoc = {
  status: "assigned" | "archived" | "draft";
  title: string;
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

type WritingActivityRow = { id: string; data: WritingActivityDoc };

type SubmissionData = { createdAt?: unknown; status?: unknown };

type SpaceDocSafe = SpaceDoc & {
  ownerId?: unknown;
  code?: unknown;
  isOpen?: unknown;
  title?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readIsAdmin(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  const roles = profile["roles"];
  if (!isRecord(roles)) return false;
  return roles["admin"] === true;
}

function getErrorInfo(err: unknown): { code?: string; message: string } {
  if (err instanceof Error) return { message: err.message };
  if (typeof err === "string") return { message: err };
  if (err && typeof err === "object") {
    const code = "code" in err ? (err as { code?: unknown }).code : undefined;
    const message = "message" in err ? (err as { message?: unknown }).message : undefined;
    return {
      code: typeof code === "string" ? code : undefined,
      message: typeof message === "string" ? message : JSON.stringify(err),
    };
  }
  return { message: String(err) };
}

function formatMaybeDate(v: unknown) {
  try {
    if (!v) return "";
    const d: Date | null =
      v instanceof Date
        ? v
        : isRecord(v) && typeof v["toDate"] === "function"
          ? (v as { toDate: () => Date }).toDate()
          : v instanceof Timestamp
            ? v.toDate()
            : null;
    return d ? d.toLocaleString() : "";
  } catch {
    return "";
  }
}

function isReviewedStatus(statusRaw: unknown): boolean {
  const s = typeof statusRaw === "string" ? statusRaw.toLowerCase().trim() : "";
  return s === "reviewed" || s === "approved" || s === "needs_work" || s === "needswork";
}

function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "pt") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
}

function SpaceOpenSwitch({
  checked,
  disabled,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white px-3 py-3 sm:px-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        {description ? <div className="mt-0.5 text-xs text-slate-600">{description}</div> : null}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition",
          checked ? "border-green-600 bg-green-600" : "border-slate-300 bg-slate-300",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

export default function TeacherSpaceDetailPage() {
  return (
    <AuthGate>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const t = useTranslations("spaceDetail");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const router = useRouter();
  const { user, profile, loading } = useUserProfile();
  const params = useParams<{ spaceId: string }>();
  const spaceId = params.spaceId;

  const isAdmin = useMemo(() => readIsAdmin(profile), [profile]);
  const canOperateSpace = accessAllowedGuard(user?.uid);

  const [space, setSpace] = useState<SpaceDocSafe | null>(null);

  const [access, setAccess] = useState<AccessState>("checking");
  const [accessReason, setAccessReason] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const [writingActivities, setWritingActivities] = useState<WritingActivityRow[]>([]);
  const [showArchivedWriting, setShowArchivedWriting] = useState(false);
  const [writingErr, setWritingErr] = useState<string | null>(null);

  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [messageSavingId, setMessageSavingId] = useState<string | null>(null);

  const [subSummaryByAssignment, setSubSummaryByAssignment] = useState<Record<string, { total: number; newCount: number }>>({});
  const [subSummaryErrByAssignment, setSubSummaryErrByAssignment] = useState<Record<string, string | null>>({});
  const [subSummaryUnsubByAssignment, setSubSummaryUnsubByAssignment] = useState<Record<string, Unsubscribe>>({});

  useEffect(() => {
    const ref = doc(db, "spaces", spaceId);
    return onSnapshot(ref, (snap) => setSpace(snap.exists() ? (snap.data() as SpaceDocSafe) : null));
  }, [spaceId]);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (loading) return;

      if (!user?.uid) {
        if (!alive) return;
        setAccess("denied");
        setAccessReason(t("access.mustBeSignedIn"));
        return;
      }

      if (!space) return;

      setAccess("checking");
      setAccessReason("");

      try {
        if (isAdmin) {
          if (!alive) return;
          setAccess("allowed");
          return;
        }

        const ownerId = space.ownerId;
        if (typeof ownerId === "string" && ownerId === user.uid) {
          if (!alive) return;
          setAccess("allowed");
          return;
        }

        const memberDocId = `${spaceId}_${user.uid}`;
        const ms = await getDoc(doc(db, "spaceMembers", memberDocId));
        if (!alive) return;

        if (ms.exists()) setAccess("allowed");
        else {
          setAccess("denied");
          setAccessReason(t("access.notMember"));
        }
      } catch (e: unknown) {
        if (!alive) return;
        setAccess("denied");
        setAccessReason(getErrorInfo(e).message || t("access.verifyFailed"));
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [loading, user?.uid, isAdmin, spaceId, space, t]);

  useEffect(() => {
    if (access !== "allowed") return;

    const qy = query(collection(db, "spaces", spaceId, "lessons"), orderBy("assignedAt", "desc"));
    return onSnapshot(qy, (snap) => {
      const next: AssignmentRow[] = snap.docs.map((d) => ({
        id: d.id,
        data: (d.data() as AssignmentDoc) ?? ({} as AssignmentDoc),
      }));

      setAssignments(next);

      setMessageDrafts((current) => {
        const copy = { ...current };
        for (const row of next) {
          if (!(row.id in copy)) copy[row.id] = row.data.studentMessage ?? "";
        }
        return copy;
      });
    });
  }, [access, spaceId, t]);

  useEffect(() => {
    if (access !== "allowed") return;

    const qy = query(collection(db, "spaces", spaceId, "writingActivities"), orderBy("assignedAt", "desc"));
    return onSnapshot(
      qy,
      (snap) => {
        const next: WritingActivityRow[] = snap.docs.map((d) => ({
          id: d.id,
          data: (d.data() as WritingActivityDoc) ?? ({} as WritingActivityDoc),
        }));

        setWritingActivities(next);
        setWritingErr(null);
      },
      (err) => {
        setWritingActivities([]);
        setWritingErr(err instanceof Error ? err.message : t("writingStation.readFailed"));
      }
    );
  }, [access, spaceId, t]);

  const visibleAssignments = useMemo(
    () => (showArchived ? assignments : assignments.filter((a) => a.data.status !== "archived")),
    [assignments, showArchived]
  );

  const visibleWritingActivities = useMemo(
    () => (
      showArchivedWriting
        ? writingActivities
        : writingActivities.filter((a) => a.data.status !== "archived")
    ),
    [showArchivedWriting, writingActivities]
  );

  useEffect(() => {
    if (access !== "allowed") return;

    const visibleIds = new Set(visibleAssignments.map((a) => a.id));

    Object.entries(subSummaryUnsubByAssignment).forEach(([assignmentId, unsub]) => {
      if (!visibleIds.has(assignmentId)) {
        try {
          unsub();
        } catch {
          // ignore
        }
        setSubSummaryUnsubByAssignment((m) => {
          const copy = { ...m };
          delete copy[assignmentId];
          return copy;
        });
      }
    });

    visibleAssignments.forEach((a) => {
      if (subSummaryUnsubByAssignment[a.id]) return;

      setSubSummaryErrByAssignment((m) => ({ ...m, [a.id]: null }));

      const qy = query(
        collection(db, "spaces", spaceId, "lessons", a.id, "submissions"),
        orderBy("createdAt", "desc"),
        limit(200)
      );

      const unsub = onSnapshot(
        qy,
        (snap) => {
          let newCount = 0;
          snap.docs.forEach((d) => {
            const data = (d.data() as SubmissionData) ?? {};
            if (!isReviewedStatus(data.status)) newCount += 1;
          });

          setSubSummaryByAssignment((m) => ({ ...m, [a.id]: { total: snap.size, newCount } }));
        },
        (err: unknown) => {
          const info = getErrorInfo(err);
          setSubSummaryErrByAssignment((m) => ({
            ...m,
            [a.id]: info.message || t("errors.readSubmissionsFailed"),
          }));
        }
      );

      setSubSummaryUnsubByAssignment((m) => ({ ...m, [a.id]: unsub }));
    });
  }, [access, spaceId, visibleAssignments, subSummaryUnsubByAssignment, t]);

  useEffect(() => {
    return () => {
      Object.values(subSummaryUnsubByAssignment).forEach((u) => {
        try {
          u();
        } catch {
          // ignore
        }
      });
    };
  }, [subSummaryUnsubByAssignment]);

  async function saveStudentMessage(assignmentId: string) {
    setSaveErr(null);

    if (access !== "allowed") {
      setSaveErr(t("errors.noManageAccess"));
      return;
    }

    if (!canManage) {
      setSaveErr(t("errors.noManageAccess"));
      return;
    }

    const text = (messageDrafts[assignmentId] ?? "").trim();

    setMessageSavingId(assignmentId);
    try {
      await updateDoc(doc(db, "spaces", spaceId, "lessons", assignmentId), {
        studentMessage: text,
        studentMessageUpdatedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    } catch (e: unknown) {
      setSaveErr(getErrorInfo(e).message || t("errors.updateAssignmentFailed"));
    } finally {
      setMessageSavingId(null);
    }
  }

  async function setAssignmentStatus(assignmentId: string, status: "active" | "archived") {
    setSaveErr(null);

    if (access !== "allowed") {
      setSaveErr(t("errors.noManageAccess"));
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "spaces", spaceId, "lessons", assignmentId), {
        status,
        updatedAt: Timestamp.now(),
      });
    } catch (e: unknown) {
      setSaveErr(getErrorInfo(e).message || t("errors.updateAssignmentFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function setWritingActivityStatus(activityId: string, status: "assigned" | "archived") {
    setSaveErr(null);

    if (access !== "allowed" || !canManage) {
      setSaveErr(t("errors.noManageAccess"));
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "spaces", spaceId, "writingActivities", activityId), {
        status,
        updatedAt: Timestamp.now(),
      });
    } catch (e: unknown) {
      setSaveErr(getErrorInfo(e).message || t("writingStation.updateFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="w-full py-4 text-sm text-slate-600">{tCommon("loading")}</div>;
  if (!space) return <div className="w-full py-4 text-sm text-slate-600">{tCommon("loading")}</div>;

  if (access === "checking") {
    return (
      <div className="mx-auto w-full max-w-5xl min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 break-words text-2xl font-semibold text-slate-900">{t("checking.title")}</h1>
            <div className="mt-1 break-words text-sm text-slate-600">{t("checking.subtitle")}</div>
          </div>
          <Link
            className="text-sm font-medium text-slate-700 underline underline-offset-4"
            href={withLocale(locale, "/teacher/spaces")}
          >
            {t("actions.back")}
          </Link>
        </div>
      </div>
    );
  }

  if (access === "denied") {
    return (
      <div className="mx-auto w-full max-w-5xl min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 break-words text-2xl font-semibold text-slate-900">{t("denied.title")}</h1>
            <div className="mt-2 break-words text-sm text-slate-600">{accessReason || t("denied.subtitle")}</div>
            <div className="mt-2 break-words text-sm text-slate-600">{t("denied.hint")}</div>
          </div>
          <Link
            className="text-sm font-medium text-slate-700 underline underline-offset-4"
            href={withLocale(locale, "/teacher/spaces")}
          >
            {t("actions.back")}
          </Link>
        </div>
      </div>
    );
  }

  const canManage = access === "allowed" && Boolean(user?.uid) && canOperateSpace;

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-3 sm:space-y-4">
      <div className="w-full min-w-0 rounded-2xl border border-slate-300 bg-slate-50 p-3 shadow-md sm:p-5">
        <div className="min-w-0">
          <Link
            className="inline-flex text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-950"
            href={withLocale(locale, "/teacher/spaces")}
          >
            {t("actions.back")}
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="mt-3 break-words text-2xl font-semibold text-slate-900">{String(space.title ?? "")}</h1>
            <div className="mt-1 break-words text-sm text-slate-600">{t("overview.subtitle")}</div>
          </div>
        </div>
      </div>

      {saveErr && (
        <div className="w-full min-w-0 rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {saveErr}
        </div>
      )}

      <div className="w-full min-w-0 rounded-2xl border border-slate-300 bg-slate-100 p-3 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid w-full min-w-0 grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr]">
            <Link
              href={withLocale(locale, `/teacher/spaces/${spaceId}/print`)}
              className="inline-flex min-h-[62px] items-center justify-center rounded-2xl border border-sky-700 bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-500"
            >
              {t("actions.printRoom")}
            </Link>
            <SpaceOpenSwitch
              checked={space?.isOpen === true}
              disabled={saving || !canManage}
              label={space?.isOpen ? t("spaceToggle.openLabel") : t("spaceToggle.closedLabel")}
              description={space?.isOpen ? t("spaceToggle.openDescription") : t("spaceToggle.closedDescription")}
              onChange={async (next) => {
                setSaveErr(null);
                if (!canManage) {
                  setSaveErr(t("errors.noManageAccess"));
                  return;
                }
                setSaving(true);
                try {
                  await setSpaceOpen(spaceId, next);
                } catch (e: unknown) {
                  setSaveErr(getErrorInfo(e).message || t("errors.updateSpaceFailed"));
                } finally {
                  setSaving(false);
                }
              }}
            />
          </div>
        </div>
      </div>

      <div className="w-full min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-base font-semibold text-emerald-950">{t("writingStation.title")}</div>
            <div className="mt-1 max-w-2xl break-words text-sm text-emerald-900">
              {t("writingStation.subtitle")}
            </div>
          </div>

          <label
            className={[
              "inline-flex min-h-[42px] select-none items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
              showArchivedWriting
                ? "border-emerald-500 bg-white text-emerald-950 shadow-sm ring-2 ring-emerald-200"
                : "border-emerald-200 bg-white text-emerald-900",
            ].join(" ")}
          >
            <input
              type="checkbox"
              checked={showArchivedWriting}
              onChange={(e) => setShowArchivedWriting(e.target.checked)}
              className="h-4 w-4 rounded border-emerald-300 accent-emerald-700"
            />
            <span className="whitespace-nowrap">{t("writingStation.showArchived")}</span>
          </label>
        </div>

        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-emerald-950">{t("writingStation.manageTitle")}</div>
              <div className="mt-1 max-w-2xl break-words text-sm text-emerald-900">
                {t("writingStation.manageText")}
              </div>
            </div>
            <Link
              href={withLocale(locale, "/teacher/writing")}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              {t("writingStation.actions.openHub")}
            </Link>
          </div>

          {writingErr ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {writingErr}
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid min-w-0 gap-3">
          {visibleWritingActivities.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-white p-3 text-sm text-emerald-900 sm:p-4">
              {t("writingStation.empty")}
            </div>
          ) : (
            visibleWritingActivities.map((activity) => {
              const assignedAt = formatMaybeDate(activity.data.assignedAt || activity.data.createdAt);
              const status = activity.data.status ?? "assigned";

              return (
                <div key={activity.id} className="rounded-xl border border-emerald-200 bg-white p-3 shadow-sm sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="break-words font-semibold text-slate-950">
                          {activity.data.title || t("writingStation.fallbackTitle")}
                        </div>
                        {status === "archived" ? (
                          <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                            {t("badges.archived")}
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            {t("writingStation.badges.assigned")}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 break-words text-sm text-slate-600">
                        {t("writingStation.genre.story")}
                        {activity.data.level ? ` · ${activity.data.level}` : ""}
                        {activity.data.language ? ` · ${activity.data.language}` : ""}
                        {activity.data.theme ? ` · ${activity.data.theme}` : ""}
                        {assignedAt ? ` · ${assignedAt}` : ""}
                      </div>

                      <div className="mt-2 text-xs text-slate-500">
                        {activity.data.aiPolicy?.enabled === false
                          ? t("writingStation.ai.off")
                          : t("writingStation.ai.on", {
                            n: activity.data.aiPolicy?.maxUsesTotal ?? 20,
                          })}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(withLocale(locale, `/teacher/spaces/${spaceId}/writing/${activity.id}`))}
                        className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        {t("writingStation.actions.submissions")}
                      </button>

                      {status !== "archived" ? (
                        <button
                          type="button"
                          onClick={() => setWritingActivityStatus(activity.id, "archived")}
                          disabled={saving || !canManage}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {t("actions.archive")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setWritingActivityStatus(activity.id, "assigned")}
                          disabled={saving || !canManage}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {t("actions.restore")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="w-full min-w-0 rounded-2xl border border-slate-300 bg-slate-200 p-3 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900">{t("assignments.title")}</div>
            <div className="mt-1 break-words text-sm text-slate-600">
              {t("assignments.count", {
                count: visibleAssignments.length,
                label: t("assignments.title"),
              })}
            </div>
          </div>

          <label
            className={[
              "inline-flex min-h-[42px] select-none items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
              showArchived
                ? "border-amber-500 bg-amber-100 text-amber-950 shadow-sm ring-2 ring-amber-300"
                : "border-slate-300 bg-white text-slate-800",
            ].join(" ")}
          >
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-amber-600"
            />
            <span className="whitespace-nowrap">{t("assignments.showArchived")}</span>
          </label>
        </div>

        <div className="mt-4 grid min-w-0 gap-3">
          {visibleAssignments.length === 0 ? (
            <div className="rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-600 sm:p-4">
              {t.rich("assignments.emptyHtml", { b: (chunks) => <b>{chunks}</b> })}
            </div>
          ) : (
            visibleAssignments.map((a) => {
              const assignedAt = formatMaybeDate(a.data.assignedAt || a.data.createdAt);
              const status = a.data.status ?? "active";
              const sourceLabel = a.data.sourceType === "library" ? t("labels.library") : t("labels.myContent");

              const summary = subSummaryByAssignment[a.id] ?? { total: 0, newCount: 0 };
              const sumErr = subSummaryErrByAssignment[a.id] ?? null;

              const allReviewed = summary.total > 0 && summary.newCount === 0;
              const hasNew = summary.newCount > 0;
              const currentMessage = messageDrafts[a.id] ?? a.data.studentMessage ?? "";
              const messageSaved = currentMessage.trim() === (a.data.studentMessage ?? "").trim();

              return (
                <div key={a.id} className="min-w-0 rounded-xl border border-slate-300 bg-white p-3 shadow-sm sm:p-4">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <div className="break-words font-semibold text-slate-900">
                        {a.data.title || t("fallback.untitledTask")}
                      </div>

                      {status === "archived" && (
                        <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {t("badges.archived")}
                        </span>
                      )}

                      {!sumErr ? (
                        <>
                          {summary.total === 0 ? (
                            <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                              {t("badges.noSubmissions")}
                            </span>
                          ) : allReviewed ? (
                            <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
                              {t("badges.allReviewed")}
                            </span>
                          ) : hasNew ? (
                            <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-900">
                              {t("badges.newCount", { n: summary.newCount })}
                            </span>
                          ) : (
                            <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                              {t("badges.submissionsCount", { n: summary.total })}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
                          {t("badges.submissionsError")}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 break-words text-sm text-slate-600">
                      {sourceLabel}
                      {a.data.level ? ` · ${a.data.level}` : ""}
                      {a.data.language ? ` · ${a.data.language}` : ""}
                      {assignedAt ? ` · ${assignedAt}` : ""}
                    </div>

                    <div className="mt-4 grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                      {status !== "archived" ? (
                        <button
                          type="button"
                          onClick={() => setAssignmentStatus(a.id, "archived")}
                          disabled={saving || !canManage}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {t("actions.archive")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAssignmentStatus(a.id, "active")}
                          disabled={saving || !canManage}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {t("actions.restore")}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => router.push(withLocale(locale, `/teacher/spaces/${spaceId}/lessons/${a.id}`))}
                        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        {t("actions.submissions")}
                      </button>
                    </div>

                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
                        <div>
                          <label className="block text-sm font-semibold text-amber-950">
                            {t("studentMessage.label")}
                          </label>

                          <textarea
                            value={currentMessage}
                            onChange={(e) =>
                              setMessageDrafts((m) => ({
                                ...m,
                                [a.id]: e.target.value,
                              }))
                            }
                            disabled={!canManage || status === "archived"}
                            rows={3}
                            placeholder={t("studentMessage.placeholder")}
                            className="mt-2 w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-amber-950">
                            {t("due.label")}
                          </label>

                          <input
                            type="datetime-local"
                            value={
                              a.data.dueAt && typeof a.data.dueAt === "object" && "toDate" in a.data.dueAt
                                ? new Date((a.data.dueAt as { toDate: () => Date }).toDate()).toISOString().slice(0, 16)
                                : ""
                            }
                            onChange={async (e) => {
                              const val = e.target.value;

                              if (!val) {
                                await updateDoc(doc(db, "spaces", spaceId, "lessons", a.id), {
                                  dueAt: null,
                                  updatedAt: Timestamp.now(),
                                });
                                return;
                              }

                              const date = new Date(val);

                              await updateDoc(doc(db, "spaces", spaceId, "lessons", a.id), {
                                dueAt: Timestamp.fromDate(date),
                                updatedAt: Timestamp.now(),
                              });
                            }}
                            disabled={!canManage || status === "archived"}
                            className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                        <span className="mr-auto text-xs text-amber-900">
                          {messageSaved ? t("studentMessage.editHint") : t("studentMessage.unsavedHint")}
                        </span>

                        {a.data.studentMessageUpdatedAt ? (
                          <span className="text-xs text-amber-900">
                            {t("studentMessage.lastSaved")}: {formatMaybeDate(a.data.studentMessageUpdatedAt)}
                          </span>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => saveStudentMessage(a.id)}
                          disabled={!canManage || status === "archived" || messageSavingId === a.id || messageSaved}
                          className={[
                            "rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50",
                            messageSaved
                              ? "border border-amber-300 bg-white text-amber-900"
                              : "bg-amber-600 text-white hover:bg-amber-700",
                          ].join(" ")}
                        >
                          {messageSavingId === a.id
                            ? t("studentMessage.saving")
                            : messageSaved
                              ? t("studentMessage.saved")
                              : t("studentMessage.save")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}

function accessAllowedGuard(uid: string | undefined | null): boolean {
  return !!uid;
}
