// lib/mergeAnon.ts
import {
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  doc,
  type Firestore,
} from "firebase/firestore";

// Minimum: flytt submissions som er eid av anonUid -> newUid
export async function mergeAnonToUser(db: Firestore, anonUid: string, newUid: string) {
  if (!anonUid || !newUid || anonUid === newUid) return;

  // 1) submissions(uid == anonUid) -> uid = newUid
  const subQ = query(collection(db, "submissions"), where("uid", "==", anonUid));
  const subSnap = await getDocs(subQ);

  if (!subSnap.empty) {
    const batch = writeBatch(db);
    subSnap.docs.forEach((d) => {
      batch.update(doc(db, "submissions", d.id), { uid: newUid });
    });
    await batch.commit();
  }

  // Hvis du har andre samlinger knyttet til uid (f.eks. userDrafts, progress, osv),
  // legg dem til her på samme måte.
}