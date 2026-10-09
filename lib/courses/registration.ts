export type RegistrationMode = "approval" | "automatic";

export function registrationModeForCourse(course: Record<string, unknown>): RegistrationMode {
  const sales = course.sales as Record<string, unknown> | undefined;
  // Automatic free enrollment must never bypass paid checkout.
  return course.registrationMode === "automatic" && course.pricingMode === "free" &&
    !(Number(sales?.priceAmountOre) > 0) ? "automatic" : "approval";
}

export function countsTowardCapacity(participant: Record<string, unknown>) {
  return ["invited", "enrolled", "active"].includes(String(participant.status));
}

export function occupiedPlaces(participants: Record<string, unknown>[]) {
  const identities = new Set<string>();
  participants.filter(countsTowardCapacity).forEach((p, index) => {
    identities.add(String(p.email || "").trim().toLowerCase() || String(p.participantUid || `row-${index}`));
  });
  return identities.size;
}

export class CourseFullError extends Error {
  constructor() { super("Course is full"); }
}

export function assertPlaceAvailable(course: Record<string, unknown>, participants: Record<string, unknown>[], additionalPlaces = 1) {
  const limit = Number(course.maxParticipants);
  if (limit > 0 && occupiedPlaces(participants) + additionalPlaces > limit) throw new CourseFullError();
}
