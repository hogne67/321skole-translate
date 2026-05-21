import { getAdmin } from "@/lib/firebaseAdmin";

export function schoolsCollectionRef() {
  const { db } = getAdmin();

  return db.collection("schools");
}

export function schoolDocRef(schoolId: string) {
  return schoolsCollectionRef().doc(schoolId);
}

export function schoolMembersCollectionRef(schoolId: string) {
  return schoolDocRef(schoolId).collection("members");
}

export function schoolMemberDocRef(schoolId: string, uid: string) {
  return schoolMembersCollectionRef(schoolId).doc(uid);
}

export function schoolInvitesCollectionRef() {
  const { db } = getAdmin();

  return db.collection("schoolInvites");
}

export function schoolInviteDocRef(inviteId: string) {
  return schoolInvitesCollectionRef().doc(inviteId);
}
