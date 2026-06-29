"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";

type StudentCourseRoom = {
  id: string;
  title: string;
  description: string;
  learningGoals: string;
  targetAudience: string;
  language: string;
  level: string;
  status: string;
  publicUrl: string;
  numberOfSessions: number;
  numberOfWeeks: number;
  participantStatus: string;
  announcements: Array<{
    id: string;
    subject: string;
    body: string;
    createdAt: string;
  }>;
  manualSubmissions: Array<{
    id: string;
    kind: string;
    courseResourceId: string;
    status: string;
    comment: string;
    instructorFeedback: string;
    reviewStatus: string;
    updatedAt: string;
  }>;
  resourceSubmissions: Array<{
    id: string;
    kind: string;
    courseResourceId: string;
    status: string;
    comment: string;
    instructorFeedback: string;
    reviewStatus: string;
    updatedAt: string;
  }>;
  coursePlan: Array<{
    sessionNumber: number;
    title: string;
    description: string;
    contentSuggestions: string;
    startsAt: string;
    durationMinutes: number;
    meetingUrl: string;
    homework: string;
    status: string;
    resources: Array<{
      id: string;
      type: string;
      visibility: string;
      sourceType: string;
      sourceId: string;
      title: string;
      description: string;
      url: string;
      openMode: "link" | "lesson" | "later" | "none";
    }>;
  }>;
};

type CourseRoomSection =
  | "overview"
  | "tasks"
  | "progress"
  | "feedback"
  | "messages"
  | "info"
  | "sessions";

