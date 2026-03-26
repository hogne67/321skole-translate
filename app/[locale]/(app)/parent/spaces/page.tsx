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

  if (loading) return <div style={{ padding: 16 }}>{t("loading")}</div>;

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ marginBottom: 6 }}>{t("title")}</h1>
          <div style={{ opacity: 0.75 }}>{t("subtitle")}</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href="/parent/spaces/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.15)",
              textDecoration: "none",
              fontWeight: 700,
              color: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {t("actions.parentGroups")}
          </Link>
        </div>
      </div>

      {err ? <div style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{err}</div> : null}

      <div style={{ marginTop: 14 }}>
        {spaces.length === 0 ? (
          <div style={{ opacity: 0.7 }}>
            {t.rich("empty", {
              b: (chunks) => <b>{chunks}</b>,
            })}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
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
                  style={{
                    display: "block",
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 12,
                    padding: 12,
                    textDecoration: "none",
                    color: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 220, flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{title}</div>

                      <div style={{ opacity: 0.75, marginTop: 4 }}>{subtitle}</div>

                      {code ? (
                        <div style={{ opacity: 0.75, marginTop: 4 }}>
                          {t("meta.code")}: <b>{code}</b>
                        </div>
                      ) : null}

                      {meta ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
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
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link
                        href={openHref}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "8px 12px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.15)",
                          textDecoration: "none",
                          fontWeight: 800,
                          color: "inherit",
                          whiteSpace: "nowrap",
                        }}
                        title={t("actions.openSpace")}
                      >
                        {t("actions.openSpace")}
                      </Link>
                    </div>
                  </div>

                  <div style={{ opacity: 0.7, marginTop: 8 }}>{t("actions.openSpace")}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}