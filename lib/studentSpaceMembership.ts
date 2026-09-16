import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from "firebase/firestore";

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
  if (!data) return false;
  const status = String(data.status ?? "").trim().toLowerCase();
  return (
    data.archived !== true &&
    data.active !== false &&
    status !== "removed" &&
    status !== "disabled" &&
    status !== "inactive"
  );
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
    if (info.isMember && !data.participantId) {
      await setDoc(canonicalRef, { participantId: info.participantId, updatedAt: serverTimestamp() }, { merge: true });
    }
    return info;
  }

  const qy = query(
    collection(db, "spaceMembers"),
    where("spaceId", "==", spaceId),
    where("uid", "==", uid),
    limit(1)
  );
  const snap = await getDocs(qy);
  if (snap.empty) {
    return {
      isMember: false,
      participantId: null,
      displayName: null,
      studentCode: null,
    };
  }

  const legacyData = snap.docs[0].data() as SpaceMemberData;
  const info = readMembershipInfo(legacyData, uid);
  if (!info.isMember) return info;

  const payload: Record<string, unknown> = {
    spaceId,
    uid,
    participantId: info.participantId,
    role: "student",
    archived: false,
    active: true,
    status: "active",
    repairedFromMemberId: snap.docs[0].id,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  if (typeof legacyData.displayName === "string" && legacyData.displayName.trim()) {
    payload.displayName = legacyData.displayName.trim();
  }
  if (typeof legacyData.isAnon === "boolean") {
    payload.isAnon = legacyData.isAnon;
  }
  if (info.studentCode) {
    payload.studentCode = info.studentCode;
  }

  await setDoc(canonicalRef, payload, { merge: true });

  return info;
}

export async function ensureStudentSpaceMembership(
  db: Firestore,
  spaceId: string,
  uid: string
): Promise<boolean> {
  const membership = await getStudentSpaceMembership(db, spaceId, uid);
  return membership.isMember;
}
