import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdmin } from "../../firebaseAdmin";
import { getFeatureDecisionFromProfile } from "../../featureAccess";
import { normalizeCreateLessonInput } from "../input";
import { LessonError } from "../validation";

/** Trusted context from a server-verified token; never construct from request JSON. */
export type LessonAuthContext = Pick<DecodedIdToken, "uid" | "firebase">;

export async function createLessonForUser(
  authContext: LessonAuthContext,
  input: unknown,
  db: Firestore = getAdmin().db,
) {
  const uid = authContext?.uid;
  if (!uid || authContext.firebase?.sign_in_provider === "anonymous") {
    throw new LessonError("A signed-in account is required.", 401);
  }
  const profileSnap = await db.collection("users").doc(uid).get();
  const profile = profileSnap.data();
  if (!profileSnap.exists || !profile || profile.disabled === true) {
    throw new LessonError("Account is not allowed to create lessons.", 403);
  }
  const decision = getFeatureDecisionFromProfile({
    role: profile.role, plan: profile.plan, billing: profile.billing,
    partnerAccess: profile.partnerAccess, partnerStatus: profile.partnerStatus,
    schoolId: profile.schoolId, schoolRole: profile.schoolRole, schoolStatus: profile.schoolStatus,
    studentAccessMode: profile.studentAccessMode, feature: "producer_create_lesson",
  });
  if (!decision.allowed) throw new LessonError("Account is not allowed to create lessons.", 403);
  // Check eligibility, not remaining generation quota: generation already consumes it.
  const lesson = normalizeCreateLessonInput(input);
  const factChecked = lesson.aiQuality.factChecked;
  const ref = db.collection("lessons").doc();
  await ref.create({
    ...lesson,
    ownerId: uid, status: "draft",
    estimatedMinutes: 20, releaseMode: "ALL_AT_ONCE",
    aiQuality: {
      ...lesson.aiQuality,
      checkedTextHash: factChecked
        ? createHash("sha256").update(lesson.sourceText.replace(/\s+/g, " "), "utf8").digest("hex")
        : null,
      checkedAt: factChecked ? FieldValue.serverTimestamp() : null,
    },
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    source: "producer-texts-new", deletedAt: null, activePublishedId: null,
  });
  return { id: ref.id };
}
