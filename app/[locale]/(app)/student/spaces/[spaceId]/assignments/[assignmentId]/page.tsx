// app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";

import { db, auth } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { LANGUAGES } from "@/lib/languages";
import { SearchableSelect } from "@/components/SearchableSelect";

import ReadingTestPlayer, {
  ReadingLessonTask,
  type ReadingProgress,
} from "@/components/student/ReadingTestPlayer";

import GeometryWorksheetPracticeView from "@/components/generators/math/geometry/GeometryWorksheetPracticeView";
import FractionWorksheetView from "@/components/generators/math/fractions/FractionWorksheetView";

import type { GeometryAutoResult } from "@/lib/math/geometry/submissionTypes";
import { gradeGeometryWorksheet } from "@/lib/math/geometry/autoCheck";

import type {
  AnswersMap,
  AssignmentDoc,
  AutoGrade,
  Lesson,
  SourceType,
  SubmissionDoc,
  SubmissionStatus,
  Task,
  TextSize,
  TranslatedSection,
  TranslatedTask,
  TranslatingState,
  TtsLang,
} from "./types";

import {
  assignmentToLesson,
  buildSubmissionId,
  formatSeconds,
  getStableTaskId,
  hasSnapshotContent,
  isFinalSubmissionStatus,
  isPermissionDenied,
  normalizeStatus,
  stripUndefinedDeep,
  toTtsLang,
} from "./helpers";

import { toDateString } from "./statusHelpers";

import {
  computeAutoGrade,
  normalizeBool,
  normalizeMcq,
  readAutoGrade,
} from "./autoGrade";

import { gradeFractionWorksheet } from "./fractionGrade";
import { normalizeGeometryAnswersByTaskId } from "./geometrySubmissionHelpers";
import { isMathWorksheet } from "./worksheetTypeGuards";
import { translateOne } from "./translationHelpers";
import { segmentSentences } from "./audioHelpers";
import { splitLessonTextSections, type LessonTextSectionKey } from "./lessonTextSections";

import { SmartImage } from "./AssignmentUiAtoms";
import StudentAssignmentStatusCard from "./StudentAssignmentStatusCard";
import StudentAssignmentAudioBar from "./StudentAssignmentAudioBar";
import AssignmentFooterActions from "./AssignmentFooterActions";
import AssignmentPageHeader from "./AssignmentPageHeader";
import AssignmentPageState from "./AssignmentPageState";
import StandardAssignmentSection from "./StandardAssignmentSection";
import { getAssignmentDerivedState } from "./assignmentDerivedState";
import { useAssignmentAudio } from "./useAssignmentAudio";
import StudentAssignmentStickyActions from "./StudentAssignmentStickyActions";
import { DraftButton } from "./AssignmentActionButtons";

const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  value: l.code,
  label: l.label,
}));

/* =========================
   Helpers
========================= */

type ReadingTestTimerResult = {
  timeLimitSeconds: number | null;
  timeSpentSeconds: number | null;
  secondsLeftAtSubmit: number | null;
  timedOut: boolean;
  submittedManually: boolean;
};

function readReadingTimerResult(sd: unknown): ReadingTestTimerResult | null {
  if (!sd || typeof sd !== "object") return null;

  const d = sd as Record<string, unknown>;

  const timeLimitSeconds =
    typeof d.readingTestTimeLimitSeconds === "number"
      ? d.readingTestTimeLimitSeconds
      : null;

  const timeSpentSeconds =
    typeof d.readingTestTimeSpentSeconds === "number"
      ? d.readingTestTimeSpentSeconds
      : null;

  const secondsLeftAtSubmit =
    typeof d.readingTestSecondsLeftAtSubmit === "number"
      ? d.readingTestSecondsLeftAtSubmit
      : null;

  const timedOut = d.readingTestTimedOut === true;
  const submittedManually = d.readingTestSubmittedManually === true;

  if (
    timeLimitSeconds == null &&
    timeSpentSeconds == null &&
    secondsLeftAtSubmit == null &&
    !timedOut &&
    !submittedManually
  ) {
    return null;
  }

  return {
    timeLimitSeconds,
    timeSpentSeconds,
    secondsLeftAtSubmit,
    timedOut,
    submittedManually,
  };
}

async function resolveUserForStudentPage(): Promise<User> {
  if (auth.currentUser) return auth.currentUser;

  const existingUser = await new Promise<User | null>((resolve) => {
    let done = false;
    let unsub: (() => void) | null = null;

    const finish = (u: User | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (unsub) unsub();
      resolve(u);
    };

    unsub = onAuthStateChanged(
      auth,
      (u) => finish(u ?? null),
      () => finish(null)
    );

    const timer = window.setTimeout(() => {
      finish(auth.currentUser ?? null);
    }, 1500);
  });

  if (existingUser) return existingUser;

  return await ensureAnonymousUser();
}

/* =========================
   Page
========================= */

