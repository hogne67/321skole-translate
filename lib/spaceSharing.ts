/** A closed, archived or deleted room must not receive new shared content. */
export function isSpaceOpenForSharing(space: Record<string, unknown> | null | undefined): boolean {
  if (!space || space.isOpen !== true || space.archived === true || space.deletedAt
    || space.active === false || space.isActive === false) return false;
  const status = typeof space.status === "string" ? space.status.trim().toLowerCase() : "";
  return !["closed", "inactive", "archived", "deleted"].includes(status);
}
