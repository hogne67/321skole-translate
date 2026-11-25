export function hasParentFeedback(review: { comment?: unknown; stars?: unknown } | null | undefined): boolean {
  return !!review && (
    (typeof review.comment === "string" && review.comment.trim().length > 0) ||
    (typeof review.stars === "number" && Number.isFinite(review.stars) && review.stars > 0)
  );
}

export function needsParentReply(status: unknown, isChildWork: unknown, hasReply: boolean): boolean {
  return status === "submitted" && isChildWork === true && !hasReply;
}

export type ParentFollowUpData = {
  roomCount: number;
  pending: Array<{
    spaceId: string;
    spaceTitle: string | null;
    assignmentId: string;
    title: string | null;
    submittedAt: number;
  }>;
};
