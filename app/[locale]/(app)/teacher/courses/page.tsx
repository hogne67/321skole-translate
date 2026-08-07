"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { AcademyGate } from "./AcademyGate";
import { normalizeCourse, type Course } from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";

type SortKey = "newest" | "oldest" | "title_az" | "title_za";
type AcademyTranslator = ReturnType<typeof useTranslations>;

type ParticipatingCourse = {
  id: string;
  title: string;
  description: string;
  language: string;
  level: string;
  status: string;
  participantStatus: string;
  numberOfSessions: number;
  numberOfWeeks: number;
  participantResourceCount: number;
  updatedAt: string;
  nextSession: {
    sessionNumber: number;
    title: string;
    startsAt: string;
    durationMinutes: number;
  } | null;
};

function withLocale(locale: string, href: string): string {
  return `/${locale}${href}`;
}

function getSaleReadiness(course: Course) {
  if (course.status !== "published" && course.status !== "active") return { labelKey: "notPublished", ready: false };
  if (course.sales.saleStatus !== "ready") return { labelKey: "saleOff", ready: false };
  if (course.sales.priceAmountOre <= 0) return { labelKey: "noPrice", ready: false };
  if (
    course.sales.taxProfile.deliveryType !== "live_instruction" ||
    course.sales.taxProfile.vatTreatment !== "vat_exempt_education"
  ) {
    return { labelKey: "review", ready: false };
  }
  return { labelKey: "ready", ready: true };
}

export default function TeacherCoursesPage() {
  return (
    <AcademyGate>
      <TeacherCoursesContent />
    </AcademyGate>
  );
}

