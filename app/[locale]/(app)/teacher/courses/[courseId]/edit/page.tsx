"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { AcademyGate } from "../../AcademyGate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import {
  DEFAULT_COURSE_FORM,
  normalizeCoursePlan,
  syncCoursePlanSessionCount,
  type CourseFormValues,
  type CourseStatus,
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
  const router = useRouter();
  const params = useParams<{ courseId?: string }>();
  const courseId = typeof params?.courseId === "string" ? params.courseId : "";
  const { user } = useUserProfile();

  const [values, setValues] = useState<CourseFormValues>(DEFAULT_COURSE_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCourse() {
      if (!user || !courseId) {
        setLoading(false);
        setError("Fant ikke kurs.");
        return;
      }

      try {
        setLoading(true);
        setError("");

        const course = await fetchTeacherCourse(user, courseId);
        if (course.ownerUid !== user.uid) {
          setError("Bare eier kan redigere dette kurset.");
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
            coursePlan: syncCoursePlanSessionCount(course.coursePlan, course.numberOfSessions),
          });
        }
      } catch (err) {
        console.error("Failed to load course for edit", err);
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

  function updateField<K extends keyof CourseFormValues>(key: K, value: CourseFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSessionCountChange(nextCount: number) {
    setValues((prev) => {
      const nextPlan = syncCoursePlanSessionCount(prev.coursePlan, nextCount);
      setWarning(
        nextCount < prev.coursePlan.length
          ? "Antall økter er lavere enn planen. Eksisterende økter beholdes til du rydder dem manuelt senere."
          : ""
      );

      return {
        ...prev,
        numberOfSessions: nextCount,
        coursePlan: nextPlan,
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || saving || !courseId) return;

    const title = values.title.trim();
    if (!title) {
      setError("Tittel må fylles ut.");
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
      setError("Kurset kunne ikke lagres akkurat nå.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Laster kurs...
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
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="m-0 text-2xl font-black text-slate-950">Edit course</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Oppdater overordnet kursinformasjon. Samlinger, datoer og ressurser redigeres i Edit sessions.
          </p>
        </section>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {warning ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {warning}
          </div>
        ) : null}

        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <Field label="Title">
            <Input value={values.title} onChange={(event) => updateField("title", event.target.value)} required />
          </Field>

          <Field label="Description">
            <Textarea value={values.description} onChange={(event) => updateField("description", event.target.value)} rows={4} />
          </Field>

          <Field label="Learning goals">
            <Textarea value={values.learningGoals} onChange={(event) => updateField("learningGoals", event.target.value)} rows={4} />
          </Field>

          <Field label="Target audience">
            <Textarea value={values.targetAudience} onChange={(event) => updateField("targetAudience", event.target.value)} rows={3} />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Language">
              <Input value={values.language} onChange={(event) => updateField("language", event.target.value)} />
            </Field>

            <Field label="Level">
              <Select value={values.level} onChange={(event) => updateField("level", event.target.value)}>
                {COURSE_LEVEL_OPTIONS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Price text">
              <Input value={values.priceText} onChange={(event) => updateField("priceText", event.target.value)} />
            </Field>

            <Field label="Status">
              <Select value={values.status} onChange={(event) => updateField("status", event.target.value as CourseStatus)}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </Select>
            </Field>

            <Field label="Max participants">
              <Input type="number" min={0} value={values.maxParticipants} onChange={(event) => updateField("maxParticipants", Number(event.target.value))} />
            </Field>

            <Field label="Number of sessions">
              <Input type="number" min={0} value={values.numberOfSessions} onChange={(event) => handleSessionCountChange(Number(event.target.value))} />
            </Field>

            <Field label="Number of weeks">
              <Input type="number" min={0} value={values.numberOfWeeks} onChange={(event) => updateField("numberOfWeeks", Number(event.target.value))} />
            </Field>
          </div>
        </section>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.push(`/${locale}/teacher/courses/${courseId}`)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving..." : "Save course"}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}
