export function hasAcademyAccess(profile: unknown): boolean {
  if (!profile || typeof profile !== "object") return false;

  const record = profile as Record<string, unknown>;
  if (record.academyEnabled === true) return true;

  const features = record.features;
  if (!features || typeof features !== "object") return false;

  return (features as Record<string, unknown>).academy === true;
}

export function hasAdminAccess(profile: unknown): boolean {
  if (!profile || typeof profile !== "object") return false;

  const record = profile as Record<string, unknown>;
  if (record.role === "admin") return true;

  const roles = record.roles;
  if (!roles || typeof roles !== "object") return false;

  return (roles as Record<string, unknown>).admin === true;
}

export function canAccessAcademy(profile: unknown): boolean {
  return hasAdminAccess(profile) || hasAcademyAccess(profile);
}
