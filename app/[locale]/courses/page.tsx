import Link from "next/link";
import type { Metadata } from "next";
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

function formatStartsAt(coursePlan: CoursePlanSession[]) {
  const next = coursePlan
    .map((session) => session.startsAt)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  if (!next) return "Start date coming";
  return next.toLocaleDateString("nb-NO", {
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

export const metadata: Metadata = {
  title: "321Academy Courses",
  description: "Browse published courses from 321Academy.",
};

export default async function PublicCoursesPage({ params }: PageProps) {
  const { locale } = await params;
  const courses = await loadMarketplaceCourses();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto grid max-w-6xl gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-800">
            321Academy
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="m-0 text-3xl font-black">Courses</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Browse teacher-led courses. Payment and automatic enrollment are not enabled yet,
                so requests are handled as course interest for now.
              </p>
            </div>
            <Link
              href={`/${locale}/academy/courses`}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
            >
              My course room
            </Link>
          </div>
        </section>

        {courses.length === 0 ? (
          <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <h2 className="m-0 text-xl font-black">No published courses yet</h2>
            <p className="mt-2 text-sm text-slate-600">
              Published 321Academy courses will appear here.
            </p>
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <article
                key={course.slug}
                className="grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="aspect-video bg-slate-100">
                  {course.marketing.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={course.marketing.coverImageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm font-black text-slate-400">
                      321Academy
                    </div>
                  )}
                </div>
                <div className="grid gap-4 p-4">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge value={course.level || "Level"} />
                      <Badge value={course.language || "Language"} />
                    </div>
                    <h2 className="m-0 mt-3 break-words text-lg font-black">{course.title}</h2>
                    {course.teacherName ? (
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Instructor: {course.teacherName}
                      </p>
                    ) : null}
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-700">
                      {course.marketing.summary || course.description || "Course description coming soon."}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Info label="Start" value={formatStartsAt(course.coursePlan)} />
                    <Info label="Price" value={formatCoursePrice(course.sales, course.priceText)} />
                    <Info label="Sessions" value={String(course.numberOfSessions || course.coursePlan.length)} />
                    <Info label="Weeks" value={course.numberOfWeeks ? String(course.numberOfWeeks) : "Flexible"} />
                  </div>

                  <Link
                    href={`/${locale}/courses/${course.slug}`}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 px-4 text-sm font-black text-white no-underline hover:bg-emerald-800"
                  >
                    View course
                  </Link>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function Badge({ value }: { value: string }) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600">
      {value}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-extrabold text-slate-950">{value}</div>
    </div>
  );
}

function formatCoursePrice(sales: CourseSalesSettings, fallback: string) {
  if (sales.priceAmountOre > 0) {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency: sales.currency || "NOK",
      maximumFractionDigits: sales.priceAmountOre % 100 === 0 ? 0 : 2,
    }).format(sales.priceAmountOre / 100);
  }

  return fallback || "Contact";
}
