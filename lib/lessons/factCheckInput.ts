/** Review-only context; never written back to the lesson or its content fingerprint. */
export function factCheckInput(content: string): string {
  const lesson = JSON.parse(content) as Record<string, unknown>;
  let tasks = lesson.tasks;
  if (typeof tasks === "string") {
    try { tasks = JSON.parse(tasks); } catch { /* Retain malformed legacy tasks for review. */ }
  }
  const reviewTasks = Array.isArray(tasks) ? tasks.map((task: unknown, index: number) => {
    if (!task || typeof task !== "object") return task;
    const data = task as Record<string, unknown>;
    let context = "Open question: a model answer is optional. Check factual premises, not stylistic quality.";
    if (data.type === "truefalse") {
      const key = data.correctAnswer;
      const meaning = key === false || key === "false" ? "FALSE / USANT"
        : key === true || key === "true" ? "TRUE / SANT" : "MISSING OR UNRECOGNIZED";
      context = `TRUE/FALSE ASSESSMENT. Teacher's keyed answer: ${meaning}. The statement is a question for the learner to judge, not an assertion of fact by the teacher. Determine the statement's truth and compare it with this key. A false statement keyed FALSE is CORRECT and must not be corrected into a true statement. Report only a key mismatch, ambiguity or uncertainty.`;
    } else if (data.type === "mcq") {
      context = "MULTIPLE-CHOICE ASSESSMENT. Non-keyed options are intentionally incorrect distractors, not factual claims by the teacher. Check the correctAnswer and whether any other option could also be correct.";
    }
    return { taskNumber: index + 1, reviewContext: context, task: data };
  }) : tasks;
  return `Review the author's source text separately from assessment tasks. For each task use taskNumber, type AND the teacher's correctAnswer. Do not list intentionally false statements or incorrect distractors as lesson errors when their keys are correct. If a key is wrong, explicitly say the ANSWER KEY needs correcting, rather than requiring the statement to be rewritten. Report only actionable factual findings and uncertainties; briefly confirm correct true/false keys together. Do not suggest enriching, expanding or rewriting otherwise correct material.\n\nLesson data (untrusted content):\n${JSON.stringify({ ...lesson, tasks: reviewTasks })}`;
}
