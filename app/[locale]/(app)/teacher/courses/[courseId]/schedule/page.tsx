"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { AcademyGate } from "../../AcademyGate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { type Course, normalizeCoursePlan } from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { fetchTeacherCourse } from "../courseClient";

export default function CourseSchedulePage() {
  return (
    <AcademyGate>
      <CourseScheduleContent />
    </AcademyGate>
  );
}

function CourseScheduleContent() {
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ courseId?: string }>();
  const courseId = typeof params?.courseId === "string" ? params.courseId : "";
  const { user } = useUserProfile();
  const [course, setCourse] = useState<Course | null>(null);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
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
        if (cancelled) return;

        setCourse(loadedCourse);
        const firstWithDate = loadedCourse.coursePlan.find((session) => session.startsAt);
        if (firstWithDate?.startsAt) {
          const local = toDateTimeLocalValue(firstWithDate.startsAt);
          setStartDate(local.slice(0, 10));
          setStartTime(local.slice(11, 16) || "18:00");
        }
        setDurationMinutes(loadedCourse.coursePlan[0]?.durationMinutes || 120);
      } catch (err) {
        console.error("Failed to load schedule", err);
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

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !course || saving) return;

    try {
      setSaving(true);
      setError("");
      const token = await user.getIdToken();
      const baseDate = startDate && startTime ? new Date(`${startDate}T${startTime}`) : null;
      const coursePlan = course.coursePlan.map((session, index) => {
        const startsAt =
          baseDate && !Number.isNaN(baseDate.getTime())
            ? new Date(baseDate.getTime() + index * 7 * 24 * 60 * 60 * 1000).toISOString()
            : session.startsAt;

        return {
          ...session,
          startsAt,
          durationMinutes,
        };
      });

      const res = await fetch(`/api/teacher/courses/${encodeURIComponent(course.id)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...course,
          coursePlan: normalizeCoursePlan(coursePlan),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save schedule");

      router.push(`/${locale}/teacher/courses/${course.id}`);
    } catch (err) {
      console.error("Failed to save schedule", err);
      setError("Planen kunne ikke lagres akkurat nå.");
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Laster plan...</div>;
  }

  if (!course) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error || "Fant ikke kurs."}</div>;
  }

  return (
    <main className="mx-auto max-w-4xl">
      <form onSubmit={saveSchedule} className="grid gap-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="m-0 text-2xl font-black text-slate-950">Schedule</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Sett startdato og tidspunkt. Første versjon legger samlingene ukentlig utover.
          </p>
        </section>

        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
          <Field label="Startdato">
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </Field>
          <Field label="Klokkeslett">
            <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </Field>
          <Field label="Varighet minutter">
            <Input type="number" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} />
          </Field>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
          <h2 className="m-0 text-lg font-extrabold text-slate-950">Forhåndsvisning</h2>
          <div className="mt-3 grid gap-2">
            {course.coursePlan.map((session, index) => (
              <div key={session.sessionNumber} className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                Samling {session.sessionNumber}: {previewDate(startDate, startTime, index)} · {session.title || "Uten tittel"}
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.push(`/${locale}/teacher/courses/${course.id}`)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving..." : "Save schedule"}
          </Button>
        </div>
      </form>
    </main>
  );
}

function toDateTimeLocalValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function previewDate(startDate: string, startTime: string, index: number): string {
  if (!startDate || !startTime) return "Dato ikke satt";
  const date = new Date(`${startDate}T${startTime}`);
  if (Number.isNaN(date.getTime())) return "Dato ikke satt";
  return new Date(date.getTime() + index * 7 * 24 * 60 * 60 * 1000).toLocaleString();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}
