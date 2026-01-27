// lib/ensureUserProfile.ts
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserProfile } from "@/lib/userProfile";

export async function ensureUserProfile(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (snap.exists()) return;

  const profile: UserProfile = {
    roles: { student: true },        // MVP: alle nye får student
    teacherStatus: "none",
    caps: { pdf: true, tts: true, vocab: true, publish: false, sell: false },
    parentOf: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, profile, { merge: true });
}
