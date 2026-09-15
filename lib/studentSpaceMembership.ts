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

export async function ensureStudentSpaceMembership(
  db: Firestore,
  spaceId: string,
  uid: string
): Promise<boolean> {
  if (!spaceId || !uid) return false;

  const canonicalId = `${spaceId}_${uid}`;
  const canonicalRef = doc(db, "spaceMembers", canonicalId);
  const canonicalSnap = await getDoc(canonicalRef);
  if (canonicalSnap.exists()) {
    return isActiveMember(canonicalSnap.data() as SpaceMemberData);
  }

  const qy = query(
    collection(db, "spaceMembers"),
    where("spaceId", "==", spaceId),
    where("uid", "==", uid),
    limit(1)
  );
  const snap = await getDocs(qy);
  if (snap.empty) return false;

  const legacyData = snap.docs[0].data() as SpaceMemberData;
  if (!isActiveMember(legacyData)) return false;

  const payload: Record<string, unknown> = {
    spaceId,
    uid,
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

  await setDoc(canonicalRef, payload, { merge: true });

  return true;
}
