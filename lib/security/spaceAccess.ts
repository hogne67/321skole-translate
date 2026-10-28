/** Read-time normalization only. The same ASCII whitespace policy is used in Firebase rules. */
export function normalizeSpaceMemberStatus(status: unknown): string | null {
  return typeof status === "string" ? status.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").toLowerCase() : null;
}

/** Explicit active status is required; absent/invalid status or conflicting flags deny access. */
export function isActiveSpaceMember(data: Record<string, unknown> | null | undefined): boolean {
  return !!data && !Array.isArray(data) && data.role !== "school_admin"
    && normalizeSpaceMemberStatus(data.status) === "active"
    && (!("active" in data) || data.active === true)
    && (!("archived" in data) || data.archived === false);
}

export function isSpaceTeachingMember(data: Record<string, unknown> | null | undefined): boolean {
  return isActiveSpaceMember(data) && !!data &&
    (["teacher", "co_teacher"].includes(String(data.role ?? "")) ||
      ["co_teacher", "substitute"].includes(String(data.staffRole ?? "")));
}
