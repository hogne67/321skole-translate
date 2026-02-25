// app/(app)/student/spaces/[spaceId]/page.tsx
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
  where,
  limit,
  writeBatch,
  serverTimestamp,
  type Firestore,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { SpaceDoc } from "@/lib/spacesClient";
import { useUserProfile } from "@/lib/useUserProfile";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
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

function isFsTimestampLike(x: unknown): x is { toMillis: () => number } {
  return (
    !!x &&
    typeof x === "object" &&
    "toMillis" in x &&
    typeof (x as { toMillis?: unknown }).toMillis === "function"
  );
}

function toMillisAny(x: unknown): number {
  if (isFsTimestampLike(x)) {
    try {
      const v = x.toMillis();
      if (typeof v === "number" && isFinite(v)) return v;
    } catch (e: unknown) {
      void e;
    }
  }
  if (typeof x === "number" && isFinite(x)) return x;
  return 0;
}

function normalizeStatus(
  s: unknown
): "submitted" | "needs_work" | "approved" | "draft" | "unknown" {
  const v = String(s ?? "").toLowerCase().trim();
  if (v === "needs_work" || v === "needswork" || v === "needs-work") return "needs_work";
  // treat reviewed as approved in UI
  if (v === "reviewed" || v === "approved" || v === "ok" || v === "passed" || v === "done")
    return "approved";
  if (v === "submitted" || v === "sent" || v === "delivered") return "submitted";
  if (v === "draft") return "draft";
  return "unknown";
}

function pillStyle(st: ReturnType<typeof normalizeStatus>) {
  if (st === "needs_work")
    return { border: "1px solid rgba(245,158,11,0.60)", background: "rgba(245,158,11,0.18)" };
  if (st === "approved")
    return { border: "1px solid rgba(46,204,113,0.60)", background: "rgba(46,204,113,0.16)" };
  return { border: "1px solid rgba(0,0,0,0.22)", background: "rgba(0,0,0,0.04)" };
}

function StatusPill({
  status,
  label,
  hint,
}: {
  status: ReturnType<typeof normalizeStatus>;
  label: string;
  hint: string;
}) {
  return (
    <span
      title={hint}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 10px",
        borderRadius: 999,
        fontWeight: 900,
        fontSize: 12,
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...pillStyle(status),
      }}
    >
      {label}
    </span>
  );
}

