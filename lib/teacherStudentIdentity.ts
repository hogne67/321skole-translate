export type TeacherPupilMember = {
  teacherStudentId?: unknown; participantId?: unknown; uid?: unknown;
  role?: unknown; active?: unknown; archived?: unknown; status?: unknown;
};

export function teacherStudentIdentity(member: TeacherPupilMember): string {
  for (const value of [member.teacherStudentId, member.participantId, member.uid]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function isActiveTeacherPupil(member: TeacherPupilMember): boolean {
  return member.role === "student" && member.active !== false && member.archived !== true && member.status !== "removed";
}
