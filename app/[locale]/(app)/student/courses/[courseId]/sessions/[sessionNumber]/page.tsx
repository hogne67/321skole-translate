"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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

type Translator = ReturnType<typeof useTranslations>;

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
  const t = useTranslations("academy.studentSessionRoom");
  const params = useParams<{ courseId?: string; sessionNumber?: string }>();
  const courseId = typeof params?.courseId === "string" ? params.courseId : "";
  const sessionNumber = Number(params?.sessionNumber);
  const { user } = useUserProfile();
  const videoShellRef = useRef<HTMLDivElement | null>(null);
  const dailyContainerRef = useRef<HTMLDivElement | null>(null);
  const dailyFrameRef = useRef<DailyCallFrame | null>(null);
  const [course, setCourse] = useState<CourseRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [joiningDaily, setJoiningDaily] = useState(false);
  const [dailyLoaded, setDailyLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dailyError, setDailyError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCourse() {
      if (!user || !courseId || !Number.isFinite(sessionNumber)) {
        setLoading(false);
        setError(t("notFound"));
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
        if (!res.ok || !data.course) throw new Error(data.error || t("loadFailed"));
        if (!cancelled) setCourse(data.course);
      } catch (err) {
        console.error("Failed to load course session", err);
        if (!cancelled) setError(t("loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourse();

    return () => {
      cancelled = true;
    };
  }, [courseId, sessionNumber, t, user]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
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
      enableDailyIframeFullscreen(dailyContainerRef.current);
      await frame.join({ url: data.roomUrl, token: data.token });
      enableDailyIframeFullscreen(dailyContainerRef.current);
      setDailyLoaded(true);
    } catch (err) {
      const message = getDailyJoinErrorMessage(err, t("video.notAvailable"));
      if (message === t("video.notAvailable")) {
        console.info("Daily session is not available yet.");
      } else {
        console.info("Daily session could not be joined.", message);
      }
      setDailyError(message);
    } finally {
      setJoiningDaily(false);
    }
  }

  async function openVideoFullscreen() {
    const target = videoShellRef.current ?? dailyContainerRef.current;
    if (!target || !document.fullscreenEnabled) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await target.requestFullscreen();
      }
    } catch (err) {
      console.info("Fullscreen could not be toggled.", err);
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
        <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 text-sm text-slate-600">
          {t("loading")}
        </div>
      </main>
    );
  }

  if (error || !course || !session) {
    return (
      <main className="mx-auto grid max-w-4xl gap-4 px-3 py-4">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error || t("notFound")}
        </div>
        <Link
          href={`/${locale}/academy/courses/${courseId}`}
          className="inline-flex h-10 w-fit items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
        >
          {t("backToCourseRoom")}
        </Link>
      </main>
    );
  }

  const submittedCount = session.resources.filter((resource) =>
    submissionByResourceId.has(resource.id)
  ).length;

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-3 py-4">
      <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              {course.title || t("courseFallback")} · {t("session", { number: session.sessionNumber })}
            </div>
            <h1 className="m-0 mt-2 break-words text-2xl font-black text-slate-950">
              {session.title || t("session", { number: session.sessionNumber })}
            </h1>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {session.description || course.description || t("noDescription")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold capitalize text-slate-600">
              {formatSessionStatus(session.status, t)}
            </span>
            <Link
              href={`/${locale}/academy/courses/${course.id}`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
            >
              {t("backToCourseRoom")}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
        <div
          ref={videoShellRef}
          className={`relative grid gap-4 rounded-lg border border-slate-900 bg-slate-950 p-5 text-white shadow-sm ${
            isFullscreen
              ? "min-h-screen grid-rows-[1fr] rounded-none border-0 p-0"
              : dailyLoaded
                ? "grid-rows-[auto_minmax(0,auto)]"
                : "min-h-[420px] grid-rows-[auto_auto_minmax(360px,1fr)]"
          }`}
        >
          <div className={`flex flex-wrap items-start justify-between gap-3 ${isFullscreen && dailyLoaded ? "hidden" : ""}`}>
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-emerald-300">
                {t("video.eyebrow")}
              </div>
              <h2 className="m-0 mt-2 text-xl font-black">{t("video.title")}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                {t("video.intro")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void openVideoFullscreen()}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-white/20 bg-white/10 px-3 text-sm font-bold text-white hover:bg-white/15"
            >
              {t("video.fullscreen")}
            </button>
          </div>
          {isFullscreen ? (
            <button
              type="button"
              onClick={() => void document.exitFullscreen()}
              className="absolute right-4 top-4 z-[9999] inline-flex h-10 items-center justify-center rounded-lg border border-white/30 bg-black/70 px-4 text-sm font-black text-white shadow-lg backdrop-blur hover:bg-black/80"
            >
              {t("video.exitFullscreen")}
            </button>
          ) : null}

          <div className={`place-items-center rounded-lg border border-white/10 bg-white/5 p-6 text-center ${dailyLoaded ? "hidden" : "grid"}`}>
            <div>
              <div className="text-5xl font-black text-white/20">321</div>
              <p className="mt-3 text-sm font-semibold text-slate-300">
                {t("video.placeholder")}
              </p>
              <button
                type="button"
                onClick={() => void joinDailySession()}
                disabled={joiningDaily}
                className="mt-5 inline-flex h-11 items-center justify-center rounded-lg border border-emerald-400 bg-emerald-400 px-5 text-sm font-black text-slate-950 no-underline hover:bg-emerald-300 disabled:opacity-60"
              >
                {joiningDaily ? t("video.starting") : dailyLoaded ? t("video.reconnect") : t("video.join")}
              </button>
              {dailyError ? (
                <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm font-semibold text-rose-100">
                  {dailyError}
                </div>
              ) : null}
            </div>
          </div>
          <div
            ref={dailyContainerRef}
            className={`overflow-hidden bg-black ${
              isFullscreen
                ? "h-screen min-h-0 rounded-none"
                : dailyLoaded
                  ? "aspect-video min-h-0 rounded-xl"
                  : "min-h-[360px] rounded-xl"
            }`}
          />
        </div>

        <aside className="grid gap-4">
          <InfoCard label={t("info.starts")} value={formatSessionDate(session.startsAt, locale, t("dateNotSet"))} />
          <InfoCard label={t("info.duration")} value={`${session.durationMinutes || 120} min`} />
          <InfoCard label={t("info.resources")} value={`${session.resources.length}`} />
          <InfoCard label={t("info.submitted")} value={`${submittedCount}/${session.resources.length}`} />
        </aside>
      </section>

      <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <div>
          <h2 className="m-0 text-xl font-black text-slate-950">{t("resources.title")}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {t("resources.intro")}
          </p>
        </div>

        {session.resources.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            {t("resources.empty")}
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

                <ResourceStatus
                  submission={submissionByResourceId.get(resource.id)}
                  t={t}
                  locale={locale}
                />

                <ResourceAction
                  locale={locale}
                  courseId={course.id}
                  sessionNumber={session.sessionNumber}
                  resource={resource}
                  t={t}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <h2 className="m-0 text-xl font-black text-slate-950">{t("agenda.title")}</h2>
        <p className="m-0 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {session.contentSuggestions || session.description || t("agenda.empty")}
        </p>
        {session.homework ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              {t("agenda.homework")}
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
    <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-4 shadow-sm">
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
  t,
}: {
  locale: string;
  courseId: string;
  sessionNumber: number;
  resource: CourseRoomSession["resources"][number];
  t: Translator;
}) {
  if (resource.openMode === "lesson" && resource.sourceId) {
    return (
      <Link
        href={`/${locale}/student/lesson/${resource.sourceId}?courseId=${encodeURIComponent(courseId)}&sessionNumber=${encodeURIComponent(String(sessionNumber))}&resourceId=${encodeURIComponent(resource.id)}`}
        className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-sm font-bold text-white no-underline"
      >
        {t("resources.openLesson")}
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
        {t("resources.openResource")}
      </a>
    );
  }

  return (
    <div className="mt-3 text-xs font-bold text-slate-500">
      {t("resources.opensLater")}
    </div>
  );
}

function ResourceStatus({
  submission,
  t,
  locale,
}: {
  submission?: CourseRoom["resourceSubmissions"][number];
  t: Translator;
  locale: string;
}) {
  if (!submission) {
    return <div className="mt-3 text-xs font-bold text-slate-500">{t("status.notSubmitted")}</div>;
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
      <div className="font-bold">
        {formatSubmissionStatus(submission.status, t)} · {formatMaybeDate(submission.updatedAt, locale)}
      </div>
      <div className="mt-1 font-bold">{formatReviewStatus(submission.reviewStatus, t)}</div>
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

function getDailyIframeElement(container: HTMLElement | null): HTMLIFrameElement | null {
  return container?.querySelector("iframe") ?? null;
}

function enableDailyIframeFullscreen(container: HTMLElement | null) {
  const iframe = getDailyIframeElement(container);
  if (!iframe) return;

  iframe.allowFullscreen = true;
  const allow = iframe.getAttribute("allow") || "";
  const permissions = ["camera", "microphone", "fullscreen", "display-capture", "autoplay"];
  const nextAllow = Array.from(new Set([...allow.split(";").map((item) => item.trim()).filter(Boolean), ...permissions])).join("; ");
  iframe.setAttribute("allow", nextAllow);
  iframe.setAttribute("allowfullscreen", "true");
}

function getDailyJoinErrorMessage(error: unknown, fallback: string): string {
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

  return fallback;
}

function formatSessionStatus(value: string, t: Translator): string {
  if (value === "planned") return t("status.planned");
  if (value === "completed") return t("status.completed");
  if (value === "cancelled") return t("status.cancelled");
  return value || t("status.planned");
}

function formatSubmissionStatus(value: string, t: Translator): string {
  if (value === "draft") return t("status.draft");
  if (value === "submitted") return t("status.submitted");
  return value || t("status.submitted");
}

function formatReviewStatus(value: string, t: Translator): string {
  if (value === "approved") return t("status.approved");
  if (value === "needs_work") return t("status.needsWork");
  return t("status.awaiting");
}

function formatSessionDate(value: string, locale: string, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale);
}

function formatMaybeDate(value: string, locale: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale);
}
