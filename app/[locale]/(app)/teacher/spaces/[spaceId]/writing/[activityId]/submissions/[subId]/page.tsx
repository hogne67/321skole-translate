"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import AuthGate from "@/components/AuthGate";
import TeacherFeedbackPanel from "@/components/teacher/submissions/TeacherFeedbackPanel";
import { auth, db } from "@/lib/firebase";
import { authedPost } from "@/lib/authedPost";
import { upgradeWritingActivityForRuntime } from "@/lib/writingStation";
import { doc, getDoc, onSnapshot, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import type {
  WritingActivity,
  WritingAiUsageLog,
  WritingFieldTemplate,
  WritingRoomTemplate,
  WritingSectionTemplate,
  WritingSubmission,
} from "@/lib/writingStation";

type SpaceDocLite = {
  title?: string;
};

type SpaceMemberDoc = {
  displayName?: string;
  name?: string;
  studentName?: string;
  email?: string;
};

type SubmissionData = Partial<WritingSubmission> & {
  aiUsage?: Array<Partial<WritingAiUsageLog> & Record<string, unknown>>;
  sectionImprovementRequests?: Record<string, {
    status?: "submitted";
    answerSummary?: string;
    updatedAt?: unknown;
  }>;
};

type ReviewStatus = "reviewed" | "needs_work";
type SectionFeedbackStatus = "approved" | "improve";

type SectionFeedbackSuggestion = {
  sectionId: string;
  text: string;
  status?: SectionFeedbackStatus;
};

type OverallFeedbackSuggestion = {
  text: string;
  status?: ReviewStatus;
};

type TeacherTab = "planning" | "drafting" | "revision" | "final" | "aiLog";
type SourceKind = "website" | "book" | "article" | "image" | "other";

type SourceEntry = {
  id: string;
  kind: SourceKind;
  title: string;
  url?: string;
  author?: string;
  site?: string;
  publisher?: string;
  year?: string;
  note?: string;
};

const HIDDEN_FACTUAL_PLANNING_SECTION_IDS = new Set(["purpose_audience", "key_terms", "structure"]);

function withLocale(locale: string, href: string): string {
  if (!href.startsWith("/")) return href;
  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "nb" || seg === "pt") return href;
  return `/${locale}${href}`;
}

function formatMaybeDate(value: unknown, locale: string): string {
  try {
    if (!value) return "";
    const date: Date | null =
      value instanceof Date
        ? value
        : value instanceof Timestamp
          ? value.toDate()
          : typeof (value as { toDate?: unknown })?.toDate === "function"
            ? (value as { toDate: () => Date }).toDate()
            : null;
    if (!date) return "";
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return "";
  }
}

function normalizeStatus(value: unknown) {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "planning_submitted") return "planning_submitted";
  if (status === "planning_reviewed") return "planning_reviewed";
  if (status === "submitted") return "submitted";
  if (status === "reviewed" || status === "approved") return "reviewed";
  if (status === "needs_work") return "needs_work";
  if (status === "draft") return "draft";
  return "unknown";
}

function statusClass(status: string) {
  if (status === "planning_submitted") return "border-purple-200 bg-purple-50 text-purple-900";
  if (status === "planning_reviewed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "submitted") return "border-blue-200 bg-blue-50 text-blue-900";
  if (status === "reviewed") return "border-green-200 bg-green-50 text-green-900";
  if (status === "needs_work") return "border-yellow-200 bg-yellow-50 text-yellow-900";
  if (status === "draft") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-slate-300 bg-white text-slate-700";
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(String).join(", ").trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isSourceKind(value: unknown): value is SourceKind {
  return value === "website" || value === "book" || value === "article" || value === "image" || value === "other";
}

function parseSourceEntries(raw: string): SourceEntry[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): SourceEntry | null => {
        if (!item || typeof item !== "object") return null;
        const data = item as Record<string, unknown>;
        const title = textValue(data.title);
        const url = textValue(data.url);
        const note = textValue(data.note);
        if (!title && !url && !note) return null;
        return {
          id: textValue(data.id) || `${title}-${url}-${note}`,
          kind: isSourceKind(data.kind) ? data.kind : "other",
          title,
          url,
          author: textValue(data.author),
          site: textValue(data.site),
          publisher: textValue(data.publisher),
          year: textValue(data.year),
          note,
        };
      })
      .filter((entry): entry is SourceEntry => entry != null);
  } catch {
    return [];
  }
}

function formatSourceEntry(entry: SourceEntry): string {
  const parts =
    entry.kind === "website" || entry.kind === "image"
      ? [entry.title, entry.site, entry.url]
      : entry.kind === "book"
        ? [entry.title, entry.author, entry.publisher, entry.year]
        : entry.kind === "article"
          ? [entry.title, entry.author, entry.site || entry.publisher, entry.year, entry.url]
          : [entry.title, entry.author, entry.url];
  const main = parts.filter(Boolean).join(" - ");
  return [main, entry.note].filter(Boolean).join("\n  ");
}

function buildSourceListText(submission: SubmissionData | null) {
  const answers = submission?.answersByFieldId ?? {};
  const entries = parseSourceEntries(textValue(answers.sources_entries_json));
  return entries.map(formatSourceEntry).filter(Boolean).join("\n");
}

function getFieldAnswer(submission: SubmissionData | null, field: WritingFieldTemplate, section: WritingSectionTemplate): string {
  if (!submission) return "";
  const answers = submission.answersByFieldId ?? {};
  const drafts = submission.sectionDrafts ?? {};
  return textValue(answers[field.id] ?? drafts[section.id]);
}

