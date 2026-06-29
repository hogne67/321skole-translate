"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { AcademyGate } from "../../AcademyGate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { type Course, type CourseMarketing } from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { CourseWorkspaceNav } from "../CourseWorkspaceNav";
import { fetchTeacherCourse } from "../courseClient";

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
    summary: "",
    salesText: "",
    seoTitle: "",
    seoDescription: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  function updateMarketing<K extends keyof CourseMarketing>(key: K, value: CourseMarketing[K]) {
    setMarketing((prev) => ({ ...prev, [key]: value }));
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
          Første flate for bilde, salgstekst og offentlig presentasjon. AI-bilde og opplasting kommer senere.
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
        <Field label="Course image">
          <Input
            value={marketing.coverImageUrl}
            onChange={(event) => updateMarketing("coverImageUrl", event.target.value)}
            placeholder="https://..."
          />
        </Field>
        {marketing.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={marketing.coverImageUrl}
            alt=""
            className="max-h-72 w-full rounded-lg border border-slate-200 object-cover"
          />
        ) : null}
        <Field label="Short public summary">
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
