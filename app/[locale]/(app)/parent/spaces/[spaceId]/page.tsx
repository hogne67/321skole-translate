// app\[locale]\(app)\parent\spaces\[spaceId]\page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type Firestore,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
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

function errMessage(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

type AssignmentDoc = {
  title?: string;
  description?: string;
  summary?: string;
  subtitle?: string;
  status?: string;
  archived?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  sourceId?: string;
  sourceType?: string;
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

type AssignmentStatusMeta = {
  hasSubmission: boolean;
  submissionStatus: string | null;
  hasAiFeedback: boolean;
  autoSummary: string | null;
  hasParentReview: boolean;
  reviewStars: number | null;
};

function assignmentSnippet(d: AssignmentDoc) {
  const asRec: Record<string, unknown> = d;
  const s = safeString(d.description ?? asRec.summary ?? asRec.subtitle);
  if (!s) return null;
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

function isArchived(d: AssignmentDoc) {
  return d.archived === true || String(d.status ?? "").toLowerCase() === "archived";
}

function buildParentSubmissionId(spaceId: string, assignmentId: string, uid: string) {
  return `${spaceId}_${assignmentId}_${uid}`;
}

function renderAutoSummary(auto: ParentSpaceSubmissionDoc["auto"]): string | null {
  if (!auto) return null;

  const score = safeNumber(auto.score);
  const maxScore = safeNumber(auto.maxScore);
  if (score !== null && maxScore !== null && maxScore > 0) return `${score}/${maxScore}`;

  const correct = safeNumber(auto.correctCount);
  const total = safeNumber(auto.totalAutoGraded);
  if (correct !== null && total !== null && total > 0) return `${correct}/${total}`;

  return null;
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

export default function ParentSpaceDetailPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const t = useTranslations("parent.spaceDetail");
  const locale = useLocale();

    const tx = useMemo(
    () => (key: string, fallback: string) => {
      try {
        return t(key as never);
      } catch {
        return fallback;
      }
    },
    [t]
  );

  const [user, setUser] = useState<User | null>(null);

  const [space, setSpace] = useState<SpaceDoc | null>(null);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<Array<{ id: string; data: AssignmentDoc }>>([]);
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [statusMap, setStatusMap] = useState<Record<string, AssignmentStatusMeta>>({});

  const collatorLocale = useMemo(() => (locale === "no" ? "nb" : "en"), [locale]);

  function titleOfAssignment(d: AssignmentDoc, id: string) {
    return safeString(d.title) ?? id;
  }

  function kindLabel(kind: string | null) {
    if (kind === "family") return tx("kinds.family", "Family room");
    if (kind === "parent_group") return tx("kinds.parentGroup", "Parent group");
    return tx("kinds.other", "Space");
  }

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    setErr(null);
    setMissing(false);

    let unsub: (() => void) | null = null;

    try {
      const dbx = requireDb(db);
      unsub = onSnapshot(
        doc(dbx, "spaces", spaceId),
        (snap) => {
          if (!snap.exists()) {
            setSpace(null);
            setMissing(true);
            return;
          }

          setMissing(false);
          setSpace(snap.data() as SpaceDoc);
        },
        (e: unknown) => setErr(errMessage(e, tx("errors.readSpace", "Could not read space.")))
      );
    } catch (e: unknown) {
      setErr(errMessage(e, tx("errors.listenStart", "Could not start space listener.")));
    }

    return () => unsub?.();
    }, [spaceId, tx]);

  useEffect(() => {
    setAssignErr(null);

    let unsub: (() => void) | null = null;

    try {
      const dbx = requireDb(db);
      const qy = query(collection(dbx, "spaces", spaceId, "lessons"), orderBy("updatedAt", "desc"));

      unsub = onSnapshot(
        qy,
        (snap) => {
          const out: Array<{ id: string; data: AssignmentDoc }> = [];

          snap.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
            out.push({ id: d.id, data: d.data() as AssignmentDoc });
          });

          out.sort((a, b) =>
            titleOfAssignment(a.data, a.id).localeCompare(
              titleOfAssignment(b.data, b.id),
              collatorLocale
            )
          );

          setAssignments(out);
        },
        (e: unknown) =>
          setAssignErr(errMessage(e, tx("errors.readAssignments", "Could not read assignments.")))
      );
    } catch (e: unknown) {
      setAssignErr(
        errMessage(e, tx("errors.listenAssignmentsStart", "Could not start assignments listener."))
      );
    }

    return () => unsub?.();
    }, [spaceId, collatorLocale, tx]);

  useEffect(() => {
    if (!user?.uid || assignments.length === 0) {
      setStatusMap({});
      return;
    }

    const dbx = requireDb(db);
    const unsubs: Array<() => void> = [];
    const nextMap: Record<string, AssignmentStatusMeta> = {};

    function patch(id: string, patchObj: Partial<AssignmentStatusMeta>) {
      const prev = nextMap[id] ?? {
        hasSubmission: false,
        submissionStatus: null,
        hasAiFeedback: false,
        autoSummary: null,
        hasParentReview: false,
        reviewStars: null,
      };

      nextMap[id] = { ...prev, ...patchObj };
      setStatusMap((old) => ({
        ...old,
        [id]: nextMap[id],
      }));
    }

    for (const item of assignments) {
      const assignmentId = item.id;
      const submissionId = buildParentSubmissionId(spaceId, assignmentId, user.uid);

      const unsubSubmission = onSnapshot(
        doc(dbx, "spaces", spaceId, "lessons", assignmentId, "submissions", submissionId),
        (snap) => {
          if (!snap.exists()) {
            patch(assignmentId, {
              hasSubmission: false,
              submissionStatus: null,
              hasAiFeedback: false,
              autoSummary: null,
            });
            return;
          }

          const data = snap.data() as ParentSpaceSubmissionDoc;
          patch(assignmentId, {
            hasSubmission: true,
            submissionStatus: safeString(data.status),
            hasAiFeedback: !!safeString(data.aiFeedback),
            autoSummary: renderAutoSummary(data.auto),
          });
        },
        () => {}
      );

      const unsubReview = onSnapshot(
        doc(dbx, "spaces", spaceId, "lessons", assignmentId, "parentReviews", user.uid),
        (snap) => {
          if (!snap.exists()) {
            patch(assignmentId, {
              hasParentReview: false,
              reviewStars: null,
            });
            return;
          }

          const data = snap.data() as ParentReviewDoc;
          patch(assignmentId, {
            hasParentReview: true,
            reviewStars: safeNumber(data.stars),
          });
        },
        () => {}
      );

      unsubs.push(unsubSubmission, unsubReview);
    }

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [assignments, spaceId, user?.uid]);

  const visibleAssignments = useMemo(
    () => (showArchived ? assignments : assignments.filter((x) => !isArchived(x.data))),
    [assignments, showArchived]
  );

  const activeAssignmentId = useMemo(() => {
    if (!space || !isRecord(space)) return null;
    return safeString((space as Record<string, unknown>).activeLessonId);
  }, [space]);

  const activeAssignmentDoc = useMemo(() => {
    if (!activeAssignmentId) return null;
    return assignments.find((a) => a.id === activeAssignmentId)?.data ?? null;
  }, [assignments, activeAssignmentId]);

  const activeAssignmentMeta = useMemo(() => {
    if (!activeAssignmentId) return null;
    return statusMap[activeAssignmentId] ?? null;
  }, [statusMap, activeAssignmentId]);

  const activeAssignmentHref = activeAssignmentId
    ? `/parent/spaces/${spaceId}/assignments/${activeAssignmentId}`
    : null;

  const spaceRec: Record<string, unknown> = isRecord(space) ? (space as Record<string, unknown>) : {};
  const spaceTitle = safeString(spaceRec.title) ?? tx("header.untitled", "Untitled space");
  const spaceCode = safeString(spaceRec.code);
  const spaceKind = safeString(spaceRec.kind);
  const activeLessonTitleFromSpace = safeString(spaceRec.activeLessonTitle);

  if (missing) {
    return (
      <div style={{ padding: 16 }}>
        <h1>{tx("missing.title", "Space not found")}</h1>
        <div style={{ opacity: 0.75 }}>{tx("missing.subtitle", "This space does not exist or is unavailable.")}</div>
        <div style={{ marginTop: 12 }}>
          <Link href="/parent/spaces">{tx("actions.backToMySpaces", "Back to my spaces")}</Link>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: 16 }}>
        <h1>{tx("error.title", "Something went wrong")}</h1>
        <div style={{ color: "crimson", whiteSpace: "pre-wrap", marginTop: 8 }}>{err}</div>
        <div style={{ marginTop: 12 }}>
          <Link href="/parent/spaces">{tx("actions.backToMySpaces", "Back to my spaces")}</Link>
        </div>
      </div>
    );
  }

  if (!space) {
    return <div style={{ padding: 16 }}>{tx("loading", "Loading…")}</div>;
  }

  return (
    <main style={{ maxWidth: 900, margin: "14px auto", padding: 12 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/parent/spaces">{tx("actions.backToMySpaces", "Back to my spaces")}</Link>
      </div>

      <section
        style={{
          border: "1px solid rgba(0,0,0,0.10)",
          borderRadius: 16,
          background: "white",
          padding: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>{spaceTitle}</h1>

            <div style={{ opacity: 0.72, marginTop: 8 }}>
              {tx("header.kind", "Type")}: <b>{kindLabel(spaceKind)}</b>
            </div>

            {spaceCode ? (
              <div style={{ opacity: 0.72, marginTop: 4 }}>
                {tx("header.code", "Code")}: <b>{spaceCode}</b>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section
        style={{
          marginTop: 14,
          border: "1px solid rgba(0,0,0,0.10)",
          borderRadius: 16,
          background: "white",
          padding: 18,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          {tx("active.title", "Active lesson")}
        </div>

        {activeAssignmentId && activeAssignmentHref ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {activeLessonTitleFromSpace ??
                safeString(activeAssignmentDoc?.title) ??
                tx("active.defaultTitle", "Lesson")}
            </div>

            {safeString(activeAssignmentDoc?.level) || safeString(activeAssignmentDoc?.language) ? (
              <div style={{ fontSize: 13, opacity: 0.72, marginTop: 6 }}>
                {[safeString(activeAssignmentDoc?.level), safeString(activeAssignmentDoc?.language)]
                  .filter(Boolean)
                  .join(" • ")}
              </div>
            ) : null}

            {activeAssignmentMeta ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <Badge
                  text={statusLabel(activeAssignmentMeta.submissionStatus)}
                  tone={statusTone(activeAssignmentMeta.submissionStatus)}
                />
                {activeAssignmentMeta.autoSummary ? (
                  <Badge text={`Auto: ${activeAssignmentMeta.autoSummary}`} tone="neutral" />
                ) : null}
                {activeAssignmentMeta.hasAiFeedback ? (
                  <Badge text="AI-feedback" tone="good" />
                ) : null}
                {activeAssignmentMeta.hasParentReview ? (
                  <Badge
                    text={
                      activeAssignmentMeta.reviewStars
                        ? `Foreldrevurdering • ${activeAssignmentMeta.reviewStars}★`
                        : "Foreldrevurdering"
                    }
                    tone="good"
                  />
                ) : null}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <Link
                href={activeAssignmentHref}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "#111",
                  color: "#fff",
                  borderRadius: 10,
                  textDecoration: "none",
                }}
              >
                {tx("active.open", "Open")}
              </Link>

            </div>
          </>
        ) : (
          <div style={{ opacity: 0.75 }}>{tx("active.none", "No active lesson right now.")}</div>
        )}
      </section>

      <section
        style={{
          marginTop: 14,
          border: "1px solid rgba(0,0,0,0.10)",
          borderRadius: 16,
          background: "white",
          padding: 18,
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
          <div style={{ fontWeight: 800 }}>{tx("all.title", "All lessons")}</div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", opacity: 0.85 }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            {tx("all.showArchived", "Show archived")}
          </label>
        </div>

        {assignErr ? (
          <div style={{ marginTop: 10, color: "crimson", whiteSpace: "pre-wrap" }}>{assignErr}</div>
        ) : visibleAssignments.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.75 }}>{tx("all.none", "No lessons yet.")}</div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {visibleAssignments.map((it) => {
              const title = titleOfAssignment(it.data, it.id);
              const snippet = assignmentSnippet(it.data);
              const archived = isArchived(it.data);
              const href = `/parent/spaces/${spaceId}/assignments/${it.id}`;
              const meta = statusMap[it.id] ?? null;

              return (
                <div
                  key={it.id}
                  style={{
                    border: "1px solid rgba(0,0,0,0.10)",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 240, flex: 1 }}>
                      <div style={{ fontWeight: 800 }}>
                        {title}{" "}
                        {archived ? (
                          <span style={{ fontWeight: 600, opacity: 0.6 }}>
                            {tx("all.archivedTag", "(archived)")}
                          </span>
                        ) : null}
                      </div>

                      {safeString(it.data.level) || safeString(it.data.language) ? (
                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                          {[safeString(it.data.level), safeString(it.data.language)]
                            .filter(Boolean)
                            .join(" • ")}
                        </div>
                      ) : null}

                      {meta ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                          <Badge
                            text={statusLabel(meta.submissionStatus)}
                            tone={statusTone(meta.submissionStatus)}
                          />
                          {meta.autoSummary ? (
                            <Badge text={`Auto: ${meta.autoSummary}`} tone="neutral" />
                          ) : null}
                          {meta.hasAiFeedback ? (
                            <Badge text="AI-feedback" tone="good" />
                          ) : null}
                          {meta.hasParentReview ? (
                            <Badge
                              text={
                                meta.reviewStars
                                  ? `Foreldrevurdering • ${meta.reviewStars}★`
                                  : "Foreldrevurdering"
                              }
                              tone="good"
                            />
                          ) : null}
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                          <Badge text="Ikke startet" tone="neutral" />
                        </div>
                      )}

                      {snippet ? (
                        <div style={{ marginTop: 8, opacity: 0.8, whiteSpace: "pre-wrap" }}>{snippet}</div>
                      ) : null}
                    </div>

                    <Link
                      href={href}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "8px 12px",
                        background: "#111",
                        color: "#fff",
                        borderRadius: 10,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                        height: "fit-content",
                      }}
                    >
                      {tx("actions.open", "Open")}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}