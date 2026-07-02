"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { AcademyGate } from "../../AcademyGate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { storage } from "@/lib/firebase";
import {
  type Course,
  type CourseMarketing,
} from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { CourseWorkspaceNav } from "../CourseWorkspaceNav";
import { fetchTeacherCourse } from "../courseClient";

type CoverMode = "upload" | "ai";
export default function CourseMarketingPage() {
  return (
    <AcademyGate>
      <CourseMarketingContent />
    </AcademyGate>
  );
}

function CourseMarketingContent() {
  const locale = useLocale();
  const t = useTranslations("academy.marketing");
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingMarketing, setGeneratingMarketing] = useState(false);
  const [coverMode, setCoverMode] = useState<CoverMode>("upload");
  const [imageMessage, setImageMessage] = useState("");
  const [marketingMessage, setMarketingMessage] = useState("");
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [shareMessage, setShareMessage] = useState("");
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
  const publicShareUrl = useMemo(() => {
    if (!course) return "";
    if (course.publicUrl) return course.publicUrl;
    if (typeof window === "undefined" || !course.slug) return "";
    return `${window.location.origin}/${locale}/courses/${course.slug}`;
  }, [course, locale]);
  const shareText = useMemo(() => {
    if (!course) return "";
    return [
      course.title,
      marketing.summary || course.description,
      publicShareUrl,
    ]
      .filter(Boolean)
      .join("\n\n");
  }, [course, marketing.summary, publicShareUrl]);
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
          scale: 7,
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

  useEffect(() => {
    let cancelled = false;

    async function loadCourse() {
      if (!user || !courseId) {
        setError(t("errors.notFound"));
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
          setCoverMode(loadedCourse.marketing.coverImageSource === "ai" ? "ai" : "upload");
        }
      } catch (err) {
        console.error("Failed to load marketing page", err);
        if (!cancelled) setError(t("errors.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourse();

    return () => {
      cancelled = true;
    };
  }, [courseId, t, user]);

  function updateMarketing<K extends keyof CourseMarketing>(key: K, value: CourseMarketing[K]) {
    setMarketing((prev) => ({ ...prev, [key]: value }));
  }


  function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return t("errors.generic");
  }

  async function copyText(value: string, successMessage: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setShareMessage(successMessage);
    } catch {
      setShareMessage(t("errors.copyFailed"));
    }
  }

  async function nativeShare() {
    if (!publicShareUrl || typeof navigator.share !== "function") {
      await copyText(publicShareUrl, t("messages.linkCopied"));
      return;
    }

    try {
      await navigator.share({
        title: course?.title || "321Academy course",
        text: marketing.summary || course?.description || "",
        url: publicShareUrl,
      });
      setShareMessage(t("messages.shareDialogOpened"));
    } catch {
      // User cancellation is fine; no noisy error needed.
    }
  }

  function buildSuggestedImagePrompt() {
    if (!course) return "";

    const courseDescription = marketing.summary || course.description;
    const salesAngle = marketing.salesText || course.targetAudience;

    return [
      t("aiPrompt.line1"),
      t("aiPrompt.line2"),
      t("aiPrompt.line3"),
      t("aiPrompt.line4"),
      t("aiPrompt.line5"),
      t("aiPrompt.line6"),
      t("aiPrompt.courseTitle", { value: course.title || t("aiPrompt.courseFallback") }),
      courseDescription ? t("aiPrompt.courseDescription", { value: courseDescription }) : "",
      course.learningGoals ? t("aiPrompt.learningGoals", { value: course.learningGoals }) : "",
      course.targetAudience ? t("aiPrompt.targetAudience", { value: course.targetAudience }) : "",
      salesAngle ? t("aiPrompt.salesAngle", { value: salesAngle }) : "",
      course.language ? t("aiPrompt.courseLanguage", { value: course.language }) : "",
      course.level ? t("aiPrompt.level", { value: course.level }) : "",
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

      if (!file.type.startsWith("image/")) throw new Error(t("errors.chooseImage"));
      if (file.size > 8 * 1024 * 1024) throw new Error(t("errors.imageTooLarge"));

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
      setImageMessage(t("messages.imageUploaded"));
    } catch (err) {
      console.error("Failed to upload course image", err);
      setError(getErrorMessage(err) || t("errors.uploadFailed"));
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
        throw new Error(t("errors.imagePromptRequired"));
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
      if (!res.ok) throw new Error(data.error || t("errors.imageGenerationFailed"));

      const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : typeof data.url === "string" ? data.url : "";
      if (!imageUrl) throw new Error(t("errors.noImageReturned"));

      setMarketing((prev) => ({
        ...prev,
        coverImageUrl: imageUrl,
        coverImageSource: "ai",
      }));
      setCoverMode("ai");
      setImageMessage(t("messages.imageGenerated"));
    } catch (err) {
      console.error("Failed to generate course image", err);
      setError(getErrorMessage(err) || t("errors.imageGenerationFailed"));
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
        throw new Error(data.error || t("errors.marketingGenerationFailed"));
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
      setMarketingMessage(t("messages.marketingGenerated"));
    } catch (err) {
      console.error("Failed to generate marketing text", err);
      setError(getErrorMessage(err) || t("errors.marketingGenerationFailed"));
    } finally {
      setGeneratingMarketing(false);
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
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save marketing");

      const refreshed = await fetchTeacherCourse(user, course.id);
      setCourse(refreshed);
      setMarketing(refreshed.marketing);
    } catch (err) {
      console.error("Failed to save marketing", err);
      setError(t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-4 text-sm text-slate-500">{t("loading")}</div>;
  }

  if (!course) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error || t("errors.notFound")}</div>;
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
      <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="m-0 text-2xl font-black text-slate-950">{t("title")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {t("intro")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/${locale}/teacher/courses/${course.id}/preview`}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
            >
              {t("actions.preview")}
            </Link>
            {course.publicUrl ? (
              <a
                href={course.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 text-sm font-bold text-white no-underline hover:bg-slate-800"
              >
                {t("actions.openPublicPage")}
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <div>
          <h2 className="m-0 text-lg font-extrabold text-slate-950">{t("share.title")}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {t("share.intro")}
          </p>
        </div>

        {!publicShareUrl ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            {t("share.publishFirst")}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="grid gap-3">
              <Field label={t("share.link")}>
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <Input value={publicShareUrl} readOnly />
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => void copyText(publicShareUrl, t("messages.linkCopied"))}
                  >
                    {t("actions.copyLink")}
                  </Button>
                </div>
              </Field>

              <Field label={t("share.text")}>
                <Textarea
                  value={shareText}
                  readOnly
                  rows={5}
                />
              </Field>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => void copyText(shareText, t("messages.shareTextCopied"))}>
                  {t("actions.copyText")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => void nativeShare()}>
                  {t("actions.share")}
                </Button>
                <a
                  href={facebookShareHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
                >
                  Facebook
                </a>
                <a
                  href={linkedInShareHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
                >
                  LinkedIn
                </a>
              </div>

              {shareMessage ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                  {shareMessage}
                </div>
              ) : null}
            </div>

            <div className="grid content-start gap-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt={t("share.qrAlt")} className="aspect-square w-full" />
                ) : (
                  <div className="grid aspect-square place-items-center rounded-md bg-slate-100 text-sm font-bold text-slate-500">
                    {t("share.qrFallback")}
                  </div>
                )}
              </div>
              {qrDataUrl ? (
                <a
                  href={qrDataUrl}
                  download={`${course.slug || "course"}-qr.png`}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
                >
                  {t("actions.downloadQr")}
                </a>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <h2 className="m-0 text-lg font-extrabold text-slate-950">{t("fields.marketingFields")}</h2>
        <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4">
            <div>
              <h3 className="m-0 text-base font-extrabold text-slate-950">{t("fields.courseImage")}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t("fields.imageLocked")}
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
                {t("actions.uploadImage")}
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
                {t("actions.generateWithAi")}
              </button>
            </div>

            {coverMode === "upload" ? (
              <div className="grid gap-3">
                <Field label={t("fields.uploadImage")}>
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
                <Field label={t("fields.pasteImageUrl")}>
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
                  {uploadingImage ? t("image.uploading") : t("image.uploadHelp")}
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                <Field label={t("fields.imageStyle")}>
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
                    <option value="illustration">{t("image.illustration")}</option>
                    <option value="realistic">{t("image.realistic")}</option>
                  </select>
                </Field>
                <Field label={t("fields.aiImagePrompt")}>
                  <Textarea
                    value={marketing.coverImagePrompt}
                    onChange={(event) => updateMarketing("coverImagePrompt", event.target.value)}
                    rows={4}
                    placeholder={t("image.promptPlaceholder")}
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => updateMarketing("coverImagePrompt", buildSuggestedImagePrompt())}
                  >
                    {t("actions.useSuggestedPrompt")}
                  </Button>
                  <span className="text-xs font-semibold text-slate-500">
                    {t("image.promptHelp")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={generatingImage || !marketing.coverImagePrompt.trim()}
                    onClick={() => void generateCourseImage()}
                  >
                    {generatingImage ? t("actions.generatingImage") : t("actions.generateImage")}
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
                    {t("actions.removeImage")}
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
                    alt={course.title || t("image.previewAlt")}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{t("image.placeholder")}</span>
                )}
              </div>
            </div>
            <div className="text-xs font-semibold text-slate-500">
              {t("image.source", {
                source:
                  marketing.coverImageSource === "ai"
                    ? t("image.sourceAi")
                    : marketing.coverImageSource === "upload"
                      ? t("image.sourceUpload")
                      : t("image.sourceNone"),
              })}
            </div>
          </div>
        </div>
        <Field label={t("fields.shortSummary")}>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={generatingMarketing}
              onClick={() => void generateMarketingText()}
            >
              {generatingMarketing ? t("actions.generatingMarketing") : t("actions.generateMarketing")}
            </Button>
            <span className="text-xs font-semibold text-slate-500">
              {t("image.promptHelp")}
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
            placeholder={t("placeholders.summary")}
          />
        </Field>
        <Field label={t("fields.salesText")}>
          <Textarea
            value={marketing.salesText}
            onChange={(event) => updateMarketing("salesText", event.target.value)}
            rows={5}
            placeholder={t("placeholders.salesText")}
          />
        </Field>
        <Field label={t("fields.seoTitle")}>
          <Input value={marketing.seoTitle} onChange={(event) => updateMarketing("seoTitle", event.target.value)} />
        </Field>
        <Field label={t("fields.seoDescription")}>
          <Textarea
            value={marketing.seoDescription}
            onChange={(event) => updateMarketing("seoDescription", event.target.value)}
            rows={3}
          />
        </Field>
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.push(`/${locale}/teacher/courses/${course.id}`)}>
          {t("actions.backToDashboard")}
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? t("actions.saving") : t("actions.save")}
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
