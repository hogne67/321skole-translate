"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale, useTranslations } from "next-intl";
import { authedPost } from "@/lib/authedPost";
import GeometryWorksheetPracticeView from "@/components/generators/math/geometry/GeometryWorksheetPracticeView";
import GeometryAutoCheckSummary from "@/components/generators/math/geometry/GeometryAutoCheckSummary";
import GeometryAutoCheckTaskList from "@/components/generators/math/geometry/GeometryAutoCheckTaskList";
import type { MathWorksheet } from "@/lib/math/geometry/types";
import type {
  GeometryAnswersByTaskId,
  GeometryAutoResult,
} from "@/lib/math/geometry/submissionTypes";

type Role = "student" | "teacher" | "admin" | "parent" | "creator";
type ReviewStatus = "reviewed" | "needs_work";
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
  sentence?: string;
  textWithGap?: string;
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
  answersByTaskId?: AnswersMap | unknown;
  auth?: { isAnon?: boolean; uid?: string | null } | unknown;

  studentName?: string;
  studentDisplayName?: string;

  teacherFeedback?: TeacherFeedback | null;
  aiFeedback?: AiFeedback | null;
  auto?: AutoGrade | GeometryAutoResult | unknown;

  spaceId?: string;
  assignmentId?: string;

  startedAt?: unknown;
  submittedAt?: unknown;
  timeSpentSeconds?: unknown;

  readingTestTimeLimitSeconds?: unknown;
  readingTestTimeUsedSeconds?: unknown;
  readingTestTimedOut?: unknown;
  readingTestSubmittedManually?: unknown;
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

  lessonType?: string;
  taskType?: string;

  sourceText?: string;
  text?: string;
  tasks?: unknown;
  coverImageUrl?: string;
  mathWorksheet?: MathWorksheet | null;
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
  lessonType?: string;
  taskType?: string;
  mathWorksheet?: MathWorksheet | null;
};

type SpaceMemberDoc = {
  name?: string;
  fullName?: string;
  displayName?: string;
  uid?: string;
  role?: string;
};

type AiResp = { text: string; skipped?: boolean; locale?: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isMathWorksheet(value: unknown): value is MathWorksheet {
  if (!value || typeof value !== "object") return false;
  const v = value as { tasks?: unknown; title?: unknown };
  return Array.isArray(v.tasks) && typeof v.title === "string";
}

function hasAssignmentSnapshotContent(a: AssignmentDoc | null): boolean {
  if (!a) return false;
  const hasText = String(a.sourceText ?? a.text ?? "").trim().length > 0;
  const hasTasks = safeTasksArray(a.tasks).length > 0;
  const hasImage = String(a.coverImageUrl ?? "").trim().length > 0;
  const hasMathWorksheet = isMathWorksheet(a.mathWorksheet);
  return hasText || hasTasks || hasImage || hasMathWorksheet;
}

function assignmentSnapshotToLesson(a: AssignmentDoc): Lesson {
  return {
    title: a.title,
    level: a.level,
    topic: a.topic,
    language: a.language,
    sourceText: a.sourceText,
    text: a.text,
    tasks: a.tasks,
    coverImageUrl: a.coverImageUrl,
    status: a.status,
    lessonType: a.lessonType,
    taskType: a.taskType,
    mathWorksheet: a.mathWorksheet ?? null,
  };
}

function readLegacyRole(profile: Record<string, unknown>): Role | null {
  const roles = profile["roles"];
  if (!isRecord(roles)) return null;

  if (roles["admin"] === true) return "admin";
  if (roles["teacher"] === true) return "teacher";
  if (roles["creator"] === true) return "creator";
  if (roles["parent"] === true) return "parent";
  if (roles["student"] === true) return "student";
  return null;
}

function readRole(profile: unknown): Role | null {
  if (!isRecord(profile)) return null;

  const r = profile["role"];
  if (r === "student" || r === "teacher" || r === "admin" || r === "parent" || r === "creator") {
    return r;
  }

  return readLegacyRole(profile);
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

function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function safeBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function formatDuration(totalSeconds: number | null | undefined): string {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds)) return "—";
  const secs = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
  return "needs_work";
}

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
    r.byTask && typeof r.byTask === "object" && !Array.isArray(r.byTask)
      ? (r.byTask as Record<string, AutoGradeEntry>)
      : {};

  if (totalAuto === 0 && Object.keys(byTask).length === 0) return null;

  return { totalAuto, correctAuto, wrongAuto, unansweredAuto, percentAuto, byTask };
}

