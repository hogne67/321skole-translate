"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { AcademyGate } from "./AcademyGate";
import { normalizeCourse, type Course } from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";

type SortKey = "newest" | "oldest" | "title_az" | "title_za";

function withLocale(locale: string, href: string): string {
  return `/${locale}${href}`;
}

function getSaleReadiness(course: Course) {
  if (course.status !== "published" && course.status !== "active") return { label: "Not published", ready: false };
  if (course.sales.saleStatus !== "ready") return { label: "Sale off", ready: false };
  if (course.sales.priceAmountOre <= 0) return { label: "No price", ready: false };
  if (
    course.sales.taxProfile.deliveryType !== "live_instruction" ||
    course.sales.taxProfile.vatTreatment !== "vat_exempt_education"
  ) {
    return { label: "Review", ready: false };
  }
  return { label: "Sale ready", ready: true };
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
  const searchParams = useSearchParams();
  const { user } = useUserProfile();
  const [courses, setCourses] = useState<Course[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [loading, setLoading] = useState(true);
  const [busyCourseId, setBusyCourseId] = useState("");
  const [copyMessageById, setCopyMessageById] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

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
        const res = await fetch("/api/teacher/courses", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = (await res.json().catch(() => ({}))) as {
          courses?: Array<Record<string, unknown> & { id?: string }>;
          error?: string;
        };

        if (!res.ok) throw new Error(data.error || "Could not load courses");

        const items = (data.courses ?? []).map((course) =>
          normalizeCourse(typeof course.id === "string" ? course.id : "", course)
        );

        if (!cancelled) setCourses(items);
      } catch (err) {
        console.error("Failed to load courses", err);
        if (!cancelled) setError("Kunne ikke hente kurs akkurat nå.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourses();

    return () => {
      cancelled = true;
    };
  }, [user]);

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

  const filter = searchParams.get("filter");
  const isPublishedFilter = filter === "published";
  const connectReturn = searchParams.get("connect");

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
      setError("Publisering kunne ikke oppdateres akkurat nå.");
    } finally {
      setBusyCourseId("");
    }
  }

  async function copyPublicLink(course: Course) {
    if (!course.publicUrl) return;

    try {
      await navigator.clipboard.writeText(course.publicUrl);
      setCopyMessageById((prev) => ({ ...prev, [course.id]: "Copied" }));
      window.setTimeout(() => {
        setCopyMessageById((prev) => ({ ...prev, [course.id]: "" }));
      }, 1600);
    } catch {
      setCopyMessageById((prev) => ({ ...prev, [course.id]: "Could not copy" }));
      window.setTimeout(() => {
        setCopyMessageById((prev) => ({ ...prev, [course.id]: "" }));
      }, 1600);
    }
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-5">
      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-2xl font-black text-slate-950">321Academy</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Lag, organiser og følg opp kurs for egne deltakere.
            </p>
          </div>
          <Link
            href={withLocale(locale, "/teacher/courses/generate")}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 px-4 text-sm font-bold text-white no-underline hover:bg-emerald-800"
          >
            + Create course
          </Link>
        </div>
      </section>

      {connectReturn ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          Stripe setup returned. Open a course and check Marketing → Sales setup to confirm payout status.
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-950">
              {isPublishedFilter ? "Published courses" : "Kurs"}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={withLocale(locale, "/teacher/courses")}
                className={`rounded-full border px-3 py-1 text-xs font-bold no-underline ${
                  isPublishedFilter
                    ? "border-slate-200 bg-white text-slate-700"
                    : "border-slate-900 bg-slate-900 text-white"
                }`}
              >
                My courses
              </Link>
              <Link
                href={withLocale(locale, "/teacher/courses?filter=published")}
                className={`rounded-full border px-3 py-1 text-xs font-bold no-underline ${
                  isPublishedFilter
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                Published courses
              </Link>
              <Link
                href={withLocale(locale, "/academy/courses")}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 no-underline"
              >
                Kurs jeg deltar på
              </Link>
              <Link
                href={withLocale(locale, "/courses")}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 no-underline"
              >
                Course marketplace
              </Link>
            </div>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
            {sortedCourses.length}
          </span>
        </div>

        <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Søk i kurs"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
          />
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
          >
            <option value="newest">Nyeste først</option>
            <option value="oldest">Eldste først</option>
            <option value="title_az">Tittel A-Å</option>
            <option value="title_za">Tittel Å-A</option>
          </select>
        </div>

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Laster kurs...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : sortedCourses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
            <h3 className="m-0 text-base font-extrabold text-slate-900">Ingen kurs ennå</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Start med et enkelt kursutkast. Du kan fylle inn detaljer nå og bygge videre senere.
            </p>
            <Link
              href={withLocale(locale, "/teacher/courses/generate")}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 px-4 text-sm font-bold text-white no-underline hover:bg-emerald-800"
            >
              + Create course
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 rounded-lg bg-sky-50 p-3">
            {sortedCourses.map((course) => (
              <article
                key={course.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
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
                    <div className="min-w-0">
                    <h3 className="m-0 break-words text-base font-extrabold text-slate-950">
                      {course.title || "Uten tittel"}
                    </h3>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold capitalize text-slate-600">
                      {course.status}
                    </span>
                    <CourseSaleBadge course={course} />
                    {course.status === "draft" ? (
                      <button
                        type="button"
                        disabled={busyCourseId === course.id}
                        onClick={() => void updatePublishStatus(course, "publish")}
                        className="inline-flex h-8 items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 px-3 text-xs font-bold text-white disabled:opacity-60"
                      >
                        {busyCourseId === course.id ? "Working..." : "Publish"}
                      </button>
                    ) : null}
                    <Link
                      href={withLocale(locale, `/teacher/courses/${course.id}`)}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 no-underline hover:bg-slate-50"
                    >
                      Åpne kurs
                    </Link>
                    <Link
                      href={withLocale(locale, `/teacher/courses/${course.id}/preview`)}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 no-underline hover:bg-slate-50"
                    >
                      Preview
                    </Link>
                    {course.publicUrl && (course.status === "published" || course.status === "active") ? (
                      <>
                        <a
                          href={course.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 no-underline hover:bg-slate-50"
                        >
                          Public
                        </a>
                        <button
                          type="button"
                          onClick={() => void copyPublicLink(course)}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 hover:bg-slate-50"
                        >
                          {copyMessageById[course.id] || "Copy link"}
                        </button>
                        <button
                          type="button"
                          disabled={busyCourseId === course.id}
                          onClick={() => void updatePublishStatus(course, "unpublish")}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-900 disabled:opacity-60"
                        >
                          {busyCourseId === course.id ? "Working..." : "Unpublish"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function CourseSaleBadge({ course }: { course: Course }) {
  const readiness = getSaleReadiness(course);

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-bold ${
        readiness.ready
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {readiness.label}
    </span>
  );
}
