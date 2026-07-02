"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { AcademyGate } from "../../AcademyGate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { db } from "@/lib/firebase";
import { loadMyContent, type ContentItem } from "@/lib/contentFeed";
import {
  normalizeCoursePlan,
  type Course,
  type CoursePlanSession,
  type CourseSessionResource,
  type CourseSessionResourceType,
  type CourseSessionResourceVisibility,
  type CourseSessionStatus,
} from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { CourseWorkspaceNav } from "../CourseWorkspaceNav";
import { fetchTeacherCourse } from "../courseClient";

type LibraryLesson = {
  id: string;
  title?: string;
  level?: string;
  language?: string;
  textType?: string;
  texttype?: string;
  lessonType?: string;
  isActive?: boolean;
  status?: string;
  visibility?: string;
  publishVisibility?: string;
  showInLibrary?: boolean;
  href: string;
};

type PickerMode = "myContent" | "library";
type ScheduleRepeat = "weekdays" | "weekly" | "biweekly" | "monthly";

export default function CourseSessionsPage() {
  return (
    <AcademyGate>
      <CourseSessionsContent />
    </AcademyGate>
  );
}

function CourseSessionsContent() {
  const locale = useLocale();
  const t = useTranslations("academy.sessions");
  const router = useRouter();
  const params = useParams<{ courseId?: string }>();
  const courseId = typeof params?.courseId === "string" ? params.courseId : "";
  const { user } = useUserProfile();
  const [course, setCourse] = useState<Course | null>(null);
  const [coursePlan, setCoursePlan] = useState<CoursePlanSession[]>([]);
  const [myLessons, setMyLessons] = useState<Array<Extract<ContentItem, { type: "lesson" }>>>([]);
  const [libraryLessons, setLibraryLessons] = useState<LibraryLesson[]>([]);
  const [picker, setPicker] = useState<{ sessionIndex: number; mode: PickerMode } | null>(null);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [scheduleRepeat, setScheduleRepeat] = useState<ScheduleRepeat>("weekly");
  const [expandedSessions, setExpandedSessions] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
          setCoursePlan(loadedCourse.coursePlan);
          const firstWithDate = loadedCourse.coursePlan.find((session) => session.startsAt);
          if (firstWithDate?.startsAt) {
            const local = toDateTimeLocalValue(firstWithDate.startsAt);
            setStartDate(local.slice(0, 10));
            setStartTime(local.slice(11, 16) || "18:00");
          }
          setDurationMinutes(loadedCourse.coursePlan[0]?.durationMinutes || 120);
        }
      } catch (err) {
        console.error("Failed to load sessions", err);
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

  useEffect(() => {
    let cancelled = false;

    async function loadLessons() {
      if (!user?.uid) return;

      try {
        const result = await loadMyContent({
          db,
          uid: user.uid,
          mode: "teacher",
          isAnon: user.isAnonymous,
          locale,
        });
        if (!cancelled) {
          setMyLessons(
            result.items.filter((item): item is Extract<ContentItem, { type: "lesson" }> => item.type === "lesson")
          );
        }
      } catch (err) {
        console.error("Failed to load my content for courses", err);
      }
    }

    void loadLessons();

    return () => {
      cancelled = true;
    };
  }, [locale, user]);

  useEffect(() => {
    const qy = query(
      collection(db, "published_lessons"),
      where("isActive", "==", true),
      orderBy("createdAt", "desc"),
      limit(300)
    );

    return onSnapshot(
      qy,
      (snap) => {
        setLibraryLessons(
          snap.docs
            .map((docSnap) => {
              const data = docSnap.data() as Omit<LibraryLesson, "id" | "href">;
              return {
                id: docSnap.id,
                ...data,
                href: `/${locale}/lesson/${docSnap.id}`,
              };
            })
            .filter(shouldShowInLibrary)
        );
      },
      (err) => {
        console.error("Failed to load library lessons for courses", err);
      }
    );
  }, [locale]);

  function updateSession<K extends keyof Omit<CoursePlanSession, "sessionNumber">>(
    index: number,
    key: K,
    value: CoursePlanSession[K]
  ) {
    setCoursePlan((prev) =>
      prev.map((session, sessionIndex) =>
        sessionIndex === index ? { ...session, [key]: value } : session
      )
    );
  }

  function addResource(sessionIndex: number) {
    setCoursePlan((prev) =>
      prev.map((session, index) =>
        index === sessionIndex
          ? {
              ...session,
              resources: [
                ...session.resources,
                {
                  id: `resource-${Date.now().toString(36)}-${session.resources.length + 1}`,
                  type: "link",
                  visibility: "participants",
                  sourceId: "",
                  sourceType: "",
                  title: "",
                  url: "",
                  description: "",
                },
              ],
            }
          : session
      )
    );
  }

  function updateResource<K extends keyof CourseSessionResource>(
    sessionIndex: number,
    resourceIndex: number,
    key: K,
    value: CourseSessionResource[K]
  ) {
    setCoursePlan((prev) =>
      prev.map((session, index) =>
        index === sessionIndex
          ? {
              ...session,
              resources: session.resources.map((resource, currentIndex) =>
                currentIndex === resourceIndex ? { ...resource, [key]: value } : resource
              ),
            }
          : session
      )
    );
  }

  function removeResource(sessionIndex: number, resourceIndex: number) {
    setCoursePlan((prev) =>
      prev.map((session, index) =>
        index === sessionIndex
          ? {
              ...session,
              resources: session.resources.filter((_, currentIndex) => currentIndex !== resourceIndex),
            }
          : session
      )
    );
  }

  function applyQuickSchedule() {
    const baseDate = startDate && startTime ? new Date(`${startDate}T${startTime}`) : null;

    setCoursePlan((prev) =>
      prev.map((session, index) => {
        const startsAt =
          baseDate && !Number.isNaN(baseDate.getTime())
            ? addScheduleInterval(baseDate, index, scheduleRepeat).toISOString()
            : session.startsAt;

        return {
          ...session,
          startsAt,
          durationMinutes,
        };
      })
    );
  }

  function addSession() {
    let nextSessionNumber = 1;
    setCoursePlan((prev) => {
      const previous = prev.at(-1);
      const sessionNumber = (previous?.sessionNumber ?? prev.length) + 1;
      nextSessionNumber = sessionNumber;
      return [
        ...prev,
        {
          sessionNumber,
          title: "",
          description: "",
          contentSuggestions: "",
          resources: [],
          startsAt: "",
          durationMinutes: previous?.durationMinutes || durationMinutes || 120,
          meetingUrl: "",
          homework: "",
          status: "planned",
        },
      ];
    });
    setExpandedSessions((prev) => ({ ...prev, [nextSessionNumber]: true }));
  }

  function removeSession(sessionNumber: number) {
    const ok = window.confirm(t("session.confirmRemove", { number: sessionNumber }));
    if (!ok) return;

    setCoursePlan((prev) =>
      prev
        .filter((session) => session.sessionNumber !== sessionNumber)
        .map((session, index) => ({
          ...session,
          sessionNumber: index + 1,
        }))
    );
    setExpandedSessions((prev) => {
      const next: Record<number, boolean> = {};
      for (const [key, value] of Object.entries(prev)) {
        const current = Number(key);
        if (!Number.isFinite(current) || current === sessionNumber) continue;
        next[current > sessionNumber ? current - 1 : current] = value;
      }
      return next;
    });
  }

  function toggleSession(sessionNumber: number) {
    setExpandedSessions((prev) => ({ ...prev, [sessionNumber]: !prev[sessionNumber] }));
  }

  async function saveSessions(event: FormEvent<HTMLFormElement>) {
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
          coursePlan: normalizeCoursePlan(coursePlan),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save sessions");

      router.push(`/${locale}/teacher/courses/${course.id}`);
    } catch (err) {
      console.error("Failed to save sessions", err);
      setError(t("errors.saveFailed"));
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
        active="sessions"
      />
      <form onSubmit={saveSessions} className="grid gap-5">
        <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="m-0 text-2xl font-black text-slate-950">{t("title")}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {t("intro")}
              </p>
            </div>
          </div>
        </section>

        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
          <div className="rounded-xl border border-emerald-200 bg-white/95 p-2 shadow-xl backdrop-blur">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 min-w-56 items-center justify-center rounded-xl border border-emerald-700 bg-emerald-700 px-8 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? t("actions.saving") : t("actions.save")}
            </button>
          </div>
        </div>

        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

        <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-950">{t("quickSchedule.title")}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {t("quickSchedule.intro")}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label={t("quickSchedule.fields.startDate")}>
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </Field>
            <Field label={t("quickSchedule.fields.time")}>
              <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </Field>
            <Field label={t("quickSchedule.fields.duration")}>
              <Input type="number" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} />
            </Field>
            <Field label={t("quickSchedule.fields.repeat")}>
              <Select value={scheduleRepeat} onChange={(event) => setScheduleRepeat(event.target.value as ScheduleRepeat)}>
                <option value="weekdays">{t("quickSchedule.repeat.weekdays")}</option>
                <option value="weekly">{t("quickSchedule.repeat.weekly")}</option>
                <option value="biweekly">{t("quickSchedule.repeat.biweekly")}</option>
                <option value="monthly">{t("quickSchedule.repeat.monthly")}</option>
              </Select>
            </Field>
          </div>
          <div className="rounded-lg border border-sky-200 bg-white p-3 text-sm font-semibold leading-6 text-slate-700">
            {t("quickSchedule.note")}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={applyQuickSchedule}>
                {t("actions.apply")}
              </Button>
          </div>
        </section>

        <section className="grid gap-3">
          {coursePlan.map((session, index) => {
            const expanded = expandedSessions[session.sessionNumber] === true;

            return (
              <div key={session.sessionNumber} className="overflow-hidden rounded-lg border border-sky-100 bg-sky-50/80 shadow-sm">
                <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${sessionToneClass(session.status)}`}>
                  <div className="min-w-0">
                    <div className="text-xs font-black uppercase tracking-wide opacity-70">
                      {t("session.label", { number: session.sessionNumber })}
                    </div>
                    <h2 className="m-0 mt-1 truncate text-base font-black">
                      {session.title || t("session.untitled")}
                    </h2>
                  </div>
                  <div className="text-right text-sm font-extrabold">
                    {formatCompactSessionDate(session.startsAt, t("session.dateNotSet"))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <p className="m-0 min-w-0 flex-1 truncate text-sm text-slate-600">
                    {session.description || t("session.noDescription")}
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleSession(session.sessionNumber)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg font-black text-slate-900 hover:bg-slate-50"
                    aria-expanded={expanded}
                    aria-label={
                      expanded
                        ? t("session.closeAria", { number: session.sessionNumber })
                        : t("session.openAria", { number: session.sessionNumber })
                    }
                  >
                    {expanded ? "−" : "+"}
                  </button>
                </div>

                {expanded ? (
                  <div className="grid gap-4 border-t border-sky-200 bg-sky-100 p-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link
                        href={`/${locale}/teacher/courses/${course.id}/sessions/${session.sessionNumber}`}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 px-3 text-sm font-bold text-white no-underline hover:bg-emerald-800"
                      >
                        {t("actions.openSessionRoom")}
                      </Link>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => removeSession(session.sessionNumber)}
                      >
                        {t("actions.removeSession")}
                      </Button>
                    </div>

                    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label={t("fields.startsAt")}>
                          <Input
                            type="datetime-local"
                            value={toDateTimeLocalValue(session.startsAt)}
                            onChange={(event) => updateSession(index, "startsAt", fromDateTimeLocalValue(event.target.value))}
                          />
                        </Field>
                        <Field label={t("fields.durationMinutes")}>
                          <Input
                            type="number"
                            min={0}
                            value={session.durationMinutes}
                            onChange={(event) => updateSession(index, "durationMinutes", Number(event.target.value))}
                          />
                        </Field>
                        <Field label={t("fields.meetingUrl")}>
                          <Input value={session.meetingUrl} onChange={(event) => updateSession(index, "meetingUrl", event.target.value)} placeholder="https://..." />
                        </Field>
                        <Field label={t("fields.status")}>
                          <Select value={session.status} onChange={(event) => updateSession(index, "status", event.target.value as CourseSessionStatus)}>
                            <option value="planned">{t("status.planned")}</option>
                            <option value="completed">{t("status.completed")}</option>
                            <option value="cancelled">{t("status.cancelled")}</option>
                          </Select>
                        </Field>
                      </div>
                    </div>

                    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
                      <Field label={t("fields.title")}>
                        <Input value={session.title} onChange={(event) => updateSession(index, "title", event.target.value)} />
                      </Field>
                      <Field label={t("fields.description")}>
                        <Textarea value={session.description} onChange={(event) => updateSession(index, "description", event.target.value)} rows={3} />
                      </Field>
                      <Field label={t("fields.contentSuggestions")}>
                        <Textarea value={session.contentSuggestions} onChange={(event) => updateSession(index, "contentSuggestions", event.target.value)} rows={3} />
                      </Field>
                      <Field label={t("fields.homework")}>
                        <Textarea value={session.homework} onChange={(event) => updateSession(index, "homework", event.target.value)} rows={2} />
                      </Field>
                    </div>

                    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="m-0 text-base font-extrabold text-slate-950">{t("resources.title")}</h3>
                          <p className="mt-1 text-sm text-slate-600">
                            {t("resources.intro")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="secondary" size="sm" onClick={() => setPicker({ sessionIndex: index, mode: "myContent" })}>
                            {t("actions.addFromMyContent")}
                          </Button>
                          <Button type="button" variant="secondary" size="sm" onClick={() => setPicker({ sessionIndex: index, mode: "library" })}>
                            {t("actions.addFromLibrary")}
                          </Button>
                          <Button type="button" variant="secondary" size="sm" onClick={() => addResource(index)}>
                            {t("actions.addResource")}
                          </Button>
                        </div>
                      </div>

                      {session.resources.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                          {t("resources.empty")}
                        </div>
                      ) : (
                        <div className="grid gap-3">
                          {session.resources.map((resource, resourceIndex) => (
                            <div key={resource.id} className="grid gap-4 rounded-lg border border-sky-200 border-l-4 border-l-sky-500 bg-white p-4 shadow-sm">
                              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                                <div>
                                  <div className="text-xs font-black uppercase tracking-wide text-sky-700">
                                    {t("resources.label", { number: resourceIndex + 1 })}
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800">
                                      {resource.type}
                                    </span>
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
                                      {resource.visibility}
                                    </span>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="sm"
                                  onClick={() => removeResource(index, resourceIndex)}
                                >
                                  {t("actions.remove")}
                                </Button>
                              </div>
                              <div className="grid gap-3 md:grid-cols-3">
                                <Field label={t("fields.type")}>
                                  <Select
                                    value={resource.type}
                                    onChange={(event) =>
                                      updateResource(index, resourceIndex, "type", event.target.value as CourseSessionResourceType)
                                    }
                                  >
                                    <option value="link">{t("resources.type.link")}</option>
                                    <option value="pdf">{t("resources.type.pdf")}</option>
                                    <option value="platform">{t("resources.type.platform")}</option>
                                    <option value="note">{t("resources.type.note")}</option>
                                  </Select>
                                </Field>
                                <Field label={t("fields.visibility")}>
                                  <Select
                                    value={resource.visibility}
                                    onChange={(event) =>
                                      updateResource(index, resourceIndex, "visibility", event.target.value as CourseSessionResourceVisibility)
                                    }
                                  >
                                    <option value="participants">{t("resources.visibility.participants")}</option>
                                    <option value="teacher">{t("resources.visibility.teacher")}</option>
                                    <option value="public">{t("resources.visibility.public")}</option>
                                  </Select>
                                </Field>
                                <Field label={t("fields.title")}>
                                  <Input
                                    value={resource.title}
                                    onChange={(event) => updateResource(index, resourceIndex, "title", event.target.value)}
                                  />
                                </Field>
                              </div>
                              <Field label={t("fields.url")}>
                                <Input
                                  value={resource.url}
                                  onChange={(event) => updateResource(index, resourceIndex, "url", event.target.value)}
                                  placeholder={resource.type === "note" ? t("resources.optional") : "https://..."}
                                />
                              </Field>
                              <Field label={t("fields.description")}>
                                <Textarea
                                  value={resource.description}
                                  onChange={(event) => updateResource(index, resourceIndex, "description", event.target.value)}
                                  rows={2}
                                />
                              </Field>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => toggleSession(session.sessionNumber)}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 hover:bg-slate-50"
                      >
                        {t("actions.closeSession")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>

        <button
          type="button"
          onClick={addSession}
          className="rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 p-5 text-left transition hover:border-emerald-500 hover:bg-emerald-100"
        >
          <div className="text-base font-black text-emerald-950">{t("actions.addNewSession")}</div>
          <div className="mt-1 text-sm font-semibold text-emerald-800">
            {t("session.addNewDescription")}
          </div>
        </button>

        <div className="h-24" aria-hidden="true" />

      </form>

      {picker !== null ? (
        <ContentPicker
          mode={picker.mode}
          myLessons={myLessons}
          libraryLessons={libraryLessons}
          onClose={() => setPicker(null)}
          onPick={(lesson) => {
            if (picker.mode === "library") addLibraryResource(picker.sessionIndex, lesson as LibraryLesson);
            else addLessonResource(picker.sessionIndex, lesson as Extract<ContentItem, { type: "lesson" }>);
            setPicker(null);
          }}
        />
      ) : null}
    </main>
  );

  function addLessonResource(sessionIndex: number, lesson: Extract<ContentItem, { type: "lesson" }>) {
    setCoursePlan((prev) =>
      prev.map((session, index) =>
        index === sessionIndex
          ? {
              ...session,
              resources: [
                ...session.resources,
                {
                  id: `resource-${Date.now().toString(36)}-${session.resources.length + 1}`,
                  type: "platform",
                  visibility: "participants",
                  sourceId: lesson.id,
                  sourceType: "myContent",
                  title: lesson.title || t("resources.lesson"),
                  url: lesson.href,
                  description: t("resources.myContentDescription"),
                },
              ],
            }
          : session
      )
    );
  }

  function addLibraryResource(sessionIndex: number, lesson: LibraryLesson) {
    setCoursePlan((prev) =>
      prev.map((session, index) =>
        index === sessionIndex
          ? {
              ...session,
              resources: [
                ...session.resources,
                {
                  id: `resource-${Date.now().toString(36)}-${session.resources.length + 1}`,
                  type: "platform",
                  visibility: "participants",
                  sourceId: lesson.id,
                  sourceType: "library",
                  title: lesson.title || t("resources.libraryLesson"),
                  url: lesson.href,
                  description: t("resources.libraryDescription"),
                },
              ],
            }
          : session
      )
    );
  }
}

function ContentPicker({
  mode,
  myLessons,
  libraryLessons,
  onPick,
  onClose,
}: {
  mode: PickerMode;
  myLessons: Array<Extract<ContentItem, { type: "lesson" }>>;
  libraryLessons: LibraryLesson[];
  onPick: (lesson: Extract<ContentItem, { type: "lesson" }> | LibraryLesson) => void;
  onClose: () => void;
}) {
  const t = useTranslations("academy.sessions");
  const [search, setSearch] = useState("");
  const lessons = mode === "library" ? libraryLessons : myLessons;
  const filteredLessons = lessons.filter((lesson) => matchesLessonSearch(lesson, search)).slice(0, 80);
  const title = mode === "library" ? t("picker.libraryTitle") : t("picker.myContentTitle");
  const emptyText =
    mode === "library"
      ? t("picker.libraryEmpty")
      : t("picker.myContentEmpty");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <div className="grid max-h-[80vh] w-full max-w-2xl gap-4 overflow-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {t("picker.intro")}
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {t("actions.close")}
          </Button>
        </div>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("picker.searchPlaceholder")}
        />

        {filteredLessons.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            {emptyText}
          </div>
        ) : (
          <div className="grid gap-2">
            {filteredLessons.map((lesson) => (
              <button
                key={lesson.id}
                type="button"
                onClick={() => onPick(lesson)}
                className="rounded-lg border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
              >
                <div className="font-extrabold text-slate-950">{lesson.title || t("resources.lesson")}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {lesson.status || "draft"} {lesson.level ? `· ${lesson.level}` : ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function shouldShowInLibrary(lesson: LibraryLesson): boolean {
  const visibility = String(lesson.visibility || "").trim().toLowerCase();
  const publishVisibility = String(lesson.publishVisibility || "").trim().toLowerCase();
  const lessonType = String(lesson.lessonType || "").trim().toLowerCase();
  const isReadingTest = lessonType === "reading_test";

  if (visibility === "private" || visibility === "unlisted") return false;
  if (!visibility && publishVisibility === "private") return false;
  if (!isReadingTest && lesson.showInLibrary === false) return false;

  return true;
}

function matchesLessonSearch(
  lesson: Extract<ContentItem, { type: "lesson" }> | LibraryLesson,
  search: string
): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;

  return [lesson.title, lesson.level, lesson.language, lesson.id]
    .map((value) => String(value || "").toLowerCase())
    .some((value) => value.includes(q));
}

function toDateTimeLocalValue(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function addScheduleInterval(baseDate: Date, index: number, repeat: ScheduleRepeat): Date {
  if (repeat === "weekdays") return addBusinessDays(baseDate, index);

  const next = new Date(baseDate);
  if (repeat === "monthly") {
    next.setMonth(baseDate.getMonth() + index);
    return next;
  }

  const days = repeat === "biweekly" ? 14 : 7;
  next.setDate(baseDate.getDate() + index * days);
  return next;
}

function addBusinessDays(baseDate: Date, index: number): Date {
  const next = new Date(baseDate);
  let added = 0;

  while (added < index) {
    next.setDate(next.getDate() + 1);
    const day = next.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }

  return next;
}

function formatCompactSessionDate(value: string, emptyText: string): string {
  if (!value) return emptyText;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sessionToneClass(status: CourseSessionStatus): string {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (status === "cancelled") return "border-rose-200 bg-rose-50 text-rose-950";
  return "border-amber-300 bg-amber-100 text-amber-950";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}
