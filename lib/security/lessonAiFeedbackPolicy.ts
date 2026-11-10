export function isLessonAiFeedbackDisabled(space: { lessonAiFeedbackDisabled?: unknown } | null | undefined): boolean {
  const setting = space?.lessonAiFeedbackDisabled;
  // Existing rooms have no setting. An invalid stored value is treated as restricted.
  return setting !== undefined && setting !== false;
}
