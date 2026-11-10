export function isWritingAiDisabled(space: { writingAiDisabled?: unknown } | null | undefined): boolean {
  const setting = space?.writingAiDisabled;
  // Existing rooms have no setting. An invalid stored value is treated as restricted.
  return setting !== undefined && setting !== false;
}
