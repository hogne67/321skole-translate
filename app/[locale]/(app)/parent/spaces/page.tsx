// app/[locale]/(app)/parent/spaces/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowRight, BookOpen } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { auth, db } from "@/lib/firebase";

import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  type Firestore,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { listMySpaceIds } from "@/lib/spaceMembership";
import type { SpaceDoc } from "@/lib/spacesClient";
import { hasParentFeedback, needsParentReply } from "@/lib/parentFeedback";

type TFn = ReturnType<typeof useTranslations>;

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getKey(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

function codeOfSpace(s: SpaceDoc | null | undefined): string | null {
  const code = safeString(getKey(s, "code"));
  if (code) return code;

  const joinCode = safeString(getKey(s, "joinCode"));
  if (joinCode) return joinCode;

  const join = getKey(s, "join");
  if (!isRecord(join)) return null;

  const nested = safeString(join["code"]);
  return nested ?? null;
}

function kindOfSpace(s: SpaceDoc | null | undefined): string | null {
  return safeString(getKey(s, "kind"));
}

function isParentSpace(s: SpaceDoc | null | undefined): boolean {
  const kind = kindOfSpace(s);
  return kind === "family" || kind === "parent_group";
}

function errMessage(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

type AssignmentDoc = {
  title?: string;
  coverImageUrl?: string;
  imageUrl?: string;
  status?: string;
  archived?: boolean;
  updatedAt?: unknown;
  level?: string;
  language?: string;
  [k: string]: unknown;
};

type ParentSpaceSubmissionDoc = {
  uid?: string;
  status?: string;
  aiFeedback?: string | null;
  auto?: {
    score?: number;
    maxScore?: number;
    correctCount?: number;
    totalAutoGraded?: number;
  };
  [k: string]: unknown;
};

type ParentReviewDoc = {
  uid?: string;
  comment?: string;
  stars?: number;
  updatedAt?: unknown;
};

type SpaceCardMeta = {
  lessonCount: number;
  activeLessonId: string | null;
  activeLessonTitle: string | null;
  activeLessonCover: string | null;
  activeSubmissionStatus: string | null;
  activeIsChildWork: boolean;
  activeHasAiFeedback: boolean;
  activeHasParentReview: boolean;
  reviewLoaded: boolean;
  activeReviewStars: number | null;
};

function buildParentSubmissionId(spaceId: string, assignmentId: string, uid: string) {
  return `${spaceId}_${assignmentId}_${uid}`;
}

function statusLabel(status: string | null, t: TFn) {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return t("status.notStarted");
  if (s === "draft") return t("status.draft");
  if (s === "submitted") return t("status.submitted");
  if (s === "needs_work") return t("status.needsWork");
  if (s === "reviewed" || s === "approved") return t("status.reviewed");
  return s;
}

function statusTone(status: string | null): "neutral" | "good" | "warn" {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "submitted" || s === "reviewed" || s === "approved") return "good";
  if (s === "draft" || s === "needs_work") return "warn";
  return "neutral";
}

function Badge({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const styles =
    tone === "good"
      ? {
          border: "rgba(16,185,129,0.40)",
          bg: "rgba(16,185,129,0.10)",
          color: "rgba(5,150,105,1)",
        }
      : tone === "warn"
        ? {
            border: "rgba(245,158,11,0.40)",
            bg: "rgba(245,158,11,0.10)",
            color: "rgba(180,83,9,1)",
          }
        : {
            border: "rgba(0,0,0,0.14)",
            bg: "rgba(0,0,0,0.04)",
            color: "rgba(0,0,0,0.78)",
          };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${styles.border}`,
        background: styles.bg,
        color: styles.color,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function RoomCover({ source, wide }: { source?: string | null; wide: boolean }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const cover = source && source !== failedSource ? source : null;
  return (
    <div className={"relative h-44 overflow-hidden bg-emerald-50 sm:h-52" + (wide ? " md:order-last md:h-auto" : "")}>
      <Image
        src={cover ?? "/images/child-room-top1.png"}
        alt=""
        fill
        sizes={wide ? "(min-width: 768px) 420px, 100vw" : "(min-width: 1024px) 480px, 100vw"}
        unoptimized={!!cover}
        onError={cover ? () => setFailedSource(cover) : undefined}
        className={"object-cover" + (cover ? "" : " object-[center_36%]")}
      />
    </div>
  );
}

export default function ParentSpacesPage() {
  const t = useTranslations("parentSpaces");
  const locale = useLocale();

  const [user, setUser] = useState<User | null>(null);
  const [spaces, setSpaces] = useState<Array<{ id: string; data: SpaceDoc }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [spaceMeta, setSpaceMeta] = useState<Record<string, SpaceCardMeta>>({});

  const collatorLocale = useMemo(() => (locale === "no" ? "nb" : "en"), [locale]);

  const titleOfSpace = useMemo(
    () => (s: SpaceDoc): string => {
      const title = safeString(getKey(s, "title"));
      return title ?? t("defaultTitle");
    },
    [t]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    let alive = true;

    async function run() {
      setErr(null);

      if (!user) {
        if (alive) {
          setSpaces([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      try {
        const dbx = requireDb(db);
        const ids = await listMySpaceIds(dbx, user.uid);

        if (!ids.length) {
          if (alive) setSpaces([]);
          return;
        }

        const docs = await Promise.all(
          ids.map(async (id) => {
            const snap = await getDoc(doc(dbx, "spaces", id));
            if (!snap.exists()) return null;
            return { id, data: snap.data() as SpaceDoc };
          })
        );

        const items = docs
          .filter((x): x is { id: string; data: SpaceDoc } => x !== null)
          .filter((x) => isParentSpace(x.data));

        items.sort((a, b) => titleOfSpace(a.data).localeCompare(titleOfSpace(b.data), collatorLocale));

        if (alive) setSpaces(items);
      } catch (e: unknown) {
        if (alive) setErr(errMessage(e, t("errors.loadFailed")));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [user, collatorLocale, t, titleOfSpace]);

  useEffect(() => {
    if (!user?.uid || spaces.length === 0) {
      setSpaceMeta({});
      return;
    }

    const dbx = requireDb(db);
    const outerUnsubs: Array<() => void> = [];

    const patchMeta = (spaceId: string, patch: Partial<SpaceCardMeta>) => {
      setSpaceMeta((old) => {
        const prev = old[spaceId] ?? {
          lessonCount: 0,
          activeLessonId: null,
          activeLessonTitle: null,
          activeLessonCover: null,
          activeSubmissionStatus: null,
          activeIsChildWork: false,
          activeHasAiFeedback: false,
          activeHasParentReview: false,
          reviewLoaded: false,
          activeReviewStars: null,
        };

        return {
          ...old,
          [spaceId]: {
            ...prev,
            ...patch,
          },
        };
      });
    };

    for (const space of spaces) {
      const sid = space.id;
      let innerUnsubs: Array<() => void> = [];

      const lessonsQuery = query(
        collection(dbx, "spaces", sid, "lessons"),
        orderBy("updatedAt", "desc")
      );

      const unsubLessons = onSnapshot(
        lessonsQuery,
        (snap) => {
          for (const u of innerUnsubs) u();
          innerUnsubs = [];

          const lessons: Array<{ id: string; data: AssignmentDoc }> = [];
          snap.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
            const data = d.data() as AssignmentDoc;
            if (!data.deletedAt && data.archived !== true && safeString(data.status)?.toLowerCase() !== "archived") lessons.push({ id: d.id, data });
          });

          const spaceData = space.data as Record<string, unknown>;
          const activeLesson = lessons.find((x) => x.id === safeString(spaceData.activeLessonId)) ?? lessons[0];
          const activeLessonId = activeLesson?.id ?? null;

          patchMeta(sid, {
            lessonCount: lessons.length,
            activeLessonId,
            activeLessonTitle: safeString(activeLesson?.data.title),
            activeLessonCover: safeString(activeLesson?.data.coverImageUrl) ?? safeString(activeLesson?.data.imageUrl),
            activeSubmissionStatus: null,
            activeIsChildWork: false,
            activeHasAiFeedback: false,
            activeHasParentReview: false,
            reviewLoaded: false,
            activeReviewStars: null,
          });

          if (!activeLessonId) return;

          const submissionId = buildParentSubmissionId(sid, activeLessonId, user.uid);

          const unsubSubmission = onSnapshot(
            doc(dbx, "spaces", sid, "lessons", activeLessonId, "submissions", submissionId),
            (submissionSnap) => {
              if (!submissionSnap.exists()) {
                patchMeta(sid, {
                  activeSubmissionStatus: null,
                  activeIsChildWork: false,
                  activeHasAiFeedback: false,
                });
                return;
              }

              const data = submissionSnap.data() as ParentSpaceSubmissionDoc;
              patchMeta(sid, {
                activeSubmissionStatus: safeString(data.status),
                activeIsChildWork: data.isChildPortal === true,
                activeHasAiFeedback: !!safeString(data.aiFeedback),
              });
            },
            () => {}
          );

          const unsubReview = onSnapshot(
            doc(dbx, "spaces", sid, "lessons", activeLessonId, "parentReviews", user.uid),
            (reviewSnap) => {
              if (!reviewSnap.exists()) {
                patchMeta(sid, {
                  activeHasParentReview: false,
                  reviewLoaded: true,
                  activeReviewStars: null,
                });
                return;
              }

              const data = reviewSnap.data() as ParentReviewDoc;
              patchMeta(sid, {
                activeHasParentReview: hasParentFeedback(data),
                reviewLoaded: true,
                activeReviewStars: safeNumber(data.stars),
              });
            },
            () => {}
          );

          innerUnsubs.push(unsubSubmission, unsubReview);
        },
        () => {}
      );

      outerUnsubs.push(() => {
        unsubLessons();
        for (const u of innerUnsubs) u();
      });
    }

    return () => {
      for (const unsub of outerUnsubs) unsub();
    };
  }, [spaces, user?.uid]);

  if (loading) return <div className="w-full py-4 text-sm text-slate-600">{t("loading")}</div>;

  const isGuestPreview = Boolean(user?.isAnonymous);
  const createHref = isGuestPreview
    ? `/login?next=${encodeURIComponent(`/${locale}/parent/spaces/new`)}`
    : "/parent/spaces/new";

  if (isGuestPreview) {
    return (
      <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-3 sm:space-y-4">
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-50 p-3 shadow-md sm:p-5">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="m-0 break-words text-2xl font-semibold text-slate-900">{t("title")}</h1>
              <div className="mt-2 break-words text-sm text-slate-600">{t("guestPreview.subtitle")}</div>
            </div>

            <div className="flex w-full min-w-0 justify-start lg:w-auto lg:justify-end">
              <Link
                href={createHref}
                className="inline-flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-2 text-base font-semibold text-white no-underline shadow-sm hover:bg-green-500 hover:shadow-md sm:w-auto"
              >
                {t("guestPreview.loginCreate")}
              </Link>
            </div>
          </div>
        </div>

        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm sm:p-5">
          <h2 className="m-0 text-xl font-black text-emerald-950">{t("guestPreview.title")}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-900">{t("guestPreview.text")}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black text-slate-950">{t("guestPreview.cards.family.title")}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("guestPreview.cards.family.text")}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black text-slate-950">{t("guestPreview.cards.share.title")}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("guestPreview.cards.share.text")}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black text-slate-950">{t("guestPreview.cards.follow.title")}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("guestPreview.cards.follow.text")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-3 sm:space-y-4">
      <header className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 shadow-sm sm:p-6">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 break-words text-3xl font-extrabold tracking-tight text-emerald-950">{t("title")}</h1>
            <div className="mt-2 break-words text-sm text-slate-600">{t("subtitle")}</div>
          </div>

          <div className="flex w-full min-w-0 justify-start lg:w-auto lg:justify-end">
            <Link
              href={createHref}
              className="inline-flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-2 text-base font-semibold text-white no-underline shadow-sm hover:bg-green-500 hover:shadow-md sm:w-auto"
            >
              {t("actions.parentGroups")}
            </Link>
          </div>
        </div>
      </header>

      {err ? (
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <section aria-label={t("title")}>
          {spaces.length === 0 ? (
            <div className="rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-600 shadow-sm sm:p-6">
              {t.rich("empty", {
                b: (chunks) => <b>{chunks}</b>,
              })}
            </div>
          ) : (
            <div className={"grid min-w-0 gap-4 sm:gap-5" + (spaces.length > 1 ? " lg:grid-cols-2" : "")}>
              {spaces.map((s) => {
                const title = titleOfSpace(s.data);
                const code = codeOfSpace(s.data);
                const parentGroup = kindOfSpace(s.data) === "parent_group";
                const wide = spaces.length === 1;

                const openHref = `/parent/spaces/${s.id}`;
                const meta = spaceMeta[s.id] ?? null;
                const lessonCount = meta?.lessonCount ?? 0;
                const readyForFeedback = !!meta?.reviewLoaded && needsParentReply(meta.activeSubmissionStatus, meta.activeIsChildWork, meta.activeHasParentReview);

                return (
                  <article
                    key={s.id}
                    className={[
                      "grid min-w-0 overflow-hidden rounded-3xl border bg-white shadow-sm",
                      wide ? "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : "grid-rows-[auto_1fr]",
                      readyForFeedback ? "border-amber-200" : "border-emerald-200",
                    ].join(" ")}
                  >
                    <RoomCover source={meta?.activeLessonCover} wide={wide} />
                    <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
                      <header className="min-w-0">
                        <h2 className="m-0 break-words text-2xl font-extrabold tracking-tight text-emerald-950 sm:text-3xl">
                          <Link href={openHref} className="text-inherit no-underline hover:underline">{title}</Link>
                        </h2>
                        {parentGroup || code || lessonCount > 0 ? (
                          <div className="mt-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-slate-600">
                            {parentGroup ? <span>{t("kinds.parentGroup")}</span> : null}
                            {code ? <span className="min-w-0 break-words">{t("meta.code")} <b className="text-slate-900">{code}</b></span> : null}
                            {lessonCount > 0 ? <span>{t("badges.tasks", { count: lessonCount })}</span> : null}
                          </div>
                        ) : null}
                      </header>

                      {meta?.activeLessonId ? (
                        <div className={"min-w-0 rounded-2xl border p-3 sm:p-4 " + (readyForFeedback ? "border-amber-100 bg-amber-50" : "border-slate-100 bg-slate-50")}>
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                            <p className="m-0 flex items-center gap-2 text-sm font-bold text-slate-700">
                              <BookOpen size={16} aria-hidden="true" />
                              {t("activity.title")}
                            </p>
                            <Badge
                              text={readyForFeedback ? t("status.readyForFeedback") : statusLabel(meta.activeSubmissionStatus, t)}
                              tone={readyForFeedback ? "warn" : statusTone(meta.activeSubmissionStatus)}
                            />
                          </div>
                          <p className="mb-0 mt-2 break-words text-base font-bold text-slate-900 sm:text-lg">{meta.activeLessonTitle ?? t("activity.untitled")}</p>
                          {meta.activeHasAiFeedback || meta.activeHasParentReview ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {meta.activeHasAiFeedback ? <Badge text={t("badges.aiFeedback")} tone="good" /> : null}
                              {meta.activeHasParentReview ? (
                                <Badge
                                  text={meta.activeReviewStars
                                    ? t("badges.parentReviewWithStars", { stars: meta.activeReviewStars })
                                    : t("badges.parentReview")}
                                  tone="good"
                                />
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : meta ? <p className="m-0 text-sm text-slate-600">{t("activity.empty")}</p> : null}

                      <div className="mt-auto">
                        <Link
                          href={readyForFeedback ? openHref + "/assignments/" + meta.activeLessonId + "#parent-review" : openHref}
                          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-emerald-900 sm:w-auto"
                        >
                          {t(readyForFeedback ? "actions.respond" : "actions.openSpace")}
                          <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
      </section>
    </div>
  );
}
