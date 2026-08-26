"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { authedPost } from "@/lib/authedPost";
import type {
  WritingActivity,
  WritingAiAction,
  WritingAiUsageLog,
  WritingPrintProfile,
  WritingRoomTemplate,
  WritingSectionTemplate,
} from "@/lib/writingStation";
import { upgradeWritingActivityForRuntime } from "@/lib/writingStation";

type AnswersByFieldId = Record<string, string>;
type SectionDrafts = Record<string, string>;

const EMPTY_ROOMS: WritingRoomTemplate[] = [];
const OTHER_CHARACTER_MAX = 5;
const HIDDEN_FACTUAL_PLANNING_SECTION_IDS = new Set(["purpose_audience", "key_terms", "structure"]);
const EMPTY_PRINT_PROFILE: WritingPrintProfile = {
  studentName: "",
  school: "",
  className: "",
  writtenDate: "",
  imageUrl: "",
};

type WritingSubmissionDoc = {
  answersByFieldId?: AnswersByFieldId;
  sectionDrafts?: SectionDrafts;
  finalText?: string;
  status?: string;
  aiUsage?: Array<Partial<WritingAiUsageLog>>;
  teacherFeedback?: {
    text?: string;
    updatedAt?: unknown;
  } | null;
  sectionFeedback?: Record<string, {
    text?: string;
    status?: "approved" | "improve";
    updatedAt?: unknown;
  }> | null;
  sectionImprovementRequests?: Record<string, {
    status?: "submitted";
    answerSummary?: string;
    updatedAt?: unknown;
  }> | null;
  printProfile?: WritingPrintProfile | null;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizePrintProfile(value: unknown): WritingPrintProfile {
  if (!value || typeof value !== "object") return EMPTY_PRINT_PROFILE;
  const data = value as Record<string, unknown>;
  return {
    studentName: safeString(data.studentName),
    school: safeString(data.school),
    className: safeString(data.className),
    writtenDate: safeString(data.writtenDate),
    imageUrl: safeString(data.imageUrl),
  };
}

function formatMaybeDate(value: unknown): string {
  try {
    if (!value || typeof (value as { toDate?: unknown }).toDate !== "function") return "";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format((value as { toDate: () => Date }).toDate());
  } catch {
    return "";
  }
}

async function resolveUser(): Promise<User> {
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

  return existingUser ?? ensureAnonymousUser();
}

function getFieldValue(
  fieldId: string,
  sectionId: string,
  answers: AnswersByFieldId,
  sectionDrafts: SectionDrafts,
  fallback = ""
) {
  return answers[fieldId] ?? sectionDrafts[sectionId] ?? fallback;
}

function isDraftField(section: WritingSectionTemplate) {
  return section.fields.length === 1 && section.fields[0]?.kind === "long_text";
}

function buildFinalText(rooms: WritingRoomTemplate[], answers: AnswersByFieldId, sectionDrafts: SectionDrafts) {
  const draftingRoom = rooms.find((room) => room.phase === "drafting");
  if (!draftingRoom) return "";

  const title = safeString(answers.story_title).trim();
  const body = draftingRoom.sections
    .filter((section) => section.id !== "title")
    .map((section) => safeString(sectionDrafts[section.id]).trim())
    .filter(Boolean)
    .join("\n\n");

  return [title, body].filter(Boolean).join("\n\n");
}

function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function sectionWordCount(sectionId: string, sectionDrafts: SectionDrafts): number {
  return countWords(safeString(sectionDrafts[sectionId]));
}

function hasSectionInput(section: WritingSectionTemplate, answers: AnswersByFieldId, sectionDrafts: SectionDrafts) {
  if (safeString(sectionDrafts[section.id]).trim()) return true;
  if (section.id === "other_characters") {
    return Boolean(sectionTextForAi(section, answers, sectionDrafts).trim());
  }
  return section.fields.some((field) => safeString(answers[field.id]).trim());
}

function roomIsDone(
  room: WritingRoomTemplate,
  answers: AnswersByFieldId,
  sectionDrafts: SectionDrafts,
  sectionFeedback: WritingSubmissionDoc["sectionFeedback"],
  finalText: string,
  status: string
) {
  if (room.phase === "final") return status === "reviewed" || status === "submitted" || finalText.trim().length > 0;
  if (room.phase === "planning" && (status === "planning_reviewed" || status === "reviewed")) return true;
  const sectionIds = room.sections.map((section) => section.id);
  if (sectionIds.length > 0 && sectionIds.every((id) => sectionFeedback?.[id]?.status === "approved")) return true;
  return room.sections.length > 0 && room.sections.every((section) => hasSectionInput(section, answers, sectionDrafts));
}

function visibleSectionsForRoom(activity: WritingActivity, room: WritingRoomTemplate) {
  if (activity.genre !== "factual" || room.phase !== "planning") return room.sections;
  return room.sections.filter((section) => !HIDDEN_FACTUAL_PLANNING_SECTION_IDS.has(section.id));
}

function roomWithVisibleSections(activity: WritingActivity, room: WritingRoomTemplate): WritingRoomTemplate {
  return { ...room, sections: visibleSectionsForRoom(activity, room) };
}

function defaultSupportWords(section: WritingSectionTemplate): string[] {
  if (section.supportWords?.length) return section.supportWords;

  const wordsBySection: Record<string, string[]> = {
    idea: ["Det handler om", "Plutselig", "En dag", "Problemet er", "Jeg lurer på"],
    main_character: ["modig", "redd", "nysgjerrig", "snill", "hemmelighet", "ønsker", "liker ikke"],
    other_characters: ["venn", "hjelper", "motstander", "familie", "ukjent", "samarbeider med"],
    setting: ["på skolen", "hjemme", "i byen", "om natten", "lyder", "lukter", "kaldt", "mørkt"],
    conflict: ["men", "plutselig", "problemet er", "klarer ikke", "noe går galt", "må velge"],
    solution: ["til slutt", "derfor", "lærer at", "finner ut", "forandrer seg", "løser problemet"],
    opening_type: ["Det var en gang", "Plutselig", "Jeg hørte", "Ingen visste", "Alt begynte da"],
    introduction: ["Det var en gang", "I begynnelsen", "Plutselig", "Hovedpersonen heter"],
    main_part: ["først", "etterpå", "samtidig", "men", "derfor", "likevel"],
    ending: ["til slutt", "etter dette", "da forstod", "problemet ble løst", "fra den dagen"],
    content_check: ["Jeg ser at...", "Jeg vil gjøre ... tydeligere.", "Leseren forstår...", "Dette henger sammen fordi...", "Jeg må sjekke om..."],
    language_check: ["Jeg leser setningen høyt.", "Jeg sjekker om setningen starter med stor bokstav.", "Jeg setter punktum der tanken er ferdig.", "Jeg bytter ut ord som gjentas.", "Jeg ser etter og/å."],
  };

  return wordsBySection[section.id] ?? [];
}

function otherCharacterCount(answers: AnswersByFieldId): number {
  const rawCount = Number.parseInt(answers.other_characters_count ?? "", 10);
  const savedCount = Number.isFinite(rawCount) ? rawCount : 0;
  let highestUsed = 0;
  for (let i = 1; i <= OTHER_CHARACTER_MAX; i += 1) {
    if (
      safeString(answers[`other_character_${i}_name`]).trim() ||
      safeString(answers[`other_character_${i}_role`]).trim() ||
      safeString(answers[`other_character_${i}_description`]).trim()
    ) {
      highestUsed = i;
    }
  }
  const hasLegacyValue = Boolean(
    safeString(answers.other_characters_list).trim() ||
    safeString(answers.character_roles).trim()
  );
  return Math.min(OTHER_CHARACTER_MAX, Math.max(1, savedCount, highestUsed, hasLegacyValue ? 1 : 0));
}

function sectionTextForAi(section: WritingSectionTemplate, answers: AnswersByFieldId, sectionDrafts: SectionDrafts): string {
  if (section.id === "other_characters") {
    const count = otherCharacterCount(answers);
    return Array.from({ length: count }, (_, index) => {
      const n = index + 1;
      const name = safeString(answers[`other_character_${n}_name`]).trim();
      const role = safeString(answers[`other_character_${n}_role`]).trim();
      const description = safeString(answers[`other_character_${n}_description`]).trim();
      return [name ? `Person ${n}: ${name}` : "", role ? `Rolle: ${role}` : "", description ? `Beskrivelse: ${description}` : ""]
        .filter(Boolean)
        .join("\n");
    }).filter(Boolean).join("\n\n");
  }

  return sectionDrafts[section.id] ?? section.fields
    .map((field) => answers[field.id])
    .filter(Boolean)
    .join("\n");
}

function sectionAnswerSummary(section: WritingSectionTemplate, answers: AnswersByFieldId, sectionDrafts: SectionDrafts): string {
  if (section.id === "other_characters") return sectionTextForAi(section, answers, sectionDrafts);
  const draft = safeString(sectionDrafts[section.id]).trim();
  if (draft) return draft;
  return section.fields
    .map((field) => {
      const value = safeString(answers[field.id]).trim();
      return value ? `${field.label}: ${value}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export default function StudentWritingActivityPage() {
  const t = useTranslations("studentWritingStation");
  const params = useParams<{ spaceId: string; activityId: string }>();
  const spaceId = params.spaceId;
  const activityId = params.activityId;

  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activity, setActivity] = useState<WritingActivity | null>(null);
  const [answersByFieldId, setAnswersByFieldId] = useState<AnswersByFieldId>({});
  const [sectionDrafts, setSectionDrafts] = useState<SectionDrafts>({});
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [aiBusySectionId, setAiBusySectionId] = useState<string | null>(null);
  const [aiResponses, setAiResponses] = useState<Record<string, string>>({});
  const [aiErrBySection, setAiErrBySection] = useState<Record<string, string | null>>({});
  const [aiUsage, setAiUsage] = useState<Array<Partial<WritingAiUsageLog>>>([]);
  const [supportOpenBySection, setSupportOpenBySection] = useState<Record<string, boolean>>({});
  const [teacherOpenBySection, setTeacherOpenBySection] = useState<Record<string, boolean>>({});
  const [sectionFeedback, setSectionFeedback] = useState<WritingSubmissionDoc["sectionFeedback"]>({});
  const [sectionImprovementRequests, setSectionImprovementRequests] = useState<WritingSubmissionDoc["sectionImprovementRequests"]>({});
  const [teacherFeedbackText, setTeacherFeedbackText] = useState("");
  const [teacherFeedbackUpdatedAt, setTeacherFeedbackUpdatedAt] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState("");
  const [improvementBusySectionId, setImprovementBusySectionId] = useState<string | null>(null);
  const [printProfile, setPrintProfile] = useState<WritingPrintProfile>(EMPTY_PRINT_PROFILE);
  const [savingPrintProfile, setSavingPrintProfile] = useState(false);

  useEffect(() => {
    let alive = true;

    resolveUser()
      .then((u) => {
        if (alive) setUid(u.uid);
      })
      .catch((e: unknown) => {
        if (alive) setErr(e instanceof Error ? e.message : t("errors.auth"));
      });

    return () => {
      alive = false;
    };
  }, [t]);

  useEffect(() => {
    setErr(null);
    setLoading(true);

    const ref = doc(db, "spaces", spaceId, "writingActivities", activityId);
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setActivity(null);
          setErr(t("errors.notFound"));
          setLoading(false);
          return;
        }

        const data = snap.data() as DocumentData;
        const next = upgradeWritingActivityForRuntime({ id: snap.id, ...(data as Record<string, unknown>) } as WritingActivity);
        setActivity(next);
        setActiveRoomId((current) => current ?? next.rooms?.[0]?.id ?? null);
        setLoading(false);
      },
      (e: unknown) => {
        setErr(e instanceof Error ? e.message : t("errors.readActivity"));
        setLoading(false);
      }
    );
  }, [activityId, spaceId, t]);

  useEffect(() => {
    if (!uid) return;

    const submissionId = `${spaceId}_${activityId}_${uid}`;
    const ref = doc(db, "spaces", spaceId, "writingActivities", activityId, "submissions", submissionId);

    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as WritingSubmissionDoc;
        setAnswersByFieldId(data.answersByFieldId ?? {});
        setSectionDrafts(data.sectionDrafts ?? {});
        setAiUsage(Array.isArray(data.aiUsage) ? data.aiUsage : []);
        setSectionFeedback(data.sectionFeedback ?? {});
        setSectionImprovementRequests(data.sectionImprovementRequests ?? {});
        setSubmissionStatus(safeString(data.status));
        setTeacherFeedbackText(safeString(data.teacherFeedback?.text));
        setTeacherFeedbackUpdatedAt(formatMaybeDate(data.teacherFeedback?.updatedAt));
        setPrintProfile(normalizePrintProfile(data.printProfile));
      },
      () => {
        // Draft loading should not block writing.
      }
    );
  }, [activityId, spaceId, uid]);

  const rooms = activity?.rooms ?? EMPTY_ROOMS;
  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? rooms[0] ?? null;
  const finalText = useMemo(() => buildFinalText(rooms, answersByFieldId, sectionDrafts), [answersByFieldId, rooms, sectionDrafts]);
  const printableTitle = safeString(answersByFieldId.story_title).trim() || activity?.title || "";
  const draftingSections = useMemo(
    () => rooms.filter((room) => room.phase === "drafting").flatMap((room) => room.sections).filter((section) => section.id !== "title"),
    [rooms]
  );
  const draftingWordTotal = useMemo(
    () => draftingSections.reduce((sum, section) => sum + sectionWordCount(section.id, sectionDrafts), 0),
    [draftingSections, sectionDrafts]
  );
  const finalWordTotal = useMemo(() => countWords(finalText), [finalText]);

  function updateField(section: WritingSectionTemplate, fieldId: string, value: string) {
    setAnswersByFieldId((current) => ({ ...current, [fieldId]: value }));

    if (isDraftField(section)) {
      setSectionDrafts((current) => ({ ...current, [section.id]: value }));
    }
  }

  async function saveDraft(status: "draft" | "planning_submitted" | "submitted" = "draft") {
    if (!uid || !activity) return;

    setSaving(true);
    setMsg(null);
    setErr(null);

    try {
      const submissionId = `${spaceId}_${activityId}_${uid}`;
      const ref = doc(db, "spaces", spaceId, "writingActivities", activityId, "submissions", submissionId);
      await setDoc(
        ref,
        {
          activityId,
          spaceId,
          studentUid: uid,
          answersByFieldId,
          sectionDrafts,
          finalText,
          status,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          submittedAt: status === "submitted" ? serverTimestamp() : null,
          planningSubmittedAt: status === "planning_submitted" ? serverTimestamp() : null,
        },
        { merge: true }
      );

      setMsg(
        status === "submitted"
          ? t("messages.submitted")
          : status === "planning_submitted"
            ? t("messages.planningSubmitted")
            : t("messages.saved")
      );
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("errors.save"));
    } finally {
      setSaving(false);
      window.setTimeout(() => setMsg(null), 2500);
    }
  }

  async function savePrintProfile() {
    if (!uid || !activity) return;

    setSavingPrintProfile(true);
    setMsg(null);
    setErr(null);

    try {
      const submissionId = `${spaceId}_${activityId}_${uid}`;
      const ref = doc(db, "spaces", spaceId, "writingActivities", activityId, "submissions", submissionId);
      await setDoc(
        ref,
        {
          activityId,
          spaceId,
          studentUid: uid,
          answersByFieldId,
          sectionDrafts,
          finalText,
          printProfile,
          status: submissionStatus || "draft",
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      setMsg(t("messages.printSaved"));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("errors.save"));
    } finally {
      setSavingPrintProfile(false);
      window.setTimeout(() => setMsg(null), 2500);
    }
  }

  async function sendSectionImprovement(section: WritingSectionTemplate) {
    if (!uid || !activity) return;

    setImprovementBusySectionId(section.id);
    setMsg(null);
    setErr(null);

    try {
      const submissionId = `${spaceId}_${activityId}_${uid}`;
      const ref = doc(db, "spaces", spaceId, "writingActivities", activityId, "submissions", submissionId);
      await setDoc(
        ref,
        {
          activityId,
          spaceId,
          studentUid: uid,
          answersByFieldId,
          sectionDrafts,
          finalText,
          status: submissionStatus || "draft",
          sectionImprovementRequests: {
            ...(sectionImprovementRequests ?? {}),
            [section.id]: {
              status: "submitted",
              answerSummary: sectionAnswerSummary(section, answersByFieldId, sectionDrafts),
              updatedAt: serverTimestamp(),
            },
          },
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      setMsg(t("messages.improvementSubmitted"));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("errors.save"));
    } finally {
      setImprovementBusySectionId(null);
      window.setTimeout(() => setMsg(null), 2500);
    }
  }

  async function sendRoomImprovements(room: WritingRoomTemplate) {
    if (!uid || !activity) return;

    const sectionsToSend = room.sections.filter((section) => {
      const feedback = sectionFeedback?.[section.id];
      const summary = sectionAnswerSummary(section, answersByFieldId, sectionDrafts).trim();
      const sent = sectionImprovementRequests?.[section.id];
      return feedback?.status === "improve" && summary && sent?.answerSummary !== summary;
    });

    if (sectionsToSend.length === 0) return;

    setSaving(true);
    setMsg(null);
    setErr(null);

    try {
      const submissionId = `${spaceId}_${activityId}_${uid}`;
      const ref = doc(db, "spaces", spaceId, "writingActivities", activityId, "submissions", submissionId);
      const requests = Object.fromEntries(
        sectionsToSend.map((section) => [
          section.id,
          {
            status: "submitted",
            answerSummary: sectionAnswerSummary(section, answersByFieldId, sectionDrafts),
            updatedAt: serverTimestamp(),
          },
        ])
      );

      await setDoc(
        ref,
        {
          activityId,
          spaceId,
          studentUid: uid,
          answersByFieldId,
          sectionDrafts,
          finalText,
          status: submissionStatus || "draft",
          sectionImprovementRequests: {
            ...(sectionImprovementRequests ?? {}),
            ...requests,
          },
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      setMsg(t("messages.improvementSubmitted"));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("errors.save"));
    } finally {
      setSaving(false);
      window.setTimeout(() => setMsg(null), 2500);
    }
  }

  function preferredAction(section: WritingSectionTemplate): WritingAiAction {
    const actions = section.aiPolicy?.allowedActions ?? [];
    if (section.id.includes("revision") || section.id.includes("check")) {
      return actions.includes("revision_feedback") ? "revision_feedback" : actions[0] ?? "revision_feedback";
    }
    if (section.fields.some((field) => field.id.includes("draft"))) {
      return actions.includes("continue_guidance") ? "continue_guidance" : actions[0] ?? "continue_guidance";
    }
    return actions.includes("ask_questions") ? "ask_questions" : actions[0] ?? "ask_questions";
  }

  async function requestAiSupport(section: WritingSectionTemplate, action: WritingAiAction) {
    if (!activity) return;

    const sectionText = sectionTextForAi(section, answersByFieldId, sectionDrafts);

    setAiBusySectionId(section.id);
    setAiErrBySection((current) => ({ ...current, [section.id]: null }));

    try {
      const result = await authedPost<{ supportText?: string }>(
        `/api/spaces/${spaceId}/writing-activities/${activityId}/ai-support`,
        {
          sectionId: section.id,
          action,
          sectionText,
          answersByFieldId,
          sectionDrafts,
        }
      );

      setAiResponses((current) => ({
        ...current,
        [section.id]: safeString(result.supportText),
      }));
    } catch (e: unknown) {
      setAiErrBySection((current) => ({
        ...current,
        [section.id]: e instanceof Error ? e.message : t("errors.ai"),
      }));
    } finally {
      setAiBusySectionId(null);
    }
  }

  if (loading) return <div className="w-full py-4 text-sm text-slate-600">{t("loading")}</div>;

  if (err && !activity) {
    return (
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
        <div className="font-semibold">{t("errors.title")}</div>
        <div className="mt-2 whitespace-pre-wrap text-sm">{err}</div>
        <Link href={`/student/spaces/${spaceId}`} className="mt-4 inline-flex text-sm font-semibold underline">
          {t("actions.back")}
        </Link>
      </div>
    );
  }

  if (!activity || !activeRoom) return null;

  const visibleActiveRoom = roomWithVisibleSections(activity, activeRoom);
  const roomImprovementSections = visibleActiveRoom.sections.filter((section) => {
    const feedback = sectionFeedback?.[section.id];
    const summary = sectionAnswerSummary(section, answersByFieldId, sectionDrafts).trim();
    const sent = sectionImprovementRequests?.[section.id];
    return feedback?.status === "improve" && summary && sent?.answerSummary !== summary;
  });
  const roomAllApproved = visibleActiveRoom.sections.length > 0 && visibleActiveRoom.sections.every((section) => sectionFeedback?.[section.id]?.status === "approved");
  const bottomPrimaryStatus =
    activeRoom.phase === "planning"
      ? "planning_submitted"
      : activeRoom.phase === "final"
        ? "submitted"
        : "submitted";
  const bottomPrimaryLabel =
    roomAllApproved
      ? t("actions.approved")
      : roomImprovementSections.length > 0
        ? t("actions.sendImprovements")
        : activeRoom.phase === "planning"
      ? t("actions.sendPlan")
      : activeRoom.phase === "final"
        ? t("actions.submit")
        : t("actions.sendToTeacher");
  const bottomPrimaryDisabled =
    saving ||
    roomAllApproved ||
    (activeRoom.phase === "final" && !finalText.trim());
  const roomTitle = (room: WritingRoomTemplate) => (room.phase === "revision" ? t("rooms.revision") : room.title);
  const activeRoomDone = roomIsDone(visibleActiveRoom, answersByFieldId, sectionDrafts, sectionFeedback, finalText, submissionStatus);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 pb-28">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <Link href={`/student/spaces/${spaceId}`} className="text-sm font-semibold text-emerald-900 underline">
          {t("actions.back")}
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="m-0 text-2xl font-semibold text-slate-950">{activity.title}</h1>
            <div className="mt-1 text-sm text-emerald-900">
              {t("genre.story")}
              {activity.level ? ` · ${activity.level}` : ""}
              {activity.language ? ` · ${activity.language}` : ""}
              {activity.theme ? ` · ${activity.theme}` : ""}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-900">
            {submissionStatus ? t(`status.${submissionStatus}`) : t("status.draft")}
          </div>
        </div>

        {msg ? <div className="mt-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900">{msg}</div> : null}
        {err ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}

        {activity.assignmentText || activity.criteria?.length || activity.competenceGoals?.length ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4">
            {activity.assignmentText ? (
              <div>
                <div className="text-xs font-black uppercase text-emerald-800">{t("assignment.title")}</div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-900">{activity.assignmentText}</div>
              </div>
            ) : null}
            {activity.criteria?.length ? (
              <div className="mt-3">
                <div className="text-xs font-black uppercase text-emerald-800">{t("assignment.criteria")}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activity.criteria.map((criterion) => (
                    <span key={criterion} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-950">
                      {criterion}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {activity.competenceGoals?.length ? (
              <div className="mt-3">
                <div className="text-xs font-black uppercase text-emerald-800">{t("assignment.goals")}</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-800">
                  {activity.competenceGoals.map((goal) => (
                    <li key={goal}>{goal}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {rooms.map((room) => {
          const isActive = room.id === activeRoom.id;
          const visibleRoom = roomWithVisibleSections(activity, room);
          const isDone = roomIsDone(visibleRoom, answersByFieldId, sectionDrafts, sectionFeedback, finalText, submissionStatus);
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => setActiveRoomId(room.id)}
              className={[
                "whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-semibold",
                isActive
                  ? isDone
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-amber-500 bg-amber-400 text-slate-950"
                  : isDone
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                    : "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100",
              ].join(" ")}
            >
              {roomTitle(room)}
            </button>
          );
        })}
      </nav>

      {teacherFeedbackText ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="m-0 text-lg font-semibold text-slate-950">{t("teacherFeedback.title")}</h2>
            <div className="text-sm font-semibold text-blue-900">
              {submissionStatus === "reviewed" ? t("teacherFeedback.reviewed") : t("teacherFeedback.needsWork")}
            </div>
          </div>
          {teacherFeedbackUpdatedAt ? (
            <div className="mt-1 text-xs font-semibold text-blue-900">{t("teacherFeedback.updatedAt", { at: teacherFeedbackUpdatedAt })}</div>
          ) : null}
          <div className="mt-3 whitespace-pre-wrap rounded-xl border border-blue-200 bg-white p-3 text-sm leading-6 text-slate-900">
            {teacherFeedbackText}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3">
        <div>
          <h2 className="m-0 text-xl font-semibold text-slate-950">{roomTitle(activeRoom)}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>{t(`phase.${activeRoom.phase}`)}</span>
            <span
              className={[
                "rounded-full border px-2 py-1 text-xs font-semibold",
                activeRoomDone ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900",
              ].join(" ")}
            >
              {activeRoomDone ? t("progress.ready") : t("progress.keepWorking")}
            </span>
          </div>
        </div>

        {visibleActiveRoom.sections.map((section) => {
          const supportWords = defaultSupportWords(section);
          const aiUses = aiUsage.filter((item) => item.sectionId === section.id).length;
          const aiMax = section.aiPolicy?.maxUses ?? 2;
          const aiAvailable = !!section.aiPolicy?.enabled && activity.aiPolicy?.enabled !== false;
          const aiAction = preferredAction(section);
          const supportOpen = supportOpenBySection[section.id] === true;
          const sectionTeacherFeedback = sectionFeedback?.[section.id];
          const improvementRequest = sectionImprovementRequests?.[section.id];
          const currentSectionSummary = sectionAnswerSummary(section, answersByFieldId, sectionDrafts);
          const improvementSent =
            sectionTeacherFeedback?.status === "improve" &&
            improvementRequest?.status === "submitted" &&
            safeString(improvementRequest.answerSummary).trim() === currentSectionSummary.trim();
          const teacherOpen = teacherOpenBySection[section.id] === true;
          const sectionDone = sectionTeacherFeedback?.status === "approved" || hasSectionInput(section, answersByFieldId, sectionDrafts);
          const sectionApproved = sectionTeacherFeedback?.status === "approved";
          const showWordStats = activeRoom.phase === "drafting" && section.id !== "title";
          const sectionWords = sectionWordCount(section.id, sectionDrafts);
          const sectionPercent = draftingWordTotal > 0 ? Math.round((sectionWords / draftingWordTotal) * 100) : 0;

          return (
            <article
              key={section.id}
              className={[
                "rounded-2xl border p-4 shadow-sm",
                sectionApproved
                  ? "border-emerald-200 bg-emerald-50"
                  : sectionDone
                    ? "border-amber-200 bg-amber-50/60"
                    : "border-slate-200 bg-white",
              ].join(" ")}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="m-0 text-lg font-semibold text-slate-950">{section.title}</h3>
                    <span
                      className={[
                        "rounded-full border px-2 py-1 text-xs font-semibold",
                        sectionApproved
                          ? "border-emerald-200 bg-white text-emerald-900"
                          : sectionDone
                            ? "border-amber-200 bg-white text-amber-900"
                            : "border-slate-200 bg-white text-slate-600",
                      ].join(" ")}
                    >
                      {sectionApproved ? t("progress.approved") : sectionDone ? t("progress.started") : t("progress.notStarted")}
                    </span>
                    {showWordStats ? (
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                        {t("wordStats.section", { count: sectionWords, percent: sectionPercent })}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{section.prompt}</p>

                  <div className="mt-4 grid gap-3">
                    {section.id === "other_characters" ? (
                      <div className="grid gap-3">
                        {Array.from({ length: otherCharacterCount(answersByFieldId) }, (_, index) => {
                          const n = index + 1;
                          const nameId = `other_character_${n}_name`;
                          const roleId = `other_character_${n}_role`;
                          const descriptionId = `other_character_${n}_description`;
                          const roleValue = safeString(answersByFieldId[roleId]) || (n === 1 ? safeString(answersByFieldId.character_roles).split(",")[0]?.trim() ?? "" : "");
                          const descriptionValue = safeString(answersByFieldId[descriptionId]) || (n === 1 ? safeString(answersByFieldId.other_characters_list) : "");
                          return (
                            <div key={n} className="rounded-xl border border-slate-200 bg-white/80 p-3">
                              <div className="mb-2 text-sm font-black text-slate-900">
                                {t("otherCharacters.person", { n })}
                              </div>
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                                <label className="block">
                                  <span className="text-sm font-semibold text-slate-900">{t("otherCharacters.name")}</span>
                                  <input
                                    value={safeString(answersByFieldId[nameId])}
                                    onChange={(e) => updateField(section, nameId, e.target.value)}
                                    placeholder={t("otherCharacters.namePlaceholder")}
                                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-sm font-semibold text-slate-900">{t("otherCharacters.role")}</span>
                                  <select
                                    value={roleValue}
                                    onChange={(e) => updateField(section, roleId, e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                                  >
                                    <option value="">{t("fields.choose")}</option>
                                    {["venn", "hjelper", "motstander", "familie", "ukjent"].map((option) => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <label className="mt-3 block">
                                <span className="text-sm font-semibold text-slate-900">{t("otherCharacters.description")}</span>
                                <textarea
                                  value={descriptionValue}
                                  onChange={(e) => updateField(section, descriptionId, e.target.value)}
                                  placeholder={t("otherCharacters.descriptionPlaceholder")}
                                  rows={3}
                                  className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500"
                                />
                              </label>
                            </div>
                          );
                        })}
                        {otherCharacterCount(answersByFieldId) < OTHER_CHARACTER_MAX ? (
                          <button
                            type="button"
                            onClick={() => updateField(section, "other_characters_count", String(otherCharacterCount(answersByFieldId) + 1))}
                            className="w-fit rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
                          >
                            {t("otherCharacters.add")}
                          </button>
                        ) : null}
                      </div>
                    ) : section.fields.map((field) => {
                      const value = getFieldValue(
                        field.id,
                        section.id,
                        answersByFieldId,
                        sectionDrafts,
                        field.id === "final_text" ? finalText : ""
                      );

                      if (field.kind === "choice") {
                        return (
                          <label key={field.id} className="block">
                            <span className="text-sm font-semibold text-slate-900">{field.label}</span>
                            <select
                              value={value}
                              onChange={(e) => updateField(section, field.id, e.target.value)}
                              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                            >
                              <option value="">{t("fields.choose")}</option>
                              {(field.options ?? []).map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </label>
                        );
                      }

                      if (field.kind === "chips") {
                        const selected = value.split(",").map((item) => item.trim()).filter(Boolean);
                        return (
                          <div key={field.id}>
                            <div className="text-sm font-semibold text-slate-900">{field.label}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(field.options ?? []).map((option) => {
                                const isSelected = selected.includes(option);
                                const next = isSelected
                                  ? selected.filter((item) => item !== option)
                                  : [...selected, option];
                                return (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() => updateField(section, field.id, next.join(", "))}
                                    className={[
                                      "rounded-full border px-3 py-1 text-sm font-semibold",
                                      isSelected
                                        ? "border-emerald-600 bg-emerald-600 text-white"
                                        : "border-slate-300 bg-white text-slate-800",
                                    ].join(" ")}
                                  >
                                    {option}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      const isLong = field.kind === "long_text";
                      return (
                        <label key={field.id} className="block">
                          <span className="text-sm font-semibold text-slate-900">{field.label}</span>
                          {isLong ? (
                            <textarea
                              value={value}
                              onChange={(e) => updateField(section, field.id, e.target.value)}
                              placeholder={field.placeholder}
                              rows={section.id === "final_text" ? 10 : 4}
                              className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500"
                            />
                          ) : (
                            <input
                              value={value}
                              onChange={(e) => updateField(section, field.id, e.target.value)}
                              placeholder={field.placeholder}
                              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <aside className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 lg:sticky lg:top-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black uppercase text-emerald-900">{t("support.title")}</div>
                      <div className="mt-1 text-xs font-semibold text-emerald-800">{t("support.subtitle")}</div>
                    </div>
                    {aiAvailable ? (
                      <div className="whitespace-nowrap rounded-full border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-900">
                        {t("ai.usage", { used: aiUses, max: aiMax })}
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        if (!sectionTeacherFeedback?.text && !(activeRoom.phase === "final" && teacherFeedbackText)) return;
                        setTeacherOpenBySection((current) => ({ ...current, [section.id]: !teacherOpen }));
                      }}
                      disabled={!sectionTeacherFeedback?.text && !(activeRoom.phase === "final" && teacherFeedbackText)}
                      className={[
                        "rounded-full border px-3 py-1 text-xs font-semibold",
                        sectionTeacherFeedback?.text || (activeRoom.phase === "final" && teacherFeedbackText)
                          ? sectionTeacherFeedback?.status === "approved" || (activeRoom.phase === "final" && submissionStatus === "reviewed")
                            ? "border-emerald-200 bg-white/90 text-emerald-900 hover:bg-white"
                            : "border-amber-200 bg-white/90 text-amber-900 hover:bg-white"
                          : "border-slate-200 bg-white/60 text-slate-500",
                      ].join(" ")}
                    >
                      {sectionTeacherFeedback?.text || (activeRoom.phase === "final" && teacherFeedbackText)
                        ? teacherOpen
                          ? t("sectionFeedback.hide")
                          : t("sectionFeedback.show")
                        : t("sectionFeedback.none")}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSupportOpenBySection((current) => ({ ...current, [section.id]: !supportOpen }))}
                      className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-white"
                    >
                      {supportOpen ? t("support.hideWords") : t("support.showWords")}
                    </button>

                    {aiAvailable ? (
                      <button
                        type="button"
                        onClick={() => requestAiSupport(section, aiAction)}
                        disabled={aiBusySectionId != null || aiUses >= aiMax}
                        className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-950 hover:bg-emerald-200 disabled:opacity-60"
                      >
                        {aiBusySectionId === section.id
                          ? t("ai.working")
                          : aiUses >= aiMax
                            ? t("ai.usedUp")
                            : activeRoom.phase === "revision"
                              ? t("ai.controlAction")
                              : t("ai.mainAction")}
                      </button>
                    ) : null}
                  </div>

                  {supportOpen && supportWords.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {supportWords.map((word) => (
                        <span key={word} className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-950">
                          {word}
                        </span>
                      ))}
                    </div>
                  ) : supportOpen ? (
                    <div className="mt-3 text-sm text-emerald-900">{t("support.empty")}</div>
                  ) : null}

                  {aiErrBySection[section.id] ? (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {aiErrBySection[section.id]}
                    </div>
                  ) : null}

                  {teacherOpen && sectionTeacherFeedback?.text ? (
                    <div className="mt-3 rounded-xl border border-blue-200 bg-white p-3 text-sm leading-6 text-slate-900">
                      <div className="mb-1 text-xs font-black uppercase text-blue-800">
                        {sectionTeacherFeedback.status === "approved"
                          ? t("sectionFeedback.approved")
                          : t("sectionFeedback.improve")}
                      </div>
                      <div className="whitespace-pre-wrap">{sectionTeacherFeedback.text}</div>
                      {sectionTeacherFeedback.status === "improve" ? (
                        <button
                          type="button"
                          onClick={() => void sendSectionImprovement(section)}
                          disabled={improvementBusySectionId != null || !currentSectionSummary.trim() || improvementSent}
                          className={[
                            "mt-3 w-full rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-70",
                            improvementSent
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : "border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100",
                          ].join(" ")}
                        >
                          {improvementBusySectionId === section.id
                            ? t("actions.saving")
                            : improvementSent
                              ? t("sectionFeedback.improvementSent")
                              : t("sectionFeedback.sendImprovement")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {teacherOpen && !sectionTeacherFeedback?.text && activeRoom.phase === "final" && teacherFeedbackText ? (
                    <div className="mt-3 rounded-xl border border-blue-200 bg-white p-3 text-sm leading-6 text-slate-900">
                      <div className="mb-1 text-xs font-black uppercase text-blue-800">
                        {submissionStatus === "reviewed" ? t("teacherFeedback.reviewed") : t("teacherFeedback.needsWork")}
                      </div>
                      {teacherFeedbackUpdatedAt ? (
                        <div className="mb-2 text-xs font-semibold text-blue-900">
                          {t("teacherFeedback.updatedAt", { at: teacherFeedbackUpdatedAt })}
                        </div>
                      ) : null}
                      <div className="whitespace-pre-wrap">{teacherFeedbackText}</div>
                    </div>
                  ) : null}

                  {aiResponses[section.id] ? (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3 text-sm leading-6 text-emerald-950">
                      <div className="mb-1 text-xs font-black uppercase text-emerald-800">{t("ai.responseTitle")}</div>
                      <div className="whitespace-pre-wrap">{aiResponses[section.id]}</div>
                    </div>
                  ) : null}
                </aside>
              </div>
            </article>
          );
        })}

        {activeRoom.phase === "final" ? (
          <div className="space-y-4">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="m-0 text-lg font-semibold text-slate-950">{t("final.preview")}</h3>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                  {t("wordStats.total", { count: finalWordTotal })}
                </span>
              </div>
              <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-900">
                {finalText || t("final.empty")}
              </div>
            </article>

            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="m-0 text-lg font-semibold text-slate-950">{t("printProduct.title")}</h3>
                  <p className="mt-1 text-sm text-emerald-950">{t("printProduct.subtitle")}</p>
                </div>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <button
                    type="button"
                    disabled
                    className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-500"
                    title={t("printProduct.lockedHint")}
                  >
                    {t("printProduct.uploadLocked")}
                  </button>
                  <button
                    type="button"
                    disabled
                    className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-500"
                    title={t("printProduct.lockedHint")}
                  >
                    {t("printProduct.aiImageLocked")}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 print:hidden">
                <label className="text-sm font-semibold text-slate-900">
                  {t("printProduct.studentName")}
                  <input
                    value={printProfile.studentName ?? ""}
                    onChange={(e) => setPrintProfile((current) => ({ ...current, studentName: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="text-sm font-semibold text-slate-900">
                  {t("printProduct.school")}
                  <input
                    value={printProfile.school ?? ""}
                    onChange={(e) => setPrintProfile((current) => ({ ...current, school: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="text-sm font-semibold text-slate-900">
                  {t("printProduct.className")}
                  <input
                    value={printProfile.className ?? ""}
                    onChange={(e) => setPrintProfile((current) => ({ ...current, className: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="text-sm font-semibold text-slate-900">
                  {t("printProduct.writtenDate")}
                  <input
                    type="date"
                    value={printProfile.writtenDate ?? ""}
                    onChange={(e) => setPrintProfile((current) => ({ ...current, writtenDate: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="text-sm font-semibold text-slate-900 sm:col-span-2">
                  {t("printProduct.imageUrl")}
                  <input
                    value={printProfile.imageUrl ?? ""}
                    onChange={(e) => setPrintProfile((current) => ({ ...current, imageUrl: e.target.value }))}
                    placeholder={t("printProduct.imageUrlPlaceholder")}
                    className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-normal"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void savePrintProfile()}
                  disabled={savingPrintProfile}
                  className="w-fit rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {savingPrintProfile ? t("actions.saving") : t("printProduct.save")}
                </button>
              </div>

              <article className="writingPrintProduct mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                {printProfile.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={printProfile.imageUrl}
                    alt=""
                    className="mb-5 max-h-72 w-full rounded-xl object-cover"
                  />
                ) : null}
                <h2 className="m-0 text-3xl font-bold text-slate-950">{printableTitle || t("printProduct.untitled")}</h2>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  {printProfile.studentName ? <span>{printProfile.studentName}</span> : null}
                  {printProfile.school ? <span>{printProfile.school}</span> : null}
                  {printProfile.className ? <span>{printProfile.className}</span> : null}
                  {printProfile.writtenDate ? <span>{printProfile.writtenDate}</span> : null}
                  <span>{t("wordStats.total", { count: finalWordTotal })}</span>
                </div>
                <div className="mt-6 whitespace-pre-wrap text-base leading-8 text-slate-950">
                  {finalText || t("final.empty")}
                </div>
              </article>
            </section>
          </div>
        ) : null}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur print:hidden">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-700">
            <span className="font-semibold text-slate-950">{roomTitle(activeRoom)}</span>
            {msg ? <span className="ml-2 text-emerald-800">{msg}</span> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => saveDraft("draft")}
              disabled={saving}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
            >
              {saving ? t("actions.saving") : t("actions.saveDraft")}
            </button>
            {activeRoom.phase === "final" ? (
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
              >
                {t("actions.print")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (roomImprovementSections.length > 0) {
                  void sendRoomImprovements(activeRoom);
                  return;
                }
                void saveDraft(bottomPrimaryStatus);
              }}
              disabled={bottomPrimaryDisabled}
              className={[
                "rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-70",
                roomAllApproved ? "bg-emerald-600" : "bg-emerald-700 hover:bg-emerald-800",
              ].join(" ")}
            >
              {saving ? t("actions.saving") : bottomPrimaryLabel}
            </button>
          </div>
        </div>
      </div>
      <style jsx global>{`
        @media print {
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
            padding: 24px !important;
          }
        }
      `}</style>
    </main>
  );
}
