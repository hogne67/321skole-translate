import { isActiveSpaceMember } from "./spaceAccess";

function validOwner(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[/ \t\r\n]/.test(value);
}

/** Only explicit, unambiguous identity fields confer ownership. Never infer it from provenance. */
export function getSpaceOwnerUid(data: object | null | undefined): string | null {
  if (!data || Array.isArray(data)) return null;
  const fields = data as Record<string, unknown>;
  const hasId = Object.prototype.hasOwnProperty.call(data, "ownerId"), hasUid = Object.prototype.hasOwnProperty.call(data, "ownerUid");
  if (hasId) return validOwner(fields.ownerId) && (!hasUid || fields.ownerUid === fields.ownerId) ? fields.ownerId : null;
  return hasUid && validOwner(fields.ownerUid) ? fields.ownerUid : null;
}

/** Missing canonical membership preserves legacy owners; an explicit revocation always vetoes ownership. */
export function hasSpaceOwnerAccess(data: object | null | undefined, uid: string,
  member: Record<string, unknown> | null | undefined): boolean {
  return !!uid && getSpaceOwnerUid(data) === uid && (member == null || isActiveSpaceMember(member));
}
