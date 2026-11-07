/** Read-time normalization only. The same ASCII whitespace policy is used in Firebase rules. */
export function normalizeSpaceMemberStatus(status: unknown): string | null {
  return typeof status === "string" ? status.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").toLowerCase() : null;
}

/** Explicit active status is required; absent/invalid status or conflicting flags deny access. */
export function isActiveSpaceMember(data: Record<string, unknown> | null | undefined): boolean {
  return !!data && !Array.isArray(data) && data.role !== "school_admin" && data.role !== "substitute"
    && normalizeSpaceMemberStatus(data.status) === "active"
    && (!("active" in data) || data.active === true)
    && (!("archived" in data) || data.archived === false);
}

export function isSpaceTeachingMember(data: Record<string, unknown> | null | undefined): boolean {
  return isActiveSpaceMember(data) && !!data &&
    (["teacher", "co_teacher"].includes(String(data.role ?? "")) ||
      ["co_teacher", "substitute"].includes(String(data.staffRole ?? "")));
}

export function spaceSubstituteExpiry(data: Record<string, unknown> | null | undefined): number | null {
  const timestamp = data?.substituteExpiresAt;
  if (data?.role !== "substitute" || !timestamp || typeof timestamp !== "object" ||
      !("toMillis" in timestamp) || typeof timestamp.toMillis !== "function") return null;
  const value = timestamp.toMillis();
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isCurrentSpaceSubstitute(data: Record<string, unknown> | null | undefined, now = Date.now()): boolean {
  const expiry = spaceSubstituteExpiry(data);
  return data?.status === "substitute" && data.active === true && data.archived === false && expiry !== null && expiry > now;
}

export function isSchoolSpace(space: Record<string, unknown> | undefined, schoolId: string): boolean {
  return !!space && space.schoolId === schoolId && space.kind !== "family" && space.kind !== "parent_group";
}
