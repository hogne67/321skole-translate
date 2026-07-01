"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
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
        if (!res.ok) throw new Error(data.error || "Could not load courses");
        if (!cancelled) {
          setCourses(Array.isArray(data.courses) ? data.courses : []);
          setHighlightedCourseId(typeof data.highlightedCourseId === "string" ? data.highlightedCourseId : "");
        }
      } catch (err) {
        console.error("Failed to load student courses", err);
        if (!cancelled) setError("Kursene kunne ikke hentes akkurat nå.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourses();

    return () => {
      cancelled = true;
    };
  }, [orderId, user]);

  return (
    <main className="mx-auto grid max-w-4xl gap-5 px-3 py-4">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-2xl font-black text-slate-950">Courses</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Courses where your email has been added as a participant.
            </p>
          </div>

          <Link
            href={dashboardHref}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
          >
            Back to dashboard
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
              <div className="text-base font-black">Payment completed</div>
              <div className="mt-1">
                {highlightedCourse
                  ? `${highlightedCourse.title} has been added to your course room.`
                  : "The course has been added to your course room."}
              </div>
            </div>
            {highlightedCourse ? (
              <Link
                href={`/${locale}/academy/courses/${highlightedCourse.id}`}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-800 bg-white px-4 text-sm font-black text-emerald-950 no-underline hover:bg-emerald-100"
              >
                Open course room
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {loading ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Loading courses...
        </section>
      ) : courses.length === 0 ? (
        <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
          <h2 className="m-0 text-lg font-extrabold text-slate-900">No courses yet</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            When an instructor adds this email as a participant, the course will appear here.
          </p>
        </section>
      ) : (
        <section className="grid gap-3">
          {courses.map((course) => (
            <article key={course.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="m-0 break-words text-lg font-black text-slate-950">
                    {course.title || "Untitled course"}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 capitalize">
                      {course.participantStatus}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      {course.numberOfSessions} sessions
                    </span>
                  </div>
                </div>
                <Link
                  href={`/${locale}/academy/courses/${course.id}`}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 text-sm font-bold text-white no-underline hover:bg-slate-800"
                >
                  Open course room
                </Link>
              </div>

              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                {course.nextSession ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide text-emerald-800">
                        Next session
                      </div>
                      <div className="mt-1 font-extrabold text-emerald-950">
                        {course.nextSession.title || `Session ${course.nextSession.sessionNumber}`}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-emerald-900">
                        {formatSessionDate(course.nextSession.startsAt)} · {course.nextSession.durationMinutes || 120} min
                      </div>
                    </div>
                    <div className="min-w-40 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-center">
                      <div className="text-xs font-black uppercase tracking-wide text-emerald-700">
                        Starts in
                      </div>
                      <div className="mt-1 text-lg font-black text-emerald-950">
                        {formatCountdown(course.nextSession.startsAt)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-emerald-800">
                      Next session
                    </div>
                    <div className="mt-1 text-sm font-semibold text-emerald-900">
                      No session has been scheduled yet.
                    </div>
                  </div>
                )}

                {course.nextSession ? (
                  <Link
                    href={`/${locale}/academy/courses/${course.id}/sessions/${course.nextSession.sessionNumber}`}
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-emerald-800 bg-white px-4 text-sm font-bold text-emerald-950 no-underline hover:bg-emerald-100"
                  >
                    Join video session
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-950 opacity-70"
                    title="Video session room will be added later."
                  >
                    Join video session
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

function formatSessionDate(value: string): string {
  if (!value) return "Date not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatCountdown(value: string): string {
  if (!value) return "Not set";

  const startsAt = new Date(value).getTime();
  if (Number.isNaN(startsAt)) return "Not set";

  const diffMs = startsAt - Date.now();
  if (diffMs <= 0) return "Now";

  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
