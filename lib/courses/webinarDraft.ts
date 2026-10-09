import { createEmptyCoursePlan, type CoursePlanSession } from "./types";

export function webinarDraftSession(input: {
  title: string;
  description: string;
  localStartsAt: string;
  durationMinutes: number;
}): CoursePlanSession {
  const session = createEmptyCoursePlan(1)[0];
  const date = input.localStartsAt ? new Date(input.localStartsAt) : null;
  if (date && !Number.isFinite(date.getTime())) throw new Error("Velg en gyldig dato og et klokkeslett, eller bestem tidspunktet senere.");
  return {
    ...session,
    title: input.title.trim(),
    description: input.description.trim(),
    startsAt: date ? date.toISOString() : "",
    durationMinutes: input.durationMinutes,
  };
}
