"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";

type StudentCourse = {
  id: string;
  title: string;
  description: string;
  language: string;
  level: string;
  status: string;
  participantStatus: string;
  publicUrl: string;
  numberOfSessions: number;
  numberOfWeeks: number;
  nextSession: {
    sessionNumber: number;
    title: string;
    startsAt: string;
    durationMinutes: number;
  } | null;
  participantResourceCount: number;
};

export default function StudentCoursesPage() {
  const locale = useLocale();
  const t = useTranslations("academy.studentCourses");
  const searchParams = useSearchParams();
  const { user, profile } = useUserProfile();
  const [courses, setCourses] = useState<StudentCourse[]>([]);
  const [highlightedCourseId, setHighlightedCourseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const dashboardHref = getDashboardHref(locale, profile);
  const checkoutStatus = searchParams.get("courseCheckout");
  const orderId = searchParams.get("order") || "";
  const highlightedCourse = courses.find((course) => course.id === highlightedCourseId) ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadCourses() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const token = await user.getIdToken();
        const query = orderId ? `?order=${encodeURIComponent(orderId)}` : "";
        const res = await fetch(`/api/student/courses${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          courses?: StudentCourse[];
          highlightedCourseId?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || t("loadFailed"));
        if (!cancelled) {
          setCourses(Array.isArray(data.courses) ? data.courses : []);
          setHighlightedCourseId(typeof data.highlightedCourseId === "string" ? data.highlightedCourseId : "");
        }
      } catch (err) {
        console.error("Failed to load student courses", err);
        if (!cancelled) setError(t("loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourses();

    return () => {
      cancelled = true;
    };
  }, [orderId, t, user]);

  return (
    <main className="mx-auto grid max-w-4xl gap-5 px-3 py-4">
      <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-2xl font-black text-slate-950">{t("title")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {t("intro")}
            </p>
          </div>

          <Link
            href={dashboardHref}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
          >
            {t("backToDashboard")}
          </Link>
        </div>
      </section>

      {error ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </section>
      ) : null}

      {checkoutStatus === "success" ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-base font-black">{t("checkoutTitle")}</div>
              <div className="mt-1">
                {highlightedCourse
                  ? t("checkoutAdded", { title: highlightedCourse.title })
                  : t("checkoutAddedFallback")}
              </div>
            </div>
            {highlightedCourse ? (
              <Link
                href={`/${locale}/academy/courses/${highlightedCourse.id}`}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-800 bg-white px-4 text-sm font-black text-emerald-950 no-underline hover:bg-emerald-100"
              >
                {t("openCourseRoom")}
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {loading ? (
        <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 text-sm text-slate-600">
          {t("loading")}
        </section>
      ) : courses.length === 0 ? (
        <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
          <h2 className="m-0 text-lg font-extrabold text-slate-900">{t("emptyTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("emptyText")}
          </p>
        </section>
      ) : (
        <section className="grid gap-3">
          {courses.map((course) => (
            <article key={course.id} className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="m-0 break-words text-lg font-black text-slate-950">
                    {course.title || t("untitled")}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 capitalize">
                      {formatParticipantStatus(course.participantStatus, t)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      {t("sessions", { count: course.numberOfSessions })}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/${locale}/academy/courses/${course.id}`}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 text-sm font-bold text-white no-underline hover:bg-slate-800"
                >
                  {t("openCourseRoom")}
                </Link>
              </div>

              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                {course.nextSession ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide text-emerald-800">
                        {t("nextSession")}
                      </div>
                      <div className="mt-1 font-extrabold text-emerald-950">
                        {course.nextSession.title || t("session", { number: course.nextSession.sessionNumber })}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-emerald-900">
                        {formatSessionDate(course.nextSession.startsAt, locale, t("dateNotSet"))} · {course.nextSession.durationMinutes || 120} min
                      </div>
                    </div>
                    <div className="min-w-40 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-center">
                      <div className="text-xs font-black uppercase tracking-wide text-emerald-700">
                        {t("startsIn")}
                      </div>
                      <div className="mt-1 text-lg font-black text-emerald-950">
                        {formatCountdown(course.nextSession.startsAt, t)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-emerald-800">
                      {t("nextSession")}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-emerald-900">
                      {t("notScheduled")}
                    </div>
                  </div>
                )}

                {course.nextSession ? (
                  <Link
                    href={`/${locale}/academy/courses/${course.id}/sessions/${course.nextSession.sessionNumber}`}
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-emerald-800 bg-white px-4 text-sm font-bold text-emerald-950 no-underline hover:bg-emerald-100"
                  >
                    {t("joinVideo")}
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-950 opacity-70"
                    title={t("videoLater")}
                  >
                    {t("joinVideo")}
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function getDashboardHref(locale: string, profile: unknown): string {
  const role =
    profile && typeof profile === "object" && "role" in profile
      ? String((profile as { role?: unknown }).role || "")
      : "";

  if (role === "teacher") return `/${locale}/teacher`;
  if (role === "parent") return `/${locale}/parent`;
  if (role === "admin") return `/${locale}/admin`;
  return `/${locale}/student`;
}

function formatSessionDate(value: string, locale: string, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale);
}

function formatCountdown(value: string, t: ReturnType<typeof useTranslations>): string {
  if (!value) return t("notSet");

  const startsAt = new Date(value).getTime();
  if (Number.isNaN(startsAt)) return t("notSet");

  const diffMs = startsAt - Date.now();
  if (diffMs <= 0) return t("now");

  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return t("daysHours", { days, hours });
  if (hours > 0) return t("hoursMinutes", { hours, minutes });
  return t("minutes", { minutes });
}

function formatParticipantStatus(status: string, t: ReturnType<typeof useTranslations>): string {
  if (status === "invited") return t("status.invited");
  if (status === "enrolled") return t("status.enrolled");
  if (status === "active") return t("status.active");
  if (status === "completed") return t("status.completed");
  if (status === "cancelled") return t("status.cancelled");
  return status;
}
