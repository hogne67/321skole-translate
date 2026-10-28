import {
  doc,
  getDoc,
  type Firestore,
} from "firebase/firestore";
import { isActiveSpaceMember } from "@/lib/security/spaceAccess";

type SpaceMemberData = {
  archived?: unknown;
  active?: unknown;
  status?: unknown;
  displayName?: unknown;
  isAnon?: unknown;
  role?: unknown;
  participantId?: unknown;
  studentCode?: unknown;
};

export type StudentSpaceMembershipInfo = {
  isMember: boolean;
  participantId: string | null;
  displayName: string | null;
  studentCode: string | null;
};

function isActiveMember(data: SpaceMemberData | null): boolean {
  return isActiveSpaceMember(data);
}

function readMembershipInfo(
  data: SpaceMemberData | null,
  fallbackUid: string
): StudentSpaceMembershipInfo {
  if (!isActiveMember(data)) {
    return {
      isMember: false,
      participantId: null,
      displayName: null,
      studentCode: null,
    };
  }

  const participantId =
    typeof data?.participantId === "string" && data.participantId.trim()
      ? data.participantId.trim()
      : fallbackUid;
  const displayName =
    typeof data?.displayName === "string" && data.displayName.trim()
      ? data.displayName.trim()
      : null;
  const studentCode =
    typeof data?.studentCode === "string" && data.studentCode.trim()
      ? data.studentCode.trim()
      : null;

  return {
    isMember: true,
    participantId,
    displayName,
    studentCode,
  };
}

export async function getStudentSpaceMembership(
  db: Firestore,
  spaceId: string,
  uid: string
): Promise<StudentSpaceMembershipInfo> {
  if (!spaceId || !uid) {
    return {
      isMember: false,
      participantId: null,
      displayName: null,
      studentCode: null,
    };
  }

  const canonicalId = `${spaceId}_${uid}`;
  const canonicalRef = doc(db, "spaceMembers", canonicalId);
  const canonicalSnap = await getDoc(canonicalRef);
  if (canonicalSnap.exists()) {
    const data = canonicalSnap.data() as SpaceMemberData;
    const info = readMembershipInfo(data, uid);
    return info;
  }

  // Match the canonical-only authorization used by rules and server routes.
  return readMembershipInfo(null, uid);
}

export async function ensureStudentSpaceMembership(
  db: Firestore,
  spaceId: string,
  uid: string
): Promise<boolean> {
  const membership = await getStudentSpaceMembership(db, spaceId, uid);
  return membership.isMember;
}