export default function StudentCourseRoomPage() {
  const locale = useLocale();
  const params = useParams<{ courseId?: string }>();
  const courseId = typeof params?.courseId === "string" ? params.courseId : "";
  const { user } = useUserProfile();
  const [course, setCourse] = useState<StudentCourseRoom | null>(null);
  const [manualComments, setManualComments] = useState<Record<string, string>>({});
  const [manualSavingId, setManualSavingId] = useState("");
  const [manualSuccessById, setManualSuccessById] = useState<Record<string, string>>({});
  const [manualErrorById, setManualErrorById] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<CourseRoomSection>("overview");
  const [expandedSessions, setExpandedSessions] = useState<Record<number, boolean>>({});
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
        const token = await user.getIdToken();
        const res = await fetch(`/api/student/courses/${encodeURIComponent(courseId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          course?: StudentCourseRoom;
          error?: string;
        };
        if (!res.ok || !data.course) throw new Error(data.error || "Could not load course");
        if (!cancelled) {
          setCourse(data.course);
          setManualComments(
            Object.fromEntries(
              data.course.manualSubmissions.map((submission) => [
                submission.courseResourceId,
                submission.comment,
              ])
            )
          );
        }
      } catch (err) {
        console.error("Failed to load student course room", err);
        if (!cancelled) setError("Kursrommet kunne ikke hentes akkurat nå.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourse();

    return () => {
      cancelled = true;
    };
  }, [courseId, user]);

  async function submitManualResource(
    event: FormEvent<HTMLFormElement>,
    resourceId: string,
    sessionNumber: number
  ) {
    event.preventDefault();
    if (!user || !courseId || manualSavingId) return;

    try {
      setManualSavingId(resourceId);
      setManualErrorById((prev) => ({ ...prev, [resourceId]: "" }));
      setManualSuccessById((prev) => ({ ...prev, [resourceId]: "" }));

      const token = await user.getIdToken();
      const res = await fetch(`/api/student/courses/${encodeURIComponent(courseId)}/submissions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resourceId,
          sessionNumber,
          comment: manualComments[resourceId] ?? "",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        submissionId?: string;
        status?: string;
        error?: string;
      };
      if (!res.ok || !data.submissionId) throw new Error(data.error || "Could not save submission");

      const submissionId = data.submissionId;
      const updatedAt = new Date().toISOString();
      setCourse((prev) => {
        if (!prev) return prev;
        const nextSubmission = {
          id: submissionId,
          kind: "manual",
          courseResourceId: resourceId,
          status: data.status || "submitted",
          comment: manualComments[resourceId] ?? "",
          instructorFeedback: "",
          reviewStatus: "none",
          updatedAt,
        };
        const existing = prev.manualSubmissions.filter(
          (submission) => submission.courseResourceId !== resourceId
        );
        const existingResources = prev.resourceSubmissions.filter(
          (submission) => submission.courseResourceId !== resourceId
        );
        return {
          ...prev,
          manualSubmissions: [...existing, nextSubmission],
          resourceSubmissions: [...existingResources, nextSubmission],
        };
      });
      setManualSuccessById((prev) => ({ ...prev, [resourceId]: "Lagret" }));
      window.setTimeout(() => {
        setManualSuccessById((prev) => ({ ...prev, [resourceId]: "" }));
      }, 1600);
    } catch (err) {
      console.error("Failed to save manual course submission", err);
      setManualErrorById((prev) => ({
        ...prev,
        [resourceId]: "Innleveringen kunne ikke lagres akkurat nå.",
      }));
    } finally {
      setManualSavingId("");
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-3 py-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Laster kursrom...
        </div>
      </main>
    );
  }

  if (error || !course) {
    return (
      <main className="mx-auto grid max-w-4xl gap-4 px-3 py-4">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error || "Fant ikke kurs."}
        </div>
        <Link
          href={`/${locale}/academy/courses`}
          className="inline-flex h-10 w-fit items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
        >
          Back to courses
        </Link>
      </main>
    );
  }

  const nextSession = getNextSession(course);
  const manualSubmissionByResourceId = new Map(
    course.manualSubmissions.map((submission) => [submission.courseResourceId, submission])
  );
  const resourceSubmissionByResourceId = new Map(
    course.resourceSubmissions.map((submission) => [submission.courseResourceId, submission])
  );
  const visibleResources = course.coursePlan.flatMap((session) =>
    session.resources.map((resource) => ({
      ...resource,
      sessionNumber: session.sessionNumber,
      sessionTitle: session.title,
      startsAt: session.startsAt,
    }))
  );
  const submittedResourceCount = visibleResources.filter((resource) =>
    resourceSubmissionByResourceId.has(resource.id)
  ).length;
  const approvedResourceCount = visibleResources.filter(
    (resource) => resourceSubmissionByResourceId.get(resource.id)?.reviewStatus === "approved"
  ).length;
  const toDoResources = visibleResources
    .filter((resource) => resourceSubmissionByResourceId.get(resource.id)?.reviewStatus !== "approved")
    .slice(0, 6);
  const feedbackItems = course.resourceSubmissions
    .filter((submission) => submission.instructorFeedback || submission.reviewStatus !== "none")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map((submission) => ({
      submission,
      resource: visibleResources.find((resource) => resource.id === submission.courseResourceId),
    }));
  const progressPercent =
    visibleResources.length === 0
      ? 0
      : Math.round((submittedResourceCount / visibleResources.length) * 100);

  return (
    <main className="mx-auto grid max-w-5xl gap-5 px-3 py-4">
      <section className="sticky top-3 z-20 rounded-lg border border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              321Academy course room
            </div>
            <h1 className="m-0 mt-2 break-words text-2xl font-black text-slate-950">
              {course.title || "Uten tittel"}
            </h1>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {course.description || "Ingen beskrivelse ennå."}
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold capitalize text-slate-600">
            {course.participantStatus}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            {course.level || "Level ikke satt"}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            {course.language || "Språk ikke satt"}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            {course.numberOfSessions} samlinger
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            {course.numberOfWeeks} uker
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/${locale}/academy/courses`}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
          >
            Back to courses
          </Link>
          {course.publicUrl ? (
            <a
              href={course.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
            >
            Public course page
          </a>
        ) : null}
      </div>

        <CourseRoomNav
          activeSection={activeSection}
          onChange={setActiveSection}
          counts={{
            tasks: toDoResources.length,
            feedback: feedbackItems.length,
            messages: course.announcements.length,
            sessions: course.coursePlan.length,
          }}
        />
      </section>

      {activeSection === "overview" ? (
        <section className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-4">
            <OverviewStatCard label="To do" value={toDoResources.length} tone="amber" />
            <OverviewStatCard label="Submitted" value={submittedResourceCount} tone="slate" />
            <OverviewStatCard label="Approved" value={approvedResourceCount} tone="emerald" />
            <OverviewStatCard label="Progress" value={`${progressPercent}%`} tone="slate" />
          </div>
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
          <Link
            href={`/${locale}/academy/courses/${course.id}/sessions/${nextSession.sessionNumber}`}
            className="mt-3 inline-flex h-10 items-center justify-center rounded-lg border border-emerald-800 bg-emerald-800 px-4 text-sm font-bold text-white no-underline hover:bg-emerald-900"
          >
            Open session room
          </Link>
        </section>
          ) : (
            <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5">
              <h2 className="m-0 text-lg font-black text-slate-950">Next session</h2>
              <p className="mt-2 text-sm text-slate-600">No session is scheduled yet.</p>
            </section>
          )}
        </section>
      ) : null}

      {activeSection === "tasks" ? (
      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-black text-slate-950">To do</h2>
            <p className="mt-1 text-sm text-slate-600">
              Åpne kursoppgaver og ressurser som ikke er godkjent ennå.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
            {toDoResources.length}
          </span>
        </div>
        {toDoResources.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-800">
            Alt som er lagt ut er godkjent eller ferdig for nå.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {toDoResources.map((resource) => (
              <article key={resource.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Samling {resource.sessionNumber}
                  {resource.startsAt ? ` · ${formatSessionDate(resource.startsAt)}` : ""}
                </div>
                <h3 className="m-0 mt-2 text-base font-extrabold text-slate-950">
                  {resource.title || resource.type}
                </h3>
                {resource.description ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {resource.description}
                  </p>
                ) : null}
                <ResourceSubmissionStatus
                  submission={resourceSubmissionByResourceId.get(resource.id)}
                />
                <ToDoResourceAction courseId={course.id} locale={locale} resource={resource} />
              </article>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {activeSection === "progress" ? (
      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-black text-slate-950">My progress</h2>
            <p className="mt-1 text-sm text-slate-600">
              {submittedResourceCount}/{visibleResources.length} ressurser levert · {approvedResourceCount} godkjent
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
            {`${progressPercent}%`}
          </span>
        </div>
        {visibleResources.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            Ingen kursressurser er lagt ut ennå.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {visibleResources.map((resource) => (
              <div key={resource.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Samling {resource.sessionNumber}
                </div>
                <div className="mt-1 font-extrabold text-slate-950">
                  {resource.title || resource.type}
                </div>
                <ResourceSubmissionStatus
                  submission={resourceSubmissionByResourceId.get(resource.id)}
                />
              </div>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {activeSection === "feedback" ? (
      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-black text-slate-950">Feedback from instructor</h2>
            <p className="mt-1 text-sm text-slate-600">
              Siste vurderinger og kommentarer fra kursholder.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
            {feedbackItems.length}
          </span>
        </div>
        {feedbackItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            Ingen vurderinger ennå.
          </div>
        ) : (
          <div className="grid gap-3">
            {feedbackItems.map(({ submission, resource }) => (
              <article key={submission.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                      {resource?.sessionNumber ? `Samling ${resource.sessionNumber}` : "Kursoppgave"}
                    </div>
                    <h3 className="m-0 mt-1 text-base font-extrabold text-slate-950">
                      {resource?.title || "Ressurs"}
                    </h3>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">
                    {formatReviewStatus(submission.reviewStatus)}
                  </span>
                </div>
                {submission.instructorFeedback ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {submission.instructorFeedback}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">
                    Ingen kommentar, bare status er satt.
                  </p>
                )}
                <div className="mt-3 text-xs font-bold text-slate-500">
                  Oppdatert: {formatMaybeDate(submission.updatedAt)}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {activeSection === "messages" ? (
      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-black text-slate-950">Announcements</h2>
            <p className="mt-1 text-sm text-slate-600">
              Beskjeder fra kursinstruktør vises her.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
            {course.announcements.length}
          </span>
        </div>
        {course.announcements.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            Ingen beskjeder ennå.
          </div>
        ) : (
          <div className="grid gap-3">
            {course.announcements.map((announcement) => (
              <article key={announcement.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="m-0 text-base font-extrabold text-slate-950">
                    {announcement.subject || "Beskjed"}
                  </h3>
                  <span className="text-xs font-bold text-slate-500">
                    {formatMaybeDate(announcement.createdAt)}
                  </span>
                </div>
                {announcement.body ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {announcement.body}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {activeSection === "info" ? (
      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <TextBlock title="Learning goals" value={course.learningGoals || "Ikke fylt ut"} />
        <TextBlock title="Target audience" value={course.targetAudience || "Ikke fylt ut"} />
      </section>
      ) : null}

      {activeSection === "sessions" ? (
      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="m-0 text-xl font-black text-slate-950">Sessions</h2>
        {course.coursePlan.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            Ingen samlinger er lagt inn ennå.
          </div>
        ) : (
          <div className="grid gap-3">
            {course.coursePlan.map((session) => {
              const expanded = expandedSessions[session.sessionNumber] === true;
              const submittedInSession = session.resources.filter((resource) =>
                resourceSubmissionByResourceId.has(resource.id)
              ).length;
              const toneClass = getParticipantSessionTone(session.status);

              return (
                <article
                  key={session.sessionNumber}
                  className={`overflow-hidden rounded-lg border shadow-sm ${toneClass}`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSessions((prev) => ({
                        ...prev,
                        [session.sessionNumber]: !expanded,
                      }))
                    }
                    className="grid w-full gap-2 p-4 text-left"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-black uppercase tracking-wide opacity-70">
                          Session {session.sessionNumber}
                        </div>
                        <h3 className="m-0 mt-1 break-words text-base font-extrabold">
                          {session.title || "Untitled session"}
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-bold">
                        <span className="rounded-full border border-white/60 bg-white/80 px-3 py-1">
                          {formatSessionDate(session.startsAt)}
                        </span>
                        <span className="rounded-full border border-white/60 bg-white/80 px-3 py-1 capitalize">
                          {session.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="m-0 line-clamp-2 text-sm leading-6 opacity-90">
                        {session.description || "No description yet."}
                      </p>
                      <span className="rounded-full border border-white/60 bg-white/80 px-3 py-1 text-xs font-bold">
                        {expanded ? "Close" : "Open"} · {session.resources.length} resources
                      </span>
                    </div>
                  </button>

                  {expanded ? (
                    <div className="grid gap-4 border-t border-white/70 bg-white/80 p-4">
                      <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                          {session.durationMinutes || 120} min
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                          {submittedInSession}/{session.resources.length} submitted
                        </span>
                      </div>

                      {session.meetingUrl ? (
                        <a
                          href={session.meetingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 w-fit items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-sm font-bold text-white no-underline hover:bg-slate-800"
                        >
                          Open meeting
                        </a>
                      ) : null}

                      {session.resources.length > 0 ? (
                        <div className="grid gap-2">
                          <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                            Resources for this session
                          </div>
                          {session.resources.map((resource) => (
                            <div key={resource.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="font-extrabold text-slate-900">
                                    {resource.title || resource.type}
                                  </div>
                                  {resource.description ? (
                                    <div className="mt-1 whitespace-pre-wrap text-slate-600">
                                      {resource.description}
                                    </div>
                                  ) : null}
                                </div>
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                                  {resource.sourceType || resource.type}
                                </span>
                              </div>
                              {resource.openMode === "lesson" && resource.sourceId ? (
                                <Link
                                  href={`/${locale}/student/lesson/${resource.sourceId}?courseId=${encodeURIComponent(course.id)}&sessionNumber=${encodeURIComponent(String(session.sessionNumber))}&resourceId=${encodeURIComponent(resource.id)}`}
                                  className="mt-2 inline-flex text-sm font-bold text-slate-900 underline"
                                >
                                  Open lesson
                                </Link>
                              ) : resource.openMode === "link" && resource.url ? (
                                <a
                                  href={resource.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 inline-flex text-sm font-bold text-slate-900 underline"
                                >
                                  Open resource
                                </a>
                              ) : resource.openMode === "later" ? (
                                <div className="mt-2 text-xs font-bold text-slate-500">
                                  Platform resource opens here later.
                                </div>
                              ) : null}
                              {resource.openMode === "lesson" ? (
                                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                  <ResourceSubmissionStatus
                                    submission={resourceSubmissionByResourceId.get(resource.id)}
                                  />
                                </div>
                              ) : null}
                              {resource.openMode !== "lesson" ? (
                                <form
                                  onSubmit={(event) =>
                                    void submitManualResource(event, resource.id, session.sessionNumber)
                                  }
                                  className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
                                >
                                  <label className="grid gap-2 text-xs font-bold text-slate-700">
                                    <span>Comment for instructor</span>
                                    <textarea
                                      value={manualComments[resource.id] ?? ""}
                                      onChange={(event) =>
                                        setManualComments((prev) => ({
                                          ...prev,
                                          [resource.id]: event.target.value,
                                        }))
                                      }
                                      rows={3}
                                      maxLength={3000}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal leading-6 text-slate-800"
                                      placeholder="Write a short comment, or submit empty if this should only be marked as done."
                                    />
                                  </label>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <ManualSubmissionStatus
                                      submission={manualSubmissionByResourceId.get(resource.id)}
                                    />
                                    <button
                                      type="submit"
                                      disabled={manualSavingId === resource.id}
                                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-60"
                                    >
                                      {manualSavingId === resource.id ? "Saving..." : "Submit"}
                                    </button>
                                  </div>
                                  {manualSuccessById[resource.id] ? (
                                    <div className="text-xs font-bold text-emerald-700">
                                      {manualSuccessById[resource.id]}
                                    </div>
                                  ) : null}
                                  {manualErrorById[resource.id] ? (
                                    <div className="text-xs font-bold text-rose-700">
                                      {manualErrorById[resource.id]}
                                    </div>
                                  ) : null}
                                </form>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                          No resources have been added to this session yet.
                        </div>
                      )}

                      {session.homework ? (
                        <p className="m-0 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          <strong>Homework:</strong> {session.homework}
                        </p>
                      ) : null}

                      <div className="flex justify-end border-t border-slate-200 pt-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSessions((prev) => ({
                              ...prev,
                              [session.sessionNumber]: false,
                            }))
                          }
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 hover:bg-slate-50"
                        >
                          Close session
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
      ) : null}
    </main>
  );
}

function CourseRoomNav({
  activeSection,
  onChange,
  counts,
}: {
  activeSection: CourseRoomSection;
  onChange: (section: CourseRoomSection) => void;
  counts: {
    tasks: number;
    feedback: number;
    messages: number;
    sessions: number;
  };
}) {
  const items: Array<{ id: CourseRoomSection; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "tasks", label: "Tasks", count: counts.tasks },
    { id: "progress", label: "Progress" },
    { id: "feedback", label: "Feedback", count: counts.feedback },
    { id: "messages", label: "Messages", count: counts.messages },
    { id: "info", label: "Course info" },
    { id: "sessions", label: "Sessions", count: counts.sessions },
  ];

  return (
    <nav className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => {
        const active = activeSection === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-bold transition ${
              active
                ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
            }`}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

function OverviewStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "slate" | "amber" | "emerald";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
        : "border-slate-200 bg-white text-slate-950";

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="text-xs font-black uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}

function ManualSubmissionStatus({
  submission,
}: {
  submission?: StudentCourseRoom["manualSubmissions"][number];
}) {
  if (!submission) {
    return <span className="text-xs font-bold text-slate-500">Ikke levert ennå</span>;
  }

  return (
    <div className="grid gap-1 text-xs text-slate-600">
      <span className="font-bold">
        Levert · {formatMaybeDate(submission.updatedAt)}
      </span>
      <span className="font-bold">{formatReviewStatus(submission.reviewStatus)}</span>
      {submission.instructorFeedback ? (
        <span className="whitespace-pre-wrap text-slate-700">
          {submission.instructorFeedback}
        </span>
      ) : null}
    </div>
  );
}

function ResourceSubmissionStatus({
  submission,
}: {
  submission?: StudentCourseRoom["resourceSubmissions"][number];
}) {
  if (!submission) {
    return <div className="mt-2 text-xs font-bold text-slate-500">Ikke levert ennå</div>;
  }

  return (
    <div className="mt-2 grid gap-1 text-xs text-slate-600">
      <span className="font-bold">
        {formatSubmissionStatus(submission.status)} · {formatMaybeDate(submission.updatedAt)}
      </span>
      <span className="font-bold">{formatReviewStatus(submission.reviewStatus)}</span>
      {submission.instructorFeedback ? (
        <span className="whitespace-pre-wrap text-slate-700">
          {submission.instructorFeedback}
        </span>
      ) : null}
    </div>
  );
}

