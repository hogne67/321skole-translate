import { isSpaceTeachingMember } from "./security/spaceAccess";
import { hasSpaceOwnerAccess } from "./security/spaceOwnership";

function isSpaceActiveForSharing(space: Record<string, unknown> | null | undefined): space is Record<string, unknown> {
  if (!space || space.archived === true || space.deletedAt
    || space.active === false || space.isActive === false) return false;
  const status = typeof space.status === "string" ? space.status.trim().toLowerCase() : "";
  return !["closed", "inactive", "archived", "deleted"].includes(status);
}

export function isSpaceOpenForSharing(space: Record<string, unknown> | null | undefined): boolean {
  return isSpaceActiveForSharing(space) && space.isOpen === true;
}

export function isParentSpaceKind(kind: unknown): kind is "family" | "parent_group" {
  return kind === "family" || kind === "parent_group";
}

// Family rooms are private by default and can receive assignments while active.
export function isParentSpaceAvailableForSharing(space: Record<string, unknown> | null | undefined): boolean {
  return isSpaceActiveForSharing(space) &&
    (space.kind === "family" || (space.kind === "parent_group" && space.isOpen === true));
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

export function canShareContentToParentSpace(
  space: Record<string, unknown> | null | undefined,
  uid: string,
  member: Record<string, unknown> | null = null,
): boolean {
  return isParentSpaceAvailableForSharing(space) && hasSpaceOwnerAccess(space, uid, member);
}

export const SPACE_NOT_OPEN_MESSAGE = "Space is not active. Open the space before sharing content.";
export const PARENT_SPACE_NOT_AVAILABLE_MESSAGE = "This family room cannot receive assignments.";

export class SpaceNotOpenError extends Error {
  constructor(message = SPACE_NOT_OPEN_MESSAGE) {
    super(message);
  }
}
