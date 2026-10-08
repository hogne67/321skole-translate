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
  options: { idempotencyKey?: string } = {},
): Promise<{ id: string; title?: string }> {
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
  const document = {
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
  };
  if (options.idempotencyKey !== undefined) {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(options.idempotencyKey)) throw new LessonError("Invalid idempotencyKey.", 400);
    // Task IDs generated during normalization must not change retry fingerprints.
    const rawTasks = (input as { tasks?: { id?: string }[] }).tasks ?? [];
    const fingerprintInput = { ...lesson, tasks: lesson.tasks.map((task, i) => ({ ...task, id: rawTasks[i]?.id ?? null })) };
    const fingerprint = createHash("sha256").update(JSON.stringify(fingerprintInput)).digest("hex");
    const key = createHash("sha256").update(JSON.stringify([uid, options.idempotencyKey])).digest("hex");
    const receipt = db.collection("lessonCreationRequests").doc(key);
    return db.runTransaction(async transaction => {
      const existing = await transaction.get(receipt);
      if (existing.exists) {
        const data = existing.data()!;
        if (data.uid !== uid || data.fingerprint !== fingerprint) throw new LessonError("Idempotency key already used with different lesson content.", 400);
        return { id: data.lessonId as string, title: data.title as string };
      }
      transaction.create(ref, document);
      transaction.create(receipt, { uid, fingerprint, lessonId: ref.id, title: lesson.title, createdAt: FieldValue.serverTimestamp() });
      return { id: ref.id, title: lesson.title };
    });
  }
  await ref.create(document);
  return { id: ref.id };
}
