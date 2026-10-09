import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

export async function approveCourseSignup(
  db: Firestore,
  courseId: string,
  requestId: string,
  identity: { participantUid: string; roleSnapshot: string }
) {
  const courseRef = db.collection("courses").doc(courseId);
  const requestRef = courseRef.collection("signupRequests").doc(requestId);
  return db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) throw new Error("Request not found");
    const request = requestSnap.data()!;
    const email = String(request.email || "").trim().toLowerCase();
    if (!email) throw new Error("Request is missing email");
    const participants = courseRef.collection("participants");
    const matches = await tx.get(participants.where("email", "==", email));
    // Reuse legacy/manual registrations, preserving their progress and payment fields.
    const existing = matches.docs.find((doc) => doc.id === request.participantId)
      ?? matches.docs.find((doc) => doc.data().status !== "cancelled")
      ?? matches.docs[0];
    const participantRef = existing?.ref ?? participants.doc(`email-${createHash("sha256").update(email).digest("hex")}`);
    const now = new Date();
    if (!existing) {
      tx.set(participantRef, {
        name: String(request.name || ""), email, ...identity,
        phone: String(request.phone || ""), source: "signupRequest", signupRequestId: requestId,
        status: "enrolled", createdAt: now, updatedAt: now,
      });
    } else if (request.status !== "accepted" && existing.data().status === "cancelled") {
      tx.update(participantRef, { status: "enrolled", updatedAt: now });
    }
    tx.set(requestRef, { status: "accepted", participantId: participantRef.id, updatedAt: now }, { merge: true });
    return { participantId: participantRef.id, alreadyAccepted: request.status === "accepted" };
  });
}
