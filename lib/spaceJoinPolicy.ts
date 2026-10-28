import { isActiveSpaceMember } from "./security/spaceAccess";

export type JoinMember = {
  uid?: unknown; participantId?: unknown; displayName?: unknown; studentCode?: unknown;
  role?: unknown; active?: unknown; archived?: unknown; status?: unknown;
};
export function joinText(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
export function isActivePupil(member: JoinMember): boolean {
  return member.role === "student" && isActiveSpaceMember(member);
}
export function pupilIdentity(member: JoinMember): string { return joinText(member.participantId) || joinText(member.uid); }
type JoinDecision = { error: string } | {
  member: JoinMember; participantId: string; displayName: string; switchRequired: boolean; currentDisplayName: string | null;
};
export function evaluatePupilJoin(existing: JoinMember | null, matches: JoinMember[]): JoinDecision {
  if (existing && !isActiveSpaceMember(existing)) return { error: "access_revoked" };
  const active = matches.filter(isActivePupil);
  if (!active.length) return { error: "invalid_student_code" } as const;
  const identities = new Set(active.map(pupilIdentity));
  if (identities.size !== 1 || !active.every(m => pupilIdentity(m))) return { error: "identity_conflict" } as const;
  const member = active[0];
  if (!joinText(member.displayName)) return { error: "missing_pupil_name" } as const;
  return {
    member, participantId: pupilIdentity(member), displayName: joinText(member.displayName),
    switchRequired: Boolean(existing && isActiveSpaceMember(existing) &&
      (existing.role !== "student" || pupilIdentity(existing) !== pupilIdentity(member))),
    currentDisplayName: existing && isActiveSpaceMember(existing) ? joinText(existing.displayName) : null,
  };
}