function TeacherCoursesContent() {
  const locale = useLocale();
  const t = useTranslations("academy");
  const searchParams = useSearchParams();
  const { user } = useUserProfile();
  const [courses, setCourses] = useState<Course[]>([]);
  const [participatingCourses, setParticipatingCourses] = useState<ParticipatingCourse[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [loading, setLoading] = useState(true);
  const [busyCourseId, setBusyCourseId] = useState("");
  const [copyMessageById, setCopyMessageById] = useState<Record<string, string>>({});
  const [shareCourseId, setShareCourseId] = useState("");
  const [error, setError] = useState("");
  const [publishConfirmCourse, setPublishConfirmCourse] = useState<Course | null>(null);
  const [publishSigned, setPublishSigned] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCourses() {
      if (!user?.uid) {
        setCourses([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const token = await user.getIdToken();
        const [res, participatingRes] = await Promise.all([
          fetch("/api/teacher/courses", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetch("/api/student/courses", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
        ]);

        const data = (await res.json().catch(() => ({}))) as {
          courses?: Array<Record<string, unknown> & { id?: string }>;
          error?: string;
        };
        const participatingData = (await participatingRes.json().catch(() => ({}))) as {
          courses?: ParticipatingCourse[];
          error?: string;
        };

        if (!res.ok) throw new Error(data.error || "Could not load courses");
        if (!participatingRes.ok) throw new Error(participatingData.error || "Could not load participating courses");

        const items = (data.courses ?? []).map((course) =>
          normalizeCourse(typeof course.id === "string" ? course.id : "", course)
        );

        if (!cancelled) {
          setCourses(items);
          setParticipatingCourses(Array.isArray(participatingData.courses) ? participatingData.courses : []);
        }
      } catch (err) {
        console.error("Failed to load courses", err);
        if (!cancelled) setError(t("teacherCourses.states.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourses();

    return () => {
      cancelled = true;
    };
  }, [t, user]);

  const sortedCourses = useMemo(() => {
    const filter = searchParams.get("filter");
    const searchText = search.trim().toLowerCase();
    let visible =
      filter === "published"
        ? courses.filter((course) => course.status === "published" || course.status === "active")
        : courses;

    if (searchText) {
      visible = visible.filter((course) => {
        const haystack = [
          course.title,
          course.status,
          course.language,
          course.level,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(searchText);
      });
    }

    return [...visible].sort((a, b) => {
      if (sortKey === "title_az" || sortKey === "title_za") {
        const cmp = (a.title || "").localeCompare(b.title || "", "nb");
        return sortKey === "title_az" ? cmp : -cmp;
      }

      const aTime = a.createdAt?.toDate().getTime() ?? 0;
      const bTime = b.createdAt?.toDate().getTime() ?? 0;
      return sortKey === "newest" ? bTime - aTime : aTime - bTime;
    });
  }, [courses, search, searchParams, sortKey]);

  const sortedParticipatingCourses = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    let visible = participatingCourses;

    if (searchText) {
      visible = visible.filter((course) =>
        [course.title, course.status, course.language, course.level, course.participantStatus]
          .join(" ")
          .toLowerCase()
          .includes(searchText)
      );
    }

    return [...visible].sort((a, b) => {
      if (sortKey === "title_az" || sortKey === "title_za") {
        const cmp = (a.title || "").localeCompare(b.title || "", "nb");
        return sortKey === "title_az" ? cmp : -cmp;
      }

      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return sortKey === "newest" ? bTime - aTime : aTime - bTime;
    });
  }, [participatingCourses, search, sortKey]);

  const filter = searchParams.get("filter");
  const isPublishedFilter = filter === "published";
  const isParticipatingFilter = filter === "participating";
  const connectReturn = searchParams.get("connect");
  const visibleCount = isParticipatingFilter ? sortedParticipatingCourses.length : sortedCourses.length;

  async function updatePublishStatus(course: Course, action: "publish" | "unpublish") {
    if (!user || busyCourseId) return;

    try {
      setBusyCourseId(course.id);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/courses/${course.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, locale }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not update course");

      const refreshed = await fetch("/api/teacher/courses", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const refreshedData = (await refreshed.json().catch(() => ({}))) as {
        courses?: Array<Record<string, unknown> & { id?: string }>;
      };
      if (refreshed.ok) {
        setCourses(
          (refreshedData.courses ?? []).map((item) =>
            normalizeCourse(typeof item.id === "string" ? item.id : "", item)
          )
        );
      } else {
        setCourses((prev) =>
          prev.map((item) =>
            item.id === course.id
              ? { ...item, status: action === "publish" ? "published" : "draft" }
              : item
          )
        );
      }
    } catch (err) {
      console.error("Failed to update publish status", err);
      setError(t("teacherCourses.states.publishFailed"));
    } finally {
      setBusyCourseId("");
    }
  }

  function requestPublishCourse(course: Course) {
    setPublishSigned(false);
    setPublishConfirmCourse(course);
  }

  function closePublishConfirm() {
    setPublishConfirmCourse(null);
    setPublishSigned(false);
  }

  async function confirmPublishCourse() {
    if (!publishConfirmCourse || !publishSigned) return;
    const course = publishConfirmCourse;
    closePublishConfirm();
    await updatePublishStatus(course, "publish");
  }

  function setCourseCopyMessage(courseId: string, message: string) {
    setCopyMessageById((prev) => ({ ...prev, [courseId]: message }));
    window.setTimeout(() => {
      setCopyMessageById((prev) => ({ ...prev, [courseId]: "" }));
    }, 1800);
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-5">
      <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-2xl font-black text-slate-950">{t("teacherCourses.title")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {t("teacherCourses.intro")}
            </p>
          </div>
          <Link
            href={withLocale(locale, "/teacher/courses/generate")}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 px-4 text-sm font-bold text-white no-underline hover:bg-emerald-800"
          >
            {t("teacherCourses.createCourse")}
          </Link>
        </div>
      </section>

      {connectReturn ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          {t("teacherCourses.stripeReturned")}
        </div>
      ) : null}

      <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-950">
              {isPublishedFilter ? t("teacherCourses.headings.published") : t("teacherCourses.headings.courses")}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={withLocale(locale, "/teacher/courses")}
                className={`rounded-full border px-3 py-1 text-xs font-bold no-underline ${
                  isPublishedFilter || isParticipatingFilter
                    ? "border-slate-200 bg-white text-slate-700"
                    : "border-slate-900 bg-slate-900 text-white"
                }`}
              >
                {t("teacherCourses.filters.myCourses")}
              </Link>
              <Link
                href={withLocale(locale, "/teacher/courses?filter=published")}
                className={`rounded-full border px-3 py-1 text-xs font-bold no-underline ${
                  isPublishedFilter && !isParticipatingFilter
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {t("teacherCourses.filters.published")}
              </Link>
              <Link
                href={withLocale(locale, "/teacher/courses?filter=participating")}
                className={`rounded-full border px-3 py-1 text-xs font-bold no-underline ${
                  isParticipatingFilter
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {t("teacherCourses.filters.participating")}
              </Link>
              <Link
                href={withLocale(locale, "/academy/courses/marketplace")}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 no-underline"
              >
                {t("teacherCourses.filters.marketplace")}
              </Link>
            </div>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
            {visibleCount}
          </span>
        </div>

        <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("teacherCourses.searchPlaceholder")}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
          />
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
          >
            <option value="newest">{t("teacherCourses.sort.newest")}</option>
            <option value="oldest">{t("teacherCourses.sort.oldest")}</option>
            <option value="title_az">{t("teacherCourses.sort.titleAz")}</option>
            <option value="title_za">{t("teacherCourses.sort.titleZa")}</option>
          </select>
        </div>

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            {t("teacherCourses.states.loading")}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : isParticipatingFilter ? (
          sortedParticipatingCourses.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
              <h3 className="m-0 text-base font-extrabold text-slate-900">
                {t("teacherCourses.headings.noParticipating")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t("teacherCourses.states.participatingEmptyText")}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 rounded-lg bg-sky-50 p-3">
              {sortedParticipatingCourses.map((course) => (
                <ParticipatingCourseCard key={course.id} course={course} locale={locale} t={t} />
              ))}
            </div>
          )
        ) : sortedCourses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
            <h3 className="m-0 text-base font-extrabold text-slate-900">
              {t("teacherCourses.headings.noCourses")}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("teacherCourses.states.emptyText")}
            </p>
            <Link
              href={withLocale(locale, "/teacher/courses/generate")}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 px-4 text-sm font-bold text-white no-underline hover:bg-emerald-800"
            >
              {t("teacherCourses.createCourse")}
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 rounded-lg bg-sky-50 p-3">
            {sortedCourses.map((course) => (
              <article
                key={course.id}
                className="rounded-lg border border-sky-100 bg-white/70 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {course.marketing.coverImageUrl ? (
                      <div className="hidden w-32 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 sm:block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={course.marketing.coverImageUrl}
                          alt=""
                          className="aspect-video w-full object-cover"
                        />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="m-0 break-words text-base font-extrabold text-slate-950">
                          {course.title || t("common.untitled")}
                        </h3>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold capitalize text-slate-600">
                          {course.status}
                        </span>
                        <CourseSaleBadge course={course} t={t} />
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {course.publicUrl && (course.status === "published" || course.status === "active") ? (
                          <Link
                            href={withLocale(locale, `/academy/courses/marketplace/${course.slug}`)}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 no-underline hover:bg-slate-50"
                          >
                            {t("teacherCourses.actions.publicPage")}
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          disabled={!course.publicUrl}
                          onClick={() => setShareCourseId((current) => (current === course.id ? "" : course.id))}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {copyMessageById[course.id] || t("teacherCourses.actions.shareLink")}
                        </button>
                        <Link
                          href={withLocale(locale, `/teacher/courses/${course.id}/preview`)}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 no-underline hover:bg-slate-50"
                        >
                          {t("teacherCourses.actions.preview")}
                        </Link>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-start justify-end gap-2">
                    <Link
                      href={withLocale(locale, `/teacher/courses/${course.id}`)}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-xs font-bold text-white no-underline hover:bg-slate-800"
                    >
                      {t("teacherCourses.actions.openCourse")}
                    </Link>
                    {course.status === "draft" ? (
                      <button
                        type="button"
                        disabled={busyCourseId === course.id}
                        onClick={() => requestPublishCourse(course)}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 px-3 text-xs font-bold text-white disabled:opacity-60"
                      >
                        {busyCourseId === course.id
                          ? t("teacherCourses.actions.working")
                          : t("teacherCourses.actions.publish")}
                      </button>
                    ) : null}
                    {course.publicUrl && (course.status === "published" || course.status === "active") ? (
                      <button
                        type="button"
                        disabled={busyCourseId === course.id}
                        onClick={() => void updatePublishStatus(course, "unpublish")}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-900 disabled:opacity-60"
                      >
                        {busyCourseId === course.id
                          ? t("teacherCourses.actions.working")
                          : t("teacherCourses.actions.unpublish")}
                      </button>
                    ) : null}
                  </div>
                </div>
                {shareCourseId === course.id ? (
                  <CourseShareBox
                    course={course}
                    locale={locale}
                    t={t}
                    message={copyMessageById[course.id] || ""}
                    onMessage={(message) => setCourseCopyMessage(course.id, message)}
                  />
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {publishConfirmCourse ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closePublishConfirm}
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div className="min-w-0">
                <div className="font-black text-slate-900">{t("teacherCourses.publishConfirm.title")}</div>
                <div className="truncate text-sm text-slate-600">{publishConfirmCourse.title}</div>
              </div>
              <button
                type="button"
                onClick={closePublishConfirm}
                className="rounded-xl border border-slate-300 px-3 py-2 font-black text-slate-800 hover:bg-zinc-50"
              >
                x
              </button>
            </div>

            <div className="grid gap-4 p-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <div className="font-black">{t("teacherCourses.publishConfirm.noticeTitle")}</div>
                <p className="mt-2">{t("teacherCourses.publishConfirm.noticeBody")}</p>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-800">
                <input
                  type="checkbox"
                  checked={publishSigned}
                  onChange={(event) => setPublishSigned(event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <span>{t("teacherCourses.publishConfirm.statement")}</span>
              </label>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4">
              <button
                type="button"
                onClick={closePublishConfirm}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
              >
                {t("teacherCourses.publishConfirm.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void confirmPublishCourse()}
                disabled={!publishSigned}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("teacherCourses.publishConfirm.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function CourseShareBox({
  course,
  locale,
  t,
  message,
  onMessage,
}: {
  course: Course;
  locale: string;
  t: AcademyTranslator;
  message: string;
  onMessage: (message: string) => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const publicShareUrl = course.publicUrl || (course.slug ? `/${locale}/courses/${course.slug}` : "");
  const shareText = [course.title, course.marketing.summary || course.description, publicShareUrl]
    .filter(Boolean)
    .join("\n\n");
  const facebookShareHref = publicShareUrl
    ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicShareUrl)}`
    : "";
  const linkedInShareHref = publicShareUrl
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicShareUrl)}`
    : "";

  useEffect(() => {
    let cancelled = false;

    async function makeQr() {
      if (!publicShareUrl) {
        setQrDataUrl("");
        return;
      }

      try {
        const QRCode = (await import("qrcode")).default;
        const dataUrl = await QRCode.toDataURL(publicShareUrl, {
          margin: 1,
          scale: 6,
          color: {
            dark: "#0f172a",
            light: "#ffffff",
          },
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch (err) {
        console.error("Failed to generate course QR code", err);
        if (!cancelled) setQrDataUrl("");
      }
    }

    void makeQr();

    return () => {
      cancelled = true;
    };
  }, [publicShareUrl]);

  async function copyText(value: string, successMessage: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      onMessage(successMessage);
    } catch {
      onMessage(t("marketing.errors.copyFailed"));
    }
  }

  async function nativeShare() {
    if (!publicShareUrl || typeof navigator.share !== "function") {
      await copyText(publicShareUrl, t("marketing.messages.linkCopied"));
      return;
    }

    try {
      await navigator.share({
        title: course.title || "321Academy course",
        text: course.marketing.summary || course.description || "",
        url: publicShareUrl,
      });
      onMessage(t("marketing.messages.shareDialogOpened"));
    } catch {
      // User cancellation is fine.
    }
  }

  return (
    <div className="mt-4 grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-4 lg:grid-cols-[minmax(0,1fr)_160px]">
      <div className="grid gap-3">
        <div>
          <h4 className="m-0 text-sm font-black text-slate-950">{t("marketing.share.title")}</h4>
          <p className="mt-1 text-xs leading-5 text-slate-600">{t("marketing.share.intro")}</p>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            value={publicShareUrl}
            readOnly
            className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
          />
          <button
            type="button"
            onClick={() => void copyText(publicShareUrl, t("marketing.messages.linkCopied"))}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-xs font-bold text-white"
          >
            {t("marketing.actions.copyLink")}
          </button>
        </div>
        <textarea
          value={shareText}
          readOnly
          rows={4}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-700"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyText(shareText, t("marketing.messages.shareTextCopied"))}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 hover:bg-slate-50"
          >
            {t("marketing.actions.copyText")}
          </button>
          <button
            type="button"
            onClick={() => void nativeShare()}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 hover:bg-slate-50"
          >
            {t("marketing.actions.share")}
          </button>
          {facebookShareHref ? (
            <a
              href={facebookShareHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 no-underline hover:bg-slate-50"
            >
              Facebook
            </a>
          ) : null}
          {linkedInShareHref ? (
            <a
              href={linkedInShareHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 no-underline hover:bg-slate-50"
            >
              LinkedIn
            </a>
          ) : null}
        </div>
        {message ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs font-semibold text-emerald-800">
            {message}
          </div>
        ) : null}
      </div>
      <div className="grid content-start gap-2">
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt={t("marketing.share.qrAlt")} className="aspect-square w-full" />
          ) : (
            <div className="grid aspect-square place-items-center rounded-md bg-slate-100 text-xs font-bold text-slate-500">
              {t("marketing.share.qrFallback")}
            </div>
          )}
        </div>
        {qrDataUrl ? (
          <a
            href={qrDataUrl}
            download={`${course.slug || "course"}-qr.png`}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 no-underline hover:bg-slate-50"
          >
            {t("marketing.actions.downloadQr")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function CourseSaleBadge({ course, t }: { course: Course; t: AcademyTranslator }) {
  const readiness = getSaleReadiness(course);

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-bold ${
        readiness.ready
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {t(`teacherCourses.sale.${readiness.labelKey}`)}
    </span>
  );
}

function ParticipatingCourseCard({
  course,
  locale,
  t,
}: {
  course: ParticipatingCourse;
  locale: string;
  t: AcademyTranslator;
}) {
  return (
    <article className="rounded-lg border border-sky-100 bg-white/70 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 break-words text-base font-extrabold text-slate-950">
              {course.title || t("common.untitled")}
            </h3>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold capitalize text-slate-600">
              {course.status}
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold capitalize text-emerald-800">
              {course.participantStatus}
            </span>
          </div>
          {course.description ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
              {course.description}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              {t("teacherCourses.meta.sessions", { count: course.numberOfSessions })}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              {t("teacherCourses.meta.resources", { count: course.participantResourceCount })}
            </span>
            {course.nextSession ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-900">
                {t("teacherCourses.meta.next", {
                  date: formatParticipantNextSession(course.nextSession.startsAt, t),
                })}
              </span>
            ) : null}
          </div>
        </div>
        <Link
          href={withLocale(locale, `/academy/courses/${course.id}`)}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-xs font-bold text-white no-underline hover:bg-slate-800"
        >
          {t("teacherCourses.actions.openCourseRoom")}
        </Link>
      </div>
    </article>
  );
}

function formatParticipantNextSession(value: string, t: AcademyTranslator): string {
  if (!value) return t("teacherCourses.meta.notScheduled");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
