import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { assertPlaceAvailable, countsTowardCapacity } from "./registration";

export async function approveCourseSignup(
  db: Firestore,
  courseId: string,
  requestId: string,
  identity: { participantUid: string; roleSnapshot: string }
) {
  const courseRef = db.collection("courses").doc(courseId);
  const requestRef = courseRef.collection("signupRequests").doc(requestId);
  return db.runTransaction(async (tx) => {
    const course = (await tx.get(courseRef)).data() ?? {};
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) throw new Error("Request not found");
    const request = requestSnap.data()!;
    const email = String(request.email || "").trim().toLowerCase();
    if (!email) throw new Error("Request is missing email");
    const participants = courseRef.collection("participants");
    const allParticipants = await tx.get(participants);
    const matches = { docs: allParticipants.docs.filter((doc) => String(doc.data().email || "").trim().toLowerCase() === email) };
    // Reuse legacy/manual registrations, preserving their progress and payment fields.
    const existing = matches.docs.find((doc) => doc.id === request.participantId)
      ?? matches.docs.find((doc) => doc.data().status !== "cancelled")
      ?? matches.docs[0];
    const participantRef = existing?.ref ?? participants.doc(`email-${createHash("sha256").update(email).digest("hex")}`);
    const now = new Date();
    if (!existing || (request.status !== "accepted" && !countsTowardCapacity(existing.data()))) {
      assertPlaceAvailable(course, allParticipants.docs.map((doc) => doc.data()));
    }
    if (!existing) {
      tx.set(participantRef, {
        name: String(request.name || ""), email, ...identity,
        phone: String(request.phone || ""), source: "signupRequest", signupRequestId: requestId,
        status: "enrolled", createdAt: now, updatedAt: now,
      });
    } else if (request.status !== "accepted" && !["active", "enrolled"].includes(existing.data().status)) {
      tx.update(participantRef, { status: "enrolled", updatedAt: now });
    }
    tx.set(requestRef, { status: "accepted", participantId: participantRef.id, updatedAt: now }, { merge: true });
    if (!existing || !countsTowardCapacity(existing.data())) tx.update(courseRef, { enrollmentChangedAt: now });
    return { participantId: participantRef.id, alreadyAccepted: request.status === "accepted" };
  });
}
