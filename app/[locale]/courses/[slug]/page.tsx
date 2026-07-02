import { notFound } from "next/navigation";
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
import { CourseCheckoutButton } from "./CourseCheckoutButton";
import { SignupRequestForm } from "./SignupRequestForm";

type PageProps = {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
};

type PublicCourse = {
  slug: string;
  title: string;
  description: string;
  learningGoals: string;
  targetAudience: string;
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
  canCheckout: boolean;
  isFull: boolean;
  participantCount: number;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function loadPublicCourse(slug: string): Promise<PublicCourse | null> {
  const { db } = getAdmin();
  const snap = await db.collection("courses").where("slug", "==", slug).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return null;

  const data = doc.data();
  if (data.status !== "published" && data.status !== "active") return null;

  let teacherName = "";
  let ownerCanReceivePayments = false;
  const ownerUid = safeString(data.ownerUid);
  if (ownerUid) {
    const ownerSnap = await db.collection("users").doc(ownerUid).get();
    const owner = ownerSnap.exists ? ownerSnap.data() ?? {} : {};
    teacherName = safeString(owner.displayName);
    const connect =
      owner.academyStripeConnect && typeof owner.academyStripeConnect === "object"
        ? owner.academyStripeConnect as Record<string, unknown>
        : {};
    ownerCanReceivePayments =
      typeof connect.accountId === "string" &&
      connect.chargesEnabled === true &&
      connect.payoutsEnabled === true &&
      connect.detailsSubmitted === true;
  }
  const sales = normalizeCourseSalesSettings(data.sales);
  const participantsSnap = await doc.ref.collection("participants").get();
  const participantCount = participantsSnap.docs.filter((participantDoc) => {
    const status = safeString(participantDoc.data().status);
    return status === "invited" || status === "enrolled" || status === "active";
  }).length;
  const isFull = safeNumber(data.maxParticipants) > 0 && participantCount >= safeNumber(data.maxParticipants);

  return {
    title: safeString(data.title),
    slug,
    description: safeString(data.description),
    learningGoals: safeString(data.learningGoals),
    targetAudience: safeString(data.targetAudience),
    language: safeString(data.language),
    level: safeString(data.level),
    priceText: safeString(data.priceText),
    sales,
    maxParticipants: safeNumber(data.maxParticipants),
    numberOfSessions: safeNumber(data.numberOfSessions),
    numberOfWeeks: safeNumber(data.numberOfWeeks),
    marketing: normalizeCourseMarketing(data.marketing),
    coursePlan: normalizeCoursePlan(data.coursePlan),
    teacherName,
    isFull,
    participantCount,
    canCheckout:
      !isFull &&
      ownerCanReceivePayments === true &&
      sales.saleStatus === "ready" &&
      sales.priceAmountOre > 0 &&
      sales.taxProfile.deliveryType === "live_instruction" &&
      sales.taxProfile.vatTreatment === "vat_exempt_education",
  };
}

export default async function PublicCoursePage({ params }: PageProps) {
  const { locale, slug } = await params;
  const t = await getTranslations("academy.publicCourse");
  const course = await loadPublicCourse(slug);
  if (!course) notFound();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto grid max-w-5xl gap-6">
        <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">
            {t("brand")}
          </div>
          <h1 className="m-0 mt-2 break-words text-3xl font-black">{course.title}</h1>
          {course.teacherName ? (
            <p className="mt-2 text-sm font-bold text-slate-600">{t("instructor", { name: course.teacherName })}</p>
          ) : null}
          {course.marketing.coverImageUrl ? (
            <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={course.marketing.coverImageUrl}
                alt=""
                className="aspect-video w-full object-cover"
              />
            </div>
          ) : null}
          {course.marketing.summary ? (
            <p className="mt-4 max-w-3xl whitespace-pre-wrap text-lg font-semibold leading-8 text-slate-800">
              {course.marketing.summary}
            </p>
          ) : null}
          <p className="mt-4 max-w-3xl whitespace-pre-wrap text-base leading-7 text-slate-700">
            {course.description || t("noDescription")}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Badge label={t("badges.level")} value={course.level || t("missing")} />
            <Badge label={t("badges.language")} value={course.language || t("missing")} />
            <Badge label={t("badges.sessions")} value={String(course.numberOfSessions)} />
            <Badge label={t("badges.weeks")} value={String(course.numberOfWeeks)} />
            <Badge label={t("badges.maxParticipants")} value={String(course.maxParticipants)} />
            {course.maxParticipants > 0 ? (
              <Badge
                label={t("badges.available")}
                value={t("places", { count: Math.max(0, course.maxParticipants - course.participantCount) })}
              />
            ) : null}
            <Badge label={t("badges.price")} value={formatCoursePrice(course.sales, course.priceText, locale, t("missing"))} />
          </div>

          {course.canCheckout ? (
            <>
              <CourseCheckoutButton enabled label={t("buy")} />
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold leading-6 text-emerald-900">
                {t("paymentHeld")}
              </div>
              <SignupRequestForm slug={course.slug} compact />
            </>
          ) : course.isFull ? (
            <>
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                {t("full")}
              </div>
              <SignupRequestForm slug={course.slug} compact />
            </>
          ) : (
            <SignupRequestForm slug={course.slug} />
          )}
        </section>

        <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-6 shadow-sm">
          <TextBlock title={t("learningGoals")} value={course.learningGoals || t("missing")} />
          <TextBlock title={t("targetAudience")} value={course.targetAudience || t("missing")} />
          {course.marketing.salesText ? (
            <TextBlock title={t("about")} value={course.marketing.salesText} />
          ) : null}
        </section>

        <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-6 shadow-sm">
          <h2 className="m-0 text-xl font-black">{t("coursePlan")}</h2>
          {course.coursePlan.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              {t("noSessions")}
            </div>
          ) : (
            <div className="grid gap-3">
              {course.coursePlan.map((session) => (
                <article
                  key={session.sessionNumber}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("session", { number: session.sessionNumber })}
                  </div>
                  <h3 className="m-0 mt-2 text-base font-extrabold">
                    {session.title || t("untitled")}
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {session.description || t("noSessionDescription")}
                  </p>
                  {session.contentSuggestions ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      <strong>{t("contentSuggestions")}</strong> {session.contentSuggestions}
                    </p>
                  ) : null}
                  {session.resources.some(isPublicPreviewResource) ? (
                    <div className="mt-3 grid gap-2">
                      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                        {t("resources")}
                      </div>
                      {session.resources.filter(isPublicPreviewResource).map((resource) => (
                        <div key={resource.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                          <div className="font-extrabold text-slate-900">
                            {resource.title || resource.type}
                          </div>
                          {resource.description ? <div className="mt-1 whitespace-pre-wrap">{resource.description}</div> : null}
                          {isPublicResourceLink(resource) ? (
                            <a href={resource.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-sm font-bold text-slate-900 underline">
                              {t("openResource")}
                            </a>
                          ) : (
                            <div className="mt-1 text-xs font-bold text-slate-500">
                              {t("availableAfterEnrollment")}
                            </div>
                          )}
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
                  <div className="mt-3 text-sm font-bold text-slate-500">
                    {t("meetingAfterEnrollment")}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    <strong>{t("homework")}</strong> {session.homework || t("noHomework")}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const course = await loadPublicCourse(slug);
  if (!course) return {};

  return {
    title: course.marketing.seoTitle || course.title,
    description: course.marketing.seoDescription || course.marketing.summary || course.description,
    openGraph: {
      title: course.marketing.seoTitle || course.title,
      description: course.marketing.seoDescription || course.marketing.summary || course.description,
      images: course.marketing.coverImageUrl ? [course.marketing.coverImageUrl] : undefined,
    },
  };
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
      <strong>{label}:</strong> {value}
    </span>
  );
}

function TextBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <h2 className="m-0 text-lg font-black">{title}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function formatCoursePrice(sales: CourseSalesSettings, fallback: string, locale: string, missing: string) {
  if (sales.priceAmountOre > 0) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: sales.currency || "NOK",
      maximumFractionDigits: sales.priceAmountOre % 100 === 0 ? 0 : 2,
    }).format(sales.priceAmountOre / 100);
  }

  return fallback || missing;
}

function formatSessionDate(value: string, locale: string, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale);
}

function isPublicResourceLink(resource: CoursePlanSession["resources"][number]): boolean {
  if (!resource.url) return false;
  if (resource.visibility !== "public") return false;
  if (resource.type === "platform") return false;
  if (resource.sourceType === "myContent" || resource.sourceType === "library") return false;
  return /^https?:\/\//i.test(resource.url);
}

function isPublicPreviewResource(resource: CoursePlanSession["resources"][number]): boolean {
  return resource.visibility === "public";
}
