// lib/usageAdmin.ts
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import type { QuotaBucket } from "@/lib/featureAccess";

function getMonthId(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function usageDocPath(uid: string, monthId: string) {
  return ["users", uid, "usage", monthId] as const;
}

export async function getUsageAdmin(uid: string): Promise<Record<string, number>> {
  const monthId = getMonthId();
  const { db } = getAdmin();

  const ref = db.doc(usageDocPath(uid, monthId).join("/"));
  const snap = await ref.get();

  if (!snap.exists) return {};

  return (snap.data() ?? {}) as Record<string, number>;
}

export async function incrementUsageAdmin(
  uid: string,
  key: QuotaBucket,
  amount = 1
): Promise<void> {
  const monthId = getMonthId();
  const { db } = getAdmin();

  const ref = db.doc(usageDocPath(uid, monthId).join("/"));
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      [key]: amount,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  await ref.set(
    {
      [key]: FieldValue.increment(amount),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}