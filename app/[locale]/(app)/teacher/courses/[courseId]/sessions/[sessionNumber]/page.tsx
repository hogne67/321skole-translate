"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { type Course } from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { CourseWorkspaceNav } from "../../CourseWorkspaceNav";
import { fetchTeacherCourse } from "../../courseClient";

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

const DAILY_NOT_AVAILABLE_MESSAGE =
  "This meeting is not available yet. Try again closer to the session start time.";

export default function TeacherCourseSessionPage() {
  const locale = useLocale();
  const params = useParams<{ courseId?: string; sessionNumber?: string }>();
  const courseId = typeof params?.courseId === "string" ? params.courseId : "";
  const sessionNumber = Number(params?.sessionNumber);
  const { user } = useUserProfile();
  const dailyContainerRef = useRef<HTMLDivElement | null>(null);
  const dailyFrameRef = useRef<DailyCallFrame | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
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
        const loadedCourse = await fetchTeacherCourse(user, courseId);
        if (!cancelled) setCourse(loadedCourse);
      } catch (err) {
        console.error("Failed to load teacher session room", err);
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

  const session = useMemo(
    () => course?.coursePlan.find((item) => item.sessionNumber === sessionNumber) ?? null,
    [course, sessionNumber]
  );

  async function joinDailySession() {
    if (!user || !courseId || !Number.isFinite(sessionNumber) || joiningDaily) return;

    try {
      setJoiningDaily(true);
      setDailyError("");
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/teacher/courses/${encodeURIComponent(courseId)}/sessions/${encodeURIComponent(String(sessionNumber))}/daily`,
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
      if (!window.Daily || !dailyContainerRef.current) throw new Error("Daily could not be loaded");

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
      console.info("Teacher Daily session could not be joined.", message);
      setDailyError(message);
    } finally {
      setJoiningDaily(false);
    }
  }

  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading session...</div>;
  }

  if (error || !course || !session) {
    return (
      <main className="mx-auto grid max-w-4xl gap-4">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error || "Could not find this session."}
        </div>
        <Link
          href={`/${locale}/teacher/courses/${courseId}`}
          className="inline-flex h-10 w-fit items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
        >
          Back to course
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-5">
      <CourseWorkspaceNav
        locale={locale}
        courseId={course.id}
        title={course.title}
        status={course.status}
        active="sessions"
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              Instructor session room · Session {session.sessionNumber}
            </div>
            <h1 className="m-0 mt-2 text-2xl font-black text-slate-950">
              {session.title || `Session ${session.sessionNumber}`}
            </h1>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {session.description || "No session description yet."}
            </p>
          </div>
          <Link
            href={`/${locale}/teacher/courses/${course.id}/sessions`}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
          >
            Edit sessions
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
        <div className="grid min-h-[480px] gap-4 rounded-lg border border-slate-900 bg-slate-950 p-5 text-white shadow-sm">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-emerald-300">
              Host room
            </div>
            <h2 className="m-0 mt-2 text-xl font-black">Video session</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Join through this page as instructor. This creates a host token for the private Daily room.
            </p>
          </div>

          <div className="grid place-items-center rounded-lg border border-white/10 bg-white/5 p-6 text-center">
            <div>
              <div className="text-5xl font-black text-white/20">321</div>
              <p className="mt-3 text-sm font-semibold text-slate-300">
                Daily instructor embed
              </p>
              <button
                type="button"
                onClick={() => void joinDailySession()}
                disabled={joiningDaily}
                className="mt-5 inline-flex h-11 items-center justify-center rounded-lg border border-emerald-400 bg-emerald-400 px-5 text-sm font-black text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
              >
                {joiningDaily ? "Starting..." : dailyLoaded ? "Reconnect video" : "Start / join session"}
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
          <InfoCard label="Meeting link" value={session.meetingUrl ? "Ready" : "Created on join"} />
        </aside>
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="m-0 text-xl font-black text-slate-950">Session plan</h2>
        <p className="m-0 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {session.contentSuggestions || session.description || "No agenda has been added yet."}
        </p>
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

function formatSessionDate(value: string): string {
  if (!value) return "Date not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
