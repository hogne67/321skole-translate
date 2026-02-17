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
import AttestationAndModeCard from "@/components/AttestationAndModeCard";

type Mode = "student" | "teacher" | "creator" | "parent";
type ReviewStatus = "reviewed" | "needs_work";

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
  status?: ReviewStatus | string;
  answers?: AnswersMap | unknown;
  auth?: { isAnon?: boolean; uid?: string | null } | unknown;

  studentName?: string;
  studentDisplayName?: string;

  teacherFeedback?: TeacherFeedback | null;

  // ✅ NEW: auto-grading from student submit
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

/* =========================
   Helpers (copy from student page)
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

/** Default needs_work (gul) */
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

  // Hvis totalAuto=0 og byTask er tom => sannsynligvis ingen auto / gammel innlevering
  if (totalAuto === 0 && Object.keys(byTask).length === 0) return null;

  return { totalAuto, correctAuto, wrongAuto, unansweredAuto, percentAuto, byTask };
}

/* =========================
   UI bits
========================= */

function StatusPill({ status }: { status: ReviewStatus }) {
  const isApproved = status === "reviewed";
  const bg = isApproved ? "rgba(16,185,129,0.16)" : "rgba(245,158,11,0.18)";
  const bd = isApproved ? "rgba(16,185,129,0.45)" : "rgba(245,158,11,0.55)";
  const tx = isApproved ? "rgba(5,150,105,1)" : "rgba(180,83,9,1)";
  const label = isApproved ? "Approved" : "Needs work";
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

function AutoGradeBadge({ auto }: { auto: AutoGrade | null }) {
  if (!auto) return null;

  const pct = auto.percentAuto;
  const main = `Auto: ${auto.correctAuto}/${auto.totalAuto}${pct != null ? ` (${pct}%)` : ""}`;

  const kind =
    pct == null ? "neutral" : pct >= 80 ? "good" : pct >= 50 ? "warn" : "bad";

  const details = `Riktig: ${auto.correctAuto} · Feil: ${auto.wrongAuto} · Ikke besvart: ${auto.unansweredAuto}`;

  return <Badge text={main} kind={kind} title={details} />;
}

function StatusToggle({
  value,
  onChange,
  disabled,
}: {
  value: ReviewStatus;
  onChange: (v: ReviewStatus) => void;
  disabled?: boolean;
}) {
  const checked = value === "reviewed"; // checked = approved
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, userSelect: "none" }}>
      <span style={{ fontSize: 13, opacity: 0.85 }}>Status</span>

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

      <StatusPill status={value} />
    </label>
  );
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

