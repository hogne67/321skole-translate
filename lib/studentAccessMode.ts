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

export function hasFeideIdentity(token: {
  firebase?: { sign_in_provider?: unknown; identities?: unknown };
} | null | undefined): boolean {
  const firebase = token?.firebase;
  if (firebase?.sign_in_provider === "oidc.feide") return true;
  const identities = firebase?.identities;
  return typeof identities === "object" && identities !== null
    && Object.hasOwn(identities, "oidc.feide");
}

export function getEffectiveStudentModeForToken(input: {
  role?: unknown;
  studentAccessMode?: unknown;
  schoolId?: unknown;
  schoolStatus?: unknown;
}, token: Parameters<typeof hasFeideIdentity>[0]): string | null {
  if (input.role === "student" && (hasFeideIdentity(token)
    || (typeof input.schoolId === "string" && input.schoolId.trim().length > 0 && input.schoolStatus === "active"))) {
    return "space_only";
  }
  return typeof input.studentAccessMode === "string" ? input.studentAccessMode : null;
}

export function getStudentAccessMode(
  profile: StudentAccessProfile | null | undefined,
  opts?: {
    isAnonymous?: boolean;
    isFeideLinked?: boolean;
    defaultMode?: StudentAccessMode;
  }
): StudentAccessMode {
  if (opts?.isAnonymous) return "space_only";

  const isSchoolStudent =
    profile?.role === "student" &&
    typeof profile?.schoolId === "string" &&
    profile.schoolId.trim().length > 0 &&
    profile.schoolStatus === "active" &&
    profile.schoolRole !== "school_teacher" &&
    profile.schoolRole !== "school_admin";

  if (isSchoolStudent || (profile?.role === "student" && opts?.isFeideLinked)) return "space_only";

  const explicit = normalizeStudentAccessMode(profile?.studentAccessMode);
  if (explicit) return explicit;

  if (profile?.role === "student" && profile.onboardingComplete !== true) {
    return "space_only";
  }

  return opts?.defaultMode ?? "self_study";
}

export function isSpaceOnlyStudent(
  profile: StudentAccessProfile | null | undefined,
  opts?: {
    isAnonymous?: boolean;
    isFeideLinked?: boolean;
    defaultMode?: StudentAccessMode;
  }
): boolean {
  const role = opts?.isAnonymous ? "student" : profile?.role;
  return role === "student" && getStudentAccessMode(profile, opts) === "space_only";
}
