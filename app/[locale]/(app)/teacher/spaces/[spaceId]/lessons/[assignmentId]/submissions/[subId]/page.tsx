// app/[locale]/(app)/teacher/spaces/[spaceId]/lessons/[assignmentId]/submissions/[subId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import { doc, getDoc, onSnapshot, serverTimestamp, Timestamp, writeBatch, type Firestore } from "firebase/firestore";
import { useUserProfile } from "@/lib/useUserProfile";
import AttestationAndModeCard from "@/components/AttestationAndModeCard";
import { useLocale, useTranslations } from "next-intl";
import { authedPost } from "@/lib/authedPost";

type Mode = "student" | "teacher" | "creator" | "parent";

// Teacher review statuses (your “grading system”)
type ReviewStatus = "reviewed" | "needs_work";

// Submission status can also be draft/submitted etc.
type SubmissionStatus = ReviewStatus | "draft" | "submitted" | "approved" | string;

type SourceType = "myContent" | "library";
type TaskType = "mcq" | "truefalse" | "open";

type Task = {
  id?: string;
  order?: number;
  type?: TaskType | string;
  prompt?: string;
  options?: unknown[];
  correctAnswer?: unknown;
};

type AnswersMap = Record<string, unknown>;

type TeacherFeedback = {
  text?: string;
  updatedAt?: unknown;
  teacherUid?: string | null;
};

type AiFeedback = {
  text?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  teacherUid?: string | null;
  // later: model, promptVersion, etc.
};

type AutoGradeEntry = {
  type: "mcq" | "truefalse";
  isCorrect: boolean;
  studentAnswer: unknown;
  correctAnswer: unknown;
};

type AutoGrade = {
  totalAuto: number;
  correctAuto: number;
  wrongAuto: number;
  unansweredAuto: number;
  percentAuto: number | null;
  byTask: Record<string, AutoGradeEntry>;
};

type SubmissionDoc = {
  createdAt?: unknown;
  updatedAt?: unknown;
  status?: SubmissionStatus;
  answers?: AnswersMap | unknown;
  auth?: { isAnon?: boolean; uid?: string | null } | unknown;

  studentName?: string;
  studentDisplayName?: string;

  teacherFeedback?: TeacherFeedback | null;

  // ✅ AI feedback stored here
  aiFeedback?: AiFeedback | null;

  auto?: AutoGrade | unknown;

  spaceId?: string;
  assignmentId?: string;
};

type AssignmentDoc = {
  status?: "active" | "archived" | string;
  sourceType?: SourceType;
  sourceId?: string;

  title?: string;
  level?: string;
  language?: string;
  topic?: string;
  description?: string;

  createdAt?: unknown;
  assignedAt?: unknown;
  assignedByUid?: string;
};

type Lesson = {
  title?: string;
  level?: string;
  topic?: string;
  language?: string;
  sourceText?: string;
  text?: string;
  tasks?: unknown;
  coverImageUrl?: string;
  isActive?: boolean;
  status?: string;
};

type SpaceMemberDoc = {
  name?: string;
  fullName?: string;
  displayName?: string;
  uid?: string;
  role?: string;
};

// ✅ API response type (only once)
type AiResp = { text: string; skipped?: boolean; locale?: string };

/* =========================
   Helpers
========================= */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readModeFromProfile(profile: unknown): Mode {
  if (!isRecord(profile)) return "student";
  const m = profile["mode"];
  return m === "teacher" || m === "creator" || m === "parent" || m === "student" ? m : "student";
}

function readHasAttested(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  const att = profile["attestation"];
  if (!isRecord(att)) return false;
  return Boolean(att["acceptedAt"]);
}

function getErrorInfo(err: unknown): { code?: string; message: string } {
  if (err instanceof Error) return { message: err.message };
  if (typeof err === "string") return { message: err };
  if (err && typeof err === "object") {
    const code = "code" in err ? (err as { code?: unknown }).code : undefined;
    const message = "message" in err ? (err as { message?: unknown }).message : undefined;
    return {
      code: typeof code === "string" ? code : undefined,
      message: typeof message === "string" ? message : JSON.stringify(err),
    };
  }
  return { message: String(err) };
}

function formatMaybeDate(v: unknown) {
  try {
    if (!v) return "";
    const d: Date | null =
      v instanceof Date
        ? v
        : typeof (v as { toDate?: unknown })?.toDate === "function"
        ? (v as { toDate: () => Date }).toDate()
        : v instanceof Timestamp
        ? v.toDate()
        : null;
    return d ? d.toLocaleString() : "";
  } catch {
    return "";
  }
}

