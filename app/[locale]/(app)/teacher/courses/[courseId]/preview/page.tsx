"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { AcademyGate } from "../../AcademyGate";
import { type Course } from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { fetchTeacherCourse } from "../courseClient";

export default function CoursePreviewPage() {
  return (
    <AcademyGate>
      <CoursePreviewContent />
    </AcademyGate>
  );
}

function CoursePreviewContent() {
  const locale = useLocale();
  const t = useTranslations("academy.teacherPreview");
  const params = useParams<{ courseId?: string }>();
  const { user } = useUserProfile();
  const courseId = typeof params?.courseId === "string" ? params.courseId : "";
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCourse() {
      if (!user || !courseId) {
        setLoading(false);
        setError(t("notFound"));
        return;
      }

      try {
        setLoading(true);
        setError("");
        const loadedCourse = await fetchTeacherCourse(user, courseId);
        if (!cancelled) setCourse(loadedCourse);
      } catch (err) {
        console.error("Failed to load course preview", err);
        if (!cancelled) setError(t("loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourse();

    return () => {
      cancelled = true;
    };
  }, [courseId, t, user]);

  if (loading) {
    return (
      <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-4 text-sm text-slate-500">
        {t("loading")}
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error || t("notFound")}
      </div>
    );
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-5">
      <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              {t("eyebrow")}
            </div>
            <h1 className="m-0 mt-2 break-words text-3xl font-black text-slate-950">
              {course.title || t("untitled")}
            </h1>
            <p className="mt-3 max-w-3xl whitespace-pre-wrap text-base leading-7 text-slate-700">
              {course.description || t("noDescription")}
            </p>
          </div>

          <button
            type="button"
            disabled
            className="inline-flex h-10 cursor-not-allowed items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-4 text-sm font-bold text-slate-500"
          >
            {t("joinButton")}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <PreviewBadge label={t("badges.level")} value={course.level || t("missing")} />
          <PreviewBadge label={t("badges.language")} value={course.language || t("missing")} />
          <PreviewBadge label={t("badges.sessions")} value={String(course.numberOfSessions)} />
          <PreviewBadge label={t("badges.price")} value={course.priceText || t("missing")} />
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-6 shadow-sm">
        <PreviewBlock title={t("learningGoals")} value={course.learningGoals || t("missing")} />
        <PreviewBlock title={t("targetAudience")} value={course.targetAudience || t("missing")} />
      </section>

      <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-6 shadow-sm">
        <h2 className="m-0 text-xl font-black text-slate-950">{t("coursePlan")}</h2>
        {course.coursePlan.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            {t("noSessions")}
          </div>
        ) : (
          <div className="grid gap-3">
            {course.coursePlan.map((session) => (
              <article key={session.sessionNumber} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                  {t("session", { number: session.sessionNumber })}
                </div>
                <h3 className="m-0 mt-2 text-base font-extrabold text-slate-950">
                  {session.title || t("noSessionTitle")}
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {session.description || t("noSessionDescription")}
                </p>
                {session.contentSuggestions ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    <strong>{t("contentSuggestions")}</strong> {session.contentSuggestions}
                  </p>
                ) : null}
                {session.resources.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                      {t("resources")}
                    </div>
                    {session.resources.map((resource) => (
                      <div key={resource.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                        <div className="font-extrabold text-slate-900">
                          {resource.title || resource.type}
                        </div>
                        <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                          {formatResourceVisibility(resource.visibility, t)}
                        </div>
                        {resource.description ? <div className="mt-1 whitespace-pre-wrap">{resource.description}</div> : null}
                        {resource.url ? (
                          <a href={resource.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-sm font-bold text-slate-900 underline">
                            {t("openResource")}
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    {formatSessionDate(session.startsAt, locale, t("dateNotSet"))}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    {session.durationMinutes || 120} min
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    {session.status}
                  </span>
                </div>
                {session.meetingUrl ? (
                  <a
                    href={session.meetingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
                  >
                    {t("meetingLink")}
                  </a>
                ) : (
                  <div className="mt-3 text-sm font-bold text-slate-500">
                    {t("meetingLater")}
                  </div>
                )}
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  <strong>{t("homework")}</strong> {session.homework || t("noHomework")}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <div>
        <Link
          href={`/${locale}/teacher/courses/${course.id}`}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
        >
          {t("back")}
        </Link>
      </div>
    </main>
  );
}

function PreviewBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
      <strong>{label}:</strong> {value}
    </span>
  );
}

function PreviewBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <h2 className="m-0 text-lg font-black text-slate-950">{title}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function formatSessionDate(value: string, locale: string, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale);
}

function formatResourceVisibility(
  visibility: Course["coursePlan"][number]["resources"][number]["visibility"],
  t: ReturnType<typeof useTranslations>
): string {
  if (visibility === "teacher") return t("visibility.teacher");
  if (visibility === "public") return t("visibility.public");
  return t("visibility.participants");
}
