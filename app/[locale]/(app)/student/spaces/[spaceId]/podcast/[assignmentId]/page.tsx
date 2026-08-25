"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import {
  resolveStudentAudioForPlayback,
  uploadStudentAudioAsset,
} from "@/lib/audio/studentAudio";
import PodcastWorkshopStudentSection from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/PodcastWorkshopStudentSection";
import {
  createPodcastWorkshopSubmission,
  readPodcastWorkshopFeedback,
  readPodcastWorkshopConfig,
  readPodcastWorkshopSubmission,
  type PodcastWorkshopFeedback,
  type PodcastWorkshopConfig,
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
  status?: string;
  uid?: string;
  podcastWorkshop?: unknown;
  podcastWorkshopFeedback?: unknown;
};

async function resolveUser(): Promise<User> {
  if (auth.currentUser) return auth.currentUser;

  const existingUser = await new Promise<User | null>((resolve) => {
    let done = false;
    let unsub: (() => void) | null = null;
    const timer = window.setTimeout(() => finish(auth.currentUser ?? null), 1500);

    const finish = (user: User | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (unsub) unsub();
      resolve(user);
    };

    unsub = onAuthStateChanged(auth, (user) => finish(user ?? null), () => finish(null));
  });

  return existingUser ?? ensureAnonymousUser();
}

function buildSubmissionId(spaceId: string, assignmentId: string, uid: string) {
  return `${spaceId}_${assignmentId}_${uid}`;
}

function hasPodcastTeacherFeedback(feedback: PodcastWorkshopFeedback | null): boolean {
  if (!feedback) return false;
  return Object.values(feedback.rooms).some((room) => {
    return String(room.text ?? "").trim().length > 0 || !!room.status;
  });
}

async function resolvePodcastAudioForPlayback(
  submission: PodcastWorkshopSubmission
): Promise<PodcastWorkshopSubmission> {
  const entries = await Promise.all(
    Object.entries(submission.productionSegments).map(async ([segmentId, segment]) => {
      const voice = await resolveStudentAudioForPlayback(segment.voice).catch(() => segment.voice);
      return [segmentId, { ...segment, voice }] as const;
    })
  );

  return {
    ...submission,
    productionSegments: Object.fromEntries(entries),
  };
}

async function uploadPodcastAudio({
  spaceId,
  assignmentId,
  submissionId,
  uid,
  submission,
}: {
  spaceId: string;
  assignmentId: string;
  submissionId: string;
  uid: string;
  submission: PodcastWorkshopSubmission;
}): Promise<PodcastWorkshopSubmission> {
  const entries = await Promise.all(
    Object.entries(submission.productionSegments).map(async ([segmentId, segment]) => {
      if (!segment.voice) return [segmentId, segment] as const;
      const voice = await uploadStudentAudioAsset({
        spaceId,
        assignmentId,
        submissionId,
        uid,
        activityType: "podcast",
        assetId: segmentId,
        asset: segment.voice,
      });
      return [segmentId, { ...segment, voice }] as const;
    })
  );

  return {
    ...submission,
    productionSegments: Object.fromEntries(entries),
  };
}

