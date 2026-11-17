export type PrintableReadingTask = {
  id: string;
  order?: number;
  type: "mcq" | "true_false" | "best_summary";
  prompt: string;
  options?: string[];
  correctAnswer?: string | boolean;
  enabled?: boolean;
};

export type ReadingTestPrintContent = {
  title: string;
  sourceText: string;
  level: string;
  language: string;
  tasks: PrintableReadingTask[];
  unsupportedTaskCount?: number;
  modality?: "reading" | "listening";
  plays?: number;
  listeningClips?: {taskId:string;script:string}[];
};

export type ReadingTestPrintLayout = "auto" | "after_text" | "new_page";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isReadingTestPrintLesson(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [value.lessonType, value.lesson_type, value.textType, value.type, ...(Array.isArray(value.meta) ? value.meta : [])]
    .some(marker => typeof marker === "string" && marker.trim().toLowerCase() === "reading_test");
}

/** Keep saved and legacy reading tasks out of the general lesson task renderer. */
export function readingTestPrintContent(value: unknown, fallbackTitle: string, fallbackLanguage: string): ReadingTestPrintContent {
  const lesson = isRecord(value) ? value : {};
  const config = isRecord(lesson.readingTestConfig) ? lesson.readingTestConfig : {};
  const text = (value: unknown, fallback = "") => typeof value === "string" ? value.trim() : fallback;
  let unsupportedTaskCount = 0;
  const tasks: PrintableReadingTask[] = [];
  for (const [index, raw] of (Array.isArray(lesson.tasks) ? lesson.tasks : []).entries()) {
    if (!isRecord(raw)) { unsupportedTaskCount += 1; continue; }
    if (raw.enabled === false) continue;
    const type = raw.type === "truefalse" ? "true_false" : raw.type;
    if (type !== "mcq" && type !== "true_false" && type !== "best_summary") {
      unsupportedTaskCount += 1;
      continue;
    }
    const options = Array.isArray(raw.options) ? raw.options.map(option => text(option)) : [];
    const correctAnswer = typeof raw.correctAnswer === "boolean" ? raw.correctAnswer
      : typeof raw.correctAnswer === "string" ? raw.correctAnswer.trim()
      : typeof raw.correctAnswer === "number" && Number.isInteger(raw.correctAnswer) ? options[raw.correctAnswer] : undefined;
    tasks.push({ id: text(raw.id, `reading-print-${index + 1}`), type, prompt: text(raw.prompt), options, correctAnswer,
      order: typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : 0 });
  }
  return { title: text(lesson.title) || fallbackTitle, sourceText: text(lesson.sourceText),
    level: text(config.cefrLevel) || text(lesson.level), language: text(lesson.language) || fallbackLanguage,
    tasks, unsupportedTaskCount };
}

// A4 with the 14 mm margins in readingTestPrint.css: 182 × 269 mm.
// Measure at print width instead of estimating from CEFR level or word count.
export function automaticReadingPrintLayout(contentHeight: number, contentWidth: number): Exclude<ReadingTestPrintLayout, "auto"> {
  if (contentWidth <= 0 || contentHeight <= 0) return "new_page";
  return contentHeight <= contentWidth * 269 / 182 - 2 ? "after_text" : "new_page";
}

export function orderedPrintTasks(tasks: PrintableReadingTask[]): PrintableReadingTask[] {
  return tasks.filter(task => task.enabled !== false)
    .sort((a, b) => (Number.isFinite(a.order) ? a.order! : 0) - (Number.isFinite(b.order) ? b.order! : 0));
}

export function printTrueFalseAnswer(answer: PrintableReadingTask["correctAnswer"]): boolean | null {
  if (typeof answer === "boolean") return answer;
  if (typeof answer !== "string") return null;
  const value = answer.trim().toLowerCase();
  if (["true", "sant", "verdadeiro"].includes(value)) return true;
  if (["false", "usant", "falso"].includes(value)) return false;
  return null;
}

/** This uses only the current worksheet. It neither submits nor stores learner data. */
export async function printReadingTest(): Promise<void> {
  await document.fonts?.ready;
  window.print();
}
