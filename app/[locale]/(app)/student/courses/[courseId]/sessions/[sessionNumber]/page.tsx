"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";

type CourseRoomSession = {
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
    sourceType: string;
    sourceId: string;
    title: string;
    description: string;
    url: string;
    openMode: "link" | "lesson" | "later" | "none";
  }>;
};

type CourseRoom = {
  id: string;
  title: string;
  description: string;
  participantStatus: string;
  coursePlan: CourseRoomSession[];
  resourceSubmissions: Array<{
    id: string;
    courseResourceId: string;
    status: string;
    instructorFeedback: string;
    reviewStatus: string;
    updatedAt: string;
  }>;
};

type DailyCallFrame = {
  join: (args: { url: string; token?: string }) => Promise<unknown>;
  destroy: () => void;
};

declare global {
  interface Window {
    Daily?: {
      createFrame: (
        element: HTMLElement,
        options: {
          showLeaveButton?: boolean;
          iframeStyle?: Record<string, string>;
        }
      ) => DailyCallFrame;
    };
  }
}

export default function CourseSessionPage() {
  const locale = useLocale();
  const params = useParams<{ courseId?: string; sessionNumber?: string }>();
  const courseId = typeof params?.courseId === "string" ? params.courseId : "";
  const sessionNumber = Number(params?.sessionNumber);
  const { user } = useUserProfile();
  const dailyContainerRef = useRef<HTMLDivElement | null>(null);
  const dailyFrameRef = useRef<DailyCallFrame | null>(null);
  const [course, setCourse] = useState<CourseRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [joiningDaily, setJoiningDaily] = useState(false);
  const [dailyLoaded, setDailyLoaded] = useState(false);
  const [dailyError, setDailyError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCourse() {
      if (!user || !courseId || !Number.isFinite(sessionNumber)) {
        setLoading(false);
        setError("Could not find this session.");
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
          course?: CourseRoom;
          error?: string;
        };
        if (!res.ok || !data.course) throw new Error(data.error || "Could not load session");
        if (!cancelled) setCourse(data.course);
      } catch (err) {
        console.error("Failed to load course session", err);
        if (!cancelled) setError("This session could not be loaded right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourse();

    return () => {
      cancelled = true;
    };
  }, [courseId, sessionNumber, user]);

  useEffect(() => {
    return () => {
      dailyFrameRef.current?.destroy();
      dailyFrameRef.current = null;
    };
  }, []);

  async function joinDailySession() {
    if (!user || !courseId || !Number.isFinite(sessionNumber) || joiningDaily) return;

    try {
      setJoiningDaily(true);
      setDailyError("");
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/student/courses/${encodeURIComponent(courseId)}/sessions/${encodeURIComponent(String(sessionNumber))}/daily`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        roomUrl?: string;
        token?: string;
        error?: string;
      };
      if (!res.ok || !data.roomUrl) throw new Error(data.error || "Could not start video session");

      await loadDailyScript();
      if (!window.Daily || !dailyContainerRef.current) {
        throw new Error("Daily could not be loaded");
      }

      dailyFrameRef.current?.destroy();
      dailyContainerRef.current.innerHTML = "";
      const frame = window.Daily.createFrame(dailyContainerRef.current, {
        showLeaveButton: true,
        iframeStyle: {
          width: "100%",
          height: "100%",
          border: "0",
          borderRadius: "0.75rem",
        },
      });
      dailyFrameRef.current = frame;
      await frame.join({ url: data.roomUrl, token: data.token });
      setDailyLoaded(true);
    } catch (err) {
      const message = getDailyJoinErrorMessage(err);
      if (message === DAILY_NOT_AVAILABLE_MESSAGE) {
        console.info("Daily session is not available yet.");
      } else {
        console.info("Daily session could not be joined.", message);
      }
      setDailyError(message);
    } finally {
      setJoiningDaily(false);
    }
  }

  const session = useMemo(
    () => course?.coursePlan.find((item) => item.sessionNumber === sessionNumber) ?? null,
    [course, sessionNumber]
  );

  const submissionByResourceId = useMemo(
    () =>
      new Map(
        (course?.resourceSubmissions ?? []).map((submission) => [
          submission.courseResourceId,
          submission,
        ])
      ),
    [course?.resourceSubmissions]
  );

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-3 py-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Loading session...
        </div>
      </main>
    );
  }

  if (error || !course || !session) {
    return (
      <main className="mx-auto grid max-w-4xl gap-4 px-3 py-4">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error || "Could not find this session."}
        </div>
        <Link
          href={`/${locale}/academy/courses/${courseId}`}
          className="inline-flex h-10 w-fit items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
        >
          Back to course room
        </Link>
      </main>
    );
  }

  const submittedCount = session.resources.filter((resource) =>
    submissionByResourceId.has(resource.id)
  ).length;

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-3 py-4">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              {course.title || "Course"} · Session {session.sessionNumber}
            </div>
            <h1 className="m-0 mt-2 break-words text-2xl font-black text-slate-950">
              {session.title || `Session ${session.sessionNumber}`}
            </h1>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {session.description || course.description || "No description yet."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold capitalize text-slate-600">
              {session.status || "planned"}
            </span>
            <Link
              href={`/${locale}/academy/courses/${course.id}`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
            >
              Back to course room
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
        <div className="grid min-h-[420px] gap-4 rounded-lg border border-slate-900 bg-slate-950 p-5 text-white shadow-sm">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-emerald-300">
              Live session
            </div>
            <h2 className="m-0 mt-2 text-xl font-black">Video room</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              This area is prepared for a video provider such as Daily. For now, use the meeting
              link when one has been added by the instructor.
            </p>
          </div>

          <div className="grid place-items-center rounded-lg border border-white/10 bg-white/5 p-6 text-center">
            <div>
              <div className="text-5xl font-black text-white/20">321</div>
              <p className="mt-3 text-sm font-semibold text-slate-300">
                Daily/meeting embed placeholder
              </p>
              <button
                type="button"
                onClick={() => void joinDailySession()}
                disabled={joiningDaily}
                className="mt-5 inline-flex h-11 items-center justify-center rounded-lg border border-emerald-400 bg-emerald-400 px-5 text-sm font-black text-slate-950 no-underline hover:bg-emerald-300 disabled:opacity-60"
              >
                {joiningDaily ? "Starting..." : dailyLoaded ? "Reconnect video" : "Join video session"}
              </button>
              {dailyError ? (
                <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm font-semibold text-rose-100">
                  {dailyError}
                </div>
              ) : null}
            </div>
          </div>
          <div ref={dailyContainerRef} className="min-h-[360px]" />
        </div>

        <aside className="grid gap-4">
          <InfoCard label="Starts" value={formatSessionDate(session.startsAt)} />
          <InfoCard label="Duration" value={`${session.durationMinutes || 120} min`} />
          <InfoCard label="Resources" value={`${session.resources.length}`} />
          <InfoCard label="Submitted" value={`${submittedCount}/${session.resources.length}`} />
        </aside>
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="m-0 text-xl font-black text-slate-950">Session resources</h2>
          <p className="mt-1 text-sm text-slate-600">
            Materials and tasks connected to this session.
          </p>
        </div>

        {session.resources.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            No resources have been added to this session yet.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {session.resources.map((resource) => (
              <article key={resource.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="m-0 text-base font-extrabold text-slate-950">
                      {resource.title || resource.type}
                    </h3>
                    {resource.description ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {resource.description}
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                    {resource.sourceType || resource.type}
                  </span>
                </div>

                <ResourceStatus submission={submissionByResourceId.get(resource.id)} />

                <ResourceAction
                  locale={locale}
                  courseId={course.id}
                  sessionNumber={session.sessionNumber}
                  resource={resource}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="m-0 text-xl font-black text-slate-950">Agenda</h2>
        <p className="m-0 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {session.contentSuggestions || session.description || "The instructor has not added an agenda yet."}
        </p>
        {session.homework ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              Homework
            </div>
            <p className="m-0 mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {session.homework}
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-black text-slate-950">{value || "-"}</div>
    </div>
  );
}

function ResourceAction({
  locale,
  courseId,
  sessionNumber,
  resource,
}: {
  locale: string;
  courseId: string;
  sessionNumber: number;
  resource: CourseRoomSession["resources"][number];
}) {
  if (resource.openMode === "lesson" && resource.sourceId) {
    return (
      <Link
        href={`/${locale}/student/lesson/${resource.sourceId}?courseId=${encodeURIComponent(courseId)}&sessionNumber=${encodeURIComponent(String(sessionNumber))}&resourceId=${encodeURIComponent(resource.id)}`}
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
      This resource will open here later.
    </div>
  );
}

function ResourceStatus({
  submission,
}: {
  submission?: CourseRoom["resourceSubmissions"][number];
}) {
  if (!submission) {
    return <div className="mt-3 text-xs font-bold text-slate-500">Not submitted yet</div>;
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
      <div className="font-bold">
        {formatSubmissionStatus(submission.status)} · {formatMaybeDate(submission.updatedAt)}
      </div>
      <div className="mt-1 font-bold">{formatReviewStatus(submission.reviewStatus)}</div>
      {submission.instructorFeedback ? (
        <div className="mt-2 whitespace-pre-wrap text-slate-700">
          {submission.instructorFeedback}
        </div>
      ) : null}
    </div>
  );
}

function loadDailyScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Daily) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>("script[data-daily-js]");
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Daily script failed to load")), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@daily-co/daily-js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.dailyJs = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Daily script failed to load")), {
      once: true,
    });
    document.head.appendChild(script);
  });
}

const DAILY_NOT_AVAILABLE_MESSAGE =
  "This meeting is not available yet. Try again closer to the session start time.";

function getDailyJoinErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message.trim() : "";
    const errorMessage = typeof record.errorMsg === "string" ? record.errorMsg.trim() : "";
    const info = typeof record.info === "string" ? record.info.trim() : "";
    if (message) return message;
    if (errorMessage) return errorMessage;
    if (info) return info;
  }

  return DAILY_NOT_AVAILABLE_MESSAGE;
}

function formatSubmissionStatus(value: string): string {
  if (value === "draft") return "Draft";
  if (value === "submitted") return "Submitted";
  return value || "Submitted";
}

function formatReviewStatus(value: string): string {
  if (value === "approved") return "Approved";
  if (value === "needs_work") return "Needs work";
  return "Awaiting review";
}

function formatSessionDate(value: string): string {
  if (!value) return "Date not set";
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
