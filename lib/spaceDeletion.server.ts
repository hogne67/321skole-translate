import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { getSpaceAccess } from "./security/spaceAccess.server";

export type SpaceDeletionStatus = { deleted: boolean; canDelete: boolean; blockedBy: "members" | "submissions" | null };

export class SpaceDeletionError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

async function inspectSpace(db: Firestore, tx: Transaction, spaceId: string, uid: string) {
  const access = await getSpaceAccess(db, spaceId, uid, tx);
  if (!access.exists) throw new SpaceDeletionError("notFound", 404);
  if (!access.owner) throw new SpaceDeletionError("ownerOnly", 403);
  const space = access.space!;
  if (space.deletedAt) return { space, deleted: true, canDelete: false, blockedBy: null };

  // Two rows suffice: at most one row can be the owner's own canonical membership.
  const members = await tx.get(db.collection("spaceMembers").where("spaceId", "==", spaceId).limit(2));
  if (members.docs.some(member => member.id !== `${spaceId}_${uid}` || member.get("uid") !== uid)) {
    return { space, deleted: false, canDelete: false, blockedBy: "members" as const };
  }

  const room = db.doc(`spaces/${spaceId}`);
  const direct = await Promise.all([
    tx.get(db.collection("spaceSubmissions").where("spaceId", "==", spaceId).limit(1)),
    tx.get(db.collection("submissions").where("spaceId", "==", spaceId).limit(1)),
    tx.get(room.collection("submissions").limit(1)),
    tx.get(room.collection("boardResponses").limit(1)),
  ]);
  if (direct.some(snapshot => !snapshot.empty)) return { space, deleted: false, canDelete: false, blockedBy: "submissions" as const };

  // listDocuments also finds legacy assignment parents whose document was removed
  // while their submissions remain. Those answers must still prevent deletion.
  const parents = (await Promise.all(["lessons", "assignments", "writingActivities", "goals"].map(
    collection => room.collection(collection).listDocuments()
  ))).flat();
  for (const parent of parents) {
    if (!(await tx.get(parent.collection("submissions").limit(1))).empty) {
      return { space, deleted: false, canDelete: false, blockedBy: "submissions" as const };
    }
  }
  return { space, deleted: false, canDelete: true, blockedBy: null };
}

export async function getSpaceDeletionStatus(db: Firestore, spaceId: string, uid: string): Promise<SpaceDeletionStatus> {
  return db.runTransaction(async tx => {
    const { deleted, canDelete, blockedBy } = await inspectSpace(db, tx, spaceId, uid);
    return { deleted, canDelete, blockedBy };
  });
}

export async function changeSpaceDeletion(db: Firestore, spaceId: string, uid: string, action: "delete" | "restore") {
  return db.runTransaction(async tx => {
    const status = await inspectSpace(db, tx, spaceId, uid);
    if (action === "delete") {
      if (status.deleted) return;
      if (!status.canDelete) throw new SpaceDeletionError(status.blockedBy!, 409);
      tx.update(db.doc(`spaces/${spaceId}`), {
        deletedAt: FieldValue.serverTimestamp(), deletedByUid: uid,
        isOpenBeforeDeletion: status.space.isOpen === true, isOpen: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (status.deleted) {
      tx.update(db.doc(`spaces/${spaceId}`), {
        deletedAt: FieldValue.delete(), deletedByUid: FieldValue.delete(),
        isOpen: status.space.isOpenBeforeDeletion === true, isOpenBeforeDeletion: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
}