type AssignmentDoc = {
  title?: string;
  description?: string;
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

function assignmentSnippet(d: AssignmentDoc) {
  const asRec: Record<string, unknown> = d;
  const s = safeString(d.description ?? asRec.summary ?? asRec.subtitle);
  if (!s) return null;
  return s.length > 140 ? s.slice(0, 140) + "…" : s;
}

function isArchived(d: AssignmentDoc) {
  return d.archived === true || String(d.status ?? "").toLowerCase() === "archived";
}

// spaceSubmissions row
type SpaceSubRow = {
  id: string;
  assignmentId: string;
  status: ReturnType<typeof normalizeStatus>;
  updatedAtMs: number;
  createdAtMs: number;
  title: string | null;
  level: string | null;
  language: string | null;
  hasTeacherMessage: boolean;

  studentArchived: boolean;
  studentArchivedAtMs: number;
};

function detectTeacherMessage(data: Record<string, unknown>) {
  const tf = isRecord(data.teacherFeedback) ? data.teacherFeedback : null;
  if (tf && isRecord(tf)) {
    const t = safeString(tf.text ?? tf.message ?? tf.comment ?? tf.body ?? tf.note);
    if (t) return true;
    const updatedAtMs = toMillisAny(tf.updatedAt);
    if (updatedAtMs > 0) return true;
  }

  const t2 = safeString(data.teacherText ?? data.feedback);
  if (t2) return true;

  const updatedAtMs2 = toMillisAny(data.teacherFeedbackUpdatedAt);
  return updatedAtMs2 > 0;
}

export default function StudentSpaceDetailPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const t = useTranslations("student.spaceDetail");
  const locale = useLocale();

  const { user } = useUserProfile();
  const uid = user?.uid ?? null;

  const [space, setSpace] = useState<SpaceDoc | null>(null);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<Array<{ id: string; data: AssignmentDoc }>>([]);
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [subsLoading, setSubsLoading] = useState(true);
  const [subsErr, setSubsErr] = useState<string | null>(null);
  const [subs, setSubs] = useState<SpaceSubRow[]>([]);

  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);

  const dateLocale = useMemo(() => {
    // next-intl locale -> Intl locale (good enough)
    if (locale === "no") return "nb-NO";
    if (locale === "en") return "en-GB";
    return locale;
  }, [locale]);

  function fmtDate(ms: number) {
    if (!ms || !isFinite(ms)) return null;
    try {
      const d = new Date(ms);
      return new Intl.DateTimeFormat(dateLocale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return null;
    }
  }

  function statusUi(st: ReturnType<typeof normalizeStatus>) {
    switch (st) {
      case "submitted":
        return { label: t("status.submitted"), hint: t("statusHints.submitted") };
      case "needs_work":
        return { label: t("status.needsWork"), hint: t("statusHints.needsWork") };
      case "approved":
        return { label: t("status.approved"), hint: t("statusHints.approved") };
      case "draft":
        return { label: t("status.draft"), hint: t("statusHints.draft") };
      default:
        return { label: t("status.unknown"), hint: "" };
    }
  }

  // --- SPACE DOC ---
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
        (e: unknown) => setErr(errMessage(e, t("errors.readSpace")))
      );
    } catch (e: unknown) {
      setErr(errMessage(e, t("errors.listenStart")));
    }
    return () => unsub?.();
  }, [spaceId, t]);

  // --- ASSIGNMENTS LIST (space-local) ---
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
          snap.forEach((d: QueryDocumentSnapshot<DocumentData>) =>
            out.push({ id: d.id, data: d.data() as AssignmentDoc })
          );
          setAssignments(out);
        },
        (e: unknown) => setAssignErr(errMessage(e, t("errors.readAssignments")))
      );
    } catch (e: unknown) {
      setAssignErr(errMessage(e, t("errors.listenAssignmentsStart")));
    }

    return () => unsub?.();
  }, [spaceId, t]);

  // --- MY SUBMISSIONS (spaceSubmissions) ---
  useEffect(() => {
    setSubsErr(null);
    setArchiveMsg(null);

    if (!uid) {
      setSubsLoading(false);
      setSubs([]);
      return () => {};
    }

    let unsub: (() => void) | null = null;
    setSubsLoading(true);

    try {
      const dbx = requireDb(db);

      const qy = query(
        collection(dbx, "spaceSubmissions"),
        where("spaceId", "==", spaceId),
        where("uid", "==", uid),
        orderBy("updatedAt", "desc"),
        limit(200)
      );

      unsub = onSnapshot(
        qy,
        (snap) => {
          const out: SpaceSubRow[] = [];
          snap.forEach((d) => {
            const data = ((d.data() as unknown) as Record<string, unknown>) ?? {};
            const assignmentId = safeString(data.assignmentId) ?? "";
            if (!assignmentId) return;

            const updatedAtMs = toMillisAny(data.updatedAt) || toMillisAny(data.createdAt);
            const createdAtMs = toMillisAny(data.createdAt);

            const studentArchived = data.studentArchived === true;
            const studentArchivedAtMs = toMillisAny(data.studentArchivedAt);

            out.push({
              id: d.id,
              assignmentId,
              status: normalizeStatus(data.status),
              updatedAtMs,
              createdAtMs,
              title: safeString(data.title) ?? null,
              level: safeString(data.level) ?? null,
              language: safeString(data.language) ?? null,
              hasTeacherMessage: detectTeacherMessage(data),

              studentArchived,
              studentArchivedAtMs,
            });
          });

          out.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
          setSubs(out);
          setSubsLoading(false);
        },
        (e: unknown) => {
          const code =
            e && typeof e === "object" && "code" in e
              ? String((e as { code?: unknown }).code ?? "error")
              : "error";
          setSubsErr(`${code}: ${errMessage(e, t("errors.readSubmissions"))}`);
          setSubsLoading(false);
        }
      );
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: unknown }).code ?? "error")
          : "error";
      setSubsErr(`${code}: ${errMessage(e, t("errors.listenStart"))}`);
      setSubsLoading(false);
    }

    return () => unsub?.();
  }, [spaceId, uid, t]);

  const activeAssignmentId = useMemo(() => (space?.activeLessonId ?? null) as string | null, [space]);

  const activeAssignmentDoc = useMemo(() => {
    if (!activeAssignmentId) return null;
    return assignments.find((a) => a.id === activeAssignmentId)?.data ?? null;
  }, [assignments, activeAssignmentId]);

  const visibleAssignments = useMemo(
    () => (showArchived ? assignments : assignments.filter((x) => !isArchived(x.data))),
    [assignments, showArchived]
  );

  // latest per assignmentId (from spaceSubmissions)
  const latestByAssignment = useMemo(() => {
    const m = new Map<string, SpaceSubRow>();
    for (const r of subs) {
      if (!m.has(r.assignmentId)) m.set(r.assignmentId, r);
    }
    return m;
  }, [subs]);

  const grouped = useMemo(() => {
    const out: Array<{ assignmentId: string; latest: SpaceSubRow }> = [];
    for (const [assignmentId, latest] of latestByAssignment.entries()) out.push({ assignmentId, latest });
    out.sort((a, b) => (b.latest.updatedAtMs || 0) - (a.latest.updatedAtMs || 0));
    return out;
  }, [latestByAssignment]);

  const activeSubs = useMemo(() => grouped.filter((g) => g.latest.studentArchived !== true), [grouped]);
  const archivedSubs = useMemo(() => grouped.filter((g) => g.latest.studentArchived === true), [grouped]);

  function titleFor(assignmentId: string) {
    const s = latestByAssignment.get(assignmentId);
    return s?.title ?? assignmentId;
  }

  function metaForRow(r: SpaceSubRow | null) {
    if (!r) return null;
    const parts = [safeString(r.level), safeString(r.language)].filter(Boolean);
    return parts.length ? parts.join(" • ") : null;
  }

  const activeMine = useMemo(() => {
    if (!activeAssignmentId) return null;
    return latestByAssignment.get(activeAssignmentId) ?? null;
  }, [activeAssignmentId, latestByAssignment]);

  const shouldShowActiveAssignment = useMemo(() => {
    if (!activeAssignmentId) return false;
    if (!uid) return true;
    return !activeMine;
  }, [activeAssignmentId, uid, activeMine]);

  const activeAssignmentHref = activeAssignmentId
    ? `/student/spaces/${spaceId}/assignments/${activeAssignmentId}`
    : null;

  const spaceRec: Record<string, unknown> = isRecord(space) ? (space as Record<string, unknown>) : {};
  const spaceCode = safeString(spaceRec.code);
  const activeLessonTitleFromSpace = safeString(spaceRec.activeLessonTitle);

  async function moveToArchive(subId: string) {
    if (!uid) return;
    setArchiveMsg(null);
    setArchivingId(subId);

    try {
      const dbx = requireDb(db);
      const ref = doc(dbx, "spaceSubmissions", subId);

      const batch = writeBatch(dbx);
      batch.update(ref, {
        studentArchived: true,
        studentArchivedAt: serverTimestamp(),
      });
      await batch.commit();

      setArchiveMsg(t("toast.movedToArchive"));
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code?: unknown }).code ?? "error") : "error";
      setArchiveMsg(`${code}: ${errMessage(e, t("errors.archiveMove"))}`);
    } finally {
      setArchivingId(null);
      setTimeout(() => setArchiveMsg(null), 2500);
    }
  }

  async function restoreFromArchive(subId: string) {
    if (!uid) return;
    setArchiveMsg(null);
    setArchivingId(subId);

    try {
      const dbx = requireDb(db);
      const ref = doc(dbx, "spaceSubmissions", subId);

      const batch = writeBatch(dbx);
      batch.update(ref, {
        studentArchived: false,
        studentArchivedAt: null,
      });
      await batch.commit();

      setArchiveMsg(t("toast.restored"));
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code?: unknown }).code ?? "error") : "error";
      setArchiveMsg(`${code}: ${errMessage(e, t("errors.archiveRestore"))}`);
    } finally {
      setArchivingId(null);
      setTimeout(() => setArchiveMsg(null), 2500);
    }
  }

  if (missing) {
    return (
      <div style={{ padding: 16 }}>
        <h1>{t("missing.title")}</h1>
        <div style={{ opacity: 0.75 }}>{t("missing.subtitle")}</div>
        <div style={{ marginTop: 12 }}>
          <Link href="/student/spaces">{t("actions.backToMySpaces")}</Link>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: 16 }}>
        <h1>{t("error.title")}</h1>
        <div style={{ color: "crimson", whiteSpace: "pre-wrap", marginTop: 8 }}>{err}</div>
        <div style={{ marginTop: 12 }}>
          <Link href="/student/spaces">{t("actions.backToMySpaces")}</Link>
        </div>
      </div>
    );
  }

  if (!space) return <div style={{ padding: 16 }}>{t("loading")}</div>;

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>{safeString(space.title) ?? safeString(spaceRec.title) ?? t("header.untitled")}</h1>
          <div style={{ opacity: 0.7 }}>
            {t("header.classCode")}: <b>{spaceCode ?? "—"}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/student/spaces">{t("actions.backMySpacesShort")}</Link>
        </div>
      </div>

      {archiveMsg ? (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            background: "rgba(0,0,0,0.02)",
          }}
        >
          {archiveMsg}
        </div>
      ) : null}

      {/* 1) ACTIVE ASSIGNMENT */}
      <div
        style={{
          marginTop: 14,
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          padding: 12,
          background: "white",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 6 }}>{t("active.title")}</div>

        {activeAssignmentId && shouldShowActiveAssignment && activeAssignmentHref ? (
          <>
            <div style={{ opacity: 0.92, marginBottom: 6, fontWeight: 900, fontSize: 16 }}>
              {activeLessonTitleFromSpace ??
                safeString(activeAssignmentDoc?.title) ??
                titleFor(activeAssignmentId)}
            </div>

            {safeString(activeAssignmentDoc?.level) || safeString(activeAssignmentDoc?.language) ? (
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                {[safeString(activeAssignmentDoc?.level), safeString(activeAssignmentDoc?.language)]
                  .filter(Boolean)
                  .join(" • ")}
              </div>
            ) : (
              <div style={{ marginBottom: 10 }} />
            )}

            <Link
              href={activeAssignmentHref}
              style={{
                display: "inline-block",
                padding: "10px 14px",
                background: "#111",
                color: "#fff",
                borderRadius: 10,
                textDecoration: "none",
              }}
            >
              {t("active.open")}
            </Link>

            <div style={{ marginTop: 10, opacity: 0.7 }}>{t("active.hint")}</div>
          </>
        ) : (
          <div style={{ opacity: 0.75 }}>{t("active.none")}</div>
        )}
      </div>

      {/* 2) MY SUBMISSIONS */}
      <div
        style={{
          marginTop: 14,
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          padding: 12,
          background: "white",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 900 }}>{t("mine.title")}</div>
            <div style={{ opacity: 0.7, fontSize: 13 }}>{t("mine.subtitle")}</div>
          </div>

          <button
            type="button"
            onClick={() => location.reload()}
            style={{
              border: "1px solid rgba(0,0,0,0.15)",
              borderRadius: 10,
              padding: "8px 12px",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {t("mine.refresh")}
          </button>
        </div>

        {!uid ? (
          <div style={{ marginTop: 12, opacity: 0.75 }}>{t("mine.loginToSee")}</div>
        ) : subsLoading ? (
          <div style={{ marginTop: 12, opacity: 0.7 }}>{t("loading")}</div>
        ) : subsErr ? (
          <div style={{ marginTop: 12, color: "crimson", whiteSpace: "pre-wrap" }}>{subsErr}</div>
        ) : activeSubs.length === 0 ? (
          <div style={{ marginTop: 12, opacity: 0.75 }}>{t("mine.none")}</div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {activeSubs.map((g) => {
              const r = g.latest;
              const href = `/student/spaces/${spaceId}/assignments/${g.assignmentId}?sid=${r.id}`;
              const dateStr = fmtDate(r.updatedAtMs || r.createdAtMs);
              const ui = statusUi(r.status);

              return (
                <div
                  key={g.assignmentId}
                  style={{
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 12,
                    padding: 12,
                    background: "white",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 240 }}>
                      <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.25 }}>
                        {r.title ?? titleFor(g.assignmentId)}
                      </div>

                      {metaForRow(r) ? (
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{metaForRow(r)}</div>
                      ) : null}

                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <StatusPill status={r.status} label={ui.label} hint={ui.hint} />
                        {dateStr ? <span style={{ fontSize: 12, opacity: 0.75 }}>{dateStr}</span> : null}
                        {r.hasTeacherMessage ? (
                          <span style={{ fontSize: 12, opacity: 0.9 }}>{t("mine.teacherMessage")}</span>
                        ) : null}
                      </div>

                      {r.status === "needs_work" ? (
                        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>{t("mine.openForImprovement")}</div>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      {r.status === "approved" ? (
                        <button
                          type="button"
                          onClick={() => moveToArchive(r.id)}
                          disabled={archivingId === r.id}
                          style={{
                            border: "1px solid rgba(0,0,0,0.15)",
                            borderRadius: 10,
                            padding: "8px 10px",
                            background: "white",
                            fontWeight: 900,
                            cursor: archivingId === r.id ? "default" : "pointer",
                            opacity: archivingId === r.id ? 0.6 : 1,
                            whiteSpace: "nowrap",
                          }}
                          title={t("mine.archiveHint")}
                        >
                          {archivingId === r.id ? t("mine.archiving") : t("mine.moveToArchive")}
                        </button>
                      ) : null}

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
                        {t("actions.open")}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3) ARCHIVE */}
      <div
        style={{
          marginTop: 14,
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          padding: 12,
          background: "white",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 6 }}>{t("archive.title")}</div>

        {!uid ? (
          <div style={{ opacity: 0.75 }}>{t("archive.loginToSee")}</div>
        ) : subsLoading ? (
          <div style={{ opacity: 0.7 }}>{t("loading")}</div>
        ) : archivedSubs.length === 0 ? (
          <div style={{ opacity: 0.75 }}>{t("archive.none")}</div>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {archivedSubs.map((g) => {
              const r = g.latest;
              const href = `/student/spaces/${spaceId}/assignments/${g.assignmentId}?sid=${r.id}`;
              const dateStr = fmtDate(r.studentArchivedAtMs || r.updatedAtMs || r.createdAtMs);
              const ui = statusUi(r.status);

              return (
                <div
                  key={g.assignmentId}
                  style={{ border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, padding: 12 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 240 }}>
                      <div style={{ fontWeight: 900 }}>{r.title ?? titleFor(g.assignmentId)}</div>
                      {metaForRow(r) ? (
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{metaForRow(r)}</div>
                      ) : null}

                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <StatusPill status={r.status} label={ui.label} hint={ui.hint} />
                        {dateStr ? <span style={{ fontSize: 12, opacity: 0.75 }}>{dateStr}</span> : null}
                        {r.hasTeacherMessage ? <span style={{ fontSize: 12, opacity: 0.9 }}>{t("archive.message")}</span> : null}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => restoreFromArchive(r.id)}
                        disabled={archivingId === r.id}
                        style={{
                          border: "1px solid rgba(0,0,0,0.15)",
                          borderRadius: 10,
                          padding: "8px 10px",
                          background: "white",
                          fontWeight: 900,
                          cursor: archivingId === r.id ? "default" : "pointer",
                          opacity: archivingId === r.id ? 0.6 : 1,
                          whiteSpace: "nowrap",
                        }}
                        title={t("archive.restoreHint")}
                      >
                        {archivingId === r.id ? t("archive.restoring") : t("archive.restore")}
                      </button>

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
                        {t("actions.open")}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ALL ASSIGNMENTS */}
      <div
        style={{
          marginTop: 14,
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          padding: 12,
          background: "white",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>{t("all.title")}</div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", opacity: 0.85 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            {t("all.showArchived")}
          </label>
        </div>

        {assignErr ? (
          <div style={{ marginTop: 10, color: "crimson", whiteSpace: "pre-wrap" }}>{assignErr}</div>
        ) : visibleAssignments.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.75 }}>{t("all.none")}</div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {visibleAssignments.map((it) => {
              const title = safeString(it.data.title) ?? it.id;
              const snippet = assignmentSnippet(it.data);
              const archived = isArchived(it.data);

              const mine = uid ? latestByAssignment.get(it.id) : null;

              const href = mine
                ? `/student/spaces/${spaceId}/assignments/${it.id}?sid=${mine.id}`
                : `/student/spaces/${spaceId}/assignments/${it.id}`;

              const mineUi = mine ? statusUi(mine.status) : null;
              const mineDate = mine ? fmtDate(mine.updatedAtMs || mine.createdAtMs) : null;

              return (
                <div key={it.id} style={{ border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 240 }}>
                      <div style={{ fontWeight: 900 }}>
                        {title}{" "}
                        {archived ? <span style={{ fontWeight: 600, opacity: 0.6 }}>{t("all.archivedTag")}</span> : null}
                      </div>

                      {mine ? (
                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 12, opacity: 0.65 }}>{t("all.yourStatus")}</span>
                          <StatusPill status={mine.status} label={mineUi!.label} hint={mineUi!.hint} />
                          {mine.hasTeacherMessage ? (
                            <span style={{ fontSize: 12, opacity: 0.9 }}>{t("all.message")}</span>
                          ) : null}
                          {mineDate ? <span style={{ fontSize: 12, opacity: 0.75 }}>{mineDate}</span> : null}
                        </div>
                      ) : (
                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>{t("all.notSubmitted")}</div>
                      )}
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
                      {t("actions.open")}
                    </Link>
                  </div>

                  {snippet ? <div style={{ marginTop: 8, opacity: 0.8, whiteSpace: "pre-wrap" }}>{snippet}</div> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}