function readGeometryAuto(sub: SubmissionDoc | null): GeometryAutoResult | null {
  const auto = sub?.auto;
  if (!auto || typeof auto !== "object" || Array.isArray(auto)) return null;

  const candidate = auto as Partial<GeometryAutoResult>;
  const hasTaskMap =
    candidate.byTaskId && typeof candidate.byTaskId === "object" && !Array.isArray(candidate.byTaskId);
  const hasCounts =
    typeof candidate.total === "number" ||
    typeof candidate.correct === "number" ||
    typeof candidate.wrong === "number" ||
    typeof candidate.unanswered === "number" ||
    typeof candidate.percent === "number";

  if (!hasTaskMap && !hasCounts) return null;

  return auto as GeometryAutoResult;
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

function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "nb") return href;

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
    //
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

function isReadingTestLesson(assignment: AssignmentDoc | null, lesson: Lesson | null, tasks: Task[]): boolean {
  const lessonType = String(lesson?.lessonType ?? assignment?.lessonType ?? "").trim().toLowerCase();
  if (lessonType === "reading_test") return true;

  return tasks.some((task) => {
    const type = String(task?.type ?? "").trim().toLowerCase();
    return (
      type === "word_choice" ||
      type === "sentence_placement" ||
      type === "best_summary" ||
      type === "fill_in_word"
    );
  });
}