function ToDoResourceAction({
  courseId,
  locale,
  resource,
}: {
  courseId: string;
  locale: string;
  resource: StudentCourseRoom["coursePlan"][number]["resources"][number] & {
    sessionNumber: number;
  };
}) {
  if (resource.openMode === "lesson" && resource.sourceId) {
    return (
      <Link
        href={`/${locale}/student/lesson/${resource.sourceId}?courseId=${encodeURIComponent(courseId)}&sessionNumber=${encodeURIComponent(String(resource.sessionNumber))}&resourceId=${encodeURIComponent(resource.id)}`}
        className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-sm font-bold text-white no-underline"
      >
        Open lesson
      </Link>
    );
  }

  if (resource.openMode === "link" && resource.url) {
    return (
      <a
        href={resource.url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-sm font-bold text-white no-underline"
      >
        Open resource
      </a>
    );
  }

  return (
    <div className="mt-3 text-xs font-bold text-slate-500">
      Åpnes fra samlingslisten under.
    </div>
  );
}

function formatSubmissionStatus(value: string): string {
  if (value === "draft") return "Utkast";
  if (value === "submitted") return "Levert";
  return value || "Levert";
}

function formatReviewStatus(value: string): string {
  if (value === "approved") return "Godkjent";
  if (value === "needs_work") return "Trenger arbeid";
  return "Venter på vurdering";
}

function getParticipantSessionTone(status: string): string {
  if (status === "completed") return "border-emerald-200 bg-emerald-100 text-emerald-950";
  if (status === "cancelled") return "border-rose-200 bg-rose-50 text-rose-950";
  return "border-amber-200 bg-amber-100 text-amber-950";
}

function TextBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <h2 className="m-0 text-lg font-black text-slate-950">{title}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function getNextSession(course: StudentCourseRoom) {
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

function formatSessionDate(value: string): string {
  if (!value) return "Dato ikke satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatMaybeDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
