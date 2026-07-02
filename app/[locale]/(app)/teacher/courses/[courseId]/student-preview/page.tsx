"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { AcademyGate } from "../../AcademyGate";
import { type Course } from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { fetchTeacherCourse } from "../courseClient";

export default function TeacherCourseStudentPreviewPage() {
  return (
    <AcademyGate>
      <TeacherCourseStudentPreviewContent />
    </AcademyGate>
  );
}

function TeacherCourseStudentPreviewContent() {
  const locale = useLocale();
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
        setError("Fant ikke kurs.");
        return;
      }

      try {
        setLoading(true);
        setError("");
        const loadedCourse = await fetchTeacherCourse(user, courseId);
        if (!cancelled) setCourse(loadedCourse);
      } catch (err) {
        console.error("Failed to load participant preview", err);
        if (!cancelled) setError("Deltakervisningen kunne ikke hentes akkurat nå.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourse();

    return () => {
      cancelled = true;
    };
  }, [courseId, user]);

  if (loading) {
    return (
      <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-4 text-sm text-slate-500">
        Laster deltakervisning...
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error || "Fant ikke kurs."}
      </div>
    );
  }

  const nextSession = getNextSession(course);

  return (
    <main className="mx-auto grid max-w-5xl gap-5">
      <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              Teacher preview: participant view
            </div>
            <h1 className="m-0 mt-2 break-words text-2xl font-black text-slate-950">
              {course.title || "Uten tittel"}
            </h1>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {course.description || "Ingen beskrivelse ennå."}
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
            preview
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/${locale}/teacher/courses/${course.id}`}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
          >
            Back to course dashboard
          </Link>
        </div>
      </section>

      {nextSession ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-xs font-black uppercase tracking-wide text-emerald-800">
            Next session
          </div>
          <h2 className="m-0 mt-2 text-lg font-black text-emerald-950">
            {nextSession.title || `Samling ${nextSession.sessionNumber}`}
          </h2>
          <p className="mt-1 text-sm font-semibold text-emerald-900">
            {formatSessionDate(nextSession.startsAt)} · {nextSession.durationMinutes || 120} min
          </p>
          {nextSession.meetingUrl ? (
            <a
              href={nextSession.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex h-10 items-center justify-center rounded-lg border border-emerald-800 bg-emerald-800 px-4 text-sm font-bold text-white no-underline hover:bg-emerald-900"
            >
              Open meeting
            </a>
          ) : (
            <div className="mt-3 text-sm font-bold text-emerald-900">
              Meeting link kommer senere.
            </div>
          )}
        </section>
      ) : null}

      <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <TextBlock title="Learning goals" value={course.learningGoals || "Ikke fylt ut"} />
        <TextBlock title="Target audience" value={course.targetAudience || "Ikke fylt ut"} />
      </section>

      <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <h2 className="m-0 text-xl font-black text-slate-950">Sessions</h2>
        {course.coursePlan.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            Ingen samlinger er lagt inn ennå.
          </div>
        ) : (
          <div className="grid gap-3">
            {course.coursePlan.map((session) => {
              const visibleResources = session.resources.filter((resource) => resource.visibility !== "teacher");
              return (
                <article key={session.sessionNumber} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    Session {session.sessionNumber}
                  </div>
                  <h3 className="m-0 mt-2 text-base font-extrabold text-slate-950">
                    {session.title || "Uten tittel"}
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {session.description || "Ingen beskrivelse."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                      {formatSessionDate(session.startsAt)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                      {session.durationMinutes || 120} min
                    </span>
                  </div>
                  {visibleResources.length > 0 ? (
                    <div className="mt-4 grid gap-2">
                      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Resources
                      </div>
                      {visibleResources.map((resource) => (
                        <div key={resource.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                          <div className="font-extrabold text-slate-900">
                            {resource.title || resource.type}
                          </div>
                          {resource.description ? (
                            <div className="mt-1 whitespace-pre-wrap text-slate-600">{resource.description}</div>
                          ) : null}
                          {resource.sourceType === "library" && resource.sourceId ? (
                            <Link
                              href={`/${locale}/lesson/${resource.sourceId}`}
                              className="mt-2 inline-flex text-sm font-bold text-slate-900 underline"
                            >
                              Open lesson
                            </Link>
                          ) : isOpenableResource(resource) ? (
                            <a
                              href={resource.url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex text-sm font-bold text-slate-900 underline"
                            >
                              Open resource
                            </a>
                          ) : resource.type === "platform" ? (
                            <div className="mt-2 text-xs font-bold text-slate-500">
                              Platform resource opens here later.
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {session.homework ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      <strong>Homework:</strong> {session.homework}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function TextBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <h2 className="m-0 text-lg font-black text-slate-950">{title}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function getNextSession(course: Course) {
  const now = Date.now();
  const planned = course.coursePlan
    .filter((session) => session.status === "planned")
    .sort((a, b) => {
      const aTime = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

  return planned.find((session) => !session.startsAt || new Date(session.startsAt).getTime() >= now) ?? planned[0] ?? null;
}

function isOpenableResource(resource: Course["coursePlan"][number]["resources"][number]): boolean {
  if (!resource.url) return false;
  if (resource.type === "platform") return false;
  if (resource.sourceType === "myContent" || resource.sourceType === "library") return false;
  return /^https?:\/\//i.test(resource.url);
}

function formatSessionDate(value: string): string {
  if (!value) return "Dato ikke satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
