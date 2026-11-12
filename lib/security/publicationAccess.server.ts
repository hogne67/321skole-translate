import "server-only";
export class PublicationAccessError extends Error {
  constructor(message = "No access to source lesson", public status = 403) { super(message); }
}
export function assertOwnDraft(ownerId: unknown, uid: string, admin: boolean) {
  if (!admin && ownerId !== uid) throw new PublicationAccessError("Not owner of draft");
}
export function assertPublishedBinding(data: Record<string, unknown> | undefined, ownerId: string, draftId: string) {
  if (data && (data.ownerId !== ownerId || data.lessonId !== draftId)) throw new PublicationAccessError("Published copy does not belong to this draft");
}
// An editable sourceId grants no access. Existing assignment snapshots stay usable.
export function assertAssignmentFallback(data: Record<string, unknown> | undefined, sourceType: string, uid: string, admin = false) {
  if (!data) throw new PublicationAccessError("Source lesson not found", 404);
  if (sourceType === "library") {
    if (data.isActive !== true || (data.visibility !== "public" && data.visibility !== "unlisted" && data.ownerId !== uid && !admin)) throw new PublicationAccessError();
  } else assertOwnDraft(data.ownerId, uid, admin);
}
