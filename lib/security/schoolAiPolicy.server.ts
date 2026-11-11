import "server-only";

import type { Firestore } from "firebase-admin/firestore";

import { isLessonAiFeedbackDisabled } from "@/lib/security/lessonAiFeedbackPolicy";
import { isWritingAiDisabled } from "@/lib/security/writingAiPolicy";

export type SchoolAiPolicy = { lessonFeedbackDisabled: boolean; writingDisabled: boolean; version: number };
export type SchoolAiKind = "lessonFeedback" | "writing";

export function readSchoolAiPolicy(school: Record<string, unknown> | undefined): SchoolAiPolicy {
  const raw = school?.aiPolicy;
  if (raw === undefined) return { lessonFeedbackDisabled: false, writingDisabled: false, version: 0 };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { lessonFeedbackDisabled: true, writingDisabled: true, version: 0 };
  }
  const policy = raw as Record<string, unknown>;
  const version = Number.isSafeInteger(policy.version) && (policy.version as number) >= 0 ? policy.version as number : 0;
  // Unknown stored values restrict AI until an administrator resolves the policy.
  if (typeof policy.lessonFeedbackDisabled !== "boolean" || typeof policy.writingDisabled !== "boolean"
    || !Number.isSafeInteger(policy.version) || (policy.version as number) < 0) {
    return { lessonFeedbackDisabled: true, writingDisabled: true, version };
  }
  return {
    lessonFeedbackDisabled: policy.lessonFeedbackDisabled,
    writingDisabled: policy.writingDisabled,
    version,
  };
}

export async function isSpaceAiDisabled(
  db: Firestore,
  space: Record<string, unknown> | null | undefined,
  kind: SchoolAiKind,
): Promise<boolean> {
  if (!space) return true;
  if (kind === "lessonFeedback" ? isLessonAiFeedbackDisabled(space) : isWritingAiDisabled(space)) return true;
  const rawSchoolId = space.schoolId;
  if (rawSchoolId === undefined || rawSchoolId === null) return false;
  if (typeof rawSchoolId !== "string" || !rawSchoolId.trim() || rawSchoolId.includes("/")) return true;
  const school = await db.collection("schools").doc(rawSchoolId).get();
  if (!school.exists) return true;
  const policy = readSchoolAiPolicy(school.data());
  return kind === "lessonFeedback" ? policy.lessonFeedbackDisabled : policy.writingDisabled;
}
