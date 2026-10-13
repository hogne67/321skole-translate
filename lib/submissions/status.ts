import { readPodcastWorkshopFeedback, type PodcastWorkshopFeedback, type PodcastWorkshopRoomKey } from "../podcastWorkshop";

export type SubmissionStatusSource = {
  status?: unknown;
  submittedAt?: unknown;
  podcastWorkshopFeedback?: unknown;
};

function timestampMillis(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return null;
}

function finalStatus(feedback: PodcastWorkshopFeedback): "reviewed" | "needs_work" | null {
  const status = feedback.rooms.final.status;
  return status === "approved" ? "reviewed" : status === "needs_work" ? "needs_work" : null;
}

/** Also understands reviews saved before the podcast editor synchronized the main status. */
export function getSubmissionStatus(submission: SubmissionStatusSource): string {
  const storedStatus = typeof submission.status === "string" ? submission.status.trim() : "";
  if (!submission.podcastWorkshopFeedback) return storedStatus;
  const feedback = readPodcastWorkshopFeedback(submission.podcastWorkshopFeedback);
  const status = finalStatus(feedback);
  if (!status) return storedStatus;

  const reviewedAt = timestampMillis(feedback.finalReviewedAt ?? feedback.updatedAt);
  const submittedAt = timestampMillis(submission.submittedAt);
  // An older final review must not approve a newly submitted version.
  if (submittedAt !== null && reviewedAt !== null && submittedAt > reviewedAt) return storedStatus;
  return status;
}

/** The same payload is written atomically to the nested submission and the student index. */
export function podcastFeedbackUpdate<T>(
  feedback: PodcastWorkshopFeedback,
  room: PodcastWorkshopRoomKey | undefined,
  teacherUid: string,
  now: T
) {
  const status = room === "final" ? finalStatus(feedback) : null;
  return {
    podcastWorkshopFeedback: {
      ...feedback,
      // Freeze the legacy review time when saving another room after a resubmission.
      finalReviewedAt: room === "final" ? now : feedback.finalReviewedAt ?? feedback.updatedAt ?? null,
      updatedAt: now,
      teacherUid,
    },
    updatedAt: now,
    ...(status ? {
      status,
      teacherFeedback: { text: feedback.rooms.final.text, updatedAt: now, teacherUid },
    } : {}),
  };
}