function readReadingTestMeta(sub: SubmissionDoc | null) {
  const limitSeconds = safeNumber(sub?.readingTestTimeLimitSeconds);
  const usedSeconds = safeNumber(sub?.readingTestTimeUsedSeconds) ?? safeNumber(sub?.timeSpentSeconds);
  const timedOut = safeBoolean(sub?.readingTestTimedOut);
  const submittedManually = safeBoolean(sub?.readingTestSubmittedManually);

  return {
    limitSeconds,
    usedSeconds,
    timedOut,
    submittedManually,
  };
}

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
    <label style={{ display: "flex", alignItems: "center", gap: 10, userSelect: "none", flexWrap: "wrap" }}>
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
          flex: "0 0 auto",
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
  const t = useTranslations("submission");
  const tAny = t as unknown as (key: string, values?: Record<string, unknown>) => string;
  const tCommon = useTranslations("common");
  const tGeometry = useTranslations("mathGeometry");
  const tBrand = useTranslations("brandLogo");

  const tGeometryAny = tGeometry as unknown as (
    key: string,
    values?: Record<string, unknown>
  ) => string;

  const tBrandAny = tBrand as unknown as (
    key: string,
    values?: Record<string, unknown>
  ) => string;

  const params = useParams();
  const rawSpaceId = (params as Record<string, string | string[] | undefined>)["spaceId"];
  const rawAssignmentId = (params as Record<string, string | string[] | undefined>)["assignmentId"];
  const rawSubId = (params as Record<string, string | string[] | undefined>)["subId"];

  const spaceId = Array.isArray(rawSpaceId) ? rawSpaceId[0] : rawSpaceId;
  const assignmentId = Array.isArray(rawAssignmentId) ? rawAssignmentId[0] : rawAssignmentId;
  const subId = Array.isArray(rawSubId) ? rawSubId[0] : rawSubId;

  const hasParams = Boolean(spaceId && assignmentId && subId);

  const { user, profile, loading: profileLoading } = useUserProfile();

  const role = useMemo(() => readRole(profile), [profile]);
  const canOperate = Boolean(user?.uid) && (role === "teacher" || role === "creator" || role === "admin");

  const [sub, setSub] = useState<SubmissionDoc | null>(null);
  const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  const [studentName, setStudentName] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [loadingLesson, setLoadingLesson] = useState(true);

  const [text, setText] = useState("");
  const [status, setStatus] = useState<ReviewStatus>("needs_work");
  const [initialStatus, setInitialStatus] = useState<ReviewStatus>("needs_work");

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

  const geometryWorksheet = useMemo(() => {
    return isMathWorksheet(lesson?.mathWorksheet) ? lesson.mathWorksheet : null;
  }, [lesson?.mathWorksheet]);

  const isGeometryAssignment = useMemo(() => {
    const lessonType = String(lesson?.lessonType ?? "").trim().toLowerCase();
    const lessonTaskType = String(lesson?.taskType ?? "").trim().toLowerCase();
    const assignmentLessonType = String(assignment?.lessonType ?? "").trim().toLowerCase();
    const assignmentTaskType = String(assignment?.taskType ?? "").trim().toLowerCase();

    return (
      lessonType === "math_geometry" ||
      lessonTaskType === "math_geometry" ||
      assignmentLessonType === "math_geometry" ||
      assignmentTaskType === "math_geometry" ||
      !!geometryWorksheet
    );
  }, [
    lesson?.lessonType,
    lesson?.taskType,
    assignment?.lessonType,
    assignment?.taskType,
    geometryWorksheet,
  ]);

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
        if (hasAssignmentSnapshotContent(assignment)) {
          if (alive) setLesson(assignmentSnapshotToLesson(assignment!));
          return;
        }

        const srcType = (assignment?.sourceType ?? "library") as SourceType;
        const srcId = String(assignment?.sourceId ?? "").trim();

        if (!srcId) {
          if (alive) setLesson(null);
          return;
        }

        const lSnap =
          srcType === "library"
            ? await getDoc(doc(db, "published_lessons", srcId))
            : await getDoc(doc(db, "lessons", srcId));

        if (!alive) return;

        const sourceLesson = lSnap.exists() ? ((lSnap.data() as Lesson) ?? {}) : null;

        if (!sourceLesson) {
          setLesson(null);
          return;
        }

        setLesson({
          title: assignment?.title ?? sourceLesson.title,
          level: assignment?.level ?? sourceLesson.level,
          topic: assignment?.topic ?? sourceLesson.topic,
          language: assignment?.language ?? sourceLesson.language,
          sourceText: assignment?.sourceText ?? sourceLesson.sourceText,
          text: assignment?.text ?? sourceLesson.text,
          tasks: assignment?.tasks ?? sourceLesson.tasks,
          coverImageUrl: assignment?.coverImageUrl ?? sourceLesson.coverImageUrl,
          status: sourceLesson.status,
          isActive: sourceLesson.isActive,
          lessonType: assignment?.lessonType ?? sourceLesson.lessonType,
          taskType: assignment?.taskType ?? sourceLesson.taskType,
          mathWorksheet: assignment?.mathWorksheet ?? sourceLesson.mathWorksheet ?? null,
        });
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
  }, [assignment]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!sub) return;

      const direct =
        (typeof sub.studentName === "string" && sub.studentName.trim() ? sub.studentName.trim() : "") ||
        (typeof sub.studentDisplayName === "string" && sub.studentDisplayName.trim()
          ? sub.studentDisplayName.trim()
          : "");

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

  const backLink = withLocale(
    locale,
    hasParams ? `/teacher/spaces/${spaceId}/lessons/${assignmentId}` : "/teacher/spaces"
  );

  if (!hasParams) {
    return (
      <div className="mx-auto box-border w-full max-w-6xl min-w-0 p-4">
        <div className="text-sm text-slate-600">{t("errors.missingParams")}</div>
      </div>
    );
  }

  if (loading || profileLoading) {
    return <div className="p-4 text-sm text-slate-600">{tCommon("loading")}</div>;
  }

  if (!sub) {
    return (
      <div className="mx-auto box-border w-full max-w-6xl min-w-0 p-4">
        <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
          <h1 className="m-0 text-xl font-semibold text-slate-900">{t("missing.title")}</h1>
          <p className="mt-3 break-all text-sm text-slate-600">
            <code>
              spaces/{spaceId}/lessons/{assignmentId}/submissions/{subId}
            </code>
          </p>
          <div className="mt-4">
            <Link href={backLink} className="text-sm font-medium text-slate-700 underline underline-offset-4">
              {t("actions.back")}
            </Link>
          </div>
        </div>
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

  const answersMap = readAnswerMap(isGeometryAssignment ? sub.answersByTaskId : sub.answers);
  const auto = isGeometryAssignment ? null : readAutoGrade(sub);
  const geometryAuto = isGeometryAssignment ? readGeometryAuto(sub) : null;

  const geometryPercent =
    geometryAuto && typeof geometryAuto.percent === "number" && Number.isFinite(geometryAuto.percent)
      ? geometryAuto.percent
      : null;
  const geometryCorrect =
    geometryAuto && typeof geometryAuto.correct === "number" && Number.isFinite(geometryAuto.correct)
      ? geometryAuto.correct
      : 0;
  const geometryPartial =
    geometryAuto &&
    typeof geometryAuto.partial === "number" &&
    Number.isFinite(geometryAuto.partial)
      ? geometryAuto.partial
      : 0;
  const geometryWrong =
    geometryAuto && typeof geometryAuto.wrong === "number" && Number.isFinite(geometryAuto.wrong)
      ? geometryAuto.wrong
      : 0;
  const geometryUnanswered =
    geometryAuto &&
    typeof geometryAuto.unanswered === "number" &&
    Number.isFinite(geometryAuto.unanswered)
      ? geometryAuto.unanswered
      : 0;
  const geometryTotal =
    geometryAuto && typeof geometryAuto.total === "number" && Number.isFinite(geometryAuto.total)
      ? geometryAuto.total
      : 0;

  const isReadingTest = isReadingTestLesson(assignment, lesson, tasksOriginal);
  const readingMeta = readReadingTestMeta(sub);

  const readingSummaryText = isReadingTest
    ? readingMeta.timedOut === true
      ? t("readingSummary.timedOut", {
          used: formatDuration(readingMeta.usedSeconds),
          limit: formatDuration(readingMeta.limitSeconds),
        })
      : readingMeta.submittedManually === true
        ? t("readingSummary.submittedManually", {
            used: formatDuration(readingMeta.usedSeconds),
            limit: formatDuration(readingMeta.limitSeconds),
          })
        : readingMeta.usedSeconds != null || readingMeta.limitSeconds != null
          ? t("readingSummary.generic", {
              used: formatDuration(readingMeta.usedSeconds),
              limit: formatDuration(readingMeta.limitSeconds),
            })
          : ""
    : "";

  const statusChanged = status !== initialStatus;
  const needsTextToChangeStatus = statusChanged && text.trim().length === 0;
  const canSave = canOperate && !saving && !needsTextToChangeStatus;
  const canGenerateAi = canOperate && !aiGenerating && !aiSaving;

  return (
    <div className="mx-auto box-border w-full max-w-6xl min-w-0 space-y-4">
      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-500">{t("title")}</div>
            <h1 className="mt-1 break-words text-2xl font-semibold text-slate-900">
              {studentName || (authInfo.isAnon ? t("fallback.guest") : authInfo.uid || "—")}
            </h1>
            <div className="mt-2 break-words text-base text-slate-700">{lessonTitle}</div>
            <div className="mt-2 text-sm text-slate-600">
              {createdAt ? (
                <>
                  {t("meta.delivered")} <b>{createdAt}</b>
                </>
              ) : (
                t("meta.deliveredUnknown")
              )}
            </div>
          </div>

          <div className="flex w-full min-w-0 justify-start lg:w-auto lg:justify-end">
            <Link
              href={backLink}
              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50 sm:w-auto"
            >
              {t("actions.back")}
            </Link>
          </div>
        </div>
      </div>

      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="text-base font-semibold text-slate-900">{t("meta.summaryTitle")}</div>

          <div className="flex flex-wrap gap-2">
            <StatusPill status={rawStatus} t={(k) => t(k)} />
            {!isGeometryAssignment ? <AutoGradeBadge auto={auto} t={tAny} /> : null}
            {lessonLevel ? <Badge text={t("studentView.level", { v: lessonLevel })} /> : null}
            {isGeometryAssignment ? (
              <>
                <Badge text={t("meta.geometryBadge")} kind="good" />
                {geometryPercent != null ? (
                  <Badge
                    text={t("meta.geometryAutoBadge", { pct: geometryPercent })}
                    kind={geometryPercent >= 80 ? "good" : geometryPercent >= 50 ? "warn" : "bad"}
                    title={t("meta.geometryAutoBadgeTitle", {
                      correct: geometryCorrect,
                      partial: geometryPartial,
                      wrong: geometryWrong,
                      unanswered: geometryUnanswered,
                    })}
                  />
                ) : null}
              </>
            ) : null}
            {authInfo.isAnon ? (
              <Badge text={t("meta.guest")} />
            ) : (
              <Badge text={t("meta.loggedInWithUid", { uid: authInfo.uid ?? "—" })} />
            )}
          </div>

          {(isReadingTest || auto || isGeometryAssignment) && (
            <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
              {isReadingTest ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">{t("meta.readingTestDataTitle")}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge text={t("meta.timeLimit", { value: formatDuration(readingMeta.limitSeconds) })} />
                    <Badge text={t("meta.timeUsed", { value: formatDuration(readingMeta.usedSeconds) })} kind="good" />
                    {readingMeta.timedOut === true ? (
                      <Badge text={t("meta.sentOnTimeout")} kind="warn" />
                    ) : readingMeta.submittedManually === true ? (
                      <Badge text={t("meta.submittedManually")} kind="good" />
                    ) : (
                      <Badge text={t("meta.deliveryMethodUnknown")} />
                    )}
                  </div>
                  <div className="mt-3 text-sm text-slate-700">
                    {readingMeta.timedOut === true
                      ? t("meta.readingTimedOutDesc")
                      : readingMeta.submittedManually === true
                        ? t("meta.readingManualDesc")
                        : t("meta.readingMissingMetaDesc")}
                  </div>
                </div>
              ) : isGeometryAssignment ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">{t("meta.geometryTitle")}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge text={t("meta.geometryAnswersLoaded")} kind="good" />
                    <Badge
                      text={geometryWorksheet ? t("meta.geometryWorksheetFound") : t("meta.geometryWorksheetMissing")}
                      kind={geometryWorksheet ? "good" : "warn"}
                    />
                    {geometryPercent != null ? (
                      <Badge
                        text={t("meta.scoreValue", { value: geometryPercent })}
                        kind={geometryPercent >= 80 ? "good" : geometryPercent >= 50 ? "warn" : "bad"}
                      />
                    ) : null}
                  </div>
                  <div className="mt-3 text-sm text-slate-700">
                    {geometryAuto
                      ? t("meta.geometrySummary", {
                          correct: geometryCorrect,
                          partial: geometryPartial,
                          wrong: geometryWrong,
                          unanswered: geometryUnanswered,
                          total: geometryTotal,
                        })
                      : t("meta.geometrySummaryFallback")}
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-slate-300 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{t("meta.deliveryTitle")}</div>
                <div className="mt-3 grid gap-2 text-sm text-slate-700">
                  <div>
                    <span className="font-medium">{t("meta.deliveredLabel")}</span> {createdAt || "—"}
                  </div>
                  <div>
                    <span className="font-medium">{t("meta.studentLabel")}</span>{" "}
                    {studentName || (authInfo.isAnon ? t("fallback.guest") : authInfo.uid || "—")}
                  </div>
                  <div>
                    <span className="font-medium">{t("meta.statusLabel")}</span> {String(rawStatus || "—")}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-300 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{t("meta.autoScoreTitle")}</div>
                {auto ? (
                  <div className="mt-3 grid gap-2 text-sm text-slate-700">
                    <div>
                      <span className="font-medium">{t("meta.correctLabel")}</span> {auto.correctAuto}
                    </div>
                    <div>
                      <span className="font-medium">{t("meta.wrongLabel")}</span> {auto.wrongAuto}
                    </div>
                    <div>
                      <span className="font-medium">{t("meta.unansweredLabel")}</span> {auto.unansweredAuto}
                    </div>
                    <div>
                      <span className="font-medium">{t("meta.scoreLabel")}</span> {auto.percentAuto ?? "—"}%
                    </div>
                  </div>
                ) : isGeometryAssignment ? (
                  geometryAuto ? (
                    <div className="mt-3 grid gap-2 text-sm text-slate-700">
                      <div>
                        <span className="font-medium">{t("meta.correctLabel")}</span> {geometryCorrect}
                      </div>
                      <div>
                        <span className="font-medium">{t("meta.partialLabel")}</span> {geometryPartial}
                      </div>
                      <div>
                        <span className="font-medium">{t("meta.wrongLabel")}</span> {geometryWrong}
                      </div>
                      <div>
                        <span className="font-medium">{t("meta.unansweredLabel")}</span> {geometryUnanswered}
                      </div>
                      <div>
                        <span className="font-medium">{t("meta.scoreLabel")}</span> {geometryPercent ?? "—"}%
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-slate-600">{t("meta.noGeometryAutoScore")}</div>
                  )
                ) : (
                  <div className="mt-3 text-sm text-slate-600">{t("meta.noAutoScore")}</div>
                )}
              </div>
            </div>
          )}

          {isDraft ? (
            <div className="rounded-xl border border-indigo-300 bg-indigo-50 p-3 text-sm font-semibold text-indigo-900">
              {t("draft.notice")}
            </div>
          ) : null}
        </div>
      </div>

      {!canOperate && (
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-700 shadow-sm">
          {t("notice.noTeacherRights")}
        </div>
      )}

      <div className="submissionGrid">
        <div className="box-border min-w-0 rounded-2xl border border-slate-300 bg-white p-4 shadow-md sm:p-5">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-900">{t("studentView.title")}</div>
              {loadingLesson ? (
                <div className="mt-1 text-sm text-slate-600">{t("studentView.loadingLesson")}</div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            <div className="grid gap-1">
              <div className="break-words text-lg font-semibold text-slate-900">{lessonTitle}</div>
              {lessonLevel ? <div className="text-sm text-slate-600">{t("studentView.level", { v: lessonLevel })}</div> : null}
            </div>

            {!isGeometryAssignment ? (
              <>
                <div className="rounded-xl border border-slate-300 bg-slate-50 p-3">
                  <div
                    className="flex w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white"
                    style={{ aspectRatio: "16 / 9" }}
                  >
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt={t("studentView.imageAlt")}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div className="px-4 text-center text-sm text-slate-600">
                        <div className="mb-1 font-semibold text-slate-800">{t("studentView.noImageTitle")}</div>
                        <div>{t("studentView.noImageDesc")}</div>
                      </div>
                    )}
                  </div>
                </div>

                {sourceText.trim() ? (
                  <div className="rounded-xl border border-slate-300 bg-white p-4">
                    <div className="mb-2 text-xs text-slate-500">{t("studentView.textTitle")}</div>
                    <div className="whitespace-pre-wrap leading-7 text-slate-800">{sourceText}</div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div>
              <div className="mb-3 text-base font-semibold text-slate-900">
                {isGeometryAssignment ? t("studentView.geometryTitle") : t("studentView.tasksTitle")}
              </div>

              {isGeometryAssignment && geometryWorksheet ? (
                <div className="grid gap-4">
                  <div className="rounded-xl border border-slate-300 bg-white p-3">
                    <GeometryWorksheetPracticeView
                      worksheet={geometryWorksheet}
                      t={tGeometryAny}
                      tBrand={tBrandAny}
                      answersByTaskId={answersMap as GeometryAnswersByTaskId}
                      onAnswerChange={() => {
                        // read-only teacher view
                      }}
                      showExpectedAnswers={true}
                      showIdentityFields={false}
                      showFigureMeta={true}
                      includeHints={true}
                    />
                  </div>

                  {geometryAuto ? (
                    <>
                      <GeometryAutoCheckSummary auto={geometryAuto} t={tGeometryAny} />
                      <GeometryAutoCheckTaskList
                        worksheet={geometryWorksheet}
                        auto={geometryAuto}
                        answersByTaskId={answersMap as GeometryAnswersByTaskId}
                        t={tGeometryAny}
                      />
                    </>
                  ) : null}
                </div>
              ) : tasksOriginal.length === 0 ? (
                <div className="text-sm text-slate-600">
                  {t("studentView.noTasks")}
                  <br />
                  <span className="text-slate-500">{t("studentView.noTasksHint")}</span>
                </div>
              ) : (
                <div className="grid gap-3">
                  {tasksOriginal.map((task, idx) => {
                    const stableId = getStableTaskId(task, idx);
                    const type = String(task?.type ?? "open").toLowerCase();
                    const prompt = String(task?.prompt ?? "");
                    const options = Array.isArray(task?.options) ? (task.options as unknown[]) : [];
                    const val = answersMap[stableId];

                    const entry = getAutoEntry(auto, stableId);
                    const showAutoMark =
                      !!entry &&
                      (type === "mcq" ||
                        type === "truefalse" ||
                        type === "true_false" ||
                        type === "word_choice" ||
                        type === "sentence_placement" ||
                        type === "best_summary" ||
                        type === "fill_in_word");

                    const autoBadge =
                      showAutoMark && entry ? (
                        entry.isCorrect ? (
                          <Badge text={t("auto.taskCorrect")} kind="good" />
                        ) : (
                          <Badge
                            text={val == null ? t("auto.taskUnanswered") : t("auto.taskWrong")}
                            kind={val == null ? "neutral" : "bad"}
                          />
                        )
                      ) : null;

                    const orderLabel = task?.order ?? idx + 1;

                    const selectedIndex =
                      typeof val === "number" && Number.isFinite(val) ? Math.floor(val) : null;
                    const selectedText =
                      selectedIndex != null && selectedIndex >= 0 && selectedIndex < options.length
                        ? String(options[selectedIndex])
                        : typeof val === "string"
                          ? val
                          : "";

                    return (
                      <div key={stableId} className="rounded-xl border border-slate-300 bg-white p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          <span>{t("studentView.taskN", { n: orderLabel })}</span>
                          <span>• {type}</span>
                          {autoBadge}
                        </div>

                        <div className="mb-3 whitespace-pre-wrap font-semibold leading-6 text-slate-900">{prompt}</div>

                        {(type === "word_choice" || type === "fill_in_word") && task?.sentence ? (
                          <div className="mb-3 whitespace-pre-wrap rounded-xl border border-slate-300 bg-slate-50 p-3 text-slate-800">
                            {String(task.sentence)}
                          </div>
                        ) : null}

                        {type === "sentence_placement" && task?.textWithGap ? (
                          <div className="mb-3 whitespace-pre-wrap rounded-xl border border-slate-300 bg-slate-50 p-3 text-slate-800">
                            {String(task.textWithGap)}
                          </div>
                        ) : null}

                        {(type === "mcq" ||
                          type === "word_choice" ||
                          type === "sentence_placement" ||
                          type === "best_summary" ||
                          type === "fill_in_word") &&
                        options.length > 0 ? (
                          <div className="grid gap-2">
                            {options.map((o, i) => {
                              const opt = String(o);
                              const checked = opt === selectedText;

                              const correctOpt = entry?.correctAnswer != null ? String(entry.correctAnswer) : null;
                              const isCorrectOption = correctOpt != null && opt === correctOpt;

                              return (
                                <div
                                  key={i}
                                  className="flex gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2"
                                  style={{ background: checked ? "rgba(46, 204, 113, 0.10)" : "white" }}
                                >
                                  <input type="radio" checked={checked} readOnly style={{ marginTop: 3 }} />
                                  <div className="w-full min-w-0">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="break-words text-slate-800">
                                        {opt}
                                        {isCorrectOption ? (
                                          <span className="ml-2 text-xs text-slate-500">{t("studentView.correctTag")}</span>
                                        ) : null}
                                      </div>
                                      {checked ? <Badge text={t("studentView.selectedTag")} /> : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        {type === "truefalse" || type === "true_false" ? (
                          <div className="flex flex-wrap gap-2">
                            <div
                              className="rounded-xl border border-slate-300 px-3 py-2"
                              style={{
                                background: val === true || val === "true" ? "rgba(46, 204, 113, 0.12)" : "white",
                                fontWeight: val === true || val === "true" ? 800 : 600,
                              }}
                            >
                              {t("studentView.true")} {val === true || val === "true" ? "✓" : ""}
                              {entry?.correctAnswer === true || entry?.correctAnswer === "true" ? (
                                <span className="ml-2 text-xs text-slate-500">{t("studentView.correctTag")}</span>
                              ) : null}
                            </div>
                            <div
                              className="rounded-xl border border-slate-300 px-3 py-2"
                              style={{
                                background: val === false || val === "false" ? "rgba(46, 204, 113, 0.12)" : "white",
                                fontWeight: val === false || val === "false" ? 800 : 600,
                              }}
                            >
                              {t("studentView.false")} {val === false || val === "false" ? "✓" : ""}
                              {entry?.correctAnswer === false || entry?.correctAnswer === "false" ? (
                                <span className="ml-2 text-xs text-slate-500">{t("studentView.correctTag")}</span>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        {type === "open" ||
                        type === "short_answer" ||
                        ![
                          "mcq",
                          "truefalse",
                          "true_false",
                          "word_choice",
                          "sentence_placement",
                          "best_summary",
                          "fill_in_word",
                        ].includes(type) ? (
                          <div className="w-full whitespace-pre-wrap rounded-xl border border-slate-300 bg-slate-50 p-3 text-slate-800">
                            {renderValue(val) || <span className="text-slate-500">{t("studentView.notAnswered")}</span>}
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

        <div className="rightCol">
          <div className="box-border min-w-0 rounded-2xl border border-slate-300 bg-white p-4 shadow-md sm:p-5">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-base font-semibold text-slate-900">{t("ai.title")}</div>
                <div className="flex flex-wrap gap-2">
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
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                  >
                    {aiGenerating ? t("ai.generating") : t("ai.generateButton")}
                  </button>

                  <button
                    disabled={!canOperate || !aiText.trim() || aiSaving}
                    onClick={() => void saveAiFeedbackToFirestore(aiText)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
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
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
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
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
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
                className="box-border w-full min-w-0 max-w-full resize-y rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 disabled:opacity-65"
              />

              {aiMsg && <div className="text-sm font-semibold text-slate-700">{aiMsg}</div>}

              <div className="text-xs text-slate-500">
                {t("ai.rulesHint")} <code>aiFeedback</code>.
              </div>
            </div>
          </div>

          <div className="box-border min-w-0 rounded-2xl border border-slate-300 bg-white p-4 shadow-md sm:p-5">
            <div className="text-base font-semibold text-slate-900">{t("feedback.title")}</div>

            {readingSummaryText ? (
              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-6 text-slate-800">
                {readingSummaryText}
              </div>
            ) : null}

            <div className="mt-4">
              <StatusToggle value={status} onChange={setStatus} disabled={!canOperate} t={(k) => t(k)} />
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("feedback.placeholder")}
              rows={10}
              disabled={!canOperate}
              className="box-border mt-4 w-full min-w-0 max-w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 disabled:opacity-65"
            />

            {needsTextToChangeStatus && (
              <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                {t("feedback.needTextToChangeStatus")}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {readingSummaryText ? (
                <button
                  type="button"
                  disabled={!canOperate}
                  onClick={() => {
                    setText((prev) => {
                      const p = prev.trim();
                      if (!p) return readingSummaryText;
                      if (p.includes(readingSummaryText)) return prev;
                      return `${readingSummaryText}\n\n${prev}`;
                    });
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                >
                  {t("feedback.insertTimingData")}
                </button>
              ) : null}

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
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
              >
                {saving ? t("feedback.saving") : t("feedback.saveButton")}
              </button>

              {saveMsg ? <div className="self-center text-sm text-slate-700">{saveMsg}</div> : null}
            </div>

            <div className="mt-3 text-xs text-slate-500">
              {t("feedback.rulesHint")} <code>status</code> <code>teacherFeedback</code>.
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .submissionGrid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
          gap: 16px;
          align-items: start;
        }

        .rightCol {
          display: grid;
          gap: 16px;
          min-width: 0;
        }

        @media (max-width: 980px) {
          .submissionGrid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </div>
  );
}