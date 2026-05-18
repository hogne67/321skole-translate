// app\[locale]\(app)\teacher\spaces\[spaceId]\lessons\[assignmentId]\submissions\[subId]\page.tsx
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
  writeBatch,
} from "firebase/firestore";
import { useUserProfile } from "@/lib/useUserProfile";
import { useUsage } from "@/lib/useUsage";
import { getBucketLimitFromProfile } from "@/lib/featureAccess";
import { useLocale, useTranslations } from "next-intl";
import { authedPost } from "@/lib/authedPost";
import type { GeometryAnswersByTaskId } from "@/lib/math/geometry/submissionTypes";
import Badge from "@/components/teacher/submissions/Badge";
import StatusPill from "@/components/teacher/submissions/StatusPill";
import type {
  AiResp,
  AssignmentDoc,
  Lesson,
  ReviewStatus,
  SourceType,
  SpaceMemberDoc,
  SubmissionDoc,
} from "@/lib/submissions/types";
import {
  formatDuration,
  formatLessonLevel,
  formatMaybeDate,
  getAutoEntry,
  getErrorInfo,
  getStableTaskId,
  readAiFeedbackText,
  readRole,
  readStatus,
  readStatusDefaultNeedsWork,
  readTeacherFeedbackText,
  renderValue,
  safeTasksArray,
} from "@/lib/submissions/helpers";
import AiFeedbackPanel from "@/components/teacher/submissions/AiFeedbackPanel";
import TeacherFeedbackPanel from "@/components/teacher/submissions/TeacherFeedbackPanel";
import StandardSubmissionView from "@/components/teacher/submissions/StandardSubmissionView";
import GeometrySubmissionView from "@/components/teacher/submissions/GeometrySubmissionView";
import FractionWorksheetView from "@/components/generators/math/fractions/FractionWorksheetView";
import {
  assignmentSnapshotToLesson,
  hasAssignmentSnapshotContent,
  isMathWorksheet,
  isFractionWorksheet,
  isReadingTestLesson,
  readAnswerMap,
  readAuth,
  readAutoGrade,
  readGeometryAuto,
  readReadingTestMeta,
  requireDb,
} from "@/lib/submissions/readers";

function getGeometryScoreKind(
  percent: number | null
): "neutral" | "good" | "warn" | "bad" {
  if (percent == null) return "neutral";
  if (percent >= 80) return "good";
  if (percent >= 50) return "warn";
  return "bad";
}

function isRawSubmissionKey(value: string, key: string) {
  return value === key || value === `submission.${key}`;
}

function safeSubmissionT(
  t: (key: string, values?: Record<string, unknown>) => string,
  key: string,
  fallback: string,
  values?: Record<string, unknown>
) {
  const value = t(key, values);
  return isRawSubmissionKey(value, key) ? fallback : value;
}

