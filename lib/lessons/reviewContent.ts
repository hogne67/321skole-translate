/** Shared snapshot: presentation settings and generated task IDs do not invalidate review. */
export function reviewContent(lesson: Record<string, unknown>): string {
  let tasks = lesson.tasks;
  if (typeof tasks === "string") {
    try { tasks = JSON.parse(tasks); } catch { /* Preserve malformed legacy content for review. */ }
  }
  return JSON.stringify({
    title: lesson.title ?? "",
    sourceText: lesson.sourceText ?? lesson.text ?? "",
    highFrequencyWord: lesson.highFrequencyWord ?? "",
    highFrequencyReadingSentences: lesson.highFrequencyReadingSentences ?? "",
    highFrequencyExplanation: lesson.highFrequencyExplanation ?? "",
    tasks: Array.isArray(tasks) ? tasks.map(task => {
      if (!task || typeof task !== "object") return task;
      return { type: task.type ?? "", prompt: task.prompt ?? "", options: task.options ?? [],
        correctAnswer: task.correctAnswer ?? "", answerSpace: task.answerSpace ?? "" };
    }) : tasks ?? [],
  });
}
