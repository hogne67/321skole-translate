export function canCreateSchoolSpace(
  schoolId: string,
  uid: string,
  schoolRole: unknown,
  school: Record<string, unknown> | undefined,
  member: Record<string, unknown> | undefined,
) {
  const seatLimit = school?.teacherSeatLimit;
  return school?.status === "active" && typeof seatLimit === "number" && Number.isInteger(seatLimit) && seatLimit > 0
    && member?.uid === uid && (member.schoolId === undefined || member.schoolId === schoolId)
    && member.status === "active" && (member.role === "school_teacher" || member.role === "school_admin")
    && member.role === schoolRole;
}
