// lib/spaceMembership.ts
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from "firebase/firestore";

export type SpaceRole = "student" | "teacher" | "creator" | "parent";

type EnsureSpaceMemberOpts = {
  code?: string;
  displayName?: string;
  isAnon?: boolean;
};

function normCode(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toUpperCase();
  return s ? s : undefined;
}

export async function ensureSpaceMember(
  db: Firestore,
  spaceId: string,
  uid: string,
  role: SpaceRole,
  opts?: EnsureSpaceMemberOpts
) {
  if (!spaceId) throw new Error("ensureSpaceMember: spaceId is required");
  if (!uid) throw new Error("ensureSpaceMember: uid is required");

  const docId = `${spaceId}_${uid}`;
  const ref = doc(db, "spaceMembers", docId);

  const payload: Record<string, unknown> = {
    spaceId,
    uid,
    role,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const code = normCode(opts?.code);
  if (code) payload.code = code;

  if (typeof opts?.displayName === "string" && opts.displayName.trim()) {
    payload.displayName = opts.displayName.trim();
  }

  if (typeof opts?.isAnon === "boolean") {
    payload.isAnon = opts.isAnon;
  }

  await setDoc(ref, payload);

  return { id: docId };
}

export async function listMySpaceIds(db: Firestore, uid: string): Promise<string[]> {
  if (!uid) return [];

  const qy = query(collection(db, "spaceMembers"), where("uid", "==", uid));
  const snap = await getDocs(qy);

  const out: string[] = [];
  snap.forEach((d) => {
    const data = d.data() as { spaceId?: unknown };
    if (typeof data.spaceId === "string" && data.spaceId) out.push(data.spaceId);
  });

  return Array.from(new Set(out));
}