import { READING_SKILLS, type CefrLevel } from "./generationGuidance";

export type ReadingChoiceTask = {
  prompt: string;
  options: readonly string[];
  correctAnswer: string;
  skill?: string;
  evidence?: string[];
  optionEvidence?: string[][];
};
export type GeneratedReadingTasks = {
  mcq: ReadingChoiceTask[];
  trueFalse: { prompt: string; correctAnswer: boolean }[];
  bestSummary: ReadingChoiceTask;
};

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeReadingEvidence(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((quote): quote is string => typeof quote === "string").map(quote => quote.trim()).filter(Boolean) : [];
}

export function hasTextEvidence(text: string, evidence: string[] | undefined): boolean {
  return !!evidence?.length && evidence.every(quote => normalized(quote).length >= 12 && normalized(text).includes(normalized(quote)));
}

export function hasSeparateEvidence(text: string, evidence: string[]): boolean {
  const source = normalized(text);
  const spans = evidence.map(quote => {
    const start = source.indexOf(normalized(quote));
    return { start, end: start + normalized(quote).length };
  });
  return spans.some((a, i) => spans.some((b, j) => i !== j && a.start >= 0 && b.start >= 0 && (a.end <= b.start || b.end <= a.start)));
}

function a2QualityError(tasks: GeneratedReadingTasks, text: string): string | null {
  const paragraphs = text.trim().split(/\r?\n\s*\r?\n/).filter(paragraph => paragraph.trim());
  if (paragraphs.length !== 2) return "A2 text must contain exactly two coherent paragraphs separated by a blank line.";

  const skills = ["find_information", "understand_reason", "connect_information"];
  if (tasks.mcq.length !== skills.length || skills.some(skill => tasks.mcq.filter(task => task.skill === skill).length !== 1)) {
    return "A2 needs exactly one find_information, one understand_reason and one connect_information question; three fact lookups are not enough.";
  }
  for (const task of tasks.mcq) {
    if (!hasTextEvidence(text, task.evidence)) return `A2 ${task.skill} must include exact supporting quotes from the generated text.`;
    if (task.skill === "connect_information" && !hasSeparateEvidence(text, task.evidence!)) {
      return "A2 connect_information needs at least two distinct, non-overlapping supporting quotes from different parts of the text.";
    }
  }

  const summary = tasks.bestSummary;
  if (summary.optionEvidence?.length !== summary.options.length || !summary.optionEvidence.every(evidence => hasTextEvidence(text, evidence))) {
    return "Each A2 summary option needs quotes supporting content actually in the text; use narrow true details as distractors, not invented contradictions.";
  }
  const correctIndex = summary.options.indexOf(summary.correctAnswer);
  const correctEvidence = summary.optionEvidence[correctIndex];
  if (!correctEvidence || !hasSeparateEvidence(text, correctEvidence) || !paragraphs.every(paragraph => correctEvidence.some(quote => normalized(paragraph).includes(normalized(quote))))) {
    return "The correct A2 summary needs supporting quotes from both paragraphs to represent the whole text.";
  }
  return null;
}

function b1QualityError(tasks: GeneratedReadingTasks, text: string): string | null {
  const paragraphs = text.trim().split(/\r?\n\s*\r?\n/).filter(paragraph => paragraph.trim());
  if (paragraphs.length !== 3) return "B1 text must contain exactly three coherent paragraphs separated by blank lines.";
  const skills = READING_SKILLS.B1;
  if (tasks.mcq.length !== 4 || skills.some(skill => tasks.mcq.filter(task => task.skill === skill).length !== 1)) {
    return "B1 needs exactly one find_information, understand_argument, understand_attitude and draw_inference task.";
  }
  for (const task of tasks.mcq) {
    if (!hasTextEvidence(text, task.evidence)) return `B1 ${task.skill} needs exact supporting text evidence.`;
    if (task.skill === "draw_inference" && !hasSeparateEvidence(text, task.evidence!)) return "B1 inference needs at least two distinct, non-overlapping text clues.";
  }
  if (tasks.trueFalse.length !== 3 || !tasks.trueFalse.some(task => task.correctAnswer) || !tasks.trueFalse.some(task => !task.correctAnswer)) {
    return "B1 needs three true/false statements with both true and false answers.";
  }
  const summary = tasks.bestSummary;
  if (summary.optionEvidence?.length !== summary.options.length || !summary.optionEvidence.every(evidence => hasTextEvidence(text, evidence))) {
    return "Every B1 summary option needs actual text evidence; narrower options must still be true.";
  }
  const mainEvidence = summary.optionEvidence[summary.options.indexOf(summary.correctAnswer)];
  const covered = paragraphs.filter(paragraph => mainEvidence?.some(quote => normalized(paragraph).includes(normalized(quote))));
  if (!mainEvidence || !hasSeparateEvidence(text, mainEvidence) || covered.length < 2) return "The B1 main summary needs support from at least two paragraphs.";
  return null;
}