function readTeacherFeedbackText(sub: SubmissionDoc): string {
  const tf = sub.teacherFeedback;
  if (!tf || typeof tf !== "object") return "";
  const t = (tf as { text?: unknown }).text;
  return typeof t === "string" ? t : "";
}

function readAiFeedbackText(sub: SubmissionDoc): string {
  const af = sub.aiFeedback;
  if (!af || typeof af !== "object") return "";
  const t = (af as { text?: unknown }).text;
  return typeof t === "string" ? t : "";
}

function readStatus(sub: SubmissionDoc): SubmissionStatus {
  const s = sub.status;
  if (typeof s === "string" && s.trim()) return s as SubmissionStatus;
  // default (legacy): needs_work
  return "needs_work";
}

/** Default needs_work (yellow) for toggle */
function readStatusDefaultNeedsWork(sub: SubmissionDoc): ReviewStatus {
  const s = sub.status;
  return s === "needs_work" || s === "reviewed" ? s : "needs_work";
}

function readAuth(sub: SubmissionDoc): { isAnon: boolean; uid: string | null } {
  const a = sub.auth;
  if (!a || typeof a !== "object") return { isAnon: false, uid: null };
  const isAnon = (a as { isAnon?: unknown }).isAnon === true;
  const uidRaw = (a as { uid?: unknown }).uid;
  return { isAnon, uid: typeof uidRaw === "string" ? uidRaw : null };
}

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

