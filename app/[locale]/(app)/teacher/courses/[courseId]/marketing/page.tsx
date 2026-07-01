"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { AcademyGate } from "../../AcademyGate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { storage } from "@/lib/firebase";
import {
  calculateCoursePayout,
  calculateCoursePayoutReleasePolicy,
} from "@/lib/courses/commerce";
import {
  defaultCourseTaxProfile,
  type Course,
  type CourseMarketing,
  type CourseSalesSettings,
} from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { CourseWorkspaceNav } from "../CourseWorkspaceNav";
import { fetchTeacherCourse } from "../courseClient";

type CoverMode = "upload" | "ai";
type ConnectStatus = {
  connected: boolean;
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
};

export default function CourseMarketingPage() {
  return (
    <AcademyGate>
      <CourseMarketingContent />
    </AcademyGate>
  );
}

function CourseMarketingContent() {
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ courseId?: string }>();
  const courseId = typeof params?.courseId === "string" ? params.courseId : "";
  const { user } = useUserProfile();
  const [course, setCourse] = useState<Course | null>(null);
  const [marketing, setMarketing] = useState<CourseMarketing>({
    coverImageUrl: "",
    coverImageSource: "",
    coverImagePrompt: "",
    coverImageStyle: "illustration",
    summary: "",
    salesText: "",
    seoTitle: "",
    seoDescription: "",
  });
  const [sales, setSales] = useState<CourseSalesSettings>({
    saleStatus: "not_for_sale",
    currency: "NOK",
    priceAmountOre: 0,
    taxProfile: defaultCourseTaxProfile(),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingMarketing, setGeneratingMarketing] = useState(false);
  const [coverMode, setCoverMode] = useState<CoverMode>("upload");
  const [imageMessage, setImageMessage] = useState("");
  const [marketingMessage, setMarketingMessage] = useState("");
  const [error, setError] = useState("");
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectMessage, setConnectMessage] = useState("");
  const payoutPreview = useMemo(() => {
    if (!course || sales.priceAmountOre <= 0) return null;
    return calculateCoursePayout({
      grossAmountOre: sales.priceAmountOre,
      numberOfSessions: course.numberOfSessions,
      numberOfWeeks: course.numberOfWeeks,
      participantHasActiveLicense: false,
    });
  }, [course, sales.priceAmountOre]);
  const payoutReleasePreview = useMemo(() => {
    if (!payoutPreview) return null;
    return calculateCoursePayoutReleasePolicy(payoutPreview.instructorAmountOre);
  }, [payoutPreview]);
  const saleReady =
    sales.saleStatus === "ready" &&
    sales.priceAmountOre > 0 &&
    sales.taxProfile.deliveryType === "live_instruction" &&
    sales.taxProfile.vatTreatment === "vat_exempt_education" &&
    connectStatus?.connected === true;

  const imageSourceText = useMemo(() => {
    if (!course) return "";
    return [
      `Course title: ${course.title}`,
      `Description: ${course.description}`,
      `Learning goals: ${course.learningGoals}`,
      `Target audience: ${course.targetAudience}`,
      `Language: ${course.language}`,
      `Level: ${course.level}`,
      marketing.summary ? `Public summary: ${marketing.summary}` : "",
      marketing.salesText ? `Sales text: ${marketing.salesText}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4000);
  }, [course, marketing.summary, marketing.salesText]);

  useEffect(() => {
    let cancelled = false;

    async function loadCourse() {
      if (!user || !courseId) {
        setError("Fant ikke kurs.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const loadedCourse = await fetchTeacherCourse(user, courseId);
        if (!cancelled) {
          setCourse(loadedCourse);
          setMarketing(loadedCourse.marketing);
          setSales(loadedCourse.sales);
          setCoverMode(loadedCourse.marketing.coverImageSource === "ai" ? "ai" : "upload");
        }
      } catch (err) {
        console.error("Failed to load marketing page", err);
        if (!cancelled) setError("Kurset kunne ikke hentes akkurat nå.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourse();

    return () => {
      cancelled = true;
    };
  }, [courseId, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadConnectStatus() {
      if (!user) return;

      try {
        setConnectLoading(true);
        const token = await user.getIdToken();
        const res = await fetch("/api/teacher/connect/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as ConnectStatus & { error?: string };
        if (!res.ok) throw new Error(data.error || "Could not load Stripe Connect status");
        if (!cancelled) setConnectStatus(data);
      } catch (err) {
        console.error("Failed to load Connect status", err);
        if (!cancelled) setConnectMessage("Could not load Stripe Connect status.");
      } finally {
        if (!cancelled) setConnectLoading(false);
      }
    }

    void loadConnectStatus();

    return () => {
      cancelled = true;
    };
  }, [user]);

  function updateMarketing<K extends keyof CourseMarketing>(key: K, value: CourseMarketing[K]) {
    setMarketing((prev) => ({ ...prev, [key]: value }));
  }

  function updateSales<K extends keyof CourseSalesSettings>(key: K, value: CourseSalesSettings[K]) {
    setSales((prev) => ({ ...prev, [key]: value }));
  }

  function formatOre(amountOre: number) {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency: sales.currency || "NOK",
    }).format(amountOre / 100);
  }

  function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return "Something went wrong.";
  }

  function buildSuggestedImagePrompt() {
    if (!course) return "";

    const courseDescription = marketing.summary || course.description;
    const salesAngle = marketing.salesText || course.targetAudience;

    return [
      "Create a premium 16:9 front-page marketing image for a professional course.",
      "The image should feel like something used to sell the course: polished, optimistic, trustworthy and high quality.",
      "Show happy, confident, successful people in a positive learning situation connected to the course topic.",
      "The mood should communicate progress, mastery, collaboration and practical value.",
      "Use a clean modern composition with warm natural light and enough visual space for a course title to be placed outside the image later.",
      "Do not include any text, letters, numbers, logos, watermarks, UI screens with readable text, or brand names inside the image.",
      `Course title: ${course.title || "Course"}`,
      courseDescription ? `Course description: ${courseDescription}` : "",
      course.learningGoals ? `Learning goals: ${course.learningGoals}` : "",
      course.targetAudience ? `Target audience: ${course.targetAudience}` : "",
      salesAngle ? `Sales angle: ${salesAngle}` : "",
      course.language ? `Course language: ${course.language}` : "",
      course.level ? `Level: ${course.level}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async function uploadCourseImage(file: File) {
    if (!user || !course) return;

    try {
      setUploadingImage(true);
      setError("");
      setImageMessage("");

      if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
      if (file.size > 8 * 1024 * 1024) throw new Error("The image is too large. Max 8MB.");

      const safeName = file.name.replaceAll(" ", "_").replace(/[^a-zA-Z0-9._-]/g, "");
      const fileRef = ref(storage, `covers/${user.uid}/course-${course.id}/${Date.now()}-${safeName || "cover"}`);

      await uploadBytes(fileRef, file, {
        contentType: file.type,
        cacheControl: "public,max-age=31536000",
      });

      const imageUrl = await getDownloadURL(fileRef);
      setMarketing((prev) => ({
        ...prev,
        coverImageUrl: imageUrl,
        coverImageSource: "upload",
      }));
      setCoverMode("upload");
      setImageMessage("Image uploaded. Remember to save marketing.");
    } catch (err) {
      console.error("Failed to upload course image", err);
      setError(getErrorMessage(err) || "Image upload failed.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function generateCourseImage() {
    if (!user || !course || generatingImage) return;

    try {
      setGeneratingImage(true);
      setError("");
      setImageMessage("");

      if (!marketing.coverImagePrompt.trim()) {
        throw new Error("Write an image prompt first.");
      }

      const token = await user.getIdToken();
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lessonId: `course-${course.id}`,
          format: "16:9",
          style: marketing.coverImageStyle,
          promptMode: "custom",
          customPrompt: marketing.coverImagePrompt.trim(),
          sourceText: imageSourceText,
          title: course.title,
          level: course.level,
          language: course.language,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        imageUrl?: string;
        url?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Image generation failed.");

      const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : typeof data.url === "string" ? data.url : "";
      if (!imageUrl) throw new Error("Image generation returned no image.");

      setMarketing((prev) => ({
        ...prev,
        coverImageUrl: imageUrl,
        coverImageSource: "ai",
      }));
      setCoverMode("ai");
      setImageMessage("AI image generated. Remember to save marketing.");
    } catch (err) {
      console.error("Failed to generate course image", err);
      setError(getErrorMessage(err) || "Image generation failed.");
    } finally {
      setGeneratingImage(false);
    }
  }

  async function generateMarketingText() {
    if (!user || !course || generatingMarketing) return;

    try {
      setGeneratingMarketing(true);
      setMarketingMessage("");
      setError("");

      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/courses/${encodeURIComponent(course.id)}/marketing/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = (await res.json().catch(() => ({}))) as {
        marketing?: Partial<Pick<CourseMarketing, "summary" | "salesText" | "seoTitle" | "seoDescription">>;
        error?: string;
      };
      if (!res.ok || !data.marketing) {
        throw new Error(data.error || "Could not generate marketing text.");
      }

      setMarketing((prev) => ({
        ...prev,
        summary: typeof data.marketing?.summary === "string" ? data.marketing.summary : prev.summary,
        salesText: typeof data.marketing?.salesText === "string" ? data.marketing.salesText : prev.salesText,
        seoTitle: typeof data.marketing?.seoTitle === "string" ? data.marketing.seoTitle : prev.seoTitle,
        seoDescription:
          typeof data.marketing?.seoDescription === "string"
            ? data.marketing.seoDescription
            : prev.seoDescription,
      }));
      setMarketingMessage("Marketing suggestions added. Review and edit before saving.");
    } catch (err) {
      console.error("Failed to generate marketing text", err);
      setError(getErrorMessage(err) || "Could not generate marketing text.");
    } finally {
      setGeneratingMarketing(false);
    }
  }

  async function startConnectOnboarding() {
    if (!user || connectLoading) return;

    try {
      setConnectLoading(true);
      setConnectMessage("");
      setError("");
      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/connect/onboarding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start Stripe onboarding");
      window.location.href = data.url;
    } catch (err) {
      console.error("Failed to start Connect onboarding", err);
      setConnectMessage(getErrorMessage(err) || "Could not start Stripe onboarding.");
      setConnectLoading(false);
    }
  }

  async function saveMarketing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !course || saving) return;

    try {
      setSaving(true);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/courses/${encodeURIComponent(course.id)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...course,
          marketing,
          sales,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save marketing");

      const refreshed = await fetchTeacherCourse(user, course.id);
      setCourse(refreshed);
      setMarketing(refreshed.marketing);
      setSales(refreshed.sales);
    } catch (err) {
      console.error("Failed to save marketing", err);
      setError("Marketing-feltene kunne ikke lagres akkurat nå.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Laster marketing...</div>;
  }

  if (!course) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error || "Fant ikke kurs."}</div>;
  }

  return (
    <main className="mx-auto grid max-w-4xl gap-5">
      <CourseWorkspaceNav
        locale={locale}
        courseId={course.id}
        title={course.title}
        status={course.status}
        active="marketing"
      />
      <form onSubmit={saveMarketing} className="grid gap-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="m-0 text-2xl font-black text-slate-950">Marketing</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Course image, public text and presentation fields for course cards and public pages.
        </p>
      </section>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="m-0 text-lg font-extrabold text-slate-950">Public page</h2>
          <p className="mt-1 text-sm text-slate-600">
            Offentlig side er fortsatt basert på trygge kursfelt og vises bare når kurset er published eller active.
          </p>
        </div>

        <Field label="Public URL">
          <Input value={course.publicUrl || "Publiser kurset for å lage offentlig lenke"} readOnly />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/${locale}/teacher/courses/${course.id}/preview`}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
          >
            Preview course
          </Link>
          {course.publicUrl ? (
            <a
              href={course.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 text-sm font-bold text-white no-underline hover:bg-slate-800"
            >
              Open public page
            </a>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="m-0 text-lg font-extrabold text-slate-950">Marketing fields</h2>
        <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4">
            <div>
              <h3 className="m-0 text-base font-extrabold text-slate-950">Course image</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Locked to 16:9 so it works for marketing, course cards and public sharing.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCoverMode("upload")}
                className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-bold ${
                  coverMode === "upload"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                Upload image
              </button>
              <button
                type="button"
                onClick={() => setCoverMode("ai")}
                className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-bold ${
                  coverMode === "ai"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                Generate with AI
              </button>
            </div>

            {coverMode === "upload" ? (
              <div className="grid gap-3">
                <Field label="Upload image">
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingImage}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void uploadCourseImage(file);
                    }}
                    className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
                  />
                </Field>
                <Field label="Or paste image URL">
                  <Input
                    value={marketing.coverImageUrl}
                    onChange={(event) =>
                      setMarketing((prev) => ({
                        ...prev,
                        coverImageUrl: event.target.value,
                        coverImageSource: "upload",
                      }))
                    }
                    placeholder="https://..."
                  />
                </Field>
                <div className="text-xs font-semibold text-slate-500">
                  {uploadingImage ? "Uploading..." : "Use jpg, png or webp. Max 8MB."}
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                <Field label="Image style">
                  <select
                    value={marketing.coverImageStyle}
                    onChange={(event) =>
                      updateMarketing(
                        "coverImageStyle",
                        event.target.value === "realistic" ? "realistic" : "illustration"
                      )
                    }
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
                  >
                    <option value="illustration">Illustration</option>
                    <option value="realistic">Realistic</option>
                  </select>
                </Field>
                <Field label="AI image prompt">
                  <Textarea
                    value={marketing.coverImagePrompt}
                    onChange={(event) => updateMarketing("coverImagePrompt", event.target.value)}
                    rows={4}
                    placeholder="Describe the course image. Avoid text inside the image."
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => updateMarketing("coverImagePrompt", buildSuggestedImagePrompt())}
                  >
                    Use suggested prompt
                  </Button>
                  <span className="text-xs font-semibold text-slate-500">
                    Built from course description and marketing text. You can edit it before generating.
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={generatingImage || !marketing.coverImagePrompt.trim()}
                    onClick={() => void generateCourseImage()}
                  >
                    {generatingImage ? "Generating..." : "Generate image"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!marketing.coverImageUrl || generatingImage}
                    onClick={() =>
                      setMarketing((prev) => ({
                        ...prev,
                        coverImageUrl: "",
                        coverImageSource: "",
                      }))
                    }
                  >
                    Remove image
                  </Button>
                </div>
              </div>
            )}

            {imageMessage ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                {imageMessage}
              </div>
            ) : null}
          </div>

          <div className="grid content-start gap-2">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="grid aspect-video place-items-center bg-slate-100 text-center text-sm font-bold text-slate-500">
                {marketing.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={marketing.coverImageUrl}
                    alt={course.title || "Course image"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>16:9 course image</span>
                )}
              </div>
            </div>
            <div className="text-xs font-semibold text-slate-500">
              Source: {marketing.coverImageSource === "ai" ? "AI" : marketing.coverImageSource === "upload" ? "Upload/URL" : "None"}
            </div>
          </div>
        </div>
        <Field label="Short public summary">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={generatingMarketing}
              onClick={() => void generateMarketingText()}
            >
              {generatingMarketing ? "Generating marketing..." : "Generate marketing text"}
            </Button>
            <span className="text-xs font-semibold text-slate-500">
              Creates editable suggestions from the course description.
            </span>
          </div>
          {marketingMessage ? (
            <div className="mb-1 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
              {marketingMessage}
            </div>
          ) : null}
          <Textarea
            value={marketing.summary}
            onChange={(event) => updateMarketing("summary", event.target.value)}
            rows={3}
            placeholder="Kort tekst som kan vises høyt på offentlig kursside."
          />
        </Field>
        <Field label="Sales text">
          <Textarea
            value={marketing.salesText}
            onChange={(event) => updateMarketing("salesText", event.target.value)}
            rows={5}
            placeholder="Mer utfyllende tekst om hvem kurset passer for og hva deltakerne får ut av det."
          />
        </Field>
        <Field label="SEO title">
          <Input value={marketing.seoTitle} onChange={(event) => updateMarketing("seoTitle", event.target.value)} />
        </Field>
        <Field label="SEO description">
          <Textarea
            value={marketing.seoDescription}
            onChange={(event) => updateMarketing("seoDescription", event.target.value)}
            rows={3}
          />
        </Field>
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="m-0 text-lg font-extrabold text-slate-950">Sales setup</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Configure course price, payout readiness and tax classification before accepting paid enrollments.
          </p>
        </div>

        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h3 className="m-0 text-base font-extrabold text-slate-950">Stripe Connect</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Instructors must connect Stripe Express before this course can accept paid enrollments and later payouts.
              Course payments are held by the platform until delivery milestones are reviewed.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
              <span className={`rounded-full border px-2.5 py-1 ${
                connectStatus?.connected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}>
                {connectLoading
                  ? "Checking..."
                  : connectStatus?.connected
                    ? "Connected"
                    : connectStatus?.accountId
                      ? "Onboarding incomplete"
                      : "Not connected"}
              </span>
              {connectStatus?.accountId ? (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                  {connectStatus.accountId}
                </span>
              ) : null}
            </div>
            {connectMessage ? (
              <div className="mt-2 text-sm font-semibold text-amber-800">{connectMessage}</div>
            ) : null}
          </div>
          <Button
            type="button"
            variant={connectStatus?.connected ? "secondary" : "primary"}
            disabled={connectLoading}
            onClick={() => void startConnectOnboarding()}
          >
            {connectStatus?.connected ? "Open Stripe setup" : connectStatus?.accountId ? "Continue setup" : "Connect Stripe"}
          </Button>
        </div>

        <div
          className={`rounded-lg border p-4 text-sm font-semibold ${
            saleReady
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {saleReady
            ? "Public checkout is ready. The public course page can show Buy course after you save these settings."
            : "Public checkout is not ready yet. Required: Stripe connected, sale status ready, price set, and live instruction tax profile."}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Sale status">
            <select
              value={sales.saleStatus}
              onChange={(event) =>
                updateSales(
                  "saleStatus",
                  event.target.value === "ready" || event.target.value === "needs_review"
                    ? event.target.value
                    : "not_for_sale"
                )
              }
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
            >
              <option value="not_for_sale">Not for sale yet</option>
              <option value="ready">Ready when Stripe is connected</option>
              <option value="needs_review">Needs review</option>
            </select>
          </Field>
          <Field label="Currency">
            <Input
              value={sales.currency}
              onChange={(event) => updateSales("currency", event.target.value.toUpperCase().slice(0, 3))}
              placeholder="NOK"
            />
          </Field>
          <Field label="Price">
            <Input
              type="number"
              min="0"
              step="1"
              value={sales.priceAmountOre ? String(sales.priceAmountOre / 100) : ""}
              onChange={(event) =>
                updateSales("priceAmountOre", Math.max(0, Math.round(Number(event.target.value || 0) * 100)))
              }
              placeholder="0"
            />
          </Field>
        </div>

        <div className="grid gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div>
            <h3 className="m-0 text-base font-extrabold text-emerald-950">Tax classification</h3>
            <p className="mt-1 text-sm leading-6 text-emerald-900">
              Default is live instructor-led education. Mixed or recorded digital content should be reviewed before sale.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Delivery type">
              <select
                value={sales.taxProfile.deliveryType}
                onChange={(event) => {
                  const deliveryType =
                    event.target.value === "recorded_digital_content" ||
                    event.target.value === "mixed" ||
                    event.target.value === "needs_review"
                      ? event.target.value
                      : "live_instruction";
                  setSales((prev) => ({
                    ...prev,
                    saleStatus:
                      deliveryType === "live_instruction" && prev.saleStatus !== "needs_review"
                        ? prev.saleStatus
                        : "needs_review",
                    taxProfile: {
                      ...prev.taxProfile,
                      deliveryType,
                      vatTreatment:
                        deliveryType === "live_instruction"
                          ? "vat_exempt_education"
                          : deliveryType === "recorded_digital_content"
                            ? "vatable_digital_service"
                            : "needs_review",
                    },
                  }));
                }}
                className="h-10 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-bold text-slate-800"
              >
                <option value="live_instruction">Live instructor-led course</option>
                <option value="mixed">Mixed content, review needed</option>
                <option value="recorded_digital_content">Recorded digital content</option>
                <option value="needs_review">Needs review</option>
              </select>
            </Field>
            <Field label="VAT treatment">
              <select
                value={sales.taxProfile.vatTreatment}
                onChange={(event) =>
                  setSales((prev) => ({
                    ...prev,
                    taxProfile: {
                      ...prev.taxProfile,
                      vatTreatment:
                        event.target.value === "vatable_digital_service" ||
                        event.target.value === "needs_review"
                          ? event.target.value
                          : "vat_exempt_education",
                    },
                  }))
                }
                className="h-10 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-bold text-slate-800"
              >
                <option value="vat_exempt_education">VAT exempt education</option>
                <option value="vatable_digital_service">VAT-able digital service</option>
                <option value="needs_review">Needs review</option>
              </select>
            </Field>
          </div>
          <Field label="VAT note">
            <Textarea
              value={sales.taxProfile.vatNote}
              onChange={(event) =>
                setSales((prev) => ({
                  ...prev,
                  taxProfile: { ...prev.taxProfile, vatNote: event.target.value },
                }))
              }
              rows={3}
            />
          </Field>
        </div>

        {payoutPreview ? (
          <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
            <SummaryLine label="Gross price" value={formatOre(payoutPreview.grossAmountOre)} />
            <SummaryLine label="Estimated payment fee" value={formatOre(payoutPreview.paymentFeeOre)} />
            <SummaryLine label="Estimated Daily/AI" value={formatOre(payoutPreview.dailyAiFeeOre)} />
            <SummaryLine label="Course license deduction" value={formatOre(payoutPreview.licenseFeeOre)} />
            <SummaryLine label="Net revenue" value={formatOre(payoutPreview.netRevenueOre)} />
            <SummaryLine label="Instructor estimate" value={formatOre(payoutPreview.instructorAmountOre)} />
            <SummaryLine label="Platform margin" value={formatOre(payoutPreview.platformMarginOre)} />
            <SummaryLine label="Platform/cost reserve" value={formatOre(payoutPreview.applicationFeeAmountOre)} />
            {payoutReleasePreview ? (
              <>
                <SummaryLine label="First payout after 75% delivery" value={formatOre(payoutReleasePreview.firstReleaseAmountOre)} />
                <SummaryLine label="Held until completion" value={formatOre(payoutReleasePreview.holdbackAmountOre)} />
              </>
            ) : null}
            <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-900">
              Paid enrollments are held by 321School first. Up to 75% of the instructor estimate can be released
              after 75% of the course is completed. The remaining 25% is held until completion and a short complaint
              window has passed.
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.push(`/${locale}/teacher/courses/${course.id}`)}>
          Back to dashboard
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving..." : "Save marketing"}
        </Button>
      </div>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span className="font-bold text-slate-600">{label}</span>
      <span className="font-black text-slate-950">{value}</span>
    </div>
  );
}
