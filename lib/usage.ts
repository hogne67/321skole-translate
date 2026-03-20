// lib/usage.ts
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import type { QuotaBucket } from "@/lib/featureAccess";

function getMonthId(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function usageRef(uid: string, monthId: string) {
  return doc(db, "users", uid, "usage", monthId);
}

export async function getUsage(uid: string): Promise<Record<string, number>> {
  const monthId = getMonthId();
  const ref = usageRef(uid, monthId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return {};

  return snap.data() as Record<string, number>;
}

export async function incrementUsage(
  uid: string,
  key: QuotaBucket,
  amount = 1
) {
  const monthId = getMonthId();
  const ref = usageRef(uid, monthId);

  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      [key]: amount,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await updateDoc(ref, {
    [key]: increment(amount),
    updatedAt: serverTimestamp(),
  });
}