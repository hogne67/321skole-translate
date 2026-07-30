"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import TrainingVideoPlayer from "@/components/TrainingVideoPlayer";
import { db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import type { SpaceDoc } from "@/lib/spacesClient";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { ArrowLeft, ArrowRight, ChevronDown, Library, MonitorUp, Radio, Sparkles, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

type SpaceRow = { id: string; data: SpaceDoc & { createdAt?: unknown } };
type BoardMode = "text" | "poll" | "wordwall" | "image" | "clock" | "quiz";
type SortKey = "newest" | "title_az" | "live";
type BoardState = {
  active?: boolean;
  mode?: BoardMode | string;
  sessionId?: string;
  updatedAt?: unknown;
};
type TimestampLike = { toMillis: () => number };
type QuizRow = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  level: string;
  language: string;
  questionCount: number;
  publishedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTimestampLike(value: unknown): value is TimestampLike {
  return isRecord(value) && typeof value.toMillis === "function";
}

function asMillis(value: unknown): number {
  if (isTimestampLike(value)) return value.toMillis();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (isRecord(value) && typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function modeLabel(t: (key: string) => string, mode: unknown) {
  if (mode === "poll") return t("modes.poll");
  if (mode === "wordwall") return t("modes.wordwall");
  if (mode === "image") return t("modes.image");
  if (mode === "clock") return t("modes.clock");
  if (mode === "quiz") return t("modes.quiz");
  return t("modes.text");
}

function questionCountFrom(data: Record<string, unknown>): number {
  const quiz = isRecord(data.quiz) ? data.quiz : {};
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  if (questions.length) return questions.length;
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  return tasks.length;
}

function coerceQuiz(id: string, raw: unknown): QuizRow | null {
  const data = isRecord(raw) ? raw : {};
  const quiz = isRecord(data.quiz) ? data.quiz : {};
  const lessonType = safeString(data.lessonType || data.contentType || data.textType || data.texttype).toLowerCase();
  const isQuiz = lessonType === "quiz" || Array.isArray(quiz.questions);
  if (!isQuiz || data.isActive === false) return null;

  return {
    id,
    title: safeString(data.title || quiz.title, "Quiz uten tittel"),
    description: safeString(data.description || quiz.description),
    imageUrl: safeString(data.coverImageUrl || data.imageUrl),
    level: safeString(data.level || quiz.level),
    language: safeString(data.language || quiz.language),
    questionCount: questionCountFrom(data),
    publishedAt: asMillis(data.publishedAt || data.updatedAt || data.createdAt),
  };
}

export default function TeacherBoardIndexPage() {
  return (
    <AuthGate>
      <TeacherBoardIndexInner />
    </AuthGate>
  );
}

function TeacherBoardIndexInner() {
  const t = useTranslations("teacherBoardIndex");
  const locale = useLocale();
  const { user, profile, loading } = useUserProfile();

  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [boardStates, setBoardStates] = useState<Record<string, BoardState | null>>({});
  const [spaceSearch, setSpaceSearch] = useState("");
  const [sortKey] = useState<SortKey>("title_az");
  const [spacePage, setSpacePage] = useState(0);
  const [spacePickerOpen, setSpacePickerOpen] = useState(false);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);

  const canUse = profile?.role === "teacher" || profile?.role === "admin";

  useEffect(() => {
    if (!user?.uid || !canUse) return;

    const q = query(collection(db, "spaces"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setSpaces(
        snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as SpaceRow["data"],
        }))
      );
    });
  }, [user?.uid, canUse]);

  useEffect(() => {
    if (spaces.length === 0) {
      setBoardStates({});
      return;
    }

    const unsubs = spaces.map((space) =>
      onSnapshot(
        doc(db, "spaces", space.id, "board", "state"),
        (snap) => {
          setBoardStates((prev) => ({
            ...prev,
            [space.id]: snap.exists() ? (snap.data() as BoardState) : null,
          }));
        },
        () => {
          setBoardStates((prev) => ({ ...prev, [space.id]: null }));
        }
      )
    );

    return () => unsubs.forEach((unsub) => unsub());
  }, [spaces]);

  useEffect(() => {
    if (!canUse) return;

    const q = query(collection(db, "published_lessons"), where("lessonType", "==", "quiz"), where("isActive", "==", true), limit(18));
    getDocs(q)
      .then((snap) => {
        const next = snap.docs
          .map((item) => coerceQuiz(item.id, item.data()))
          .filter((item): item is QuizRow => item !== null)
          .sort((a, b) => b.publishedAt - a.publishedAt)
          .slice(0, 6);
        setQuizzes(next);
      })
      .catch(() => setQuizzes([]));
  }, [canUse]);

  const filteredSpaces = useMemo(() => {
    const search = spaceSearch.trim().toLowerCase();
    const list = spaces.filter((space) => {
      const title = safeString(space.data.title).toLowerCase();
      const code = safeString(space.data.code).toLowerCase();
      return !search || title.includes(search) || code.includes(search);
    });

    return [...list].sort((a, b) => {
      if (sortKey === "title_az") return safeString(a.data.title).localeCompare(safeString(b.data.title), "nb");
      if (sortKey === "live") {
        const al = boardStates[a.id]?.active === true ? 1 : 0;
        const bl = boardStates[b.id]?.active === true ? 1 : 0;
        if (al !== bl) return bl - al;
      }
      return asMillis(b.data.createdAt) - asMillis(a.data.createdAt);
    });
  }, [boardStates, spaceSearch, sortKey, spaces]);

  useEffect(() => {
    setSpacePage(0);
  }, [spaceSearch, sortKey]);

  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filteredSpaces.length / pageSize));
  const visibleSpaces = filteredSpaces.slice(spacePage * pageSize, spacePage * pageSize + pageSize);

  if (loading) {
    return <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-slate-600">{t("loading")}</div>;
  }

  if (!canUse) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">{t("access.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-700">{t("access.text")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-2 py-3 sm:px-4 sm:py-4">
      <section className="rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{t("hero.title")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-600 sm:leading-6">{t("hero.text")}</p>
          </div>

          <div className="flex w-full min-w-0 justify-start lg:w-auto lg:justify-end">
            <TrainingVideoPlayer
              title={t("video.title")}
              videoUrl="https://youtu.be/7zjhziVmGvc"
              buttonLabel={t("video.button")}
              buttonTitle={t("video.buttonTitle")}
              closeLabel={t("video.close")}
              description={t("video.text")}
              thumbnail
              className="max-w-none max-sm:min-h-[70px] max-sm:gap-2 max-sm:p-2"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <MonitorUp className="h-5 w-5 text-slate-700" aria-hidden="true" />
              <h2 className="text-xl font-black text-slate-950 sm:text-2xl">{t("rooms.title")}</h2>
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-600">{t("rooms.text")}</p>
          </div>
          <button
            type="button"
            onClick={() => setSpacePickerOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 sm:w-auto"
          >
            {t("rooms.openPicker")}
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {spaces.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">{t("rooms.empty")}</div>
        ) : null}
      </section>

      {spacePickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div>
                <h3 className="text-xl font-black text-slate-950">{t("rooms.modalTitle")}</h3>
                <p className="mt-1 text-sm text-slate-600">{t("rooms.modalText")}</p>
              </div>
              <button
                type="button"
                onClick={() => setSpacePickerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white hover:bg-slate-50"
                aria-label={t("rooms.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              <input
                value={spaceSearch}
                onChange={(event) => setSpaceSearch(event.target.value)}
                placeholder={t("rooms.search")}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
              />

              <div className="mt-3 max-h-[420px] overflow-y-auto pr-1">
                <div className="grid gap-2">
                  {visibleSpaces.map((space) => {
                    const state = boardStates[space.id] ?? null;
                    const isLive = state?.active === true;
                    const title = safeString(space.data.title, t("rooms.untitled"));

                    return (
                      <Link
                        key={space.id}
                        href={`/${locale}/teacher/spaces/${space.id}/board`}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 no-underline hover:border-blue-200 hover:bg-white"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-base font-black text-slate-950">{title}</div>
                          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                            <Radio className="h-4 w-4" aria-hidden="true" />
                            {isLive ? t("rooms.activeMode", { mode: modeLabel(t, state?.mode) }) : t("rooms.ready")}
                          </div>
                        </div>
                        <span className={["inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black", isLive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"].join(" ")}>
                          <span className={["h-2 w-2 rounded-full", isLive ? "bg-emerald-500" : "bg-slate-400"].join(" ")} />
                          {isLive ? t("rooms.live") : t("rooms.notLive")}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-500">{t("rooms.showing", { shown: visibleSpaces.length, total: filteredSpaces.length })}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSpacePage((page) => Math.max(0, page - 1))}
                    disabled={spacePage === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t("rooms.prev")}
                  </button>
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600">{spacePage + 1} / {pageCount}</span>
                  <button
                    type="button"
                    onClick={() => setSpacePage((page) => Math.min(pageCount - 1, page + 1))}
                    disabled={spacePage >= pageCount - 1}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("rooms.next")}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-violet-100 bg-violet-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-violet-700">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("quiz.kicker")}
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-950">{t("quiz.title")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/${locale}/tools/quiz`} className="inline-flex items-center justify-center rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white hover:bg-violet-800">
              {t("quiz.create")}
            </Link>
            <Link href={`/${locale}/321quiz`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-black text-violet-800 hover:bg-violet-50">
              <Library className="h-4 w-4" />
              {t("quiz.library")}
            </Link>
          </div>
        </div>

        {quizzes.length ? (
          <div className="grid gap-3 p-4 md:grid-cols-3">
            {quizzes.map((quiz, index) => (
              <Link
                key={quiz.id}
                href={`/${locale}/321quiz/${quiz.id}`}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white no-underline shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                style={{ animation: `boardQuizFloat 4s ease-in-out ${index * 0.18}s infinite` }}
              >
                <div className="aspect-video bg-violet-50">
                  {quiz.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={quiz.imageUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm font-black uppercase tracking-[0.18em] text-violet-700">321quiz</div>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex flex-wrap gap-2 text-xs font-black text-slate-600">
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-800">{quiz.questionCount} spørsmål</span>
                    {quiz.level ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{quiz.level}</span> : null}
                    {quiz.language ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{quiz.language}</span> : null}
                  </div>
                  <h3 className="line-clamp-2 text-lg font-black leading-tight text-slate-950 group-hover:text-violet-700">{quiz.title}</h3>
                  {quiz.description ? <p className="line-clamp-2 text-sm leading-6 text-slate-600">{quiz.description}</p> : null}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-6 text-sm text-slate-600">{t("quiz.empty")}</div>
        )}
      </section>

      <style jsx global>{`
        @keyframes boardQuizFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