function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "nb") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
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
  const tAny = t as unknown as (
    key: string,
    values?: Record<string, unknown>
  ) => string;
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

  const rawSpaceId = (params as Record<string, string | string[] | undefined>)[
    "spaceId"
  ];
  const rawAssignmentId = (params as Record<
    string,
    string | string[] | undefined
  >)["assignmentId"];
  const rawSubId = (params as Record<string, string | string[] | undefined>)[
    "subId"
  ];

  const spaceId = Array.isArray(rawSpaceId) ? rawSpaceId[0] : rawSpaceId;
  const assignmentId = Array.isArray(rawAssignmentId)
    ? rawAssignmentId[0]
    : rawAssignmentId;
  const subId = Array.isArray(rawSubId) ? rawSubId[0] : rawSubId;

  const hasParams = Boolean(spaceId && assignmentId && subId);

  const { user, profile, loading: profileLoading } = useUserProfile();

  const role = useMemo(() => readRole(profile), [profile]);
  const canOperate =
    Boolean(user?.uid) &&
    (role === "teacher" || role === "creator" || role === "admin");

  const {
    usage,
    loading: usageLoading,
    reload: reloadUsage,
  } = useUsage(user?.uid);

  const profileRecord =
    profile && typeof profile === "object" && !Array.isArray(profile)
      ? (profile as Record<string, unknown>)
      : null;

  const billing =
    profileRecord?.billing &&
      typeof profileRecord.billing === "object" &&
      !Array.isArray(profileRecord.billing)
      ? (profileRecord.billing as { plan?: string | null; status?: string | null })
      : null;

  const aiFeedbackUsed =
    typeof usage.ai_feedback === "number" && Number.isFinite(usage.ai_feedback)
      ? usage.ai_feedback
      : 0;

  const aiFeedbackLimit = getBucketLimitFromProfile({
    role,
    plan: typeof profileRecord?.plan === "string" ? profileRecord.plan : null,
    billing,
    partnerAccess: profileRecord?.partnerAccess === true,
    partnerStatus: typeof profileRecord?.partnerStatus === "string" ? profileRecord.partnerStatus : null,
    bucket: "ai_feedback",
  });

  const aiFeedbackRemaining = Math.max(0, aiFeedbackLimit - aiFeedbackUsed);

  const [sub, setSub] = useState<SubmissionDoc | null>(null);
  const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  const [studentName, setStudentName] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [loadingLesson, setLoadingLesson] = useState(true);

  const [text, setText] = useState("");
  const [status, setStatus] = useState<ReviewStatus>("needs_work");
  const [initialStatus, setInitialStatus] =
    useState<ReviewStatus>("needs_work");

  const [aiText, setAiText] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const nestedRef = useMemo(
    () =>
      hasParams
        ? doc(
          db,
          "spaces",
          spaceId!,
          "lessons",
          assignmentId!,
          "submissions",
          subId!
        )
        : null,
    [hasParams, spaceId, assignmentId, subId]
  );

  const indexRef = useMemo(
    () => (hasParams ? doc(db, "spaceSubmissions", subId!) : null),
    [hasParams, subId]
  );

  const assignmentRef = useMemo(
    () =>
      hasParams ? doc(db, "spaces", spaceId!, "lessons", assignmentId!) : null,
    [hasParams, spaceId, assignmentId]
  );

  const geometryWorksheet = useMemo(() => {
    return isMathWorksheet(lesson?.mathWorksheet) ? lesson.mathWorksheet : null;
  }, [lesson?.mathWorksheet]);

  const fractionWorksheet = useMemo(() => {
    if (isFractionWorksheet(lesson?.fractionWorksheet)) {
      return lesson.fractionWorksheet;
    }

    const mathType = String(lesson?.mathType ?? "").trim().toLowerCase();
    const contentType = String(lesson?.contentType ?? "").trim().toLowerCase();

    if (
      (mathType === "fractions" || contentType === "fraction_worksheet") &&
      isFractionWorksheet(lesson?.mathWorksheet)
    ) {
      return lesson.mathWorksheet;
    }

    return null;
  }, [
    lesson?.fractionWorksheet,
    lesson?.mathWorksheet,
    lesson?.mathType,
    lesson?.contentType,
  ]);

  const isGeometryAssignment = useMemo(() => {
    const lessonType = String(lesson?.lessonType ?? "").trim().toLowerCase();
    const lessonTaskType = String(lesson?.taskType ?? "").trim().toLowerCase();
    const assignmentLessonType = String(assignment?.lessonType ?? "")
      .trim()
      .toLowerCase();
    const assignmentTaskType = String(assignment?.taskType ?? "")
      .trim()
      .toLowerCase();

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

  const isFractionAssignment = useMemo(() => {
    const lessonMathType = String(lesson?.mathType ?? "").trim().toLowerCase();
    const lessonContentType = String(lesson?.contentType ?? "")
      .trim()
      .toLowerCase();

    const assignmentMathType = String(assignment?.mathType ?? "")
      .trim()
      .toLowerCase();

    const assignmentContentType = String(assignment?.contentType ?? "")
      .trim()
      .toLowerCase();

    return (
      lessonMathType === "fractions" ||
      lessonContentType === "fraction_worksheet" ||
      assignmentMathType === "fractions" ||
      assignmentContentType === "fraction_worksheet" ||
      !!fractionWorksheet
    );
  }, [
    lesson?.mathType,
    lesson?.contentType,
    assignment?.mathType,
    assignment?.contentType,
    fractionWorksheet,
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
        console.log(
          "[TEACHER] read submission ERROR =>",
          info.code,
          info.message,
          err
        );
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

        setAssignment(
          aSnap.exists() ? ((aSnap.data() as AssignmentDoc) ?? {}) : null
        );
      } catch (e) {
        const info = getErrorInfo(e);
        console.log(
          "[TEACHER] read assignment ERROR =>",
          info.code,
          info.message,
          e
        );
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

        const sourceLesson = lSnap.exists()
          ? ((lSnap.data() as Lesson) ?? {})
          : null;

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
          mathWorksheet:
            assignment?.mathWorksheet ?? sourceLesson.mathWorksheet ?? null,
          fractionWorksheet:
            assignment?.fractionWorksheet ??
            sourceLesson.fractionWorksheet ??
            null,
          mathType: assignment?.mathType ?? sourceLesson.mathType,
          contentType: assignment?.contentType ?? sourceLesson.contentType,
        });
      } catch (e) {
        const info = getErrorInfo(e);
        console.log(
          "[TEACHER] read lesson ERROR =>",
          info.code,
          info.message,
          e
        );
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
        (typeof sub.studentName === "string" && sub.studentName.trim()
          ? sub.studentName.trim()
          : "") ||
        (typeof sub.studentDisplayName === "string" &&
          sub.studentDisplayName.trim()
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
      console.log(
        "[TEACHER] save ai feedback ERROR =>",
        info.code,
        info.message,
        e
      );
      setAiMsg(
        t("ai.saveFailed", {
          msg: info.message || t("fallback.unknownError"),
        })
      );
    } finally {
      setAiSaving(false);
      setTimeout(() => setAiMsg(null), 2200);
    }
  }

  const backLink = withLocale(
    locale,
    hasParams
      ? `/teacher/spaces/${spaceId}/lessons/${assignmentId}`
      : "/teacher/spaces"
  );

  if (!hasParams) {
    return (
      <div className="mx-auto box-border w-full max-w-6xl min-w-0 p-4">
        <div className="text-sm text-slate-600">
          {t("errors.missingParams")}
        </div>
      </div>
    );
  }

  if (loading || profileLoading) {
    return (
      <div className="p-4 text-sm text-slate-600">{tCommon("loading")}</div>
    );
  }

  if (!sub) {
    return (
      <div className="mx-auto box-border w-full max-w-6xl min-w-0 p-4">
        <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
          <h1 className="m-0 text-xl font-semibold text-slate-900">
            {t("missing.title")}
          </h1>
          <p className="mt-3 break-all text-sm text-slate-600">
            <code>
              spaces/{spaceId}/lessons/{assignmentId}/submissions/{subId}
            </code>
          </p>
          <div className="mt-4">
            <Link
              href={backLink}
              className="text-sm font-medium text-slate-700 underline underline-offset-4"
            >
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
  const normalizedStatus = String(rawStatus).toLowerCase();
  const isDraft = normalizedStatus === "draft";

  const lessonTitle = lesson?.title ?? assignment?.title ?? t("fallback.task");
  const lessonLevel = lesson?.level ?? assignment?.level ?? "";
  const lessonLevelLabel = formatLessonLevel(lessonLevel);
  const sourceText = String(lesson?.sourceText ?? lesson?.text ?? "");
  const cover = String(lesson?.coverImageUrl ?? "").trim() || null;

  const tasksOriginal = safeTasksArray(lesson?.tasks)
    .slice()
    .sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));

  const answersMap = readAnswerMap(
    isGeometryAssignment && !isFractionAssignment
      ? sub.answersByTaskId
      : sub.answers
  );

  const auto =
    isGeometryAssignment || isFractionAssignment ? null : readAutoGrade(sub);

  const geometryAuto =
    isGeometryAssignment && !isFractionAssignment ? readGeometryAuto(sub) : null;

  const geometryPercent =
    geometryAuto &&
      typeof geometryAuto.percent === "number" &&
      Number.isFinite(geometryAuto.percent)
      ? geometryAuto.percent
      : null;

  const geometryCorrect =
    geometryAuto &&
      typeof geometryAuto.correct === "number" &&
      Number.isFinite(geometryAuto.correct)
      ? geometryAuto.correct
      : 0;

  const geometryPartial =
    geometryAuto &&
      typeof geometryAuto.partial === "number" &&
      Number.isFinite(geometryAuto.partial)
      ? geometryAuto.partial
      : 0;

  const geometryWrong =
    geometryAuto &&
      typeof geometryAuto.wrong === "number" &&
      Number.isFinite(geometryAuto.wrong)
      ? geometryAuto.wrong
      : 0;

  const geometryUnanswered =
    geometryAuto &&
      typeof geometryAuto.unanswered === "number" &&
      Number.isFinite(geometryAuto.unanswered)
      ? geometryAuto.unanswered
      : 0;

  const correctLabel = safeSubmissionT(tAny, "meta.correctLabel", "Correct");
  const partialLabel = safeSubmissionT(
    tAny,
    "meta.partialLabel",
    "Partially correct"
  );
  const wrongLabel = safeSubmissionT(tAny, "meta.wrongLabel", "Wrong");
  const unansweredLabel = safeSubmissionT(
    tAny,
    "meta.unansweredLabel",
    "Unanswered"
  );
  const scoreLabel = safeSubmissionT(tAny, "meta.scoreLabel", "Score");
  const noAutoScoreLabel = safeSubmissionT(
    tAny,
    "meta.noAutoScore",
    "No automatic assessment available yet."
  );
  const noGeometryAutoScoreLabel = safeSubmissionT(
    tAny,
    "meta.noGeometryAutoScore",
    "No automatic assessment available yet."
  );

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

  const canGenerateAi =
    canOperate &&
    !aiGenerating &&
    !aiSaving &&
    !usageLoading &&
    aiFeedbackRemaining > 0;

  return (
    <div className="mx-auto box-border w-full max-w-6xl min-w-0 space-y-3">
      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-50 p-3 shadow-sm">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("title")}
            </div>

            <h1 className="mt-1 break-words text-xl font-semibold text-slate-900">
              {studentName ||
                (authInfo.isAnon ? t("fallback.guest") : authInfo.uid || "—")}
            </h1>

            <div className="mt-1 break-words text-sm text-slate-700">
              {lessonTitle}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
              {lessonLevelLabel ? <Badge text={lessonLevelLabel} /> : null}

              {createdAt ? (
                <span>
                  {t("meta.delivered")} <b>{createdAt}</b>
                </span>
              ) : (
                <span>{t("meta.deliveredUnknown")}</span>
              )}

              {normalizedStatus === "needs_work" ||
                normalizedStatus === "reviewed" ||
                normalizedStatus === "approved" ? (
                <StatusPill status={rawStatus} t={(k) => t(k)} />
              ) : null}

              {isGeometryAssignment &&
                !isFractionAssignment &&
                geometryPercent != null ? (
                <Badge
                  text={`${scoreLabel}: ${geometryPercent}%`}
                  kind={getGeometryScoreKind(geometryPercent)}
                />
              ) : null}

              {!isGeometryAssignment &&
                !isFractionAssignment &&
                auto?.percentAuto != null ? (
                <Badge
                  text={`${scoreLabel}: ${auto.percentAuto}%`}
                  kind={
                    auto.percentAuto >= 80
                      ? "good"
                      : auto.percentAuto >= 50
                        ? "warn"
                        : "bad"
                  }
                />
              ) : null}
            </div>
          </div>

          <div className="flex w-full min-w-0 justify-start lg:w-auto lg:justify-end">
            <Link
              href={backLink}
              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50 sm:w-auto"
            >
              {t("actions.back")}
            </Link>
          </div>
        </div>
      </div>

      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-white p-3 shadow-sm">
        {isFractionAssignment ? (
          <div className="text-sm text-slate-600">
            Brøkbesvarelse er levert. Automatisk vurdering kommer senere.
          </div>
        ) : isGeometryAssignment ? (
          geometryAuto ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {correctLabel}
                </div>
                <div className="mt-0.5 text-lg font-bold text-slate-900">
                  {geometryCorrect}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {partialLabel}
                </div>
                <div className="mt-0.5 text-lg font-bold text-slate-900">
                  {geometryPartial}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {wrongLabel}
                </div>
                <div className="mt-0.5 text-lg font-bold text-slate-900">
                  {geometryWrong}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {unansweredLabel}
                </div>
                <div className="mt-0.5 text-lg font-bold text-slate-900">
                  {geometryUnanswered}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {scoreLabel}
                </div>
                <div className="mt-0.5 text-lg font-bold text-slate-900">
                  {geometryPercent ?? "—"}%
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">
              {noGeometryAutoScoreLabel}
            </div>
          )
        ) : auto ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {correctLabel}
              </div>
              <div className="mt-0.5 text-lg font-bold text-slate-900">
                {auto.correctAuto}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {wrongLabel}
              </div>
              <div className="mt-0.5 text-lg font-bold text-slate-900">
                {auto.wrongAuto}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {unansweredLabel}
              </div>
              <div className="mt-0.5 text-lg font-bold text-slate-900">
                {auto.unansweredAuto}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {scoreLabel}
              </div>
              <div className="mt-0.5 text-lg font-bold text-slate-900">
                {auto.percentAuto ?? "—"}%
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600">{noAutoScoreLabel}</div>
        )}

        {isReadingTest && readingSummaryText ? (
          <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium leading-5 text-slate-800">
            {readingSummaryText}
          </div>
        ) : null}

        {isDraft ? (
          <div className="mt-2 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-900">
            {t("draft.notice")}
          </div>
        ) : null}
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
              <div className="text-base font-semibold text-slate-900">
                {t("studentView.title")}
              </div>
              {loadingLesson ? (
                <div className="mt-1 text-sm text-slate-600">
                  {t("studentView.loadingLesson")}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            {isGeometryAssignment || isFractionAssignment ? (
              <div className="grid gap-1">
                <div className="break-words text-lg font-semibold text-slate-900">
                  {lessonTitle}
                </div>
                {lessonLevel ? (
                  <div className="text-sm text-slate-600">
                    {t("studentView.level", { v: lessonLevel })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!isGeometryAssignment ? (
              <StandardSubmissionView
                lessonTitle={lessonTitle}
                lessonLevel={lessonLevel}
                cover={cover}
                sourceText={sourceText}
                tasksOriginal={tasksOriginal}
                answersMap={answersMap}
                auto={auto}
                t={tAny}
                getStableTaskId={getStableTaskId}
                getAutoEntry={getAutoEntry}
                renderValue={renderValue}
              />
            ) : null}

            {isGeometryAssignment || isFractionAssignment ? (
              <div>
                <div className="mb-3 text-base font-semibold text-slate-900">
                  {isGeometryAssignment
                    ? t("studentView.geometryTitle")
                    : t("studentView.tasksTitle")}
                </div>

                {isFractionAssignment && fractionWorksheet ? (
                  <FractionWorksheetView
                    worksheet={fractionWorksheet}
                    tBrand={tBrandAny}
                    showIdentityFields={false}
                    answersByTaskId={answersMap as Record<string, string>}
                    readOnly={true}
                    showAutoCheck={true}
                  />
                ) : isGeometryAssignment && geometryWorksheet ? (
                  <GeometrySubmissionView
                    worksheet={geometryWorksheet}
                    answersMap={answersMap as GeometryAnswersByTaskId}
                    auto={geometryAuto}
                    tGeometry={tGeometryAny}
                    tBrand={tBrandAny}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rightCol">
          <AiFeedbackPanel
            aiText={aiText}
            setAiText={setAiText}
            aiGenerating={aiGenerating}
            aiSaving={aiSaving}
            aiMsg={aiMsg}
            canOperate={canOperate}
            canGenerateAi={canGenerateAi}
            aiFeedbackUsed={aiFeedbackUsed}
            aiFeedbackLimit={aiFeedbackLimit}
            aiFeedbackRemaining={aiFeedbackRemaining}
            usageLoading={usageLoading}
            onGenerate={async () => {
              setAiGenerating(true);
              setAiMsg(null);

              try {
                const data = await authedPost<AiResp>(
                  "/api/teacher/ai-feedback",
                  {
                    spaceId,
                    assignmentId,
                    subId,
                    locale,
                  }
                );

                const newText = data.text || "";
                setAiText(newText);

                if (!data.skipped) {
                  await saveAiFeedbackToFirestore(newText);
                  setAiMsg(t("ai.generated"));
                } else {
                  setAiMsg(newText);
                }

                await reloadUsage();
              } catch (e: unknown) {
                const info = getErrorInfo(e);

                console.log(
                  "[TEACHER] generate ai feedback ERROR =>",
                  info.code,
                  info.message,
                  e
                );

                setAiMsg(
                  t("ai.generateFailed", {
                    msg: info.message || t("fallback.unknownError"),
                  })
                );
              } finally {
                setAiGenerating(false);
                setTimeout(() => setAiMsg(null), 2500);
              }
            }}
            onSave={() => {
              void saveAiFeedbackToFirestore(aiText);
            }}
            onCopy={async () => {
              const ok = await safeCopyToClipboard(aiText);
              setAiMsg(ok ? t("ai.copied") : t("ai.copyFailed"));
              setTimeout(() => setAiMsg(null), 1500);
            }}
            onInsert={() => {
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
            t={tAny}
          />

          <TeacherFeedbackPanel
            text={text}
            setText={setText}
            status={status}
            setStatus={setStatus}
            readingSummaryText={readingSummaryText}
            needsTextToChangeStatus={needsTextToChangeStatus}
            canOperate={canOperate}
            canSave={canSave}
            saving={saving}
            saveMsg={saveMsg}
            onSave={async () => {
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

                await authedPost("/api/notifications/teacher-feedback", {
                  spaceId,
                  assignmentId,
                  subId,
                  locale,
                });

                setInitialStatus(status);
                setSaveMsg(t("feedback.saved"));
              } catch (e: unknown) {
                const info = getErrorInfo(e);

                console.log(
                  "[TEACHER] save feedback ERROR =>",
                  info.code,
                  info.message,
                  e
                );

                setSaveMsg(
                  t("feedback.saveFailed", {
                    msg: info.message || t("fallback.unknownError"),
                  })
                );
              } finally {
                setSaving(false);
                setTimeout(() => setSaveMsg(null), 2000);
              }
            }}
            t={tAny}
          />
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
