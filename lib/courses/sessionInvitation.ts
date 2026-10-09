import { normalizeParticipantStatus } from "./types";

export function invitationRecipients(participants: Record<string, unknown>[]): string[] {
  return [...new Set(participants.filter((p) => {
    const status = normalizeParticipantStatus(p.status);
    return status === "active" || status === "enrolled";
  }).map((p) => typeof p.email === "string" ? p.email.trim().toLowerCase() : "")
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))].sort();
}

export function sessionInvitationUrl(origin: string, locale: string, courseId: string, sessionNumber: number) {
  const language = ["nb", "en", "pt"].includes(locale) ? locale : "nb";
  const path = `/${language}/student/courses/${encodeURIComponent(courseId)}/sessions/${sessionNumber}`;
  return `${origin.replace(/\/$/, "")}/${language}/login?next=${encodeURIComponent(path)}`;
}