export default function TeacherSubmissionPage() {
  return (
    <AuthGate>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const params = useParams<{
    spaceId: string;
    assignmentId: string;
    subId: string;
  }>();

  const spaceId = params.spaceId;
  const assignmentId = params.assignmentId;
  const subId = params.subId;

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

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const nestedRef = useMemo(
    () => doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", subId),
    [spaceId, assignmentId, subId]
  );

  // index doc students read from
  const indexRef = useMemo(() => doc(db, "spaceSubmissions", subId), [subId]);

  const assignmentRef = useMemo(() => doc(db, "spaces", spaceId, "lessons", assignmentId), [spaceId, assignmentId]);

  // Read submission live
  useEffect(() => {
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
      },
      (err) => {
        setLoading(false);
        const info = getErrorInfo(err as unknown);
        console.log("[TEACHER] read submission ERROR =>", info.code, info.message, err);
        setSub(null);
      }
    );
  }, [nestedRef]);

  // Read assignment doc (space lesson)
  useEffect(() => {
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

  // Fetch lesson from same source logic as student page
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
          srcType === "library"
            ? await getDoc(doc(db, "published_lessons", srcId))
            : await getDoc(doc(db, "lessons", srcId));

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

  // Resolve student name
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
        if (alive) setStudentName(authInfo.isAnon ? "Gjest" : "");
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
  }, [sub, spaceId]);

  const backLink = `/teacher/spaces/${spaceId}`;

  if (loading || profileLoading) return <div style={{ padding: 16 }}>Laster…</div>;

  if (!sub) {
    return (
      <div style={{ maxWidth: 1060, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Fant ikke innleveringen</h1>
        <p style={{ opacity: 0.8 }}>
          <code>
            spaces/{spaceId}/lessons/{assignmentId}/submissions/{subId}
          </code>
        </p>
        <Link href={backLink}>← Tilbake</Link>
      </div>
    );
  }

  const createdAt = formatMaybeDate(sub.createdAt);
  const authInfo = readAuth(sub);

  const lessonTitle = lesson?.title ?? assignment?.title ?? "Oppgave";
  const lessonLevel = lesson?.level ?? assignment?.level ?? "";
  const sourceText = (lesson?.sourceText ?? lesson?.text ?? "").toString();
  const cover = (lesson?.coverImageUrl ?? "").toString().trim() || null;

  const tasksOriginal = safeTasksArray(lesson?.tasks)
    .slice()
    .sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));

  const answersMap = readAnswerMap(sub.answers);
  const auto = readAutoGrade(sub);

  // Require text only when status changed
  const statusChanged = status !== initialStatus;
  const needsTextToChangeStatus = statusChanged && text.trim().length === 0;
  const canSave = canOperate && !saving && !needsTextToChangeStatus;

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Innlevering</h1>

          <div style={{ marginTop: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              Student:{" "}
              <span style={{ fontWeight: 900 }}>
                {studentName || (authInfo.isAnon ? "Gjest" : authInfo.uid || "—")}
              </span>
            </div>
          </div>

          <div style={{ opacity: 0.8, marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              {createdAt ? (
                <>
                  Levert: <b>{createdAt}</b>
                </>
              ) : (
                "Levert: (ukjent)"
              )}{" "}
              · <StatusPill status={readStatusDefaultNeedsWork(sub)} />
            </div>

            {/* ✅ Auto-grade badge */}
            <AutoGradeBadge auto={auto} />
          </div>

          <div style={{ opacity: 0.75, marginTop: 4, fontSize: 12 }}>
            {authInfo.isAnon ? (
              <>Gjest (uinnlogget)</>
            ) : (
              <>
                Innlogget · uid: <code>{authInfo.uid ?? "—"}</code>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href={backLink}>← Back</Link>
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
            For å gi tilbakemelding må du ha <b>attestering</b> og være i <b>teacher</b> eller <b>creator</b>-mode.
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
        {/* STUDENT VIEW (same structure as student page, but read-only) */}
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <div style={{ fontWeight: 900 }}>Svar (slik studenten ser det)</div>
            {loadingLesson ? <span style={{ fontSize: 12, opacity: 0.7 }}>Henter oppgave…</span> : null}
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{lessonTitle}</div>
              {lessonLevel ? <div style={{ opacity: 0.75, fontSize: 12 }}>Nivå: {lessonLevel}</div> : null}
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
                  <img src={cover} alt="Lesson" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ textAlign: "center", padding: 16, opacity: 0.7 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Ingen bilde</div>
                    <div style={{ fontSize: 13 }}>Denne oppgaven har ikke forsidebilde.</div>
                  </div>
                )}
              </div>
            </div>

            {/* TEXT */}
            {sourceText.trim() ? (
              <div style={{ padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, lineHeight: 1.55 }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Tekst</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{sourceText}</div>
              </div>
            ) : null}

            {/* TASKS */}
            <div style={{ marginTop: 2 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Oppgaver</div>

              {tasksOriginal.length === 0 ? (
                <div style={{ opacity: 0.75, fontSize: 13 }}>
                  Ingen tasks i denne oppgaven (eller lesson ble ikke funnet).<br />
                  <span style={{ opacity: 0.7 }}>Hvis dette skjer, mangler vanligvis assignment.sourceId eller lesson.tasks.</span>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {tasksOriginal.map((t, idx) => {
                    const stableId = getStableTaskId(t, idx);
                    const type = String(t?.type ?? "open").toLowerCase();
                    const prompt = String(t?.prompt ?? "");
                    const options = Array.isArray(t?.options) ? (t.options as unknown[]) : [];
                    const val = answersMap[stableId];

                    const entry = auto?.byTask?.[stableId];
                    const showAutoMark = !!entry && (type === "mcq" || type === "truefalse");
                    const autoBadge =
                      showAutoMark && entry
                        ? entry.isCorrect
                          ? <Badge text="Auto: ✅ riktig" kind="good" />
                          : <Badge text={val == null ? "Auto: ⏳ ikke besvart" : "Auto: ❌ feil"} kind={val == null ? "neutral" : "bad"} />
                        : null;

                    return (
                      <div key={stableId} style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8, opacity: 0.92 }}>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", opacity: 0.9, alignItems: "center" }}>
                            <span>Oppgave {t?.order ?? idx + 1}</span>
                            <span>• {type}</span>
                            {autoBadge}
                          </div>
                        </div>

                        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, marginBottom: 10, fontWeight: 700 }}>
                          {prompt}
                        </div>

                        {/* Render student's answer in the same "shape", read-only */}
                        {type === "mcq" && options.length > 0 ? (
                          <div style={{ display: "grid", gap: 8 }}>
                            {options.map((o, i) => {
                              const opt = String(o);
                              const checked = val === opt;

                              // if we have auto grading, mark the correct option subtly
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
                                        {isCorrectOption ? <span style={{ marginLeft: 8, opacity: 0.8, fontSize: 12 }}>✓ fasit</span> : null}
                                      </div>
                                      {checked ? <Badge text="Valgt" /> : null}
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
                              True {val === true ? "✓" : ""}
                              {entry?.correctAnswer === true ? <span style={{ marginLeft: 8, opacity: 0.8, fontSize: 12 }}>✓ fasit</span> : null}
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
                              False {val === false ? "✓" : ""}
                              {entry?.correctAnswer === false ? <span style={{ marginLeft: 8, opacity: 0.8, fontSize: 12 }}>✓ fasit</span> : null}
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
                            {renderValue(val) || <span style={{ opacity: 0.6 }}>(ikke besvart)</span>}
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

        {/* FEEDBACK */}
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12, height: "fit-content" }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Tilbakemelding</div>

          <StatusToggle value={status} onChange={setStatus} disabled={!canOperate} />

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Skriv en kort tilbakemelding…"
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

          {/* ✅ Require text if status changed */}
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
              For å endre status må du skrive en kort kommentar.
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
                    status, // needs_work | reviewed
                    teacherFeedback: {
                      text,
                      updatedAt: serverTimestamp(),
                      teacherUid: user?.uid ?? null,
                    },
                    updatedAt: serverTimestamp(),
                  };

                  const batch = writeBatch(dbx);
                  batch.set(nestedRef, payload, { merge: true });
                  batch.set(indexRef, payload, { merge: true });
                  await batch.commit();

                  setInitialStatus(status);
                  setSaveMsg("Lagret ✅");
                } catch (e: unknown) {
                  const info = getErrorInfo(e);
                  console.log("[TEACHER] save feedback ERROR =>", info.code, info.message, e);
                  setSaveMsg(`Kunne ikke lagre: ${info.message || "ukjent feil"}`);
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
              {saving ? "Lagrer…" : "Lagre tilbakemelding"}
            </button>

            {saveMsg && <div style={{ opacity: 0.85, alignSelf: "center" }}>{saveMsg}</div>}
          </div>

          <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
            (Regler: kun lærer/eier/admin kan endre <code>status</code> og <code>teacherFeedback</code>.)
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