import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  normalizeCourseMarketing,
  normalizeCourseSalesSettings,
  normalizeCoursePlan,
  type CourseMarketing,
  type CourseSalesSettings,
  type CoursePlanSession,
} from "@/lib/courses/types";

type PageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams?: Promise<{
    q?: string;
  }>;
};

type MarketplaceCourse = {
  slug: string;
  title: string;
  description: string;
  language: string;
  level: string;
  priceText: string;
  sales: CourseSalesSettings;
  maxParticipants: number;
  numberOfSessions: number;
  numberOfWeeks: number;
  marketing: CourseMarketing;
  coursePlan: CoursePlanSession[];
  teacherName: string;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatStartsAt(coursePlan: CoursePlanSession[], locale: string, fallback: string) {
  const next = coursePlan
    .map((session) => session.startsAt)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  if (!next) return fallback;
  return next.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function loadMarketplaceCourses(): Promise<MarketplaceCourse[]> {
  const { db } = getAdmin();
  const snap = await db.collection("courses").where("status", "in", ["published", "active"]).get();
  const ownerIds = Array.from(
    new Set(snap.docs.map((doc) => safeString(doc.data().ownerUid)).filter(Boolean))
  );

  const ownerEntries = await Promise.all(
    ownerIds.map(async (ownerUid) => {
      const ownerSnap = await db.collection("users").doc(ownerUid).get();
      const owner = ownerSnap.exists ? ownerSnap.data() ?? {} : {};
      return [ownerUid, safeString(owner.displayName)] as const;
    })
  );
  const ownerNames = new Map(ownerEntries);

  return snap.docs
    .map((doc) => {
      const data = doc.data();
      const slug = safeString(data.slug);
      const ownerUid = safeString(data.ownerUid);
      const coursePlan = normalizeCoursePlan(data.coursePlan);

      return {
        slug,
        title: safeString(data.title),
        description: safeString(data.description),
        language: safeString(data.language),
        level: safeString(data.level),
        priceText: safeString(data.priceText),
        sales: normalizeCourseSalesSettings(data.sales),
        maxParticipants: safeNumber(data.maxParticipants),
        numberOfSessions: safeNumber(data.numberOfSessions),
        numberOfWeeks: safeNumber(data.numberOfWeeks),
        marketing: normalizeCourseMarketing(data.marketing),
        coursePlan,
        teacherName: ownerNames.get(ownerUid) || "",
      };
    })
    .filter((course) => course.slug && course.title)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("academy.marketplace");
  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  };
}

export default async function PublicCoursesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = searchParams ? await searchParams : {};
  return <CoursesMarketplaceView locale={locale} q={safeString(sp?.q)} />;
}

