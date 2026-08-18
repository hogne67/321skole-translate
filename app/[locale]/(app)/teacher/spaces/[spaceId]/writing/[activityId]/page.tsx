"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
} from "firebase/firestore";
import type { WritingActivity } from "@/lib/writingStation";

type WritingSubmissionRow = {
  id: string;
  data: {
    studentUid?: string;
    status?: string;
    finalText?: string;
    aiUsage?: unknown[];
    createdAt?: unknown;
    updatedAt?: unknown;
    submittedAt?: unknown;
  };
};

type SpaceDocLite = {
  title?: string;
};

type SpaceMemberDoc = {
  displayName?: string;
  name?: string;
  studentName?: string;
};

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

function normalizeStatus(value: unknown) {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "planning_submitted") return "planning_submitted";
  if (status === "planning_reviewed") return "planning_reviewed";
  if (status === "submitted") return "submitted";
  if (status === "reviewed" || status === "approved") return "reviewed";
  if (status === "needs_work") return "needs_work";
  if (status === "draft") return "draft";
  return "unknown";
}

function statusClass(status: string) {
  if (status === "planning_submitted") return "border-purple-200 bg-purple-50 text-purple-900";
  if (status === "planning_reviewed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "submitted") return "border-blue-200 bg-blue-50 text-blue-900";
  if (status === "reviewed") return "border-green-200 bg-green-50 text-green-900";
  if (status === "needs_work") return "border-yellow-200 bg-yellow-50 text-yellow-900";
  return "border-slate-300 bg-white text-slate-700";
}

function withLocale(locale: string, href: string): string {
  if (!href.startsWith("/")) return href;
  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "nb" || seg === "pt") return href;
  return `/${locale}${href}`;
}

export default function TeacherWritingActivitySubmissionsPage() {
  const t = useTranslations("teacherWritingStation");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ spaceId: string; activityId: string }>();
  const spaceId = params.spaceId;
  const activityId = params.activityId;

  const [space, setSpace] = useState<SpaceDocLite | null>(null);
  const [activity, setActivity] = useState<WritingActivity | null>(null);
  const [submissions, setSubmissions] = useState<WritingSubmissionRow[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backHref = useMemo(
    () => withLocale(locale, `/teacher/spaces/${spaceId}`),
    [locale, spaceId]
  );

  useEffect(() => {
    if (!spaceId) return;
    return onSnapshot(doc(db, "spaces", spaceId), (snap) => {
      setSpace(snap.exists() ? (snap.data() as SpaceDocLite) : null);
    });
  }, [spaceId]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const ref = doc(db, "spaces", spaceId, "writingActivities", activityId);
    return onSnapshot(
      ref,
      (snap) => {
        setActivity(snap.exists() ? ({ id: snap.id, ...(snap.data() as Record<string, unknown>) } as WritingActivity) : null);
        setLoading(false);
      },
      (err) => {
        setError(err instanceof Error ? err.message : t("errors.readActivity"));
        setLoading(false);
      }
    );
  }, [activityId, spaceId, t]);

  useEffect(() => {
    setLoadingSubs(true);

    const qy = query(
      collection(db, "spaces", spaceId, "writingActivities", activityId, "submissions"),
      orderBy("updatedAt", "desc")
    );

    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, data: (d.data() as WritingSubmissionRow["data"]) ?? {} }))
          .filter((row) => normalizeStatus(row.data.status) !== "draft");
        setSubmissions(rows);
        setLoadingSubs(false);
      },
      (err) => {
        setError(err instanceof Error ? err.message : t("errors.readSubmissions"));
        setLoadingSubs(false);
      }
    );
  }, [activityId, spaceId, t]);

  useEffect(() => {
    let alive = true;
    const missing = Array.from(
      new Set(
        submissions
          .map((row) => row.data.studentUid)
          .filter((uid): uid is string => typeof uid === "string" && uid.trim().length > 0)
      )
    ).filter((uid) => !memberNames[uid]);

    if (missing.length === 0) return;

    (async () => {
      const pairs: Array<[string, string]> = [];
      await Promise.all(
        missing.map(async (uid) => {
          const snap = await getDoc(doc(db, "spaceMembers", `${spaceId}_${uid}`));
          if (!snap.exists()) return;
          const data = (snap.data() as SpaceMemberDoc) ?? {};
          const name = data.displayName?.trim() || data.name?.trim() || data.studentName?.trim();
          if (name) pairs.push([uid, name]);
        })
      );

      if (!alive || pairs.length === 0) return;
      setMemberNames((current) => {
        const next = { ...current };
        for (const [uid, name] of pairs) next[uid] = name;
        return next;
      });
    })().catch(() => {
      // Names are optional.
    });

    return () => {
      alive = false;
    };
  }, [memberNames, spaceId, submissions]);

  return (
    <AuthGate requireRole="teacher">
      <main className="mx-auto w-full max-w-6xl space-y-4">
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <Link href={backHref} className="text-sm font-semibold text-emerald-900 underline">
            {t("actions.backToSpace")}
          </Link>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-emerald-800">{space?.title ?? t("fallback.space")}</div>
              <h1 className="m-0 mt-1 text-2xl font-semibold text-slate-950">
                {activity?.title ?? t("fallback.activity")}
              </h1>
              <div className="mt-1 text-sm text-emerald-900">
                {t("genre.story")}
                {activity?.level ? ` · ${activity.level}` : ""}
                {activity?.language ? ` · ${activity.language}` : ""}
                {activity?.theme ? ` · ${activity.theme}` : ""}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-900">
              {loadingSubs ? tCommon("loading") : t("submissions.count", { n: submissions.length })}
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        {loading || loadingSubs ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{tCommon("loading")}</div>
        ) : !activity ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{t("errors.notFound")}</div>
        ) : submissions.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{t("submissions.empty")}</div>
        ) : (
          <section className="grid gap-3">
            {submissions.map((row) => {
              const status = normalizeStatus(row.data.status);
              const name =
                (row.data.studentUid ? memberNames[row.data.studentUid] : "") ||
                (row.data.studentUid ? `${t("fallback.student")} (${row.data.studentUid.slice(0, 6)}…)` : t("fallback.unknownStudent"));
              const delivered = formatMaybeDate(row.data.submittedAt || row.data.updatedAt || row.data.createdAt, locale) || t("fallback.unknownDate");

              return (
                <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="m-0 text-lg font-semibold text-slate-950">{name}</h2>
                      <div className="mt-1 text-sm text-slate-600">{delivered}</div>
                      <div className="mt-2 text-xs text-slate-500">
                        {t("submissions.aiUses", { n: Array.isArray(row.data.aiUsage) ? row.data.aiUsage.length : 0 })}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${statusClass(status)}`}>
                        {t(`status.${status}`)}
                      </span>
                      <button
                        type="button"
                        onClick={() => router.push(withLocale(locale, `/teacher/spaces/${spaceId}/writing/${activityId}/submissions/${row.id}`))}
                        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        {t("actions.openSubmission")}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </AuthGate>
  );
}