export default function StudentPodcastWorkshopPage() {
  const t = useTranslations("studentAssignment");
  const tAny = t as unknown as (key: string, values?: Record<string, unknown>) => string;
  const params = useParams<{ spaceId: string; assignmentId: string }>();
  const spaceId = params.spaceId;
  const assignmentId = params.assignmentId;

  const [uid, setUid] = useState<string | null>(null);
  const [isAnon, setIsAnon] = useState(true);
  const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);
  const [config, setConfig] = useState<PodcastWorkshopConfig | null>(null);
  const [submission, setSubmission] = useState<PodcastWorkshopSubmission>(() => createPodcastWorkshopSubmission(null));
  const [activeRoom, setActiveRoom] = useState<PodcastWorkshopRoomKey>("ideas");
  const [feedback, setFeedback] = useState<PodcastWorkshopFeedback | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submissionId = useMemo(
    () => (uid ? buildSubmissionId(spaceId, assignmentId, uid) : ""),
    [assignmentId, spaceId, uid]
  );

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErr(null);

      try {
        const user = await resolveUser();
        if (!alive) return;
        setUid(user.uid);
        setIsAnon(user.isAnonymous);

        const memberSnap = await getDoc(doc(db, "spaceMembers", `${spaceId}_${user.uid}`));
        if (!memberSnap.exists()) throw new Error(t("errors.notMember"));

        const assignmentSnap = await getDoc(doc(db, "spaces", spaceId, "lessons", assignmentId));
        if (!assignmentSnap.exists()) throw new Error(t("errors.assignmentNotFoundInSpace"));
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

        if (!nextConfig) throw new Error(t("errors.sourceLessonMissing"));

        if (!alive) return;
        setAssignment(nextAssignment);
        setConfig(nextConfig);
        setSubmission(createPodcastWorkshopSubmission(nextConfig));
      } catch (error) {
        const message = error instanceof Error ? error.message : t("errors.generic");
        if (alive) setErr(message);
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
    if (!submissionId || !config) return;
    const ref = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", submissionId);
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const data = (snap.data() as SubmissionDoc) ?? {};
        setStatus(String(data.status ?? ""));
        void resolvePodcastAudioForPlayback(
          readPodcastWorkshopSubmission(data.podcastWorkshop, config)
        ).then(setSubmission);
        setFeedback(readPodcastWorkshopFeedback(data.podcastWorkshopFeedback));
      },
      () => {
        // The first draft may not exist yet. Firestore rules still protect writes.
      }
    );
  }, [assignmentId, config, spaceId, submissionId]);

  async function save(nextStatus: "draft" | "submitted") {
    if (!uid || !config) return;
    if (nextStatus === "submitted" && activeRoom !== "final") {
      setMsg(t("podcastWorkshop.goToFinalBeforeSubmit"));
      return;
    }
    setSaving(true);
    setMsg(null);
    setErr(null);

    try {
      const persistedSubmission = await uploadPodcastAudio({
        spaceId,
        assignmentId,
        submissionId,
        uid,
        submission,
      });

      const payload = {
        spaceId,
        assignmentId,
        sourceId: assignment?.sourceId ?? null,
        sourceType: assignment?.sourceType ?? null,
        title: assignment?.title ?? null,
        level: assignment?.level ?? null,
        language: assignment?.language ?? null,
        uid,
        isAnon,
        status: nextStatus,
        lessonType: "podcast_workshop",
        contentType: "podcast_workshop",
        podcastWorkshop: persistedSubmission,
        submittedAt: nextStatus === "submitted" ? Date.now() : null,
        updatedAt: serverTimestamp(),
        auth: { isAnon, uid },
      };

      const batch = writeBatch(db);
      const nestedRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", submissionId);
      const indexRef = doc(db, "spaceSubmissions", submissionId);
      batch.set(nestedRef, { ...payload, createdAt: serverTimestamp() }, { merge: true });
      batch.set(indexRef, { ...payload, createdAt: serverTimestamp() }, { merge: true });
      await batch.commit();
      setStatus(nextStatus);
      setSubmission(
        await resolvePodcastAudioForPlayback({
            ...persistedSubmission,
            productionSegments: Object.fromEntries(
              Object.entries(persistedSubmission.productionSegments).map(([segmentId, segment]) => [
                segmentId,
                {
                  ...segment,
                  voice: segment.voice
                    ? {
                      ...segment.voice,
                      audioDataUrl: submission.productionSegments[segmentId]?.voice?.audioDataUrl,
                    }
                    : null,
                },
              ])
            ),
          })
      );
      setMsg(nextStatus === "submitted" ? t("messages.submitted") : "Kladd lagret.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : t("errors.submitFailed"));
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 2200);
    }
  }

  if (loading) {
    return <main className="mx-auto w-full max-w-5xl p-4 text-sm text-slate-600">{t("common.loading")}</main>;
  }

  if (err || !config) {
    return (
      <main className="mx-auto w-full max-w-5xl p-4">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
          {err ?? t("errors.generic")}
        </div>
      </main>
    );
  }

  const normalizedStatus = status.trim().toLowerCase();
  const hasTeacherFeedback = hasPodcastTeacherFeedback(feedback);
  const lockedByFinalReview = normalizedStatus === "reviewed" || normalizedStatus === "approved";
  const waitingForTeacher = normalizedStatus === "submitted" && !hasTeacherFeedback;
  const canEdit = !lockedByFinalReview && !waitingForTeacher;
  const submitLabel =
    normalizedStatus === "submitted" && hasTeacherFeedback
      ? t("actions.resubmit")
      : t("actions.submit");
  const showSubmitButton = activeRoom === "final";
  const footerHint = showSubmitButton
    ? t("podcastWorkshop.submitFooterHint")
    : t("podcastWorkshop.draftFooterHint");

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 p-3 pb-28">
      <Link href={`../assignments/${assignmentId}`} className="text-sm font-semibold text-emerald-900 underline">
        {t("actions.backToSpace")}
      </Link>

      <PodcastWorkshopStudentSection
        title={assignment?.title ?? t("fallback.title")}
        config={config}
        value={submission}
        feedback={feedback}
        disabled={saving}
        submitted={!canEdit}
        t={tAny}
        onChange={setSubmission}
        onRoomChange={setActiveRoom}
      />

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 shadow-lg">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700">{msg ?? footerHint}</div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving || !canEdit}
              onClick={() => save("draft")}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-900 disabled:opacity-60"
            >
              {saving ? t("actions.saving") : t("actions.saveDraft")}
            </button>
            {showSubmitButton ? (
              <button
                type="button"
                disabled={saving || !canEdit}
                onClick={() => save("submitted")}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
              >
                {saving ? t("actions.saving") : submitLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
