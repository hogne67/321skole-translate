import type { User } from "firebase/auth";

export async function readEffectiveSpaceAiPolicy(spaceId: string, user: User) {
  const token = await user.getIdToken();
  const response = await fetch(`/api/spaces/${encodeURIComponent(spaceId)}/ai-policy`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  const data = await response.json() as { ok?: boolean; lessonFeedbackDisabled?: boolean; writingDisabled?: boolean };
  if (!response.ok || data.ok !== true || typeof data.lessonFeedbackDisabled !== "boolean" || typeof data.writingDisabled !== "boolean") {
    throw new Error(`Could not load space AI policy (${response.status})`);
  }
  return { lessonFeedbackDisabled: data.lessonFeedbackDisabled, writingDisabled: data.writingDisabled };
}