function safeTasksArray(tasks: unknown): Task[] {
  if (Array.isArray(tasks)) return tasks as Task[];
  if (typeof tasks === "string") {
    try {
      const parsed: unknown = JSON.parse(tasks);
      return Array.isArray(parsed) ? (parsed as Task[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getStableTaskId(t: Task, idx: number): string {
  if (t?.id != null && String(t.id).trim()) return String(t.id).trim();

  const orderPart = t?.order != null ? String(t.order) : "x";
  const promptPart = typeof t?.prompt === "string" ? t.prompt.trim().slice(0, 80) : "";
  if (promptPart) return `${orderPart}__${promptPart}`;

  return `${orderPart}__idx${idx}`;
}

function readAnswerMap(a: unknown): AnswersMap {
  if (a && typeof a === "object" && !Array.isArray(a)) return a as AnswersMap;
  return {};
}

function readAutoGrade(sub: SubmissionDoc | null): AutoGrade | null {
  const a = sub?.auto;
  if (!a || typeof a !== "object") return null;

  const r = a as Partial<AutoGrade>;
  const totalAuto = typeof r.totalAuto === "number" ? r.totalAuto : 0;
  const correctAuto = typeof r.correctAuto === "number" ? r.correctAuto : 0;
  const wrongAuto = typeof r.wrongAuto === "number" ? r.wrongAuto : 0;
  const unansweredAuto = typeof r.unansweredAuto === "number" ? r.unansweredAuto : 0;
  const percentAuto = typeof r.percentAuto === "number" ? r.percentAuto : null;
  const byTask =
    r.byTask && typeof r.byTask === "object" && !Array.isArray(r.byTask) ? (r.byTask as Record<string, AutoGradeEntry>) : {};

  if (totalAuto === 0 && Object.keys(byTask).length === 0) return null;

  return { totalAuto, correctAuto, wrongAuto, unansweredAuto, percentAuto, byTask };
}

function getAutoEntry(auto: AutoGrade | null, stableId: string): AutoGradeEntry | undefined {
  const byTask = auto?.byTask;
  if (!byTask || typeof byTask !== "object") return undefined;

  const v = (byTask as Record<string, unknown>)[stableId];
  if (!v || typeof v !== "object") return undefined;

  const e = v as Partial<AutoGradeEntry>;
  if (e.type !== "mcq" && e.type !== "truefalse") return undefined;
  if (typeof e.isCorrect !== "boolean") return undefined;

  return e as AutoGradeEntry;
}

/**
 * Locale-safe link helper
 */
function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
}

function renderValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

async function safeCopyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ignore
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/* =========================
   UI bits
========================= */

function StatusPill({
  status,
  t,
}: {
  status: SubmissionStatus;
  t: (k: string) => string;
}) {
  const s = String(status || "").toLowerCase();

  const isDraft = s === "draft";
  const isApproved = s === "reviewed" || s === "approved";
  const isNeeds = s === "needs_work";
  const isSubmitted = s === "submitted";

  const bg = isDraft
    ? "rgba(99,102,241,0.12)"
    : isApproved
    ? "rgba(16,185,129,0.16)"
    : isNeeds
    ? "rgba(245,158,11,0.18)"
    : isSubmitted
    ? "rgba(0,0,0,0.06)"
    : "rgba(0,0,0,0.06)";

  const bd = isDraft
    ? "rgba(99,102,241,0.40)"
    : isApproved
    ? "rgba(16,185,129,0.45)"
    : isNeeds
    ? "rgba(245,158,11,0.55)"
    : "rgba(0,0,0,0.16)";

  const tx = isDraft
    ? "rgba(67,56,202,1)"
    : isApproved
    ? "rgba(5,150,105,1)"
    : isNeeds
    ? "rgba(180,83,9,1)"
    : "rgba(0,0,0,0.70)";

  const label = isDraft
    ? t("status.draft")
    : isApproved
    ? t("status.approved")
    : isNeeds
    ? t("status.needsWork")
    : isSubmitted
    ? t("status.submitted")
    : t("status.submitted");

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${bd}`,
        background: bg,
        color: tx,
        fontWeight: 800,
        fontSize: 12,
      }}
    >
      {label}
    </span>
  );
}

function Badge({
  text,
  kind = "neutral",
  title,
}: {
  text: string;
  kind?: "neutral" | "good" | "bad" | "warn";
  title?: string;
}) {
  const styles =
    kind === "good"
      ? { bg: "rgba(16,185,129,0.16)", bd: "rgba(16,185,129,0.45)", tx: "rgba(5,150,105,1)" }
      : kind === "bad"
      ? { bg: "rgba(231,76,60,0.14)", bd: "rgba(231,76,60,0.40)", tx: "rgba(180,40,30,1)" }
      : kind === "warn"
      ? { bg: "rgba(245,158,11,0.16)", bd: "rgba(245,158,11,0.45)", tx: "rgba(180,83,9,1)" }
      : { bg: "rgba(0,0,0,0.04)", bd: "rgba(0,0,0,0.14)", tx: "rgba(0,0,0,0.75)" };

  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${styles.bd}`,
        background: styles.bg,
        color: styles.tx,
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function AutoGradeBadge({
  auto,
  t,
}: {
  auto: AutoGrade | null;
  t: (k: string, v?: Record<string, unknown>) => string;
}) {
  if (!auto) return null;

  const pct = auto.percentAuto;
  const pctText = pct == null ? "" : ` (${pct}%)`;

  const main = t("auto.main", {
    correct: auto.correctAuto,
    total: auto.totalAuto,
    pctText,
  });

  const kind = pct == null ? "neutral" : pct >= 80 ? "good" : pct >= 50 ? "warn" : "bad";

  const details = t("auto.details", {
    correct: auto.correctAuto,
    wrong: auto.wrongAuto,
    unanswered: auto.unansweredAuto,
  });

  return <Badge text={main} kind={kind} title={details} />;
}

function StatusToggle({
  value,
  onChange,
  disabled,
  t,
}: {
  value: ReviewStatus;
  onChange: (v: ReviewStatus) => void;
  disabled?: boolean;
  t: (k: string) => string;
}) {
  const checked = value === "reviewed";
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, userSelect: "none" }}>
      <span style={{ fontSize: 13, opacity: 0.85 }}>{t("feedback.statusLabel")}</span>

      <button
        type="button"
        onClick={() => onChange(checked ? "needs_work" : "reviewed")}
        disabled={disabled}
        aria-pressed={checked}
        style={{
          position: "relative",
          width: 56,
          height: 32,
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.18)",
          background: checked ? "rgba(16,185,129,0.25)" : "rgba(245,158,11,0.25)",
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 28 : 3,
            width: 26,
            height: 26,
            borderRadius: 999,
            background: "white",
            border: "1px solid rgba(0,0,0,0.15)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.10)",
            transition: "left 120ms ease",
          }}
        />
      </button>

      <StatusPill status={value} t={t} />
    </label>
  );
}

export default function TeacherSubmissionPage() {
  return (
    <AuthGate>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const locale = useLocale();
  const t = useTranslations("teacher.submission");
  const tAny = t as unknown as (key: string, values?: Record<string, unknown>) => string;
  const tCommon = useTranslations("common");

  const params = useParams();
  const rawSpaceId = (params as Record<string, string | string[] | undefined>)["spaceId"];
  const rawAssignmentId = (params as Record<string, string | string[] | undefined>)["assignmentId"];
  const rawSubId = (params as Record<string, string | string[] | undefined>)["subId"];

  const spaceId = Array.isArray(rawSpaceId) ? rawSpaceId[0] : rawSpaceId;
  const assignmentId = Array.isArray(rawAssignmentId) ? rawAssignmentId[0] : rawAssignmentId;
  const subId = Array.isArray(rawSubId) ? rawSubId[0] : rawSubId;

  const hasParams = Boolean(spaceId && assignmentId && subId);

  const { user, profile, loading: profileLoading } = useUserProfile();

  const mode: Mode = useMemo(() => readModeFromProfile(profile), [profile]);
  const hasAttested = useMemo(() => readHasAttested(profile), [profile]);
  const canOperate = Boolean(user?.uid) && hasAttested && (mode === "teacher" || mode === "creator");

  const [sub, setSub] = useState<SubmissionDoc | null>(null);
  const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  const [studentName, setStudentName] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [loadingLesson, setLoadingLesson] = useState(true);

  const [text, setText] = useState("");
  const [status, setStatus] = useState<ReviewStatus>("needs_work");
  const [initialStatus, setInitialStatus] = useState<ReviewStatus>("needs_work");

  // ✅ AI box state
  const [aiText, setAiText] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const nestedRef = useMemo(
    () => (hasParams ? doc(db, "spaces", spaceId!, "lessons", assignmentId!, "submissions", subId!) : null),
    [hasParams, spaceId, assignmentId, subId]
  );

  const indexRef = useMemo(() => (hasParams ? doc(db, "spaceSubmissions", subId!) : null), [hasParams, subId]);

  const assignmentRef = useMemo(
    () => (hasParams ? doc(db, "spaces", spaceId!, "lessons", assignmentId!) : null),
    [hasParams, spaceId, assignmentId]
  );

  useEffect(() => {
    if (!nestedRef) {
      setLoading(false);
      setSub(null);
      return;
    }

    setLoading(true);
    return onSnapshot(
      nestedRef,
      (snap) => {
        setLoading(false);
        if (!snap.exists()) {
          setSub(null);
          return;
        }
        const data = (snap.data() as SubmissionDoc) ?? {};
        setSub(data);

        const seededText = readTeacherFeedbackText(data);
        const seededStatus = readStatusDefaultNeedsWork(data);

        setText(seededText);
        setStatus(seededStatus);
        setInitialStatus(seededStatus);

        const seededAi = readAiFeedbackText(data);
        setAiText(seededAi);
      },
      (err) => {
        setLoading(false);
        const info = getErrorInfo(err as unknown);
        console.log("[TEACHER] read submission ERROR =>", info.code, info.message, err);
        setSub(null);
      }
    );
  }, [nestedRef]);

  useEffect(() => {
    if (!assignmentRef) {
      setAssignment(null);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const aSnap = await getDoc(assignmentRef);
        if (!alive) return;
        setAssignment(aSnap.exists() ? ((aSnap.data() as AssignmentDoc) ?? {}) : null);
      } catch (e) {
        const info = getErrorInfo(e);
        console.log("[TEACHER] read assignment ERROR =>", info.code, info.message, e);
        if (alive) setAssignment(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [assignmentRef]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingLesson(true);

      try {
        const srcType = (assignment?.sourceType ?? "library") as SourceType;
        const srcId = String(assignment?.sourceId ?? "").trim();
        if (!srcId) {
          if (alive) setLesson(null);
          return;
        }

        const lSnap =
          srcType === "library" ? await getDoc(doc(db, "published_lessons", srcId)) : await getDoc(doc(db, "lessons", srcId));

        if (!alive) return;
        setLesson(lSnap.exists() ? ((lSnap.data() as Lesson) ?? {}) : null);
      } catch (e) {
        const info = getErrorInfo(e);
        console.log("[TEACHER] read lesson ERROR =>", info.code, info.message, e);
        if (alive) setLesson(null);
      } finally {
        if (alive) setLoadingLesson(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [assignment?.sourceId, assignment?.sourceType]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!sub) return;

      const direct =
        (typeof sub.studentName === "string" && sub.studentName.trim() ? sub.studentName.trim() : "") ||
        (typeof sub.studentDisplayName === "string" && sub.studentDisplayName.trim() ? sub.studentDisplayName.trim() : "");

      const authInfo = readAuth(sub);
      if (direct) {
        if (alive) setStudentName(direct);
        return;
      }

      if (!authInfo.uid) {
        if (alive) setStudentName(authInfo.isAnon ? t("fallback.guest") : "");
        return;
      }

      if (!spaceId) {
        if (alive) setStudentName(authInfo.uid);
        return;
      }

      try {
        const memberId = `${spaceId}_${authInfo.uid}`;
        const mref = doc(db, "spaceMembers", memberId);
        const msnap = await getDoc(mref);
        if (!alive) return;

        if (msnap.exists()) {
          const m = (msnap.data() as SpaceMemberDoc) ?? {};
          const nm = (m.fullName || m.displayName || m.name || "").trim();
          setStudentName(nm || authInfo.uid);
        } else {
          setStudentName(authInfo.uid);
        }
      } catch {
        if (alive) setStudentName(authInfo.uid);
      }
    })();

    return () => {
      alive = false;
    };
  }, [sub, spaceId, t]);

  async function saveAiFeedbackToFirestore(textValue: string) {
    if (!canOperate) return;
    if (!nestedRef && !indexRef) return;

    setAiSaving(true);
    setAiMsg(null);

    try {
      const dbx = requireDb(db);

      const payload = {
        aiFeedback: {
          text: textValue,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          teacherUid: user?.uid ?? null,
        },
        updatedAt: serverTimestamp(),
      };

      const batch = writeBatch(dbx);
      if (nestedRef) batch.set(nestedRef, payload, { merge: true });
      if (indexRef) batch.set(indexRef, payload, { merge: true });
      await batch.commit();

      setAiMsg(t("ai.saved"));
    } catch (e: unknown) {
      const info = getErrorInfo(e);
      console.log("[TEACHER] save ai feedback ERROR =>", info.code, info.message, e);
      setAiMsg(t("ai.saveFailed", { msg: info.message || t("fallback.unknownError") }));
    } finally {
      setAiSaving(false);
      setTimeout(() => setAiMsg(null), 2200);
    }
  }

  const backLink = withLocale(locale, hasParams ? `/teacher/spaces/${spaceId}` : "/teacher/spaces");

  if (!hasParams) {
    return (
      <div style={{ maxWidth: 1060, margin: "0 auto", padding: 16 }}>
        <div style={{ opacity: 0.85 }}>{t("errors.missingParams")}</div>
      </div>
    );
  }

  if (loading || profileLoading) {
    return <div style={{ padding: 16 }}>{tCommon("loading")}</div>;
  }

  if (!sub) {
    return (
      <div style={{ maxWidth: 1060, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>{t("missing.title")}</h1>
        <p style={{ opacity: 0.8 }}>
          <code>
            spaces/{spaceId}/lessons/{assignmentId}/submissions/{subId}
          </code>
        </p>
        <Link href={backLink}>{t("actions.back")}</Link>
      </div>
    );
  }

  const createdAt = formatMaybeDate(sub.createdAt);
  const authInfo = readAuth(sub);

  const rawStatus = readStatus(sub);
  const isDraft = String(rawStatus).toLowerCase() === "draft";

  const lessonTitle = lesson?.title ?? assignment?.title ?? t("fallback.task");
  const lessonLevel = lesson?.level ?? assignment?.level ?? "";
  const sourceText = String(lesson?.sourceText ?? lesson?.text ?? "");
  const cover = String(lesson?.coverImageUrl ?? "").trim() || null;

  const tasksOriginal = safeTasksArray(lesson?.tasks)
    .slice()
    .sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));

  const answersMap = readAnswerMap(sub.answers);
  const auto = readAutoGrade(sub);

  const statusChanged = status !== initialStatus;
  const needsTextToChangeStatus = statusChanged && text.trim().length === 0;
  const canSave = canOperate && !saving && !needsTextToChangeStatus;

  const canGenerateAi = canOperate && !aiGenerating && !aiSaving;

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{t("title")}</h1>

          <div style={{ marginTop: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {t("meta.studentLabel")}{" "}
              <span style={{ fontWeight: 900 }}>
                {studentName || (authInfo.isAnon ? t("fallback.guest") : authInfo.uid || "—")}
              </span>
            </div>
          </div>

          <div style={{ opacity: 0.8, marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              {createdAt ? (
                <>
                  {t("meta.delivered")} <b>{createdAt}</b>
                </>
              ) : (
                t("meta.deliveredUnknown")
              )}{" "}
              · <StatusPill status={rawStatus} t={(k) => t(k)} />
            </div>

            <AutoGradeBadge auto={auto} t={tAny} />
          </div>

          {isDraft ? (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(99,102,241,0.40)",
                background: "rgba(99,102,241,0.10)",
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              {t("draft.notice")}
            </div>
          ) : null}

          <div style={{ opacity: 0.75, marginTop: 4, fontSize: 12 }}>
            {authInfo.isAnon ? (
              <>{t("meta.guest")}</>
            ) : (
              <>
                {t("meta.loggedIn")} · uid: <code>{authInfo.uid ?? "—"}</code>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href={backLink}>{t("actions.back")}</Link>
        </div>
      </div>

      {!canOperate && (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <AttestationAndModeCard
            attestationVersion="2026-02-09"
            allowedModes={["student", "teacher", "creator", "parent"]}
            requireAttestationForProModes={true}
          />
          <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12, opacity: 0.9 }}>
            {t.rich("notice.needAttestationHtml", { b: (chunks) => <b>{chunks}</b> })}
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: 12,
          marginTop: 12,
        }}
      >
        {/* STUDENT VIEW */}
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <div style={{ fontWeight: 900 }}>{t("studentView.title")}</div>
            {loadingLesson ? <span style={{ fontSize: 12, opacity: 0.7 }}>{t("studentView.loadingLesson")}</span> : null}
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{lessonTitle}</div>
              {lessonLevel ? <div style={{ opacity: 0.75, fontSize: 12 }}>{t("studentView.level", { v: lessonLevel })}</div> : null}
            </div>

            {/* IMAGE */}
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 12,
                padding: 12,
                background: "rgba(0,0,0,0.02)",
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16 / 9",
                  borderRadius: 12,
                  border: "1px dashed rgba(0,0,0,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  background: "white",
                }}
              >
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt={t("studentView.imageAlt")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ textAlign: "center", padding: 16, opacity: 0.7 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{t("studentView.noImageTitle")}</div>
                    <div style={{ fontSize: 13 }}>{t("studentView.noImageDesc")}</div>
                  </div>
                )}
              </div>
            </div>

            {/* TEXT */}
            {sourceText.trim() ? (
              <div style={{ padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, lineHeight: 1.55 }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{t("studentView.textTitle")}</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{sourceText}</div>
              </div>
            ) : null}

            {/* TASKS */}
            <div style={{ marginTop: 2 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>{t("studentView.tasksTitle")}</div>

              {tasksOriginal.length === 0 ? (
                <div style={{ opacity: 0.75, fontSize: 13 }}>
                  {t("studentView.noTasks")}
                  <br />
                  <span style={{ opacity: 0.7 }}>{t("studentView.noTasksHint")}</span>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {tasksOriginal.map((task, idx) => {
                    const stableId = getStableTaskId(task, idx);
                    const type = String(task?.type ?? "open").toLowerCase();
                    const prompt = String(task?.prompt ?? "");
                    const options = Array.isArray(task?.options) ? (task.options as unknown[]) : [];
                    const val = answersMap[stableId];

                    const entry = getAutoEntry(auto, stableId);
                    const showAutoMark = !!entry && (type === "mcq" || type === "truefalse");
                    const autoBadge =
                      showAutoMark && entry
                        ? entry.isCorrect
                          ? <Badge text={t("auto.taskCorrect")} kind="good" />
                          : <Badge text={val == null ? t("auto.taskUnanswered") : t("auto.taskWrong")} kind={val == null ? "neutral" : "bad"} />
                        : null;

                    const orderLabel = task?.order ?? idx + 1;

                    // ✅ MCQ: support both stored index (number) and stored option text (string)
                    const selectedIndex =
                      typeof val === "number" && Number.isFinite(val) ? Math.floor(val) : null;
                    const selectedText =
                      selectedIndex != null && selectedIndex >= 0 && selectedIndex < options.length
                        ? String(options[selectedIndex])
                        : typeof val === "string"
                        ? val
                        : "";

                    return (
                      <div key={stableId} style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8, opacity: 0.92 }}>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", opacity: 0.9, alignItems: "center" }}>
                            <span>{t("studentView.taskN", { n: orderLabel })}</span>
                            <span>• {type}</span>
                            {autoBadge}
                          </div>
                        </div>

                        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, marginBottom: 10, fontWeight: 700 }}>{prompt}</div>

                        {type === "mcq" && options.length > 0 ? (
                          <div style={{ display: "grid", gap: 8 }}>
                            {options.map((o, i) => {
                              const opt = String(o);
                              const checked = opt === selectedText;

                              const correctOpt = entry?.correctAnswer != null ? String(entry.correctAnswer) : null;
                              const isCorrectOption = correctOpt != null && opt === correctOpt;

                              return (
                                <div
                                  key={i}
                                  style={{
                                    display: "flex",
                                    gap: 10,
                                    alignItems: "flex-start",
                                    padding: "8px 10px",
                                    border: "1px solid rgba(0,0,0,0.12)",
                                    borderRadius: 10,
                                    background: checked ? "rgba(46, 204, 113, 0.10)" : "white",
                                  }}
                                >
                                  <input type="radio" checked={checked} readOnly style={{ marginTop: 3 }} />
                                  <div style={{ width: "100%" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                      <div>
                                        {opt}
                                        {isCorrectOption ? <span style={{ marginLeft: 8, opacity: 0.8, fontSize: 12 }}>{t("studentView.correctTag")}</span> : null}
                                      </div>
                                      {checked ? <Badge text={t("studentView.selectedTag")} /> : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        {type === "truefalse" ? (
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <div
                              style={{
                                border: "1px solid rgba(0,0,0,0.14)",
                                borderRadius: 10,
                                padding: "8px 12px",
                                background: val === true ? "rgba(46, 204, 113, 0.12)" : "white",
                                fontWeight: val === true ? 800 : 600,
                              }}
                            >
                              {t("studentView.true")} {val === true ? "✓" : ""}
                              {entry?.correctAnswer === true ? <span style={{ marginLeft: 8, opacity: 0.8, fontSize: 12 }}>{t("studentView.correctTag")}</span> : null}
                            </div>
                            <div
                              style={{
                                border: "1px solid rgba(0,0,0,0.14)",
                                borderRadius: 10,
                                padding: "8px 12px",
                                background: val === false ? "rgba(46, 204, 113, 0.12)" : "white",
                                fontWeight: val === false ? 800 : 600,
                              }}
                            >
                              {t("studentView.false")} {val === false ? "✓" : ""}
                              {entry?.correctAnswer === false ? <span style={{ marginLeft: 8, opacity: 0.8, fontSize: 12 }}>{t("studentView.correctTag")}</span> : null}
                            </div>
                          </div>
                        ) : null}

                        {type === "open" || !["mcq", "truefalse"].includes(type) ? (
                          <div
                            style={{
                              width: "100%",
                              padding: 10,
                              borderRadius: 10,
                              border: "1px solid rgba(0,0,0,0.2)",
                              background: "rgba(0,0,0,0.02)",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {renderValue(val) || <span style={{ opacity: 0.6 }}>{t("studentView.notAnswered")}</span>}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: AI + FEEDBACK */}
        <div style={{ display: "grid", gap: 12, height: "fit-content" }}>
          {/* ✅ AI FEEDBACK */}
          <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>{t("ai.title")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  disabled={!canGenerateAi}
                  onClick={async () => {
                    setAiGenerating(true);
                    setAiMsg(null);

                    try {
                      const data = await authedPost<AiResp>("/api/teacher/ai-feedback", {
                        spaceId,
                        assignmentId,
                        subId,
                        locale,
                      });

                      const newText = data.text || "";
                      setAiText(newText);

                      // ✅ Persist immediately to Firestore as aiFeedback
                      if (!data.skipped) {
                        await saveAiFeedbackToFirestore(newText);
                        setAiMsg(t("ai.generated"));
                      } else {
                        setAiMsg(newText);
                      }
                    } catch (e: unknown) {
                      const info = getErrorInfo(e);
                      console.log("[TEACHER] generate ai feedback ERROR =>", info.code, info.message, e);
                      setAiMsg(t("ai.generateFailed", { msg: info.message || t("fallback.unknownError") }));
                    } finally {
                      setAiGenerating(false);
                      setTimeout(() => setAiMsg(null), 2500);
                    }
                  }}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.15)",
                    background: "white",
                    opacity: !canGenerateAi ? 0.6 : 1,
                    cursor: !canGenerateAi ? "not-allowed" : "pointer",
                    fontWeight: 900,
                  }}
                >
                  {aiGenerating ? t("ai.generating") : t("ai.generateButton")}
                </button>

                <button
                  disabled={!canOperate || !aiText.trim() || aiSaving}
                  onClick={() => void saveAiFeedbackToFirestore(aiText)}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.15)",
                    background: "white",
                    opacity: !canOperate || !aiText.trim() || aiSaving ? 0.55 : 1,
                    cursor: !canOperate || !aiText.trim() || aiSaving ? "not-allowed" : "pointer",
                    fontWeight: 900,
                  }}
                >
                  {aiSaving ? t("ai.saving") : t("ai.saveButton")}
                </button>

                <button
                  disabled={!canOperate || !aiText.trim()}
                  onClick={async () => {
                    const ok = await safeCopyToClipboard(aiText);
                    setAiMsg(ok ? t("ai.copied") : t("ai.copyFailed"));
                    setTimeout(() => setAiMsg(null), 1500);
                  }}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.15)",
                    background: "white",
                    opacity: !canOperate || !aiText.trim() ? 0.55 : 1,
                    cursor: !canOperate || !aiText.trim() ? "not-allowed" : "pointer",
                    fontWeight: 900,
                  }}
                >
                  {t("ai.copyButton")}
                </button>

                <button
                  disabled={!canOperate || !aiText.trim()}
                  onClick={() => {
                    const chunk = aiText.trim();
                    if (!chunk) return;
                    setText((prev) => {
                      const p = prev.trim();
                      if (!p) return chunk;
                      return `${p}\n\n${chunk}`;
                    });
                    setAiMsg(t("ai.inserted"));
                    setTimeout(() => setAiMsg(null), 1500);
                  }}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.15)",
                    background: "white",
                    opacity: !canOperate || !aiText.trim() ? 0.55 : 1,
                    cursor: !canOperate || !aiText.trim() ? "not-allowed" : "pointer",
                    fontWeight: 900,
                  }}
                >
                  {t("ai.insertButton")}
                </button>
              </div>
            </div>

            <textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder={t("ai.placeholder")}
              rows={9}
              disabled={!canOperate}
              style={{
                width: "100%",
                marginTop: 12,
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.18)",
                opacity: !canOperate ? 0.65 : 1,
                resize: "vertical",
                background: "rgba(0,0,0,0.01)",
              }}
            />

            {aiMsg && <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13, fontWeight: 800 }}>{aiMsg}</div>}

            <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
              {t("ai.rulesHint")} <code>aiFeedback</code>.
            </div>
          </div>

          {/* FEEDBACK */}
          <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>{t("feedback.title")}</div>

            <StatusToggle value={status} onChange={setStatus} disabled={!canOperate} t={(k) => t(k)} />

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("feedback.placeholder")}
              rows={10}
              disabled={!canOperate}
              style={{
                width: "100%",
                marginTop: 12,
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.18)",
                opacity: !canOperate ? 0.65 : 1,
                resize: "vertical",
              }}
            />

            {needsTextToChangeStatus && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(245,158,11,0.55)",
                  background: "rgba(245,158,11,0.12)",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {t("feedback.needTextToChangeStatus")}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button
                disabled={!canSave}
                onClick={async () => {
                  setSaving(true);
                  setSaveMsg(null);
                  try {
                    const dbx = requireDb(db);

                    const payload = {
                      status,
                      teacherFeedback: {
                        text,
                        updatedAt: serverTimestamp(),
                        teacherUid: user?.uid ?? null,
                      },
                      updatedAt: serverTimestamp(),
                    };

                    const batch = writeBatch(dbx);
                    if (nestedRef) batch.set(nestedRef, payload, { merge: true });
                    if (indexRef) batch.set(indexRef, payload, { merge: true });
                    await batch.commit();

                    setInitialStatus(status);
                    setSaveMsg(t("feedback.saved"));
                  } catch (e: unknown) {
                    const info = getErrorInfo(e);
                    console.log("[TEACHER] save feedback ERROR =>", info.code, info.message, e);
                    setSaveMsg(t("feedback.saveFailed", { msg: info.message || t("fallback.unknownError") }));
                  } finally {
                    setSaving(false);
                    setTimeout(() => setSaveMsg(null), 2000);
                  }
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "white",
                  opacity: !canSave ? 0.6 : 1,
                  cursor: !canSave ? "not-allowed" : "pointer",
                  fontWeight: 900,
                }}
              >
                {saving ? t("feedback.saving") : t("feedback.saveButton")}
              </button>

              {saveMsg && <div style={{ opacity: 0.85, alignSelf: "center" }}>{saveMsg}</div>}
            </div>

            <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
              {t("feedback.rulesHint")} <code>status</code> <code>teacherFeedback</code>.
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 980px) {
          div[style*="grid-template-columns: 1.1fr 0.9fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}