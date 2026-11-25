import "server-only";

import type { Firestore, Transaction } from "firebase-admin/firestore";
import { pupilMembershipRequiresCode } from "./spaceAccess";
import { schoolPupilProviderAllowed } from "./schoolPupilProviders";

function validSchoolId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.trim() === id && !id.includes("/");
}

async function schoolPolicy(db: Firestore, schoolId: string, transaction?: Transaction) {
  const ref = db.collection("schools").doc(schoolId);
  return (await (transaction ? transaction.get(ref) : ref.get())).data();
}

export async function schoolAllowsPupilCode(db: Firestore, schoolId: unknown, transaction?: Transaction) {
  if (schoolId == null) return true;
  if (!validSchoolId(schoolId)) return false;
  return (await schoolPolicy(db, schoolId, transaction))?.allowPupilCodeAccess !== false;
}

export async function schoolAllowsPupilMembership(
  db: Firestore, schoolId: unknown, member: Record<string, unknown> | undefined,
  signInProvider: unknown, transaction?: Transaction,
) {
  if (member?.role !== "student") return true;
  // Firebase can keep the same UID when a guest links an account. The old anonymous
  // token still names that UID, so it cannot authorize the new account membership.
  if (member.schoolPupilAccountUid !== undefined && (
    member.schoolPupilAccountUid !== member.uid || typeof signInProvider !== "string"
    || !signInProvider || signInProvider === "anonymous"
  )) return false;
  if (schoolId == null) return true;
  if (!validSchoolId(schoolId)) return false;
  const school = await schoolPolicy(db, schoolId, transaction);
  return pupilMembershipRequiresCode(member)
    ? school?.allowPupilCodeAccess !== false && (signInProvider === "anonymous" || schoolPupilProviderAllowed(school, signInProvider))
    : schoolPupilProviderAllowed(school, signInProvider);
}
