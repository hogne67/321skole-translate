"use client";

import { FormEvent, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { AcademyGate } from "../AcademyGate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { DEFAULT_COURSE_FORM, type CourseFormValues, type CourseStatus } from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";

export default function NewCoursePage() {
  return (
    <AcademyGate>
      <NewCourseContent />
    </AcademyGate>
  );
}

function NewCourseContent() {
  const locale = useLocale();
  const router = useRouter();
  const { user } = useUserProfile();
  const [values, setValues] = useState<CourseFormValues>(DEFAULT_COURSE_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateField<K extends keyof CourseFormValues>(key: K, value: CourseFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.uid || saving) return;

    const title = values.title.trim();
    if (!title) {
      setError("Tittel må fylles ut.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/courses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
        title,
        description: values.description.trim(),
        learningGoals: values.learningGoals.trim(),
        targetAudience: values.targetAudience.trim(),
        language: values.language.trim(),
        level: values.level.trim(),
        priceText: values.priceText.trim(),
        maxParticipants: values.maxParticipants,
        numberOfSessions: values.numberOfSessions,
        numberOfWeeks: values.numberOfWeeks,
        status: values.status,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        courseId?: string;
        error?: string;
      };

      if (!res.ok || !data.courseId) {
        throw new Error(data.error || "Could not create course");
      }

      router.push(`/${locale}/teacher/courses/${data.courseId}`);
    } catch (err) {
      console.error("Failed to create course", err);
      setError("Kurset kunne ikke lagres akkurat nå.");
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl">
      <form onSubmit={handleSubmit} className="grid gap-5">
        <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <h1 className="m-0 text-2xl font-black text-slate-950">Create course</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Opprett et kursutkast for 321Academy. Du kan bygge plan, innhold og innstillinger i
            neste steg.
          </p>
        </section>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <Field label="Title">
            <Input
              value={values.title}
              onChange={(event) => updateField("title", event.target.value)}
              required
            />
          </Field>

          <Field label="Description">
            <Textarea
              value={values.description}
              onChange={(event) => updateField("description", event.target.value)}
              rows={4}
            />
          </Field>

          <Field label="Learning goals">
            <Textarea
              value={values.learningGoals}
              onChange={(event) => updateField("learningGoals", event.target.value)}
              rows={4}
            />
          </Field>

          <Field label="Target audience">
            <Textarea
              value={values.targetAudience}
              onChange={(event) => updateField("targetAudience", event.target.value)}
              rows={3}
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Language">
              <Input
                value={values.language}
                onChange={(event) => updateField("language", event.target.value)}
              />
            </Field>

            <Field label="Level">
              <Select
                value={values.level}
                onChange={(event) => updateField("level", event.target.value)}
              >
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </Select>
            </Field>

            <Field label="Price text">
              <Input
                value={values.priceText}
                onChange={(event) => updateField("priceText", event.target.value)}
                placeholder="F.eks. Gratis pilot"
              />
            </Field>

            <Field label="Status">
              <Select
                value={values.status}
                onChange={(event) => updateField("status", event.target.value as CourseStatus)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </Select>
            </Field>

            <Field label="Max participants">
              <Input
                type="number"
                min={0}
                value={values.maxParticipants}
                onChange={(event) => updateField("maxParticipants", Number(event.target.value))}
              />
            </Field>

            <Field label="Number of sessions">
              <Input
                type="number"
                min={0}
                value={values.numberOfSessions}
                onChange={(event) => updateField("numberOfSessions", Number(event.target.value))}
              />
            </Field>

            <Field label="Number of weeks">
              <Input
                type="number"
                min={0}
                value={values.numberOfWeeks}
                onChange={(event) => updateField("numberOfWeeks", Number(event.target.value))}
              />
            </Field>
          </div>
        </section>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.push(`/${locale}/teacher/courses`)}>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}
