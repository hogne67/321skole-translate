import { isSpaceTeachingMember } from "./security/spaceAccess";
import { hasSpaceOwnerAccess } from "./security/spaceOwnership";

/** A closed, archived or deleted room must not receive new shared content. */
export function isSpaceOpenForSharing(space: Record<string, unknown> | null | undefined): boolean {
  if (!space || space.isOpen !== true || space.archived === true || space.deletedAt
    || space.active === false || space.isActive === false) return false;
  const status = typeof space.status === "string" ? space.status.trim().toLowerCase() : "";
  return !["closed", "inactive", "archived", "deleted"].includes(status);
}

/** Membership as a pupil or observer does not grant permission to share lessons. */
export function canShareContentToSpace(
  space: Record<string, unknown> | null | undefined,
  uid: string,
  member: Record<string, unknown> | null = null,
): boolean {
  return !!uid && isSpaceOpenForSharing(space)
    && (hasSpaceOwnerAccess(space, uid, member) || isSpaceTeachingMember(member));
}

export const SPACE_NOT_OPEN_MESSAGE = "Space is not active. Open the space before sharing content.";

export class SpaceNotOpenError extends Error {
  constructor() {
    super(SPACE_NOT_OPEN_MESSAGE);
  }
}
