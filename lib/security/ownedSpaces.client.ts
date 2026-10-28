import { doc, getDocs, collection, query, where, onSnapshot, Timestamp, type Firestore } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getSpaceOwnerUid } from "./spaceOwnership";

export type OwnedSpace = { id: string; data: Record<string, unknown> };
export type OwnedSpaceSnapshot = { id: string; data: () => Record<string, unknown> };
export async function getOwnedSpaceSnapshots(db: Firestore, uid: string): Promise<OwnedSpaceSnapshot[]> {
  return (await loadOwnedSpaces(db, uid)).map(row => ({ id: row.id, data: () => row.data }));
}
export function watchOwnedSpaceSnapshots(db: Firestore, uid: string, next: (snapshot: { docs: OwnedSpaceSnapshot[] }) => void, failed: (error: Error) => void = () => undefined) {
  return subscribeOwnedSpaces(db, uid, rows => next({ docs: [...rows].sort((a, b) => {
    const millis = (value: unknown) => value instanceof Timestamp ? value.toMillis() : value instanceof Date ? value.getTime() : 0;
    return millis(b.data.createdAt) - millis(a.data.createdAt) || a.id.localeCompare(b.id);
  }).map(row => ({ id: row.id, data: () => row.data })) }),
    error => failed(error instanceof Error ? error : new Error("Owned Spaces unavailable")));
}
function decodeData(data: Record<string, unknown>) {
  const result = { ...data };
  for (const key of Object.keys(result)) {
    const value = result[key];
    if (value && typeof value === "object") {
      const stamp = value as { _seconds?: unknown; _nanoseconds?: unknown; seconds?: unknown; nanoseconds?: unknown };
      const seconds = stamp._seconds ?? stamp.seconds, nanos = stamp._nanoseconds ?? stamp.nanoseconds;
      if (typeof seconds === "number" && typeof nanos === "number") result[key] = new Timestamp(seconds, nanos);
    }
  }
  return result;
}
export async function loadOwnedSpaces(db: Firestore, uid: string, user?: User | null): Promise<OwnedSpace[]> {
  if (!uid) throw new Error("Missing user");
  if (user === undefined && typeof window !== "undefined") user = (await import("@/lib/firebase")).auth.currentUser;
  if (user?.uid === uid) {
    const response = await fetch("/api/spaces/owned", { cache: "no-store", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    if (!response.ok) throw new Error("Owned Spaces unavailable");
    const payload = await response.json() as { spaces?: OwnedSpace[] };
    if (!Array.isArray(payload.spaces)) throw new Error("Invalid owned Space response");
    return payload.spaces.filter(row => getSpaceOwnerUid(row.data) === uid).map(row => ({ id: row.id, data: decodeData(row.data) }));
  }
  // Direct SDK callers can enumerate only fully bound, matching fields.
  // Single-field legacy documents require an authenticated server enumeration.
  const snapshot = await getDocs(query(collection(db, "spaces"), where("ownerId", "==", uid), where("ownerUid", "==", uid)));
  return snapshot.docs.filter(row => getSpaceOwnerUid(row.data()) === uid).map(row => ({ id: row.id, data: row.data() }));
}
export function subscribeOwnedSpaces(db: Firestore, uid: string, next: (rows: OwnedSpace[]) => void, failed: (error: unknown) => void = () => undefined) {
  let active = true, generation = 0;
  let unsubscribe: (() => void)[] = [];
  const refresh = async () => {
    const request = ++generation;
    try {
      const loaded = await loadOwnedSpaces(db, uid);
      if (!active || request !== generation) return;
      unsubscribe.forEach(stop => stop()); unsubscribe = [];
      const rows = new Map(loaded.map(row => [row.id, row])); next([...rows.values()]);
      for (const row of loaded) unsubscribe.push(onSnapshot(doc(db, "spaces", row.id), snapshot => {
        if (!active || request !== generation) return;
        if (snapshot.exists() && getSpaceOwnerUid(snapshot.data()) === uid) rows.set(row.id, { id: row.id, data: snapshot.data() });
        else rows.delete(row.id);
        next([...rows.values()]);
      }, () => { if (active && request === generation) { rows.delete(row.id); next([...rows.values()]); } }));
    } catch (error) { if (active && request === generation) { unsubscribe.forEach(stop => stop()); unsubscribe = []; next([]); failed(error); } }
  };
  void refresh();
  if (typeof window !== "undefined") window.addEventListener("focus", refresh);
  return () => { active = false; generation++; unsubscribe.forEach(stop => stop()); if (typeof window !== "undefined") window.removeEventListener("focus", refresh); };
}
