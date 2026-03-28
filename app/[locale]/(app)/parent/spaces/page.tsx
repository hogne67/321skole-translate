// app/[locale]/(app)/parent/spaces/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "next/navigation";
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
  activeSubmissionStatus: string | null;
  activeHasAiFeedback: boolean;
  activeHasParentReview: boolean;
  activeReviewStars: number | null;
};

function buildParentSubmissionId(spaceId: string, assignmentId: string, uid: string) {
  return `${spaceId}_${assignmentId}_${uid}`;
}

function statusLabel(status: string | null) {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return "Ikke startet";
  if (s === "draft") return "Kladd";
  if (s === "submitted") return "Sendt inn";
  if (s === "needs_work") return "Trenger arbeid";
  if (s === "reviewed" || s === "approved") return "Vurdert";
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

export default function ParentSpacesPage() {
  const t = useTranslations("parent.spaces");
  const locale = useLocale();
  const router = useRouter();

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

  function subtitleOfSpace(s: SpaceDoc): string {
    const kind = kindOfSpace(s);

    if (kind === "family") return t("kinds.family");
    if (kind === "parent_group") return t("kinds.parentGroup");

    return t("kinds.other");
  }

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
          activeSubmissionStatus: null,
          activeHasAiFeedback: false,
          activeHasParentReview: false,
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
            lessons.push({ id: d.id, data: d.data() as AssignmentDoc });
          });

          const spaceData = space.data as Record<string, unknown>;
          const activeLessonId = safeString(spaceData.activeLessonId);
          const activeLessonDoc = activeLessonId
            ? lessons.find((x) => x.id === activeLessonId)?.data ?? null
            : null;

          patchMeta(sid, {
            lessonCount: lessons.length,
            activeLessonId,
            activeLessonTitle:
              safeString(spaceData.activeLessonTitle) ??
              safeString(activeLessonDoc?.title) ??
              null,
            activeSubmissionStatus: null,
            activeHasAiFeedback: false,
            activeHasParentReview: false,
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
                  activeHasAiFeedback: false,
                });
                return;
              }

              const data = submissionSnap.data() as ParentSpaceSubmissionDoc;
              patchMeta(sid, {
                activeSubmissionStatus: safeString(data.status),
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
                  activeReviewStars: null,
                });
                return;
              }

              const data = reviewSnap.data() as ParentReviewDoc;
              patchMeta(sid, {
                activeHasParentReview: true,
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

  return (
    <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-4">
      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 break-words text-2xl font-semibold text-slate-900">{t("title")}</h1>
            <div className="mt-2 break-words text-sm text-slate-600">{t("subtitle")}</div>
          </div>

          <div className="flex w-full min-w-0 justify-start lg:w-auto lg:justify-end">
            <Link
              href="/parent/spaces/new"
              className="inline-flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-2 text-base font-semibold text-white no-underline shadow-sm hover:bg-green-500 hover:shadow-md sm:w-auto"
            >
              {t("actions.parentGroups")}
            </Link>
          </div>
        </div>
      </div>

      {err ? (
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-200 p-4 shadow-md sm:p-5">
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-900">{t("title")}</div>
          <div className="mt-1 break-words text-sm text-slate-600">
            {spaces.length} {spaces.length === 1 ? "gruppe" : "grupper"}
          </div>
        </div>

        <div className="mt-4">
          {spaces.length === 0 ? (
            <div className="rounded-2xl border border-slate-300 bg-white p-6 text-sm text-slate-600 shadow-sm">
              {t.rich("empty", {
                b: (chunks) => <b>{chunks}</b>,
              })}
            </div>
          ) : (
            <div className="grid min-w-0 gap-3">
              {spaces.map((s) => {
                const title = titleOfSpace(s.data);
                const code = codeOfSpace(s.data);
                const subtitle = subtitleOfSpace(s.data);

                const openHref = `/parent/spaces/${s.id}`;
                const meta = spaceMeta[s.id] ?? null;

                return (
                  <div
                    key={s.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(openHref)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") router.push(openHref);
                    }}
                    className="box-border w-full min-w-0 max-w-full cursor-pointer rounded-2xl border border-slate-300 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5"
                  >
                    <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-base font-semibold text-slate-900">{title}</div>

                        <div className="mt-2 text-sm text-slate-600">{subtitle}</div>

                        {code ? (
                          <div className="mt-2 break-words text-sm text-slate-600">
                            {t("meta.code")}: <b className="text-slate-900">{code}</b>
                          </div>
                        ) : null}

                        {meta ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge text={`${meta.lessonCount} oppgaver`} tone="neutral" />
                            {meta.activeLessonTitle ? (
                              <Badge text={`Aktiv: ${meta.activeLessonTitle}`} tone="neutral" />
                            ) : null}
                            <Badge
                              text={statusLabel(meta.activeSubmissionStatus)}
                              tone={statusTone(meta.activeSubmissionStatus)}
                            />
                            {meta.activeHasAiFeedback ? (
                              <Badge text="AI-feedback" tone="good" />
                            ) : null}
                            {meta.activeHasParentReview ? (
                              <Badge
                                text={
                                  meta.activeReviewStars
                                    ? `Foreldrevurdering • ${meta.activeReviewStars}★`
                                    : "Foreldrevurdering"
                                }
                                tone="good"
                              />
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mt-3 break-words text-sm text-slate-500">{t("actions.openSpace")}</div>
                      </div>

                      <div className="w-full min-w-0 sm:w-auto">
                        <Link
                          href={openHref}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white no-underline hover:bg-slate-800 sm:w-auto"
                          title={t("actions.openSpace")}
                        >
                          {t("actions.openSpace")}
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}