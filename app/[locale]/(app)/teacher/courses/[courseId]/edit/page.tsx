"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { AcademyGate } from "../../AcademyGate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  DEFAULT_COURSE_FORM,
  normalizeCoursePlan,
  type CourseFormValues,
} from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { CourseWorkspaceNav } from "../CourseWorkspaceNav";
import { fetchTeacherCourse } from "../courseClient";

const COURSE_LEVEL_OPTIONS = [
  { value: "a1start", label: "A1 start" },
  { value: "A1", label: "A1" },
  { value: "A2", label: "A2" },
  { value: "B1", label: "B1" },
  { value: "B2", label: "B2" },
  { value: "C1", label: "C1" },
  { value: "C2", label: "C2" },
];

export default function EditCoursePage() {
  return (
    <AcademyGate>
      <EditCourseContent />
    </AcademyGate>
  );
}

function EditCourseContent() {
  const locale = useLocale();
  const t = useTranslations("academy.editCourse");
  const router = useRouter();
  const params = useParams<{ courseId?: string }>();
  const courseId = typeof params?.courseId === "string" ? params.courseId : "";
  const { user } = useUserProfile();

  const [values, setValues] = useState<CourseFormValues>(DEFAULT_COURSE_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCourse() {
      if (!user || !courseId) {
        setLoading(false);
        setError(t("errors.notFound"));
        return;
      }

      try {
        setLoading(true);
        setError("");

        const course = await fetchTeacherCourse(user, courseId);
        if (course.ownerUid !== user.uid) {
          setError(t("errors.ownerOnly"));
          return;
        }

        if (!cancelled) {
          setValues({
            title: course.title,
            description: course.description,
            learningGoals: course.learningGoals,
            targetAudience: course.targetAudience,
            language: course.language,
            level: normalizeCourseLevel(course.level),
            priceText: course.priceText,
            maxParticipants: course.maxParticipants,
            numberOfSessions: course.numberOfSessions,
            numberOfWeeks: course.numberOfWeeks,
            status: course.status,
            coursePlan: course.coursePlan,
          });
        }
      } catch (err) {
        console.error("Failed to load course for edit", err);
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

  function updateField<K extends keyof CourseFormValues>(key: K, value: CourseFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || saving || !courseId) return;

    const title = values.title.trim();
    if (!title) {
      setError(t("errors.titleRequired"));
      return;
    }

    try {
      setSaving(true);
      setError("");

      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/courses/${encodeURIComponent(courseId)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...values,
          title,
          description: values.description.trim(),
          learningGoals: values.learningGoals.trim(),
          targetAudience: values.targetAudience.trim(),
          language: values.language.trim(),
          level: normalizeCourseLevel(values.level),
          priceText: values.priceText.trim(),
          coursePlan: normalizeCoursePlan(values.coursePlan),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not update course");

      router.push(`/${locale}/teacher/courses/${courseId}`);
    } catch (err) {
      console.error("Failed to update course", err);
      setError(t("errors.saveFailed"));
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-4 text-sm text-slate-500">
        {t("loading")}
      </div>
    );
  }

  return (
    <main className="mx-auto grid max-w-4xl gap-5">
      <CourseWorkspaceNav
        locale={locale}
        courseId={courseId}
        title={values.title}
        status={values.status}
        active="edit"
      />
      <form onSubmit={handleSubmit} className="grid gap-5">
        <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <h1 className="m-0 text-2xl font-black text-slate-950">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {t("intro")}
          </p>
        </section>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <Field label={t("fields.title")}>
            <Input value={values.title} onChange={(event) => updateField("title", event.target.value)} required />
          </Field>

          <Field label={t("fields.description")}>
            <Textarea value={values.description} onChange={(event) => updateField("description", event.target.value)} rows={4} />
          </Field>

          <Field label={t("fields.learningGoals")}>
            <Textarea value={values.learningGoals} onChange={(event) => updateField("learningGoals", event.target.value)} rows={4} />
          </Field>

          <Field label={t("fields.targetAudience")}>
            <Textarea value={values.targetAudience} onChange={(event) => updateField("targetAudience", event.target.value)} rows={3} />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("fields.language")}>
              <LockedValue
                value={values.language || "-"}
                note={t("notes.language")}
              />
            </Field>

            <Field label={t("fields.level")}>
              <LockedValue
                value={formatCourseLevel(values.level)}
                note={t("notes.level")}
              />
            </Field>

            <Field label={t("fields.maxParticipants")}>
              <Input type="number" min={0} value={values.maxParticipants} onChange={(event) => updateField("maxParticipants", Number(event.target.value))} />
              <p className="m-0 text-xs font-semibold leading-5 text-amber-700">
                {t("notes.maxParticipants")}
              </p>
            </Field>

            <Field label={t("fields.status")}>
              <LockedValue
                value={values.status}
                note={t("notes.status")}
              />
            </Field>

            <Field label={t("fields.numberOfSessions")}>
              <LockedValue
                value={String(values.numberOfSessions)}
                note={t("notes.sessions")}
              />
            </Field>

            <Field label={t("fields.numberOfWeeks")}>
              <LockedValue
                value={String(values.numberOfWeeks)}
                note={t("notes.weeks")}
              />
            </Field>
          </div>
        </section>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.push(`/${locale}/teacher/courses/${courseId}`)}>
            {t("actions.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? t("actions.saving") : t("actions.save")}
          </Button>
        </div>
      </form>
    </main>
  );
}

function normalizeCourseLevel(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "a1start";
  if (normalized === "A1_START") return "a1start";
  if (normalized === "Beginner") return "a1start";
  if (normalized === "Intermediate") return "B1";
  if (normalized === "Advanced") return "C1";
  return normalized;
}

function formatCourseLevel(value: string): string {
  const normalized = normalizeCourseLevel(value);
  return COURSE_LEVEL_OPTIONS.find((level) => level.value === normalized)?.label ?? normalized;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}

function LockedValue({ value, note }: { value: string; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-sm font-black text-slate-950">{value}</div>
      <p className="m-0 mt-1 text-xs font-semibold leading-5 text-slate-500">{note}</p>
    </div>
  );
}
