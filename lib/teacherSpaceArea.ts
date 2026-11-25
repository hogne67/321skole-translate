export type TeacherSpaceArea = "private" | "school" | "shared";
export type TeacherSpaceCreationArea = Exclude<TeacherSpaceArea, "shared">;

export function activeTeacherSchoolId(profile?: { schoolId?: unknown; schoolStatus?: unknown } | null) {
  const schoolId = profile?.schoolId;
  return profile?.schoolStatus === "active" && typeof schoolId === "string" && schoolId
    && schoolId.trim() === schoolId && !schoolId.includes("/") ? schoolId : null;
}

export function teacherSpaceArea(schoolId: unknown, activeSchoolId: string | null): TeacherSpaceArea {
  if (schoolId == null) return "private";
  return schoolId === activeSchoolId ? "school" : "shared";
}
