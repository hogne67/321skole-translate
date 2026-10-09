import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { assertPlaceAvailable, countsTowardCapacity, registrationModeForCourse } from "./registration";

export type SignupInput = { name: string; email: string; phone: string; message: string; locale: string };

export async function registerCourseSignup(db: Firestore, courseId: string, input: SignupInput) {
  const courseRef = db.collection("courses").doc(courseId);
  const email = input.email.trim().toLowerCase();
  const key = `email-${createHash("sha256").update(email).digest("hex")}`;
  return db.runTransaction(async (tx) => {
    const courseSnap = await tx.get(courseRef);
    const course = courseSnap.data();
    if (!course || !["published", "active"].includes(course.status)) throw new Error("Course is not open for requests");
    const requests = courseRef.collection("signupRequests");
    const existingRequests = await tx.get(requests.where("email", "==", email));
    const existingRequest = existingRequests.docs[0];
    // A repeated submission never resets a review, sends again, or takes another seat.
    if (existingRequest) return { requestId: existingRequest.id, created: false, accepted: existingRequest.data().status === "accepted" };

    const automatic = registrationModeForCourse(course) === "automatic";
    const participantRef = courseRef.collection("participants").doc(key);
    let existingParticipant: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    if (automatic) {
      const participants = await tx.get(courseRef.collection("participants"));
      existingParticipant = participants.docs.find((doc) => String(doc.data().email || "").trim().toLowerCase() === email && countsTowardCapacity(doc.data()))
        ?? participants.docs.find((doc) => String(doc.data().email || "").trim().toLowerCase() === email);
      if (!existingParticipant || !countsTowardCapacity(existingParticipant.data())) {
        assertPlaceAvailable(course, participants.docs.map((doc) => doc.data()));
      }
    }
    const now = new Date();
    const requestRef = requests.doc(key);
    if (automatic) {
      const target = existingParticipant?.ref ?? participantRef;
      if (!existingParticipant) tx.set(target, {
        name: input.name, email, phone: input.phone, participantUid: "", roleSnapshot: "",
        source: "signupRequest", signupRequestId: requestRef.id,
        status: "enrolled", createdAt: now, updatedAt: now,
      });
      else if (!["enrolled", "active"].includes(existingParticipant.data().status)) tx.update(target, { status: "enrolled", updatedAt: now });
      // The course document is a common contention point for simultaneous enrollments.
      tx.update(courseRef, { enrollmentChangedAt: now });
    }
    tx.set(requestRef, {
      ...input, email, status: automatic ? "accepted" : "new",
      ...(automatic ? { participantId: existingParticipant?.id ?? participantRef.id } : {}),
      createdAt: now, updatedAt: now,
    });
    return { requestId: requestRef.id, created: true, accepted: automatic };
  });
}
