import type { Firestore } from "firebase-admin/firestore";
import { assertPlaceAvailable, occupiedPlaces } from "./registration";

// All seat-taking admin writes share the same course transaction as public signups.
export async function saveCourseParticipants(db: Firestore, courseId: string, rows: Record<string, unknown>[], editId?: string) {
  const courseRef = db.collection("courses").doc(courseId);
  return db.runTransaction(async (tx) => {
    const course = (await tx.get(courseRef)).data();
    if (!course) throw new Error("Course not found");
    const participantsRef = courseRef.collection("participants");
    const snapshots = await tx.get(participantsRef);
    const current = snapshots.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    const projected: Record<string, unknown>[] = current.filter((p) => p.id !== editId);
    const writes: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }[] = [];
    let participantId = "";
    for (const row of rows) {
      const email = String(row.email || "").trim().toLowerCase();
      const existing = projected.find((p) => String(p.email || "").trim().toLowerCase() === email);
      if (existing) {
        if (editId) throw new Error("Another participant already uses this email address");
        participantId ||= String(existing.id);
        continue;
      }
      const ref = editId ? participantsRef.doc(editId) : participantsRef.doc();
      participantId ||= ref.id;
      const data = { ...row, email, updatedAt: new Date(), ...(!editId ? { createdAt: new Date() } : {}) };
      projected.push({ ...data, id: ref.id });
      writes.push({ ref, data });
    }
    if (occupiedPlaces(projected) > occupiedPlaces(current)) assertPlaceAvailable(course, projected, 0);
    for (const write of writes) tx.set(write.ref, write.data, { merge: true });
    if (writes.length) tx.update(courseRef, { enrollmentChangedAt: new Date() });
    return { participantId, createdCount: writes.length };
  });
}