export default function StudentAssignmentPage() {
  const t = useTranslations("studentAssignment");
  const tString = t as unknown as (
    key: string,
    values?: Record<string, unknown>
  ) => string;

  const tGeometry = useTranslations("mathGeometry");
  const tGeometryAny = tGeometry as unknown as (
    key: string,
    values?: Record<string, unknown>
  ) => string;

  const params = useParams<{ spaceId: string; assignmentId: string }>();
  const spaceId = params?.spaceId;
  const assignmentId = params?.assignmentId;

  const sp = useSearchParams();
  const sid = useMemo(() => (sp.get("sid") ?? "").trim(), [sp]);

  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [isAnon, setIsAnon] = useState(true);

  const [answers, setAnswers] = useState<AnswersMap>({});
  const answersRef = useRef<AnswersMap>({});
  const [draftSaving, setDraftSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [submitted, setSubmitted] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const [liveStatus, setLiveStatus] = useState<SubmissionStatus | null>(null);
  const [liveTeacherText, setLiveTeacherText] = useState<string | null>(null);
  const [liveTeacherUpdatedAt, setLiveTeacherUpdatedAt] = useState<string | null>(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);
  const [liveAuto, setLiveAuto] = useState<AutoGrade | null>(null);
  const [liveGeometryAuto, setLiveGeometryAuto] = useState<GeometryAutoResult | null>(null);
  const [liveReadingTimerResult, setLiveReadingTimerResult] =
    useState<ReadingTestTimerResult | null>(null);

  const [targetLang, setTargetLang] = useState("no");
  const [translatedText, setTranslatedText] = useState<string | null>(null);

  const [translatedTeacherText, setTranslatedTeacherText] = useState<string | null>(null);
  const [teacherFeedbackTargetLang, setTeacherFeedbackTargetLang] = useState("no");
  const [teacherFeedbackTranslating, setTeacherFeedbackTranslating] = useState(false);
  const [teacherFeedbackTtsBusy, setTeacherFeedbackTtsBusy] = useState<
    null | "teacherFeedback" | "teacherFeedbackTranslation"
  >(null);

  const [translatedTasks, setTranslatedTasks] = useState<TranslatedTask[] | null>(null);
  const [translatedSections, setTranslatedSections] = useState<TranslatedSection[] | null>(null);
  const [translating, setTranslating] = useState<TranslatingState>(null);
  const [translateErr, setTranslateErr] = useState<string | null>(null);
  const [showTextTranslation, setShowTextTranslation] = useState(true);
  const [showTaskTranslations, setShowTaskTranslations] = useState(true);
  const [taskTranslationOpen, setTaskTranslationOpen] = useState<Record<string, boolean>>({});
  const [activeTextSectionKey, setActiveTextSectionKey] = useState<LessonTextSectionKey | null>(null);

  const [playbackRate, setPlaybackRate] = useState(1.0);

  const [readingTestStarted, setReadingTestStarted] = useState(false);
  const [readingTestFinished, setReadingTestFinished] = useState(false);
  const [readingTestSecondsLeft, setReadingTestSecondsLeft] = useState<number | null>(null);

  const {
    tasksOriginal,
    isReadingTest,
    geometryWorksheet,
    fractionWorksheet,
    isGeometryAssignment,
    isFractionAssignment,
  } = getAssignmentDerivedState(lesson, assignment);

  const tMap = useMemo(() => {
    const m = new Map<string, TranslatedTask>();
    (translatedTasks ?? []).forEach((x) => m.set(x.stableId, x));
    return m;
  }, [translatedTasks]);

  const sourceTextSafe = useMemo(
    () => String(lesson?.sourceText ?? lesson?.text ?? ""),
    [lesson?.sourceText, lesson?.text]
  );

  const isImageWriting = useMemo(
    () => String(lesson?.lessonType ?? assignment?.lessonType ?? "").trim().toLowerCase() === "image_writing",
    [lesson?.lessonType, assignment?.lessonType]
  );

  const displayedSourceTextSafe = isImageWriting || isReadingTest ? "" : sourceTextSafe;

  const lessonTextSections = useMemo(
    () => splitLessonTextSections(displayedSourceTextSafe, lesson?.language || assignment?.language),
    [assignment?.language, displayedSourceTextSafe, lesson?.language]
  );

  const translatedSectionMap = useMemo(() => {
    const map = new Map<string, string>();
    (translatedSections ?? []).forEach((section) => map.set(section.key, section.translatedText));
    return map;
  }, [translatedSections]);

  const activeSectionOriginalSegs = useMemo(() => {
    if (!activeTextSectionKey) return null;
    const section = lessonTextSections.find((item) => item.key === activeTextSectionKey);
    return section ? segmentSentences(section.text).segs : null;
  }, [activeTextSectionKey, lessonTextSections]);

  const imageUrl = useMemo(() => {
    const u = String(lesson?.coverImageUrl ?? "").trim();
    return u || null;
  }, [lesson?.coverImageUrl]);

  const textFollow = useMemo(() => {
    const original = segmentSentences(displayedSourceTextSafe || "");
    const translation = segmentSentences(translatedText || "");
    return { original, translation };
  }, [displayedSourceTextSafe, translatedText]);

  const originalSegs = textFollow.original.segs;
  const translationSegs = textFollow.translation.segs;

  const originalLangForTTS: TtsLang = toTtsLang(lesson?.language || assignment?.language || "no");
  const translationLangForTTS: TtsLang = toTtsLang(targetLang);

  const {
    audioRef,
    ttsBusy,
    ttsErr,
    setTtsBusy,
    setTtsErr,
    isPlaying,
    currentTime,
    duration,
    activeTextMode,
    activeSentenceIndex,
    stopAudio,
    pauseAudio,
    resumeAudio,
    seekToSentence,
    replaySentence,
    prevSentence,
    nextSentence,
    playTTS,
  } = useAssignmentAudio({
    assignmentId,
    playbackRate,
    originalSegs: activeSectionOriginalSegs ?? originalSegs,
    translationSegs,
    t: tString,
  });

  const setTtsBusyRef = useRef(setTtsBusy);
  const setTtsErrRef = useRef(setTtsErr);
  const stopAudioRef = useRef(stopAudio);

  useEffect(() => {
    setTtsBusyRef.current = setTtsBusy;
    setTtsErrRef.current = setTtsErr;
    stopAudioRef.current = stopAudio;
  }, [setTtsBusy, setTtsErr, stopAudio]);

  const readingTestTotalSeconds = useMemo(() => {
    const cfg = lesson?.readingTestConfig;
    if (!cfg?.timerEnabled) return null;

    const raw =
      typeof cfg.timerSeconds === "number" && Number.isFinite(cfg.timerSeconds)
        ? Math.floor(cfg.timerSeconds)
        : 300;

    return Math.max(10, raw);
  }, [lesson?.readingTestConfig]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  function setAnswer(taskId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [taskId]: value }));
  }

  function toggleTaskTranslation(stableId: string) {
    setTaskTranslationOpen((prev) => {
      const current = prev[stableId];
      return { ...prev, [stableId]: current === undefined ? false : !current };
    });
  }

  function isTaskTranslationVisible(stableId: string) {
    const v = taskTranslationOpen[stableId];
    if (v === undefined) return showTaskTranslations;
    return v;
  }

  const isLockedByTeacher = useCallback((): boolean => {
    const s = normalizeStatus(liveStatus ?? "submitted");
    return s === "reviewed" || s === "approved";
  }, [liveStatus]);

  function syncReadingProgress(progress: ReadingProgress) {
    setReadingTestStarted(progress.hasStarted);
    setReadingTestSecondsLeft(progress.secondsLeft);
  }

  async function onTranslateText() {
    const base = String(lesson?.sourceText ?? lesson?.text ?? "");
    if (!base.trim()) return;

    setTranslateErr(null);
    setTranslating("text");

    try {
      const out = await translateOne(base, targetLang);
      setTranslatedText(out);
      setShowTextTranslation(true);
    } catch (e: unknown) {
      const m = (e as { message?: unknown })?.message;
      setTranslateErr(typeof m === "string" ? m : t("translate.failed"));
      setTranslatedText(null);
    } finally {
      setTranslating(null);
    }
  }

  async function onTranslateSection(key: string, text: string) {
    const base = text.trim();
    if (!base) return;

    setTranslateErr(null);
    setTranslating(`section:${key}`);

    try {
      const out = await translateOne(base, targetLang);
      setTranslatedSections((current) => {
        const rest = (current ?? []).filter((section) => section.key !== key);
        return [...rest, { key, translatedText: out }];
      });
    } catch (e: unknown) {
      const m = (e as { message?: unknown })?.message;
      setTranslateErr(typeof m === "string" ? m : t("translate.failed"));
    } finally {
      setTranslating(null);
    }
  }

  async function onTranslateTeacherFeedback() {
    const base = String(liveTeacherText ?? "").trim();
    if (!base) return;

    setTeacherFeedbackTranslating(true);
    setTranslateErr(null);

    try {
      const out = await translateOne(base, teacherFeedbackTargetLang);
      setTranslatedTeacherText(out);
    } catch (e: unknown) {
      const m = (e as { message?: unknown })?.message;
      setTranslateErr(typeof m === "string" ? m : t("translate.failed"));
      setTranslatedTeacherText(null);
    } finally {
      setTeacherFeedbackTranslating(false);
    }
  }

  async function onPlayTeacherFeedback() {
    const text = String(liveTeacherText ?? "").trim();
    if (!text) return;

    setTeacherFeedbackTtsBusy("teacherFeedback");

    try {
      await playTTS(text, originalLangForTTS, "original");
    } finally {
      setTeacherFeedbackTtsBusy(null);
    }
  }

  async function onPlayTeacherFeedbackTranslation() {
    const text = String(translatedTeacherText ?? "").trim();
    if (!text) return;

    setTeacherFeedbackTtsBusy("teacherFeedbackTranslation");

    try {
      await playTTS(text, toTtsLang(teacherFeedbackTargetLang), "translation");
    } finally {
      setTeacherFeedbackTtsBusy(null);
    }
  }

  async function onTranslateTask(tt: Task, idx: number) {
    const stableId = getStableTaskId(tt, idx);
    const promptOrig = typeof tt?.prompt === "string" ? tt.prompt : "";
    const optionsOrig = Array.isArray(tt?.options) ? tt.options : [];
    if (!promptOrig.trim() && optionsOrig.length === 0) return;

    setTranslateErr(null);
    setTranslating(`task:${stableId}`);

    try {
      let translatedPrompt = "";
      if (promptOrig.trim()) {
        translatedPrompt = await translateOne(promptOrig, targetLang);
      }

      let translatedOptions: string[] = [];
      if (optionsOrig.length > 0) {
        translatedOptions = await Promise.all(
          optionsOrig.map(async (option) => {
            try {
              return await translateOne(String(option), targetLang);
            } catch (e: unknown) {
              const m = (e as { message?: unknown })?.message;
              setTranslateErr((prev) => prev ?? (typeof m === "string" ? m : t("translate.failed")));
              return "";
            }
          })
        );
      }

      setTranslatedTasks((current) => {
        const rest = (current ?? []).filter((item) => item.stableId !== stableId);
        return [
          ...rest,
          {
            stableId,
            translatedPrompt: translatedPrompt || undefined,
            translatedOptions: translatedOptions.length > 0 ? translatedOptions : undefined,
          },
        ];
      });
      setShowTaskTranslations(true);
      setTaskTranslationOpen((current) => ({ ...current, [stableId]: true }));
    } catch (e: unknown) {
      const m = (e as { message?: unknown })?.message;
      setTranslateErr(typeof m === "string" ? m : t("translate.failed"));
    } finally {
      setTranslating(null);
    }
  }

  function getMcqSelectedIndex(stableId: string, options: unknown[]): number | null {
    const a = answers[stableId];

    if (typeof a === "number" && Number.isFinite(a)) {
      const idx = Math.floor(a);
      return idx >= 0 && idx < options.length ? idx : null;
    }

    const s = normalizeMcq(a);
    if (!s) return null;

    const idx = options.findIndex((o) => normalizeMcq(o) === s);
    return idx >= 0 ? idx : null;
  }

  function isTrueSelected(stableId: string, v: boolean): boolean {
    const b = normalizeBool(answers[stableId]);
    return b === v;
  }

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      setErr(null);

      try {
        if (!spaceId || !assignmentId) {
          setErr(t("errors.missingParams"));
          return;
        }

        const user = await resolveUserForStudentPage();
        if (!alive) return;

        setUid(user.uid);
        setIsAnon(!!user.isAnonymous);

        const memberId = `${spaceId}_${user.uid}`;
        const memberSnap = await getDoc(doc(db, "spaceMembers", memberId));
        if (!memberSnap.exists()) throw new Error(t("errors.notMember"));
        const memberData = memberSnap.data() as { archived?: unknown; active?: unknown; status?: unknown };
        const memberStatus = String(memberData.status ?? "").toLowerCase().trim();
        if (memberData.archived === true || memberData.active === false || memberStatus === "removed") {
          throw new Error(t("errors.notMember"));
        }

        const aSnap = await getDoc(doc(db, "spaces", spaceId, "lessons", assignmentId));
        if (!alive) return;

        if (!aSnap.exists()) {
          setErr(t("errors.assignmentNotFoundInSpace"));
          setLesson(null);
          setAssignment(null);
          return;
        }

        const aDoc = (aSnap.data() as AssignmentDoc) ?? {};
        setAssignment(aDoc);

        let resolvedLesson: Lesson | null = null;

        if (hasSnapshotContent(aDoc)) {
          resolvedLesson = assignmentToLesson(aDoc);
        } else {
          const srcType = (aDoc.sourceType ?? "library") as SourceType;
          const srcId = String(aDoc.sourceId ?? "").trim();

          if (!srcId) {
            setErr(t("errors.missingSourceId"));
            setLesson(null);
            return;
          }

          const lSnap =
            srcType === "library"
              ? await getDoc(doc(db, "published_lessons", srcId))
              : await getDoc(doc(db, "lessons", srcId));

          if (!alive) return;

          if (!lSnap.exists()) {
            setErr(t("errors.sourceLessonMissing"));
            setLesson(null);
            return;
          }

          const d = lSnap.data() as Lesson;

          if (srcType === "library") {
            const isInactive = d?.isActive === false;
            const isArchived = typeof d?.status === "string" && d.status.toLowerCase() === "archived";
            if (isInactive || isArchived) {
              setErr(t("errors.unpublished"));
              setLesson(null);
              return;
            }
          }

          resolvedLesson = {
            title: aDoc.title ?? d.title,
            level: aDoc.level ?? d.level,
            topic: aDoc.topic ?? d.topic,
            language: aDoc.language ?? d.language,
            sourceText: d.sourceText,
            text: d.text,
            tasks: d.tasks,
            coverImageUrl: aDoc.coverImageUrl ?? d.coverImageUrl,
            status: d.status,
            isActive: d.isActive,
            lessonType: aDoc.lessonType ?? d.lessonType,
            taskType: aDoc.taskType ?? d.taskType,
            readingTestConfig: aDoc.readingTestConfig ?? d.readingTestConfig ?? null,
            textSize: normalizeTextSize(aDoc.textSize ?? d.textSize),
            mathWorksheet: aDoc.mathWorksheet ?? d.mathWorksheet ?? null,
            fractionWorksheet: aDoc.fractionWorksheet ?? d.fractionWorksheet ?? null,
            mathType: aDoc.mathType ?? d.mathType,
            contentType: aDoc.contentType ?? d.contentType,
          };
        }

        setLesson(resolvedLesson);

        const isGeometryResolved =
          String(resolvedLesson?.lessonType ?? "").trim().toLowerCase() === "math_geometry" ||
          String(resolvedLesson?.taskType ?? "").trim().toLowerCase() === "math_geometry" ||
          isMathWorksheet(resolvedLesson?.mathWorksheet);

        setTranslatedText(null);
        setTranslatedTasks(null);
        setTranslateErr(null);
        setTranslatedTeacherText(null);
        setTeacherFeedbackTargetLang("no");
        setTeacherFeedbackTranslating(false);
        setTeacherFeedbackTtsBusy(null);
        setTaskTranslationOpen({});
        setTtsErrRef.current(null);
        setTtsBusyRef.current(null);
        stopAudioRef.current();

        setSubmitted(false);
        setSubmissionId(null);
        setMsg(null);
        setAnswers({});

        setReadingTestStarted(false);
        setReadingTestFinished(false);
        setReadingTestSecondsLeft(readingTestTotalSeconds);

        setLiveStatus(null);
        setLiveTeacherText(null);
        setLiveTeacherUpdatedAt(null);
        setLiveUpdatedAt(null);
        setLiveAuto(null);
        setLiveGeometryAuto(null);
        setLiveReadingTimerResult(null);

        const loadSubmission = async (subId: string) => {
          const sRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", subId);
          const sSnap = await getDoc(sRef);

          if (!sSnap.exists()) return false;

          const sd = (sSnap.data() as SubmissionDoc) ?? {};
          const owner = typeof sd.uid === "string" ? sd.uid : null;
          if (owner && owner !== user.uid) throw new Error(t("errors.noAccessSubmission"));

          const sStatus = normalizeStatus(sd.status);
          setLiveStatus(sStatus);
          setSubmitted(isFinalSubmissionStatus(sStatus));
          setLiveTeacherText(sd.teacherFeedback?.text ? String(sd.teacherFeedback.text).trim() : null);
          setLiveTeacherUpdatedAt(toDateString(sd.teacherFeedback?.updatedAt) ?? null);
          setLiveUpdatedAt(toDateString(sd.updatedAt) ?? null);
          setLiveReadingTimerResult(readReadingTimerResult(sd));

          const nextAnswers = isGeometryResolved
            ? (normalizeGeometryAnswersByTaskId(sd.answersByTaskId) as unknown as AnswersMap)
            : (
              sd.answers && typeof sd.answers === "object" && !Array.isArray(sd.answers)
                ? (sd.answers as AnswersMap)
                : {}
            );

          if (Object.keys(nextAnswers).length > 0) {
            setAnswers(nextAnswers);
          }

          if (isGeometryResolved) {
            setLiveGeometryAuto((sd.auto as GeometryAutoResult | null) ?? null);
            setLiveAuto(null);
          } else {
            setLiveAuto(readAutoGrade(sd));
            setLiveGeometryAuto(null);
          }

          if (sStatus === "needs_work" || sStatus === "draft") {
            setEditingSubmissionId(subId);
          } else {
            setEditingSubmissionId(null);
            if (sStatus === "submitted" || sStatus === "reviewed" || sStatus === "approved") {
              setReadingTestStarted(true);
              setReadingTestFinished(true);
            }
          }

          return true;
        };

        if (sid) {
          const found = await loadSubmission(sid);
          if (!found) {
            setMsg(t("messages.submissionNotFound"));
            setEditingSubmissionId(null);
          }
        } else {
          const autoId = `${spaceId}_${assignmentId}_${user.uid}`;

          try {
            const found = await loadSubmission(autoId);
            if (!found) setEditingSubmissionId(null);
          } catch (e: unknown) {
            if (!isPermissionDenied(e)) throw e;
            setEditingSubmissionId(null);
          }
        }
      } catch (e: unknown) {
        if (!alive) return;

        if (isPermissionDenied(e)) setErr(t("errors.permissionDenied"));
        else {
          const m = (e as { message?: unknown })?.message;
          setErr(typeof m === "string" ? m : t("errors.generic"));
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();

    return () => {
      alive = false;
    };
  }, [
    spaceId,
    assignmentId,
    sid,
    t,
    readingTestTotalSeconds,
  ]);

  useEffect(() => {
    if (!spaceId || !assignmentId) return;
    if (!uid) return;

    const activeSubId = (sid || submissionId || editingSubmissionId || "").trim();
    if (!activeSubId) return;

    const sRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", activeSubId);

    const unsub = onSnapshot(
      sRef,
      (snap) => {
        if (!snap.exists()) return;

        const sd = (snap.data() as SubmissionDoc) ?? {};
        const owner = typeof sd.uid === "string" ? sd.uid : null;
        if (owner && owner !== uid) return;

        const sStatus = normalizeStatus(sd.status);
        setLiveStatus(sStatus);
        setSubmitted(isFinalSubmissionStatus(sStatus));

        const tText = sd.teacherFeedback?.text ? String(sd.teacherFeedback.text).trim() : "";
        setLiveTeacherText(tText ? tText : null);

        setLiveTeacherUpdatedAt(toDateString(sd.teacherFeedback?.updatedAt) ?? null);
        setLiveUpdatedAt(toDateString(sd.updatedAt) ?? null);
        setLiveReadingTimerResult(readReadingTimerResult(sd));

        if (isGeometryAssignment) {
          setLiveGeometryAuto((sd.auto as GeometryAutoResult | null) ?? null);
          setLiveAuto(null);

          const nextAnswers = normalizeGeometryAnswersByTaskId(sd.answersByTaskId);
          if (Object.keys(nextAnswers).length > 0) {
            setAnswers(nextAnswers as unknown as AnswersMap);
          }
        } else {
          setLiveAuto(readAutoGrade(sd));
          setLiveGeometryAuto(null);
        }

        if (sStatus === "needs_work" || sStatus === "draft") {
          setEditingSubmissionId(activeSubId);
        } else {
          setEditingSubmissionId(null);
        }

        if (sStatus === "submitted" || sStatus === "reviewed" || sStatus === "approved") {
          setReadingTestStarted(true);
          setReadingTestFinished(true);
        }
      },
      () => { }
    );

    return () => unsub();
  }, [spaceId, assignmentId, uid, sid, submissionId, editingSubmissionId, isGeometryAssignment]);

  const saveDraft = useCallback(
    async (manual = false) => {
      if (!spaceId || !assignmentId || !uid) return;
      if (submitted) return;
      if (isLockedByTeacher()) return;
      if (isReadingTest) return;
      if (submitting) return;

      setDraftSaving(true);
      setErr(null);
      if (manual) setMsg(null);

      try {
        const subId = buildSubmissionId(spaceId, assignmentId, uid, editingSubmissionId);

        const nestedRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", subId);
        const indexRef = doc(db, "spaceSubmissions", subId);

        const isGeometryDraft = isGeometryAssignment && !!geometryWorksheet;
        const normalizedGeometryAnswers = isGeometryDraft
          ? normalizeGeometryAnswersByTaskId(answers)
          : null;

        const currentDraftStatus =
          normalizeStatus(liveStatus) === "needs_work" ? "needs_work" : "draft";

        const basePayload: Record<string, unknown> = stripUndefinedDeep({
          spaceId,
          assignmentId,
          sourceType: assignment?.sourceType ?? null,
          sourceId: assignment?.sourceId ?? null,
          title: assignment?.title ?? lesson?.title ?? null,
          level: assignment?.level ?? lesson?.level ?? null,
          language: assignment?.language ?? lesson?.language ?? null,
          uid,
          isAnon,
          status: currentDraftStatus,

          taskType: isGeometryDraft ? "math_geometry" : null,
          lessonType: isGeometryDraft ? "math_geometry" : lesson?.lessonType ?? null,
          mathWorksheet: isGeometryDraft ? geometryWorksheet : null,

          answers: isGeometryDraft ? normalizedGeometryAnswers : answers,
          answersByTaskId: isGeometryDraft ? normalizedGeometryAnswers : undefined,

          auto: null,
          aiFeedback: null,

          startedAt: Date.now(),
          timeSpentSeconds: 0,
          updatedAt: serverTimestamp(),
          auth: { isAnon, uid },
        });

        const batch = writeBatch(db);

        if (editingSubmissionId) {
          batch.set(nestedRef, basePayload, { merge: true });
          batch.set(indexRef, basePayload, { merge: true });
        } else {
          const firstPayload = { ...basePayload, createdAt: serverTimestamp() };
          batch.set(nestedRef, firstPayload, { merge: true });
          batch.set(indexRef, firstPayload, { merge: true });
        }

        await batch.commit();

        setSubmissionId(subId);
        setEditingSubmissionId(subId);
        setLiveStatus(currentDraftStatus);
        setSubmitted(false);
        setLiveAuto(null);
        setLiveGeometryAuto(null);
        setLiveReadingTimerResult(null);

        if (manual) setMsg("Kladd lagret.");
      } catch (e: unknown) {
        if (isPermissionDenied(e)) setErr(t("errors.permissionDenied"));
        else {
          const m = (e as { message?: unknown })?.message;
          setErr(typeof m === "string" ? m : t("errors.submitFailed"));
        }
      } finally {
        setDraftSaving(false);
      }
    },
    [
      spaceId,
      assignmentId,
      uid,
      submitted,
      isLockedByTeacher,
      isReadingTest,
      submitting,
      editingSubmissionId,
      isGeometryAssignment,
      geometryWorksheet,
      answers,
      liveStatus,
      assignment,
      lesson,
      isAnon,
      t,
    ]
  );

  const lastAutoSaveRef = useRef<number>(0);

  useEffect(() => {
    if (!uid || !spaceId || !assignmentId) return;
    if (submitted) return;
    if (submitting) return;
    if (isLockedByTeacher()) return;
    if (isReadingTest) return;
    if (!answers || Object.keys(answers).length === 0) return;

    const now = Date.now();
    if (now - lastAutoSaveRef.current < 1200) return;

    const timer = window.setTimeout(() => {
      lastAutoSaveRef.current = Date.now();
      void saveDraft(false);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [answers, uid, spaceId, assignmentId, submitted, submitting, isReadingTest, isLockedByTeacher, saveDraft]);

  const submitToSpace = useCallback(
    async (
      mode: "manual" | "timeout" = "manual",
      explicitAnswers?: AnswersMap,
      progressOverride?: ReadingProgress
    ) => {
      if (!spaceId || !assignmentId || !uid) return;
      if (submitted) return;

      if ((sid || editingSubmissionId) && editingSubmissionId == null) {
        setErr(null);
        setMsg(t("messages.lockedNoChanges"));
        return;
      }

      if (isLockedByTeacher()) {
        setErr(null);
        setMsg(t("messages.lockedNoChanges"));
        return;
      }

      setSubmitting(true);
      setErr(null);
      setMsg(null);

      try {
        const finalAnswers = explicitAnswers ?? answersRef.current;
        const normalizedGeometryAnswers = isGeometryAssignment
          ? normalizeGeometryAnswersByTaskId(finalAnswers)
          : null;

        const subId = buildSubmissionId(spaceId, assignmentId, uid, editingSubmissionId);

        const nestedRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", subId);
        const indexRef = doc(db, "spaceSubmissions", subId);

        let auto: unknown = computeAutoGrade(tasksOriginal, finalAnswers);
        const aiFeedback: unknown = null;

        if (isGeometryAssignment && geometryWorksheet) {
          const geometryAuto = gradeGeometryWorksheet(
            geometryWorksheet,
            normalizedGeometryAnswers ?? {}
          );
          auto = geometryAuto;
        }

        if (isFractionAssignment && fractionWorksheet) {
          auto = gradeFractionWorksheet(fractionWorksheet, finalAnswers);
        }

        const readingTestSecondsLeftAtSubmit =
          isReadingTest
            ? mode === "timeout"
              ? 0
              : progressOverride?.secondsLeft ?? readingTestSecondsLeft
            : null;

        const readingTestTimeSpentSeconds =
          isReadingTest && readingTestTotalSeconds != null
            ? Math.max(
              0,
              Math.min(
                readingTestTotalSeconds,
                readingTestTotalSeconds -
                (readingTestSecondsLeftAtSubmit ?? readingTestTotalSeconds)
              )
            )
            : null;

        const readingTimerResult: ReadingTestTimerResult | null = isReadingTest
          ? {
            timeLimitSeconds: readingTestTotalSeconds,
            timeSpentSeconds: readingTestTimeSpentSeconds,
            secondsLeftAtSubmit: readingTestSecondsLeftAtSubmit,
            timedOut: mode === "timeout",
            submittedManually: mode === "manual",
          }
          : null;

        const basePayload: Record<string, unknown> = stripUndefinedDeep({
          spaceId,
          assignmentId,
          sourceType: assignment?.sourceType ?? null,
          sourceId: assignment?.sourceId ?? null,
          title: assignment?.title ?? lesson?.title ?? null,
          level: assignment?.level ?? lesson?.level ?? null,
          language: assignment?.language ?? lesson?.language ?? null,
          uid,
          isAnon,
          status: "submitted",

          taskType: isGeometryAssignment
            ? "math_geometry"
            : isFractionAssignment
              ? "math_fractions"
              : null,

          lessonType: isGeometryAssignment
            ? "math_geometry"
            : isFractionAssignment
              ? "math_fractions"
              : lesson?.lessonType ?? null,

          mathWorksheet: isGeometryAssignment ? geometryWorksheet : null,
          fractionWorksheet: isFractionAssignment ? fractionWorksheet : null,
          mathType: isFractionAssignment ? "fractions" : lesson?.mathType ?? null,
          contentType: isFractionAssignment ? "fraction_worksheet" : lesson?.contentType ?? null,

          answers: isGeometryAssignment ? normalizedGeometryAnswers : finalAnswers,
          answersByTaskId: isGeometryAssignment ? normalizedGeometryAnswers : undefined,

          auto,
          aiFeedback,

          submittedAt: Date.now(),

          readingTestTimeLimitSeconds: isReadingTest ? readingTestTotalSeconds : null,
          readingTestTimeSpentSeconds,
          readingTestSecondsLeftAtSubmit,
          readingTestTimedOut: isReadingTest ? mode === "timeout" : false,
          readingTestSubmittedManually: isReadingTest ? mode === "manual" : false,
          readingTimerResult,

          updatedAt: serverTimestamp(),
          auth: { isAnon, uid },
        });

        const batch = writeBatch(db);

        if (editingSubmissionId) {
          batch.set(nestedRef, basePayload, { merge: true });
          batch.set(indexRef, basePayload, { merge: true });
        } else {
          const firstPayload = { ...basePayload, createdAt: serverTimestamp() };
          batch.set(nestedRef, firstPayload, { merge: true });
          batch.set(indexRef, firstPayload, { merge: true });
        }

        await batch.commit();

        setSubmissionId(subId);
        setEditingSubmissionId(null);
        setSubmitted(true);
        setReadingTestFinished(true);
        setReadingTestSecondsLeft((prev) => (mode === "timeout" ? 0 : prev));
        setLiveStatus("submitted");
        setLiveReadingTimerResult(readingTimerResult);

        if (isGeometryAssignment) {
          setLiveGeometryAuto((auto as GeometryAutoResult) ?? null);
          setLiveAuto(null);
        } else {
          setLiveAuto(auto as AutoGrade);
          setLiveGeometryAuto(null);
        }

        if (mode === "timeout") {
          setMsg("Takk for innsatsen. Tiden er ute, og læreren har mottatt svaret ditt.");
        } else {
          setMsg(editingSubmissionId ? t("messages.resubmitted") : t("messages.submitted"));
        }

        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      } catch (e: unknown) {
        if (isPermissionDenied(e)) setErr(t("errors.permissionDenied"));
        else {
          const m = (e as { message?: unknown })?.message;
          setErr(typeof m === "string" ? m : t("errors.submitFailed"));
        }
        setSubmitted(false);
        setSubmissionId(null);
      } finally {
        setSubmitting(false);
      }
    },
    [
      spaceId,
      assignmentId,
      uid,
      submitted,
      sid,
      editingSubmissionId,
      t,
      isLockedByTeacher,
      isGeometryAssignment,
      geometryWorksheet,
      isFractionAssignment,
      fractionWorksheet,
      assignment,
      lesson,
      isAnon,
      isReadingTest,
      readingTestTotalSeconds,
      readingTestSecondsLeft,
      tasksOriginal,
    ]
  );

  if (loading || err || !lesson) {
    return (
      <AssignmentPageState
        loading={loading}
        err={err}
        lessonExists={!!lesson}
        spaceId={spaceId}
        t={tString}
      />
    );
  }

  const stickyAudioLabel =
    activeTextMode === "translation"
      ? t("text.translation")
      : t("text.original");

  const showStatusCard = !!(sid || submissionId || editingSubmissionId || liveStatus);
  const effectiveStatus = normalizeStatus(liveStatus ?? (editingSubmissionId ? "draft" : sid ? "submitted" : ""));
  const lock = isLockedByTeacher();

  const mainTitle = String(assignment?.title ?? lesson.title ?? t("fallback.title") ?? "Oppgave").trim();
  const metaLine = [assignment?.level ?? lesson.level, assignment?.language ?? lesson.language]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" · ");

  const currentStatus = normalizeStatus(liveStatus ?? "");

  const isNeedsWorkStatus = currentStatus === "needs_work";
  const isSubmittedStatus = currentStatus === "submitted";
  const isApprovedLikeStatus = currentStatus === "reviewed" || currentStatus === "approved";

  const canResubmit = isNeedsWorkStatus;

  const showDraftButton =
    !isReadingTest &&
    !isApprovedLikeStatus &&
    !isSubmittedStatus;

  const showSubmitButton =
    !isApprovedLikeStatus &&
    (!isReadingTest || readingTestStarted) &&
    (!isSubmittedStatus || isNeedsWorkStatus);

  const submitLabel = submitting
    ? t("actions.saving")
    : canResubmit
      ? t("actions.resubmit")
      : isReadingTest
        ? "Send til lærer"
        : t("actions.submit");

  const submitDisabled =
    submitting ||
    lock ||
    !uid ||
    (isReadingTest && !readingTestStarted) ||
    (isReadingTest && readingTestFinished);

  const showGeometryAutoTop =
    isGeometryAssignment &&
    !!liveGeometryAuto &&
    (
      submitted ||
      effectiveStatus === "submitted" ||
      effectiveStatus === "reviewed" ||
      effectiveStatus === "approved" ||
      effectiveStatus === "needs_work"
    );

  return (
    <main style={{ width: "100%", maxWidth: 980, margin: "0 auto", padding: "12px 8px 170px", boxSizing: "border-box" }}>
      <AssignmentPageHeader
        mainTitle={isReadingTest ? "Lesetest" : mainTitle}
        metaLine={metaLine}
      />

      {translateErr ? (
        <div style={{ marginTop: 10, color: "crimson", whiteSpace: "pre-wrap" }}>{translateErr}</div>
      ) : null}

      {imageUrl && !isReadingTest ? (
        <div
          style={{
            marginTop: 14,
            width: "100%",
            boxSizing: "border-box",
            aspectRatio: "16 / 9",
            maxHeight: isImageWriting ? 520 : undefined,
            overflow: "hidden",
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.10)",
            background: isImageWriting ? "rgba(0,0,0,0.03)" : undefined,
          }}
        >
          <SmartImage src={imageUrl} alt={mainTitle || "Cover"} fit={isImageWriting ? "contain" : "cover"} />
        </div>
      ) : null}

      {!isReadingTest ? (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              padding: 8,
              borderRadius: 14,
              border: "1px solid rgba(37,99,235,0.16)",
              background: "rgba(239,246,255,0.82)",
            }}
          >
            <SearchableSelect
              label={tString("translate.languageLabel")}
              value={targetLang}
              options={LANGUAGE_OPTIONS}
              onChange={setTargetLang}
              placeholder={tString("translate.searchPlaceholder")}
              buttonWidth={220}
            />
          </div>

          <DraftButton
            show={showDraftButton}
            disabled={draftSaving || submitting || lock || !uid}
            saving={draftSaving}
            onClick={() => saveDraft(true)}
          />
        </div>
      ) : null}

      {showStatusCard ? (
        <StudentAssignmentStatusCard
          effectiveStatus={effectiveStatus}
          liveAuto={liveAuto}
          liveGeometryAuto={liveGeometryAuto}
          liveReadingTimerResult={liveReadingTimerResult}
          liveTeacherText={liveTeacherText}
          liveTeacherUpdatedAt={liveTeacherUpdatedAt}
          liveUpdatedAt={liveUpdatedAt}
          lock={lock}
          isGeometryAssignment={isGeometryAssignment}
          showGeometryAutoTop={showGeometryAutoTop}
          t={tString}
          tGeometry={tGeometryAny}
          translatedTeacherText={translatedTeacherText}
          teacherFeedbackTargetLang={teacherFeedbackTargetLang}
          teacherFeedbackTranslating={teacherFeedbackTranslating}
          teacherFeedbackTtsBusy={teacherFeedbackTtsBusy}
          onTeacherFeedbackTargetLangChange={setTeacherFeedbackTargetLang}
          onTranslateTeacherFeedback={onTranslateTeacherFeedback}
          onPlayTeacherFeedback={onPlayTeacherFeedback}
          onPlayTeacherFeedbackTranslation={onPlayTeacherFeedbackTranslation}
        />
      ) : null}

      <div style={{ marginTop: 18 }}>
        {isReadingTest ? (
          <ReadingTestPlayer
            title={mainTitle}
            level={String(assignment?.level ?? lesson.level ?? "")}
            language={String(assignment?.language ?? lesson.language ?? "")}
            sourceText={sourceTextSafe}
            tasks={tasksOriginal as ReadingLessonTask[]}
            readingTestConfig={lesson.readingTestConfig ?? null}
            initialAnswers={answers}
            disabled={lock || submitted || readingTestFinished || submitting}
            submitLabel="Send til lærer"
            importantMessage="Viktig! Nedtellingen starter når du trykker på Start test. Les teksten nøye og svar på oppgavene. Timeren stopper når du trykker på Send til lærer."
            onAnswersChange={setAnswers}
            onProgressChange={syncReadingProgress}
            onSubmittedChange={setReadingTestFinished}
            onSubmit={(progress) => submitToSpace("manual", undefined, progress)}
          />
        ) : null}

        {!isReadingTest && isGeometryAssignment && geometryWorksheet ? (
          <GeometryWorksheetPracticeView
            worksheet={geometryWorksheet}
            answersByTaskId={normalizeGeometryAnswersByTaskId(answers)}
            onAnswerChange={(taskId, value) => setAnswer(taskId, value)}
            readOnly={lock || submitted}
            t={tGeometryAny}
            tBrand={tString}
          />
        ) : null}

        {!isReadingTest && isFractionAssignment && fractionWorksheet ? (
          <FractionWorksheetView
            worksheet={fractionWorksheet}
            answersByTaskId={answers as Record<string, string>}
            onAnswerChange={(taskId, value) => setAnswer(taskId, value)}
            readOnly={lock || submitted}
            showIdentityFields={false}
            showAutoCheck={
              submitted ||
              ["submitted", "reviewed", "approved", "needs_work"].includes(
                normalizeStatus(liveStatus ?? "")
              )
            }
            variant="embedded"
          />
        ) : null}

        {!isReadingTest && !isGeometryAssignment && !isFractionAssignment ? (
          <StandardAssignmentSection
            lessonLanguage={String(lesson?.language ?? assignment?.language ?? "")}
            textSize={normalizeTextSize(lesson?.textSize ?? assignment?.textSize)}
            sourceTextSafe={displayedSourceTextSafe}
            translatedText={translatedText}
            lessonTextSections={lessonTextSections}
            translatedSectionMap={translatedSectionMap}
            originalSegs={originalSegs}
            translationSegs={translationSegs}
            activeTextSectionKey={activeTextSectionKey}
            translating={translating}
            ttsBusy={ttsBusy}
            ttsErr={ttsErr}
            showTextTranslation={showTextTranslation}
            onToggleTextTranslation={() => setShowTextTranslation((v) => !v)}
            activeTextMode={activeTextMode}
            activeSentenceIndex={activeSentenceIndex}
            hasAudio={!!audioRef.current}
            originalLangForTTS={originalLangForTTS}
            translationLangForTTS={translationLangForTTS}
            t={tString}
            onTranslateText={onTranslateText}
            onTranslateSection={onTranslateSection}
            onPlayTTS={async (text, lang, mode) => {
              setActiveTextSectionKey(null);
              await playTTS(text, lang, mode);
            }}
            onPlaySectionTTS={async (key, text, lang, mode) => {
              setActiveTextSectionKey(key);
              await playTTS(text, lang, mode);
            }}
            onSeekSentence={seekToSentence}
            tasksOriginal={tasksOriginal}
            answers={answers}
            translatedTasksMap={tMap}
            autoGrade={liveAuto}
            lock={lock || submitted}
            getStableTaskId={getStableTaskId}
            isTaskTranslationVisible={isTaskTranslationVisible}
            getMcqSelectedIndex={getMcqSelectedIndex}
            isTrueSelected={isTrueSelected}
            onToggleTranslation={toggleTaskTranslation}
            onAnswer={setAnswer}
            onTranslateTask={onTranslateTask}
            showTaskTranslations={showTaskTranslations}
            onToggleTaskTranslations={() => setShowTaskTranslations((v) => !v)}
          />
        ) : null}
      </div>

      <AssignmentFooterActions
        msg={msg}
        spaceId={spaceId}
        t={tString}
      />

      <StudentAssignmentStickyActions
        showSubmitButton={showSubmitButton}
        submitting={submitting}
        lock={lock}
        uid={uid}
        submitLabel={submitLabel}
        submitDisabled={submitDisabled}
        isReadingTest={isReadingTest}
        t={tString}
        onSubmit={() => submitToSpace("manual")}
      />

      <StudentAssignmentAudioBar
        visible={!!audioRef.current}
        label={stickyAudioLabel}
        playbackRate={playbackRate}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        t={tString}
        formatSeconds={formatSeconds}
        onDecreaseRate={() =>
          setPlaybackRate((v) => Math.max(0.75, Number((v - 0.1).toFixed(2))))
        }
        onIncreaseRate={() =>
          setPlaybackRate((v) => Math.min(1.5, Number((v + 0.1).toFixed(2))))
        }
        onPrevSentence={prevSentence}
        onNextSentence={nextSentence}
        onPause={pauseAudio}
        onResume={resumeAudio}
        onStop={stopAudio}
        onReplay={replaySentence}
        onSeek={(value) => {
          const a = audioRef.current;
          if (!a) return;
          a.currentTime = value;
        }}
      />
    </main>
  );
}

function normalizeTextSize(value: unknown): TextSize {
  if (value === "large" || value === "xlarge") return value;
  return "normal";
}