function getSectionAnswerSummary(submission: SubmissionData, section: WritingSectionTemplate): string {
  const draft = textValue(submission.sectionDrafts?.[section.id]);
  if (draft) return draft;

  if (section.id === "other_characters") {
    const answers = submission.answersByFieldId ?? {};
    const rawCount = Number.parseInt(textValue(answers.other_characters_count), 10);
    const hasLegacy = Boolean(textValue(answers.other_characters_list) || textValue(answers.character_roles));
    let highestUsed = hasLegacy ? 1 : 0;
    for (let i = 1; i <= 5; i += 1) {
      if (
        textValue(answers[`other_character_${i}_name`]) ||
        textValue(answers[`other_character_${i}_role`]) ||
        textValue(answers[`other_character_${i}_description`])
      ) {
        highestUsed = i;
      }
    }
    const count = Math.max(1, Number.isFinite(rawCount) ? rawCount : 0, highestUsed);
    return Array.from({ length: count }, (_, index) => {
      const n = index + 1;
      const name = textValue(answers[`other_character_${n}_name`]);
      const role = textValue(answers[`other_character_${n}_role`]) || (n === 1 ? textValue(answers.character_roles).split(",")[0]?.trim() ?? "" : "");
      const description = textValue(answers[`other_character_${n}_description`]) || (n === 1 ? textValue(answers.other_characters_list) : "");
      return [
        name ? `Person ${n}: ${name}` : "",
        role ? `Rolle: ${role}` : "",
        description ? `Beskrivelse: ${description}` : "",
      ].filter(Boolean).join("\n");
    }).filter(Boolean).join("\n\n");
  }

  return section.fields
    .map((field) => {
      const value = getFieldAnswer(submission, field, section);
      return value ? `${field.label}: ${value}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function getDraftTitle(activity: WritingActivity | null, submission: SubmissionData | null) {
  const answers = submission?.answersByFieldId ?? {};
  const drafts = submission?.sectionDrafts ?? {};
  const draftingRoom = activity?.rooms?.find((room) => room.phase === "drafting");
  const titleSection = draftingRoom?.sections.find((section) => section.id === "title");
  const titleFromSection = titleSection?.fields
    .map((field) => textValue(answers[field.id]))
    .find(Boolean);

  return (
    textValue(answers.story_title) ||
    textValue(answers.factual_title) ||
    titleFromSection ||
    textValue(drafts.title)
  );
}

function buildFinalText(activity: WritingActivity | null, submission: SubmissionData | null): string {
  const saved = textValue(submission?.finalText);
  const title = getDraftTitle(activity, submission);
  if (saved) {
    if (title && saved.trim().startsWith(title)) {
      return saved.trim().slice(title.length).trimStart();
    }
    return saved;
  }
  const drafts = submission?.sectionDrafts ?? {};
  return (activity?.rooms ?? [])
    .flatMap((room) => room.sections)
    .filter((section) => section.id !== "title" && section.fields.some((field) => field.id.includes("_draft") || field.id === "draft_text" || field.id === "final_text"))
    .map((section) => textValue(drafts[section.id]))
    .filter(Boolean)
    .join("\n\n");
}

function roomsByPhase(rooms: WritingRoomTemplate[], phase: WritingRoomTemplate["phase"]) {
  return rooms.filter((room) => room.phase === phase);
}

function visibleSectionsForRoom(activity: WritingActivity, room: WritingRoomTemplate) {
  if (activity.genre !== "factual" || room.phase !== "planning") return room.sections;
  return room.sections.filter((section) => !HIDDEN_FACTUAL_PLANNING_SECTION_IDS.has(section.id));
}

function roomWithVisibleSections(activity: WritingActivity, room: WritingRoomTemplate): WritingRoomTemplate {
  return { ...room, sections: visibleSectionsForRoom(activity, room) };
}

function actionKey(action: unknown): string {
  const value = String(action ?? "unknown");
  const allowed = ["ask_questions", "suggest_words", "sentence_starters", "check_requirements", "continue_guidance", "revision_feedback"];
  return allowed.includes(value) ? value : "unknown";
}

export default function TeacherWritingSubmissionDetailPage() {
  const t = useTranslations("teacherWritingStation");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const params = useParams<{ spaceId: string; activityId: string; subId: string }>();
  const spaceId = params.spaceId;
  const activityId = params.activityId;
  const subId = params.subId;

  const [space, setSpace] = useState<SpaceDocLite | null>(null);
  const [activity, setActivity] = useState<WritingActivity | null>(null);
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [member, setMember] = useState<SpaceMemberDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("needs_work");
  const [initialReviewStatus, setInitialReviewStatus] = useState<ReviewStatus>("needs_work");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [sectionFeedbackDrafts, setSectionFeedbackDrafts] = useState<Record<string, { text: string; status: SectionFeedbackStatus }>>({});
  const [savingSectionId, setSavingSectionId] = useState<string | null>(null);
  const [suggestingPlanningFeedback, setSuggestingPlanningFeedback] = useState(false);
  const [suggestingDraftingFeedback, setSuggestingDraftingFeedback] = useState(false);
  const [suggestingRevisionFeedback, setSuggestingRevisionFeedback] = useState(false);
  const [suggestingOverallFeedback, setSuggestingOverallFeedback] = useState(false);
  const [activeTab, setActiveTab] = useState<TeacherTab>("planning");

  const listHref = useMemo(
    () => withLocale(locale, `/teacher/spaces/${spaceId}/writing/${activityId}`),
    [activityId, locale, spaceId]
  );

  useEffect(() => {
    if (!spaceId) return;
    return onSnapshot(doc(db, "spaces", spaceId), (snap) => {
      setSpace(snap.exists() ? (snap.data() as SpaceDocLite) : null);
    });
  }, [spaceId]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const activityRef = doc(db, "spaces", spaceId, "writingActivities", activityId);
    const submissionRef = doc(db, "spaces", spaceId, "writingActivities", activityId, "submissions", subId);

    const unsubscribeActivity = onSnapshot(
      activityRef,
      (snap) => {
        setActivity(snap.exists() ? upgradeWritingActivityForRuntime({ id: snap.id, ...(snap.data() as Record<string, unknown>) } as WritingActivity) : null);
      },
      (err) => {
        setError(err instanceof Error ? err.message : t("errors.readActivity"));
      }
    );

    const unsubscribeSubmission = onSnapshot(
      submissionRef,
      (snap) => {
        setSubmission(snap.exists() ? ({ id: snap.id, ...(snap.data() as Record<string, unknown>) } as SubmissionData) : null);
        setLoading(false);
      },
      (err) => {
        setError(err instanceof Error ? err.message : t("errors.readSubmission"));
        setLoading(false);
      }
    );

    return () => {
      unsubscribeActivity();
      unsubscribeSubmission();
    };
  }, [activityId, spaceId, subId, t]);

  useEffect(() => {
    const uid = submission?.studentUid;
    if (!uid) {
      setMember(null);
      return;
    }

    let alive = true;
    getDoc(doc(db, "spaceMembers", `${spaceId}_${uid}`))
      .then((snap) => {
        if (!alive) return;
        setMember(snap.exists() ? (snap.data() as SpaceMemberDoc) : null);
      })
      .catch(() => {
        if (alive) setMember(null);
      });

    return () => {
      alive = false;
    };
  }, [spaceId, submission?.studentUid]);

  useEffect(() => {
    const currentStatus = normalizeStatus(submission?.status);
    const nextStatus: ReviewStatus = currentStatus === "reviewed" ? "reviewed" : "needs_work";
    const nextText = textValue(submission?.teacherFeedback?.text);
    setReviewStatus(nextStatus);
    setInitialReviewStatus(nextStatus);
    setFeedbackText(nextText);
  }, [submission?.status, submission?.teacherFeedback?.text]);

  useEffect(() => {
    const source = submission?.sectionFeedback ?? {};
    const savedDrafts: Record<string, { text: string; status: SectionFeedbackStatus }> = {};
    for (const [sectionId, value] of Object.entries(source)) {
      if (!value || typeof value !== "object") continue;
      const data = value as { text?: unknown; status?: unknown };
      savedDrafts[sectionId] = {
        text: textValue(data.text),
        status: data.status === "approved" ? "approved" : "improve",
      };
    }
    setSectionFeedbackDrafts((current) => ({
      ...current,
      ...savedDrafts,
    }));
  }, [submission?.sectionFeedback]);

  const planningRooms = useMemo(
    () => (activity ? roomsByPhase(activity.rooms ?? [], "planning").map((room) => roomWithVisibleSections(activity, room)) : []),
    [activity]
  );
  const draftingRooms = useMemo(() => roomsByPhase(activity?.rooms ?? [], "drafting"), [activity?.rooms]);
  const revisionRooms = useMemo(() => roomsByPhase(activity?.rooms ?? [], "revision"), [activity?.rooms]);
  const finalText = useMemo(() => buildFinalText(activity, submission), [activity, submission]);
  const status = normalizeStatus(submission?.status);
  const studentName =
    member?.displayName?.trim() ||
    member?.name?.trim() ||
    member?.studentName?.trim() ||
    member?.email?.trim() ||
    (submission?.studentUid ? `${t("fallback.student")} (${submission.studentUid.slice(0, 6)}...)` : t("fallback.unknownStudent"));
  const printProfile = submission?.printProfile ?? {};
  const printableTitle = getDraftTitle(activity, submission) || activity?.title || t("printProduct.untitled");
  const sourceListText = buildSourceListText(submission);
  const sourceCheckText = textValue(submission?.answersByFieldId?.sources_check);
  const hasSourceNotes = Boolean(sourceListText || sourceCheckText);
  const aiUsage = Array.isArray(submission?.aiUsage) ? submission.aiUsage : [];
  const delivered = formatMaybeDate(submission?.submittedAt || submission?.updatedAt || submission?.createdAt, locale);
  const reviewStatusChanged = reviewStatus !== initialReviewStatus;
  const needsTextToChangeStatus = reviewStatusChanged && feedbackText.trim().length === 0;
  const canSaveFeedback = !!submission && !savingFeedback && feedbackText.trim().length > 0 && !needsTextToChangeStatus;
  const isPlanningReview = status === "planning_submitted" || status === "planning_reviewed";
  const canSavePlanningFeedback = !!submission && !savingFeedback && feedbackText.trim().length > 0;
  const planningSectionIds = useMemo(() => planningRooms.flatMap((room) => room.sections.map((section) => section.id)), [planningRooms]);
  const draftingSectionIds = useMemo(() => draftingRooms.flatMap((room) => room.sections.map((section) => section.id)), [draftingRooms]);
  const revisionSectionIds = useMemo(() => revisionRooms.flatMap((room) => room.sections.map((section) => section.id)), [revisionRooms]);
  const isSectionApproved = (sectionId: string) => submission?.sectionFeedback?.[sectionId]?.status === "approved";
  const phaseApproved = (sectionIds: string[]) => sectionIds.length > 0 && sectionIds.every(isSectionApproved);
  const tabStatus: Record<TeacherTab, "approved" | "pending"> = {
    planning: status === "planning_reviewed" || phaseApproved(planningSectionIds) ? "approved" : "pending",
    drafting: phaseApproved(draftingSectionIds) ? "approved" : "pending",
    revision: phaseApproved(revisionSectionIds) ? "approved" : "pending",
    final: status === "reviewed" ? "approved" : "pending",
    aiLog: "pending",
  };
  const activeProcessRooms = activeTab === "revision" ? revisionRooms : draftingRooms;
  const processAiBusy = activeTab === "revision" ? suggestingRevisionFeedback : suggestingDraftingFeedback;
  const processAiButton = activeTab === "revision" ? t("sectionAi.revisionButton") : t("sectionAi.draftingButton");
  const processAiPhase: "drafting" | "revision" = activeTab === "revision" ? "revision" : "drafting";
  const processTitle = activeTab === "revision" ? t("detail.revisionTitle") : t("detail.processTitle");
  const processSubtitle = activeTab === "revision" ? t("detail.revisionSubtitle") : t("detail.processSubtitle");
  const processRoomsEmpty = activeProcessRooms.length === 0;

  function tabClass(tab: TeacherTab) {
    const isActive = activeTab === tab;
    const isApproved = tabStatus[tab] === "approved";
    if (isActive) return isApproved ? "border-emerald-600 bg-emerald-600 text-white" : "border-amber-500 bg-amber-400 text-slate-950";
    return isApproved
      ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
      : "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100";
  }

  async function saveTeacherFeedback(nextStatus: ReviewStatus | "planning_reviewed" = reviewStatus) {
    if (!submission || !activity) return;
    setSavingFeedback(true);
    setFeedbackMsg(null);

    try {
      await updateDoc(doc(db, "spaces", spaceId, "writingActivities", activityId, "submissions", subId), {
        status: nextStatus,
        teacherFeedback: {
          text: feedbackText,
          updatedAt: serverTimestamp(),
          teacherUid: auth.currentUser?.uid ?? null,
        },
        updatedAt: serverTimestamp(),
      });
      if (nextStatus === "reviewed" || nextStatus === "needs_work") {
        setInitialReviewStatus(nextStatus);
      }
      setFeedbackMsg(t("feedback.saved"));
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? t("feedback.saveFailed", { msg: err.message }) : t("feedback.saveFailed", { msg: t("fallback.unknownError") }));
    } finally {
      setSavingFeedback(false);
      window.setTimeout(() => setFeedbackMsg(null), 2500);
    }
  }

  async function saveSectionFeedback(sectionId: string, statusValue: SectionFeedbackStatus) {
    if (!submission || !activity) return;
    const draft = sectionFeedbackDrafts[sectionId] ?? { text: "", status: statusValue };
    const text = draft.text.trim();
    if (!text) return;

    setSavingSectionId(sectionId);
    setFeedbackMsg(null);

    try {
      await updateDoc(doc(db, "spaces", spaceId, "writingActivities", activityId, "submissions", subId), {
        [`sectionFeedback.${sectionId}`]: {
          text,
          status: statusValue,
          updatedAt: serverTimestamp(),
          teacherUid: auth.currentUser?.uid ?? null,
        },
        updatedAt: serverTimestamp(),
      });
      setFeedbackMsg(t("sectionFeedback.saved"));
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? t("feedback.saveFailed", { msg: err.message }) : t("feedback.saveFailed", { msg: t("fallback.unknownError") }));
    } finally {
      setSavingSectionId(null);
      window.setTimeout(() => setFeedbackMsg(null), 2500);
    }
  }

  async function suggestSectionFeedback(phase: "planning" | "drafting" | "revision") {
    if (!submission || !activity) return;

    if (phase === "planning") {
      setSuggestingPlanningFeedback(true);
    } else if (phase === "drafting") {
      setSuggestingDraftingFeedback(true);
    } else {
      setSuggestingRevisionFeedback(true);
    }
    setFeedbackMsg(null);

    try {
      const result = await authedPost<{ suggestions?: SectionFeedbackSuggestion[] }>(
        `/api/teacher/spaces/${spaceId}/writing-activities/${activityId}/submissions/${subId}/section-feedback-suggestions`,
        { phase }
      );

      const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
      if (!suggestions.length) {
        setFeedbackMsg(t("sectionAi.empty"));
        return;
      }

      setSectionFeedbackDrafts((current) => {
        const next = { ...current };
        for (const suggestion of suggestions) {
          if (!suggestion.sectionId || !suggestion.text?.trim()) continue;
          next[suggestion.sectionId] = {
            text: suggestion.text.trim(),
            status: suggestion.status === "approved" ? "approved" : "improve",
          };
        }
        return next;
      });
      setFeedbackMsg(t("sectionAi.inserted"));
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? t("sectionAi.failed", { msg: err.message }) : t("sectionAi.failed", { msg: t("fallback.unknownError") }));
    } finally {
      if (phase === "planning") {
        setSuggestingPlanningFeedback(false);
      } else if (phase === "drafting") {
        setSuggestingDraftingFeedback(false);
      } else {
        setSuggestingRevisionFeedback(false);
      }
      window.setTimeout(() => setFeedbackMsg(null), 3500);
    }
  }

  async function suggestOverallFeedback() {
    if (!submission || !activity || !finalText.trim()) return;

    setSuggestingOverallFeedback(true);
    setFeedbackMsg(null);

    try {
      const result = await authedPost<{ overall?: OverallFeedbackSuggestion | null }>(
        `/api/teacher/spaces/${spaceId}/writing-activities/${activityId}/submissions/${subId}/section-feedback-suggestions`,
        { phase: "final" }
      );

      const overall = result.overall;
      if (!overall?.text?.trim()) {
        setFeedbackMsg(t("sectionAi.emptyFinal"));
        return;
      }

      setFeedbackText(overall.text.trim());
      if (overall.status === "reviewed" || overall.status === "needs_work") {
        setReviewStatus(overall.status);
      }
      setFeedbackMsg(t("sectionAi.overallInserted"));
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? t("sectionAi.failed", { msg: err.message }) : t("sectionAi.failed", { msg: t("fallback.unknownError") }));
    } finally {
      setSuggestingOverallFeedback(false);
      window.setTimeout(() => setFeedbackMsg(null), 3500);
    }
  }

  return (
    <AuthGate requireRole="teacher">
      <main className="mx-auto w-full max-w-6xl space-y-4">
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <Link href={listHref} className="text-sm font-semibold text-emerald-900 underline">
            {t("actions.backToSubmissions")}
          </Link>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-emerald-800">{space?.title ?? t("fallback.space")}</div>
              <h1 className="m-0 mt-1 text-2xl font-semibold text-slate-950">{studentName}</h1>
              <div className="mt-1 text-sm text-emerald-900">
                {activity?.title ?? t("fallback.activity")}
                {activity?.level ? ` · ${activity.level}` : ""}
                {delivered ? ` · ${delivered}` : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${statusClass(status)}`}>
                {t(`status.${status}`)}
              </span>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-3 py-1 text-sm font-semibold text-emerald-900">
                {t("submissions.aiUses", { n: aiUsage.length })}
              </span>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{tCommon("loading")}</div>
        ) : !activity || !submission ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{t("errors.notFound")}</div>
        ) : (
          <>
            <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              {(["planning", "drafting", "revision", "final", "aiLog"] as TeacherTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={["whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-semibold", tabClass(tab)].join(" ")}
                >
                  {t(`tabs.${tab}`)}
                </button>
              ))}
            </nav>

            {activeTab === "planning" ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="m-0 text-lg font-semibold text-slate-950">{t("detail.planningTitle")}</h2>
                  <p className="mt-1 text-sm text-slate-600">{t("detail.planningSubtitle")}</p>
                </div>
                <div className="max-w-md rounded-xl border border-purple-100 bg-purple-50/70 px-3 py-2 text-sm leading-6 text-purple-950">
                  <div>
                    <span className="font-semibold">{t("sectionAi.helpTitle")}</span>{" "}
                    {t("sectionAi.helpText")}
                  </div>
                  <button
                    type="button"
                    disabled={suggestingPlanningFeedback || planningRooms.length === 0}
                    onClick={() => void suggestSectionFeedback("planning")}
                    className="mt-2 rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-semibold text-purple-900 hover:bg-purple-100 disabled:opacity-60"
                  >
                    {suggestingPlanningFeedback ? t("sectionAi.working") : t("sectionAi.planButton")}
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-4">
                {planningRooms.length === 0 ? (
                  <div className="text-sm text-slate-500">{t("detail.emptyPlanning")}</div>
                ) : (
                  planningRooms.map((room) => (
                    <div key={room.id} className="space-y-3">
                      <h3 className="m-0 text-base font-semibold text-slate-900">{room.title}</h3>
                      {room.sections.map((section) => {
                        const draft = sectionFeedbackDrafts[section.id] ?? { text: "", status: "improve" as SectionFeedbackStatus };
                        const sectionApproved = draft.status === "approved" && draft.text.trim().length > 0;
                        const savedSectionFeedback = submission?.sectionFeedback?.[section.id];
                        const sectionFeedbackSent =
                          textValue(savedSectionFeedback?.text) === draft.text.trim() &&
                          savedSectionFeedback?.status === draft.status &&
                          savingSectionId !== section.id;
                        const improvementRequest = submission?.sectionImprovementRequests?.[section.id];
                        const improvementAt = formatMaybeDate(improvementRequest?.updatedAt, locale);
                        return (
                          <article
                            key={section.id}
                            className={[
                              "rounded-xl border p-3",
                              sectionApproved ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50/70",
                            ].join(" ")}
                          >
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                              <div>
                                <div className="text-sm font-semibold text-slate-950">{section.title}</div>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                  {section.fields.map((field) => {
                                    const value = getFieldAnswer(submission, field, section);
                                    return (
                                      <div key={field.id} className="rounded-lg border border-slate-200 bg-white p-3">
                                        <div className="text-xs font-semibold uppercase text-slate-500">{field.label}</div>
                                        <div className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{value || t("detail.emptyAnswer")}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <aside className="rounded-xl border border-purple-200 bg-purple-50 p-3">
                                <div className="text-xs font-black uppercase text-purple-900">{t("sectionFeedback.title")}</div>
                                {improvementRequest?.status === "submitted" ? (
                                  <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-800">
                                    {t("sectionFeedback.improvementSubmitted")}
                                    {improvementAt ? ` · ${improvementAt}` : ""}
                                  </div>
                                ) : null}
                                <textarea
                                  value={draft.text}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setSectionFeedbackDrafts((current) => ({
                                      ...current,
                                      [section.id]: { text: value, status: draft.status },
                                    }));
                                  }}
                                  placeholder={t("sectionFeedback.placeholder")}
                                  rows={4}
                                  className="mt-2 w-full resize-y rounded-xl border border-purple-200 bg-white p-2 text-sm leading-6 text-slate-900 outline-none focus:border-purple-500"
                                />
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    aria-pressed={draft.status === "approved"}
                                    disabled={savingSectionId != null || !draft.text.trim()}
                                    onClick={() => {
                                      setSectionFeedbackDrafts((current) => ({
                                        ...current,
                                        [section.id]: { text: draft.text, status: "approved" },
                                      }));
                                    }}
                                    className={[
                                      "rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-60",
                                      draft.status === "approved"
                                        ? "border-emerald-600 bg-emerald-600 text-white"
                                        : "border-slate-200 bg-white/70 text-slate-500 hover:bg-white",
                                    ].join(" ")}
                                  >
                                    {t("sectionFeedback.approved")}
                                  </button>
                                  <button
                                    type="button"
                                    aria-pressed={draft.status === "improve"}
                                    disabled={savingSectionId != null || !draft.text.trim()}
                                    onClick={() => {
                                      setSectionFeedbackDrafts((current) => ({
                                        ...current,
                                        [section.id]: { text: draft.text, status: "improve" },
                                      }));
                                    }}
                                    className={[
                                      "rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-60",
                                      draft.status === "improve"
                                        ? "border-amber-500 bg-amber-500 text-white"
                                        : "border-slate-200 bg-white/70 text-slate-500 hover:bg-white",
                                    ].join(" ")}
                                  >
                                    {t("sectionFeedback.improve")}
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  disabled={savingSectionId != null || !draft.text.trim() || sectionFeedbackSent}
                                  onClick={() => {
                                    void saveSectionFeedback(section.id, draft.status);
                                  }}
                                  className={[
                                    "mt-3 w-full rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-70",
                                    sectionFeedbackSent
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                      : "border-purple-300 bg-white text-purple-900 hover:bg-purple-100",
                                  ].join(" ")}
                                >
                                  {savingSectionId === section.id
                                    ? t("feedback.saving")
                                    : sectionFeedbackSent
                                      ? t("sectionFeedback.sent")
                                      : t("sectionFeedback.save")}
                                </button>
                              </aside>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </section>
            ) : null}

            {activeTab === "final" ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="m-0 text-lg font-semibold text-slate-950">{t("detail.finalTitle")}</h2>
                  <p className="mt-1 text-sm text-slate-600">{t("detail.finalSubtitle")}</p>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    disabled={!finalText.trim()}
                    className="w-fit rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {t("printProduct.print")}
                  </button>
                  {!isPlanningReview ? (
                    <div className="max-w-md rounded-xl border border-purple-100 bg-purple-50/70 px-3 py-2 text-sm leading-6 text-purple-950">
                      <div>
                        <span className="font-semibold">{t("sectionAi.helpTitle")}</span>{" "}
                        {t("sectionAi.finalHelpText")}
                      </div>
                      <button
                        type="button"
                        disabled={suggestingOverallFeedback || !finalText.trim()}
                        onClick={() => void suggestOverallFeedback()}
                        className="mt-2 rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-semibold text-purple-900 hover:bg-purple-100 disabled:opacity-60"
                      >
                        {suggestingOverallFeedback ? t("sectionAi.working") : t("sectionAi.finalButton")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className={["mt-3 grid gap-4", !isPlanningReview ? "lg:grid-cols-[minmax(0,1fr)_380px]" : ""].join(" ")}>
                <article className="writingPrintProduct rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                  <div className="mb-5 flex justify-end">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/logo321ny.png"
                      alt="321 Skole"
                      className="h-8 w-auto object-contain"
                    />
                  </div>
                  {textValue(printProfile.imageUrl) ? (
                    <figure className="m-0 mb-6">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={textValue(printProfile.imageUrl)}
                        alt=""
                        className="max-h-80 w-full rounded-xl border border-slate-200 object-cover"
                      />
                    </figure>
                  ) : null}
                  <header className="border-b border-slate-200 pb-5">
                    <h2 className="m-0 text-3xl font-bold leading-tight text-slate-950 sm:text-4xl">{printableTitle}</h2>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      <div><span className="font-semibold text-slate-500">{t("printProduct.studentName")}:</span> {textValue(printProfile.studentName) || studentName}</div>
                      {textValue(printProfile.school) ? (
                        <div><span className="font-semibold text-slate-500">{t("printProduct.school")}:</span> {textValue(printProfile.school)}</div>
                      ) : null}
                      {textValue(printProfile.className) ? (
                        <div><span className="font-semibold text-slate-500">{t("printProduct.className")}:</span> {textValue(printProfile.className)}</div>
                      ) : null}
                      {textValue(printProfile.writtenDate) ? (
                        <div><span className="font-semibold text-slate-500">{t("printProduct.writtenDate")}:</span> {textValue(printProfile.writtenDate)}</div>
                      ) : null}
                    </div>
                  </header>
                  <div className="mt-6 whitespace-pre-wrap text-base leading-8 text-slate-950 sm:text-[17px]">
                    {finalText || t("detail.emptyFinal")}
                  </div>
                  {hasSourceNotes ? (
                    <footer className="mt-8 border-t border-slate-200 pt-4 text-sm leading-6 text-slate-800">
                      {sourceListText ? (
                        <div>
                          <div className="text-xs font-bold uppercase text-slate-500">{t("sources.list")}</div>
                          <div className="mt-1 whitespace-pre-wrap">{sourceListText}</div>
                        </div>
                      ) : null}
                      {sourceCheckText ? (
                        <div className="mt-3">
                          <div className="text-xs font-bold uppercase text-slate-500">{t("sources.check")}</div>
                          <div className="mt-1 whitespace-pre-wrap">{sourceCheckText}</div>
                        </div>
                      ) : null}
                    </footer>
                  ) : null}
                </article>
                {!isPlanningReview ? (
                  <TeacherFeedbackPanel
                    text={feedbackText}
                    setText={setFeedbackText}
                    status={reviewStatus}
                    setStatus={setReviewStatus}
                    readingSummaryText=""
                    needsTextToChangeStatus={needsTextToChangeStatus}
                    canOperate
                    canSave={canSaveFeedback}
                    saving={savingFeedback}
                    saveMsg={feedbackMsg}
                    onSave={() => {
                      void saveTeacherFeedback();
                    }}
                    t={(key, values) => t(key, values as Record<string, string | number | Date> | undefined)}
                  />
                ) : null}
              </div>
            </section>
            ) : null}

            {activeTab === "planning" && isPlanningReview ? (
              <section className="rounded-2xl border border-purple-200 bg-purple-50 p-4 shadow-sm">
                <h2 className="m-0 text-lg font-semibold text-slate-950">{t("planningFeedback.title")}</h2>
                <p className="mt-1 text-sm text-purple-900">{t("planningFeedback.subtitle")}</p>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder={t("planningFeedback.placeholder")}
                  rows={6}
                  className="mt-4 w-full resize-y rounded-xl border border-purple-200 bg-white p-3 text-sm leading-6 text-slate-900 outline-none focus:border-purple-500"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!canSavePlanningFeedback}
                    onClick={() => {
                      void saveTeacherFeedback("planning_reviewed");
                    }}
                    className="rounded-xl bg-purple-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingFeedback ? t("feedback.saving") : t("planningFeedback.saveButton")}
                  </button>
                  {feedbackMsg ? <div className="text-sm text-purple-900">{feedbackMsg}</div> : null}
                </div>
              </section>
            ) : null}

            {activeTab === "drafting" || activeTab === "revision" ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="m-0 text-lg font-semibold text-slate-950">{processTitle}</h2>
                  <p className="mt-1 text-sm text-slate-600">{processSubtitle}</p>
                </div>
                <div className="max-w-md rounded-xl border border-purple-100 bg-purple-50/70 px-3 py-2 text-sm leading-6 text-purple-950">
                  <div>
                    <span className="font-semibold">{t("sectionAi.helpTitle")}</span>{" "}
                    {activeTab === "revision" ? t("sectionAi.revisionHelpText") : t("sectionAi.draftingHelpText")}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={processAiBusy || processRoomsEmpty}
                      onClick={() => void suggestSectionFeedback(processAiPhase)}
                      className="rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-semibold text-purple-900 hover:bg-purple-100 disabled:opacity-60"
                    >
                      {processAiBusy ? t("sectionAi.working") : processAiButton}
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                {activeProcessRooms.length === 0 ? (
                  <div className="text-sm text-slate-500">{t("detail.emptyProcess")}</div>
                ) : (
                  activeProcessRooms.flatMap((room) =>
                    room.sections.map((section) => {
                      const value = getSectionAnswerSummary(submission, section);
                      const draft = sectionFeedbackDrafts[section.id] ?? { text: "", status: "improve" as SectionFeedbackStatus };
                      const sectionApproved = draft.status === "approved" && draft.text.trim().length > 0;
                      const savedSectionFeedback = submission?.sectionFeedback?.[section.id];
                      const sectionFeedbackSent =
                        textValue(savedSectionFeedback?.text) === draft.text.trim() &&
                        savedSectionFeedback?.status === draft.status &&
                        savingSectionId !== section.id;
                      const improvementRequest = submission?.sectionImprovementRequests?.[section.id];
                      const improvementAt = formatMaybeDate(improvementRequest?.updatedAt, locale);
                      return (
                        <article
                          key={`${room.id}_${section.id}`}
                          className={[
                            "rounded-xl border p-3",
                            sectionApproved ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50/70",
                          ].join(" ")}
                        >
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                            <div>
                              <div className="text-xs font-semibold uppercase text-slate-500">{room.title}</div>
                              <h3 className="m-0 mt-1 text-base font-semibold text-slate-950">{section.title}</h3>
                              {section.id === "sources" ? (
                                <div className="mt-2 grid gap-2">
                                  <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-900">
                                    <div className="text-xs font-semibold uppercase text-slate-500">{t("sources.list")}</div>
                                    <div className="mt-1">{sourceListText || t("detail.emptyAnswer")}</div>
                                  </div>
                                  <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-900">
                                    <div className="text-xs font-semibold uppercase text-slate-500">{t("sources.check")}</div>
                                    <div className="mt-1">{sourceCheckText || t("detail.emptyAnswer")}</div>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-900">
                                  {value || t("detail.emptyAnswer")}
                                </div>
                              )}
                            </div>

                            <aside className="rounded-xl border border-purple-200 bg-purple-50 p-3">
                              <div className="text-xs font-black uppercase text-purple-900">{t("sectionFeedback.title")}</div>
                              {improvementRequest?.status === "submitted" ? (
                                <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-800">
                                  {t("sectionFeedback.improvementSubmitted")}
                                  {improvementAt ? ` · ${improvementAt}` : ""}
                                </div>
                              ) : null}
                              <textarea
                                value={draft.text}
                                onChange={(e) => {
                                  const nextText = e.target.value;
                                  setSectionFeedbackDrafts((current) => ({
                                    ...current,
                                    [section.id]: { text: nextText, status: draft.status },
                                  }));
                                }}
                                placeholder={t("sectionFeedback.placeholder")}
                                rows={4}
                                className="mt-2 w-full resize-y rounded-xl border border-purple-200 bg-white p-2 text-sm leading-6 text-slate-900 outline-none focus:border-purple-500"
                              />
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  aria-pressed={draft.status === "approved"}
                                  disabled={savingSectionId != null || !draft.text.trim()}
                                  onClick={() => {
                                    setSectionFeedbackDrafts((current) => ({
                                      ...current,
                                      [section.id]: { text: draft.text, status: "approved" },
                                    }));
                                  }}
                                  className={[
                                    "rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-60",
                                    draft.status === "approved"
                                      ? "border-emerald-600 bg-emerald-600 text-white"
                                      : "border-slate-200 bg-white/70 text-slate-500 hover:bg-white",
                                  ].join(" ")}
                                >
                                  {t("sectionFeedback.approved")}
                                </button>
                                <button
                                  type="button"
                                  aria-pressed={draft.status === "improve"}
                                  disabled={savingSectionId != null || !draft.text.trim()}
                                  onClick={() => {
                                    setSectionFeedbackDrafts((current) => ({
                                      ...current,
                                      [section.id]: { text: draft.text, status: "improve" },
                                    }));
                                  }}
                                  className={[
                                    "rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-60",
                                    draft.status === "improve"
                                      ? "border-amber-500 bg-amber-500 text-white"
                                      : "border-slate-200 bg-white/70 text-slate-500 hover:bg-white",
                                  ].join(" ")}
                                >
                                  {t("sectionFeedback.improve")}
                                </button>
                              </div>
                              <button
                                type="button"
                                disabled={savingSectionId != null || !draft.text.trim() || sectionFeedbackSent}
                                onClick={() => {
                                  void saveSectionFeedback(section.id, draft.status);
                                }}
                                className={[
                                  "mt-3 w-full rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-70",
                                  sectionFeedbackSent
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                    : "border-purple-300 bg-white text-purple-900 hover:bg-purple-100",
                                ].join(" ")}
                              >
                                {savingSectionId === section.id
                                  ? t("feedback.saving")
                                  : sectionFeedbackSent
                                    ? t("sectionFeedback.sent")
                                    : t("sectionFeedback.save")}
                              </button>
                            </aside>
                          </div>
                        </article>
                      );
                    })
                  )
                )}
              </div>
            </section>
            ) : null}

            {activeTab === "aiLog" ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="m-0 text-lg font-semibold text-slate-950">{t("aiLog.title")}</h2>
                  <p className="mt-1 text-sm text-slate-600">{t("aiLog.subtitle")}</p>
                </div>
                <div className="text-sm font-semibold text-slate-700">{t("aiLog.count", { n: aiUsage.length })}</div>
              </div>
              <div className="mt-4 grid gap-3">
                {aiUsage.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{t("aiLog.empty")}</div>
                ) : (
                  aiUsage.map((log, index) => {
                    const section = (activity.rooms ?? [])
                      .flatMap((room) => room.sections)
                      .find((candidate) => candidate.id === log.sectionId);
                    const createdAt = formatMaybeDate(log.createdAt, locale);
                    return (
                      <details key={String(log.id ?? index)} className="rounded-xl border border-slate-200 bg-slate-50 p-3" open={index === 0}>
                        <summary className="cursor-pointer text-sm font-semibold text-slate-950">
                          {createdAt || t("fallback.unknownDate")} · {(section?.title ?? textValue(log.sectionId)) || t("aiLog.unknownSection")} ·{" "}
                          {t(`aiActions.${actionKey(log.action)}`)}
                        </summary>
                        <div className="mt-3 grid gap-3">
                          {textValue(log.promptSummary) || textValue(log.responseSummary) ? (
                            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                              {textValue(log.promptSummary) ? <div>{textValue(log.promptSummary)}</div> : null}
                              {textValue(log.responseSummary) ? <div>{textValue(log.responseSummary)}</div> : null}
                            </div>
                          ) : null}
                          <div>
                            <div className="text-xs font-semibold uppercase text-slate-500">{t("aiLog.prompt")}</div>
                            <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-900">
                              {textValue(log.prompt) || t("aiLog.emptyPrompt")}
                            </pre>
                          </div>
                          <div>
                            <div className="text-xs font-semibold uppercase text-slate-500">{t("aiLog.response")}</div>
                            <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-900">
                              {textValue(log.response) || t("aiLog.emptyResponse")}
                            </pre>
                          </div>
                        </div>
                      </details>
                    );
                  })
                )}
              </div>
            </section>
            ) : null}
          </>
        )}
      </main>
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 18mm;
          }

          html,
          body {
            background: #ffffff !important;
          }

          body * {
            visibility: hidden !important;
          }
          .writingPrintProduct,
          .writingPrintProduct * {
            visibility: visible !important;
          }
          .writingPrintProduct {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            border: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            color: #0f172a !important;
          }

          .writingPrintProduct img {
            max-height: 70mm !important;
            break-inside: avoid !important;
          }

          .writingPrintProduct header,
          .writingPrintProduct footer,
          .writingPrintProduct figure {
            break-inside: avoid !important;
          }
        }
      `}</style>
    </AuthGate>
  );
}
