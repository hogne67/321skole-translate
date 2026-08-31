export type StudentAccessMode = "space_only" | "self_study";

type StudentAccessProfile = {
  role?: unknown;
  studentAccessMode?: unknown;
  onboardingComplete?: unknown;
  schoolId?: unknown;
  schoolRole?: unknown;
  schoolStatus?: unknown;
};

export function normalizeStudentAccessMode(value: unknown): StudentAccessMode | null {
  if (value === "space_only") return "space_only";
  if (value === "self_study") return "self_study";
  return null;
}

export function getStudentAccessMode(
  profile: StudentAccessProfile | null | undefined,
  opts?: {
    isAnonymous?: boolean;
    defaultMode?: StudentAccessMode;
  }
): StudentAccessMode {
  if (opts?.isAnonymous) return "space_only";

  const explicit = normalizeStudentAccessMode(profile?.studentAccessMode);
  if (explicit) return explicit;

  if (profile?.role === "student" && profile.onboardingComplete !== true) {
    return "space_only";
  }

  const isSchoolStudent =
    profile?.role === "student" &&
    typeof profile?.schoolId === "string" &&
    profile.schoolId.trim().length > 0 &&
    profile.schoolStatus === "active" &&
    profile.schoolRole !== "school_teacher" &&
    profile.schoolRole !== "school_admin";

  if (isSchoolStudent) return "space_only";

  return opts?.defaultMode ?? "self_study";
}

export function isSpaceOnlyStudent(
  profile: StudentAccessProfile | null | undefined,
  opts?: {
    isAnonymous?: boolean;
    defaultMode?: StudentAccessMode;
  }
): boolean {
  const role = opts?.isAnonymous ? "student" : profile?.role;
  return role === "student" && getStudentAccessMode(profile, opts) === "space_only";
}
