"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import AuthGate from "@/components/AuthGate";
import PodcastWorkshopSubmissionView from "@/components/teacher/submissions/PodcastWorkshopSubmissionView";
import { db } from "@/lib/firebase";
import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { useUserProfile } from "@/lib/useUserProfile";
import {
  createPodcastWorkshopFeedback,
  readPodcastWorkshopConfig,
  readPodcastWorkshopFeedback,
  readPodcastWorkshopSubmission,
  type PodcastWorkshopConfig,
  type PodcastWorkshopFeedback,
  type PodcastWorkshopRoomFeedback,
  type PodcastWorkshopRoomKey,
  type PodcastWorkshopSubmission,
} from "@/lib/podcastWorkshop";

type AssignmentDoc = {
  title?: string;
  level?: string;
  language?: string;
  sourceId?: string;
  sourceType?: "myContent" | "library" | string;
  sourceText?: string;
  text?: string;
  podcastWorkshopConfig?: unknown;
};

type SubmissionDoc = {
  uid?: string;
  status?: string;
  podcastWorkshop?: unknown;
  podcastWorkshopFeedback?: unknown;
  studentName?: string;
  studentDisplayName?: string;
  createdAt?: unknown;
};

type SpaceMemberDoc = {
  displayName?: string;
  name?: string;
  studentName?: string;
};

function formatMaybeDate(value: unknown) {
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

export default function TeacherPodcastSubmissionPage() {
  return (
    <AuthGate requireRole="teacher">
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const t = useTranslations("submission");
  const tAny = t as unknown as (key: string, values?: Record<string, unknown>) => string;
  const params = useParams<{ spaceId: string; assignmentId: string; subId: string }>();
  const { user } = useUserProfile();
  const { spaceId, assignmentId, subId } = params;

  const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);
  const [config, setConfig] = useState<PodcastWorkshopConfig | null>(null);
  const [submission, setSubmission] = useState<PodcastWorkshopSubmission>(() => readPodcastWorkshopSubmission(null, null));
  const [feedback, setFeedback] = useState<PodcastWorkshopFeedback>(() => createPodcastWorkshopFeedback());
  const [studentName, setStudentName] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const backHref = useMemo(
    () => `/teacher/spaces/${spaceId}/lessons/${assignmentId}`,
    [assignmentId, spaceId]
  );

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErr(null);

      try {
        const assignmentSnap = await getDoc(doc(db, "spaces", spaceId, "lessons", assignmentId));
        if (!assignmentSnap.exists()) throw new Error(t("missing.title"));
        const nextAssignment = (assignmentSnap.data() as AssignmentDoc) ?? {};

        let nextConfig = readPodcastWorkshopConfig(
          nextAssignment.podcastWorkshopConfig,
          String(nextAssignment.sourceText ?? nextAssignment.text ?? "")
        );

        if (!nextConfig && nextAssignment.sourceId) {
          const collectionName = nextAssignment.sourceType === "library" ? "published_lessons" : "lessons";
          const sourceSnap = await getDoc(doc(db, collectionName, String(nextAssignment.sourceId)));
          const source = sourceSnap.exists() ? (sourceSnap.data() as AssignmentDoc) : null;
          nextConfig = readPodcastWorkshopConfig(
            source?.podcastWorkshopConfig,
            String(source?.sourceText ?? source?.text ?? "")
          );
        }

        if (!nextConfig) throw new Error(t("missing.title"));
        if (!alive) return;
        setAssignment(nextAssignment);
        setConfig(nextConfig);
      } catch (error) {
        if (alive) setErr(error instanceof Error ? error.message : t("fallback.unknownError"));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [assignmentId, spaceId, t]);

  useEffect(() => {
    if (!config) return;
    const ref = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", subId);
    return onSnapshot(ref, async (snap) => {
      if (!snap.exists()) {
        setErr(t("missing.title"));
        return;
      }

      const data = (snap.data() as SubmissionDoc) ?? {};
      setSubmission(readPodcastWorkshopSubmission(data.podcastWorkshop, config));
      setFeedback(readPodcastWorkshopFeedback(data.podcastWorkshopFeedback));
      setCreatedAt(formatMaybeDate(data.createdAt));

      const direct = data.studentName?.trim() || data.studentDisplayName?.trim() || "";
      if (direct) {
        setStudentName(direct);
        return;
      }

      if (data.uid) {
        const memberSnap = await getDoc(doc(db, "spaceMembers", `${spaceId}_${data.uid}`));
        if (memberSnap.exists()) {
          const member = (memberSnap.data() as SpaceMemberDoc) ?? {};
          setStudentName(member.displayName?.trim() || member.name?.trim() || member.studentName?.trim() || data.uid);
        } else {
          setStudentName(data.uid);
        }
      }
    });
  }, [assignmentId, config, spaceId, subId, t]);

  function updateRoomFeedback(room: PodcastWorkshopRoomKey, next: PodcastWorkshopRoomFeedback) {
    setFeedback((current) => ({
      ...current,
      rooms: {
        ...current.rooms,
        [room]: next,
      },
    }));
  }

  async function saveFeedback() {
    setSaving(true);
    setMsg(null);

    try {
      const payload = {
        podcastWorkshopFeedback: {
          ...feedback,
          updatedAt: serverTimestamp(),
          teacherUid: user?.uid ?? null,
        },
        updatedAt: serverTimestamp(),
      };
      const batch = writeBatch(db);
      batch.set(doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", subId), payload, { merge: true });
      batch.set(doc(db, "spaceSubmissions", subId), payload, { merge: true });
      await batch.commit();
      setMsg(t("podcastWorkshop.feedbackSaved"));
    } catch (error) {
      setMsg(t("podcastWorkshop.feedbackSaveFailed", {
        msg: error instanceof Error ? error.message : t("fallback.unknownError"),
      }));
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 2200);
    }
  }

  if (loading) {
    return <main className="mx-auto w-full max-w-6xl p-4 text-sm text-slate-600">Laster...</main>;
  }

  if (err || !config) {
    return (
      <main className="mx-auto w-full max-w-6xl p-4">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
          {err ?? t("fallback.unknownError")}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 p-3">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <Link href={backHref} className="text-sm font-semibold text-emerald-900 underline">
          {t("actions.back")}
        </Link>
        <div className="mt-3 text-xs font-black uppercase tracking-wide text-emerald-800">
          Podcastverksted
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">
          {studentName || t("fallback.guest")}
        </h1>
        {createdAt ? (
          <div className="mt-2 inline-flex rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900">
            {t("meta.deliveredLabel")}: {createdAt}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
        <PodcastWorkshopSubmissionView
          title={assignment?.title ?? t("fallback.task")}
          level={assignment?.level ?? ""}
          config={config}
          submission={submission}
          feedback={feedback}
          canOperate={true}
          saving={saving}
          saveMsg={msg}
          onFeedbackChange={updateRoomFeedback}
          onSaveFeedback={saveFeedback}
          t={tAny}
        />
      </section>
    </main>
  );
}
