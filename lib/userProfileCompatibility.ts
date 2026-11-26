type AppRole = "student" | "teacher" | "admin" | "parent" | "creator";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function compatibleUserProfileRole(profile: Record<string, unknown>): AppRole | null {
  const role = typeof profile.role === "string" ? profile.role.toLowerCase() : "";
  if (role === "student" || role === "teacher" || role === "admin" || role === "parent" || role === "creator") return role;
  if (role === "content" || role === "review" || role === "reviewer") return "admin";

  const roles = profile.roles;
  if (!isRecord(roles)) return null;
  if (roles.admin === true) return "admin";
  if (roles.teacher === true) return "teacher";
  if (roles.creator === true) return "creator";
  if (roles.parent === true) return "parent";
  if (roles.student === true) return "student";
  return null;
}

export function hasCompletedProfileOnboarding(profile: Record<string, unknown>): boolean {
  if (profile.onboardingComplete === true) return true;
  const org = profile.org;
  return isRecord(org) && [profile.displayName, org.country, org.municipality].every(
    value => typeof value === "string" && value.trim().length > 0,
  );
}