export async function CoursesMarketplaceView({
  locale,
  insideApp = false,
  q = "",
}: {
  locale: string;
  insideApp?: boolean;
  q?: string;
}) {
  const t = await getTranslations("academy.marketplace");
  const courses = await loadMarketplaceCourses();
  const searchQuery = q.trim();
  const normalizedQuery = searchQuery.toLowerCase();
  const filteredCourses = courses.filter((course) => {
    if (!normalizedQuery) return true;

    return [
      course.title,
      course.description,
      course.marketing.summary,
      course.teacherName,
      course.language,
      course.level,
      course.priceText,
      String(course.numberOfSessions || course.coursePlan.length),
      formatStartsAt(course.coursePlan, locale, t("startComing")),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const resetHref = insideApp ? `/${locale}/academy/courses/marketplace` : `/${locale}/courses`;
  const searchPlaceholder = locale.startsWith("en")
    ? "Search: title, instructor, topic..."
    : locale.startsWith("pt")
      ? "Buscar: titulo, instrutor, tema..."
      : "Søk: tittel, instruktør, tema...";

  return (
    <main className="min-h-screen bg-slate-50 px-0 py-5 text-slate-950 sm:px-2">
      <div className="mx-auto grid w-full max-w-6xl gap-5 px-0">
        <form className="grid gap-2 rounded-[14px] border border-slate-200 bg-white p-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.10)] sm:gap-3 sm:rounded-2xl sm:p-4 md:grid-cols-[1fr_auto_auto]">
          <input
            name="q"
            defaultValue={searchQuery}
            placeholder={searchPlaceholder}
            className="min-h-11 min-w-0 rounded-xl border border-slate-300 px-4 py-2 font-semibold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 max-md:col-span-2 max-[420px]:col-span-1"
          />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 py-2 text-sm font-black text-white"
          >
            {locale.startsWith("en") ? "Search" : locale.startsWith("pt") ? "Buscar" : "Søk"}
          </button>
          <Link
            href={resetHref}
            aria-disabled={!searchQuery}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-5 py-2 text-sm font-black no-underline ${
              !searchQuery
                ? "pointer-events-none border-slate-200 bg-slate-50 text-slate-300"
                : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
            }`}
          >
            {locale.startsWith("en") ? "Reset" : locale.startsWith("pt") ? "Redefinir" : "Nullstill"}
          </Link>
        </form>

        <section className="text-sm font-semibold text-slate-600">
          Viser {filteredCourses.length} av {courses.length}
        </section>

        {courses.length === 0 ? (
          <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <h2 className="m-0 text-xl font-black">{t("emptyTitle")}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {t("emptyText")}
            </p>
          </section>
        ) : filteredCourses.length === 0 ? (
          <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <h2 className="m-0 text-xl font-black">{t("emptyTitle")}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {locale.startsWith("en")
                ? "No courses matched your search."
                : locale.startsWith("pt")
                  ? "Nenhum curso correspondeu a busca."
                  : "Ingen kurs passet søket."}
            </p>
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCourses.map((course) => {
              const href = insideApp
                ? `/${locale}/academy/courses/marketplace/${course.slug}`
                : `/${locale}/courses/${course.slug}`;
              const startText = formatStartsAt(course.coursePlan, locale, t("startComing"));
              const sessionsCount = course.numberOfSessions || course.coursePlan.length;
              const price = formatOptionalCoursePrice(course.sales, course.priceText, locale);
              const summary = course.marketing.summary || course.description || t("descriptionFallback");

              return (
              <Link
                key={course.slug}
                href={href}
                className="grid min-h-full overflow-hidden rounded-[14px] border border-slate-200 bg-white text-slate-950 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="relative aspect-video bg-slate-100">
                  {sessionsCount ? (
                    <span className="absolute bottom-3 left-3 z-10 max-w-[45%] truncate rounded-full bg-lime-200/90 px-3 py-2 text-sm font-black text-slate-950 shadow-sm max-[520px]:bottom-2 max-[520px]:left-2 max-[520px]:px-2.5 max-[520px]:py-1.5 max-[520px]:text-xs">
                      {formatSessionsBadge(sessionsCount, locale)}
                    </span>
                  ) : null}
                  <span className="absolute bottom-3 right-3 z-10 max-w-[50%] truncate rounded-full bg-white/95 px-3 py-1.5 text-xs font-black text-slate-800 shadow-sm ring-1 ring-slate-200 max-[520px]:bottom-2 max-[520px]:right-2 max-[520px]:px-2.5 max-[520px]:py-1.5 max-[520px]:text-[11px]">
                    {formatStartBadge(startText, locale)}
                  </span>
                  {course.marketing.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={course.marketing.coverImageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm font-black text-slate-400">
                      {t("badge")}
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-[14px]">
                  <div>
                    <h2 className="m-0 break-words text-lg font-black leading-tight">{course.title}</h2>
                    {course.teacherName ? (
                      <p className="m-0 mt-2 text-sm font-semibold text-slate-600">
                        {t("instructor", { name: course.teacherName })}
                      </p>
                    ) : null}
                    {price ? (
                      <p className="m-0 text-sm font-semibold text-slate-600">
                        {t("price")}: {price}
                      </p>
                    ) : null}
                    <p className="m-0 mt-2 line-clamp-2 text-sm leading-5 text-slate-600">
                      {summary}
                    </p>
                  </div>

                  <div className="mt-auto flex justify-end pt-3">
                    <span className="inline-flex min-h-8 items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-black text-white">
                    {t("viewCourse")}
                    </span>
                  </div>
                </div>
              </Link>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

function formatOptionalCoursePrice(sales: CourseSalesSettings, fallback: string, locale: string) {
  if (sales.priceAmountOre > 0) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: sales.currency || "NOK",
      maximumFractionDigits: sales.priceAmountOre % 100 === 0 ? 0 : 2,
    }).format(sales.priceAmountOre / 100);
  }

  return fallback;
}

function formatSessionsBadge(count: number, locale: string) {
  if (locale.startsWith("en")) return count === 1 ? "1 session" : `${count} sessions`;
  if (locale.startsWith("pt")) return count === 1 ? "1 encontro" : `${count} encontros`;
  return count === 1 ? "1 samling" : `${count} samlinger`;
}

function formatStartBadge(startText: string, locale: string) {
  if (locale.startsWith("en")) return `Start: ${startText}`;
  if (locale.startsWith("pt")) return `Inicio: ${startText}`;
  return `Start: ${startText}`;
}
