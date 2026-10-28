import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getSpaceAccess } from "./spaceAccess.server";
import { getSpaceOwnerUid } from "./spaceOwnership";

/** Server enumeration avoids granting an unsafe collection query over ambiguous legacy documents. */
export async function listOwnedSpaces(db: Firestore, uid: string) {
  const snapshots = await Promise.all(["ownerId", "ownerUid"].map(field => db.collection("spaces").where(field, "==", uid).get()));
  const candidates = new Map(snapshots.flatMap(snapshot => snapshot.docs).map(doc => [doc.id, doc.data()]));
  const rows = await Promise.all([...candidates].map(async ([id, data]) => {
    if (getSpaceOwnerUid(data) !== uid) return null;
    const access = await getSpaceAccess(db, id, uid);
    return access.owner ? { id, data: access.space! } : null;
  }));
  return rows.filter((row): row is NonNullable<typeof row> => row !== null);
}