function advancedQualityError(level: "B2" | "C1" | "C2", tasks: GeneratedReadingTasks, text: string): string | null {
  const paragraphs = text.trim().split(/\r?\n\s*\r?\n/).filter(paragraph => paragraph.trim());
  if (paragraphs.length !== 4) return `${level} text must contain exactly four coherent paragraphs separated by blank lines.`;
  const skills = READING_SKILLS[level];
  if (tasks.mcq.length !== 5 || skills.some(skill => tasks.mcq.filter(task => task.skill === skill).length !== 1)) {
    return `${level} needs one understand_attitude, understand_argument, draw_inference, vocabulary_in_context and compare_perspectives task.`;
  }
  const issues: string[] = [];
  for (const task of tasks.mcq) {
    if (!hasTextEvidence(text, task.evidence)) {
      const invalidQuotes = task.evidence?.filter(quote => !hasTextEvidence(text, [quote])) ?? [];
      issues.push(`${level} ${task.skill} needs actual supporting text evidence. Copy complete sentences verbatim from the text; do not shorten or paraphrase them. Invalid quotes: ${JSON.stringify(invalidQuotes)}.`);
    }
    const needsMultipleClues = task.skill === "draw_inference" || task.skill === "compare_perspectives"
      || (level !== "B2" && (task.skill === "understand_argument" || task.skill === "understand_attitude"));
    if (needsMultipleClues && !hasSeparateEvidence(text, task.evidence ?? [])) {
      issues.push(`${level} ${task.skill} needs at least two distinct, non-overlapping text clues.`);
    }
  }
  const summary = tasks.bestSummary;
  if (summary.optionEvidence?.length !== summary.options.length || !summary.optionEvidence.every(evidence => hasTextEvidence(text, evidence))) {
    issues.push(`Every ${level} summary option needs actual text evidence; narrower options must preserve attribution and qualifications.`);
    summary.optionEvidence?.forEach((evidence, index) => {
      const invalid = evidence.filter(quote => !hasTextEvidence(text, [quote]));
      if (invalid.length) issues.push(`Summary option ${index + 1}: replace these shortened/paraphrased quotes with verbatim sentences: ${JSON.stringify(invalid)}.`);
    });
  }
  const mainEvidence = summary.optionEvidence?.[summary.options.indexOf(summary.correctAnswer)];
  const covered = paragraphs.filter(paragraph => mainEvidence?.some(quote => normalized(paragraph).includes(normalized(quote))));
  const requiredParagraphs = level === "B2" ? 2 : 3;
  if (!mainEvidence || !hasSeparateEvidence(text, mainEvidence) || covered.length < requiredParagraphs) issues.push(`The ${level} main summary needs support from at least ${requiredParagraphs === 3 ? "three" : "two"} paragraphs.`);
  return issues.length ? issues.join("\n") : null;
}

// These checks enforce observable task quality. Whether an answer is supported
// by the text and whether the language fits CEFR still need content review.
export function readingTaskQualityError(level: CefrLevel, tasks: GeneratedReadingTasks, text: string = ""): string | null {
  const choices = [...tasks.mcq, tasks.bestSummary];
  for (const task of choices) {
    if (new Set(task.options.map(normalized)).size !== task.options.length) {
      return "Answer options must be distinct, including case and whitespace variants.";
    }
  }
  const prompts = [...tasks.mcq, ...tasks.trueFalse, tasks.bestSummary].map(task => normalized(task.prompt));
  if (new Set(prompts).size !== prompts.length) return "Each task must have a distinct question or statement.";

  if (level === "A2" || level === "B2" || level === "C1" || level === "C2") {
    const expected = level === "A2" ? 1 : 2;
    const trueCount = tasks.trueFalse.filter(task => task.correctAnswer).length;
    const falseCount = tasks.trueFalse.length - trueCount;
    if (trueCount !== expected || falseCount !== expected) {
      return `${level} must have ${expected} true and ${expected} false statements.`;
    }
  }
  if (level === "A2") return a2QualityError(tasks, text);
  if (level === "B1") return b1QualityError(tasks, text);
  if (level === "B2" || level === "C1" || level === "C2") return advancedQualityError(level, tasks, text);
  return null;
}
