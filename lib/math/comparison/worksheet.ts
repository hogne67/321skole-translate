import Fraction from "fraction.js";

export const COMPARISON_FORMS = ["fraction", "decimal", "percent"] as const;
export const COMPARISON_DENOMINATORS = [2, 4, 5, 10, 20] as const;
export const COMPARISON_SIGNS = ["<", "=", ">"] as const;
export type ComparisonForm = typeof COMPARISON_FORMS[number];
export type ComparisonSign = typeof COMPARISON_SIGNS[number];
export type ComparisonSettings = {
  forms: ComparisonForm[];
  mode: "same" | "mixed";
  denominators: number[];
  visualSupport: boolean;
  taskCount: number;
};
export type ComparisonValue = { form: ComparisonForm; numerator: number; denominator: number };
export type ComparisonTask = { id: string; type: "comparison"; left: ComparisonValue; right: ComparisonValue; answer: ComparisonSign };
export type ComparisonWorksheet = {
  version: 1; kind: "comparison"; language: "nb" | "en" | "pt";
  title: string; instructions: string; settings: ComparisonSettings;
  showAnswerKey: boolean; tasks: ComparisonTask[];
};
export const DEFAULT_COMPARISON_SETTINGS: ComparisonSettings = {
  forms: ["fraction", "decimal", "percent"], mode: "mixed", denominators: [2, 4, 5, 10, 20], visualSupport: false, taskCount: 36,
};
export function normalizeComparisonSettings(value: unknown): ComparisonSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_SETTINGS");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.forms) || !raw.forms.length || raw.forms.some(form => !COMPARISON_FORMS.includes(form as ComparisonForm))) throw new Error("INVALID_FORMS");
  const forms = [...new Set(raw.forms)] as ComparisonForm[];
  if ((raw.mode !== "same" && raw.mode !== "mixed") || (raw.mode === "mixed" && forms.length < 2)) throw new Error("INVALID_MODE");
  if (!Array.isArray(raw.denominators) || (forms.includes("fraction") && !raw.denominators.length) || raw.denominators.some(d => !(COMPARISON_DENOMINATORS as readonly number[]).includes(d))) throw new Error("INVALID_DENOMINATORS");
  if (typeof raw.visualSupport !== "boolean") throw new Error("INVALID_SUPPORT");
  if (typeof raw.taskCount !== "number" || !Number.isInteger(raw.taskCount) || raw.taskCount < 1 || raw.taskCount > 100) throw new Error("INVALID_COUNT");
  return { forms, mode: raw.mode, denominators: [...new Set(raw.denominators)] as number[], visualSupport: raw.visualSupport, taskCount: raw.taskCount };
}
export function comparisonFraction(value: ComparisonValue) { return new Fraction(value.numerator, value.denominator); }
export function compareValues(left: ComparisonValue, right: ComparisonValue): ComparisonSign {
  const result = comparisonFraction(left).compare(comparisonFraction(right));
  return result < 0 ? "<" : result > 0 ? ">" : "=";
}
export function formatComparisonValue(value: ComparisonValue, language: string): string {
  if (value.form === "fraction") return `${value.numerator}/${value.denominator}`;
  if (value.form === "percent") return `${value.numerator}%`;
  const number = comparisonFraction(value).toString();
  return language === "en" ? number : number.replace(".", ",");
}
function pool(form: ComparisonForm, settings: ComparisonSettings): ComparisonValue[] {
  const denominators = form === "fraction" ? settings.denominators : [100];
  return denominators.flatMap(denominator => Array.from({ length: denominator + 1 }, (_, numerator) => ({ form, numerator, denominator })));
}
function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
export function generateComparisonWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): ComparisonWorksheet {
  const settings = normalizeComparisonSettings(value);
  const lang = language === "en" || language === "pt" ? language : "nb";
  const copy = getComparisonCopy(lang);
  const pairs = shuffle(settings.forms.flatMap(left => settings.forms.filter(right => settings.mode === "same" ? right === left : right !== left).map(right => ({ left, right }))), random);
  const pools = Object.fromEntries(settings.forms.map(form => [form, pool(form, settings)])) as Record<ComparisonForm, ComparisonValue[]>;
  const signs = shuffle([...COMPARISON_SIGNS], random);
  const used = new Set<string>();
  const tasks = Array.from({ length: settings.taskCount }, (_, i): ComparisonTask => {
    // Rotate pairs between triples so each receives all three relations.
    const pair = pairs[(Math.floor(i / 3) + i % 3) % pairs.length];
    const sign = signs[i % 3];
    const candidates = pools[pair.left].flatMap(left => {
      const right = pools[pair.right].filter(right => compareValues(left, right) === sign);
      return right.length ? [{ left, right }] : [];
    });
    let left: ComparisonValue, right: ComparisonValue, key: string;
    let attempts = 0;
    do {
      const candidate = candidates[Math.floor(random() * candidates.length)];
      left = candidate.left;
      right = candidate.right[Math.floor(random() * candidate.right.length)];
      key = `${left.form}:${left.numerator}/${left.denominator}:${right.form}:${right.numerator}/${right.denominator}`;
    } while (used.has(key) && ++attempts < 30);
    used.add(key);
    return { id: `comparison_${i + 1}`, type: "comparison", left, right, answer: sign };
  });
  shuffle(tasks, random);
  return { version: 1, kind: "comparison", language: lang, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey };
}
function sanitizeValue(value: unknown, settings: ComparisonSettings): ComparisonValue {
  if (!value || typeof value !== "object") throw new Error("value");
  const raw = value as ComparisonValue;
  if (!settings.forms.includes(raw.form) || !Number.isInteger(raw.numerator) || !Number.isInteger(raw.denominator) || raw.numerator < 0 || raw.numerator > raw.denominator ||
      (raw.form === "fraction" ? !settings.denominators.includes(raw.denominator) : raw.denominator !== 100)) throw new Error("value");
  return { form: raw.form, numerator: raw.numerator, denominator: raw.denominator };
}
export function sanitizeComparisonWorksheet(value: unknown): ComparisonWorksheet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 || raw.kind !== "comparison" || !Array.isArray(raw.tasks)) return null;
  try {
    const settings = normalizeComparisonSettings(raw.settings);
    if (raw.tasks.length !== settings.taskCount) return null;
    const ids = new Set<string>();
    const tasks = raw.tasks.map((value): ComparisonTask => {
      if (!value || typeof value !== "object") throw new Error("task");
      const task = value as ComparisonTask;
      if (task.type !== "comparison" || typeof task.id !== "string" || !/^[\w-]{1,80}$/.test(task.id) || ids.has(task.id)) throw new Error("task");
      ids.add(task.id);
      const left = sanitizeValue(task.left, settings), right = sanitizeValue(task.right, settings);
      if ((settings.mode === "same") !== (left.form === right.form)) throw new Error("mode");
      return { id: task.id, type: "comparison", left, right, answer: compareValues(left, right) };
    });
    const language = raw.language === "en" || raw.language === "pt" ? raw.language : "nb";
    const copy = getComparisonCopy(language);
    return { version: 1, kind: "comparison", language, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey: raw.showAnswerKey === true };
  } catch { return null; }
}
export function gradeComparisonTask(task: ComparisonTask, answer: unknown) {
  const expected = compareValues(task.left, task.right);
  return { type: "comparison" as const, isCorrect: answer === expected, isAnswered: answer !== undefined && answer !== null && String(answer).trim() !== "", studentAnswer: answer ?? "", correctAnswer: expected };
}
export function gradeComparisonWorksheet(worksheet: ComparisonWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeComparisonTask(task, answers[task.id])]));
  const entries = Object.values(byTask);
  const correctAuto = entries.filter(entry => entry.isCorrect).length;
  const unansweredAuto = entries.filter(entry => !entry.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, wrongAuto: entries.length - correctAuto - unansweredAuto, unansweredAuto, percentAuto: entries.length ? Math.round(correctAuto / entries.length * 100) : 0, byTask };
}
const nb = {
  title: "Sammenlign tall", subtitle: "Brøk, desimaltall og prosent.",
  instructions: "Sammenlign tallene. Velg < (mindre enn), > (større enn) eller = (lik). En hel er 1 eller 100 %.",
  forms: "Uttrykksformer", fraction: "Brøk", decimal: "Desimaltall", percent: "Prosent", mode: "Sammenligning", same: "Samme uttrykksform", mixed: "Blandet", denominators: "Nevnere", support: "Visuell støtte", generate: "Lag sammenligningsark", empty: "Klar for første sammenligningsark",
  invalidForms: "Velg minst én uttrykksform.", invalidMode: "Velg minst to uttrykksformer for blandet sammenligning.", invalidDenominators: "Velg minst én nevner.",
  less: "Mindre enn", equal: "Lik", greater: "Større enn", comparison: "Sammenligningstegn", whole: "En hel", numberLine: "Tallinje fra 0 til 1",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  title: "Compare numbers", subtitle: "Fractions, decimals and percentages.", instructions: "Compare the numbers. Choose < (less than), > (greater than) or = (equal). One whole is 1 or 100%.",
  forms: "Representations", fraction: "Fractions", decimal: "Decimals", percent: "Percentages", mode: "Comparison", same: "Same representation", mixed: "Mixed", denominators: "Denominators", support: "Visual support", generate: "Create comparison worksheet", empty: "Ready for your first comparison worksheet", invalidForms: "Select at least one representation.", invalidMode: "Select at least two representations for mixed comparisons.", invalidDenominators: "Select at least one denominator.", less: "Less than", equal: "Equal", greater: "Greater than", comparison: "Comparison sign", whole: "One whole", numberLine: "Number line from 0 to 1",
};
const pt: Copy = {
  title: "Comparar números", subtitle: "Frações, decimais e percentagens.", instructions: "Compara os números. Escolhe < (menor que), > (maior que) ou = (igual). Uma unidade é 1 ou 100%.",
  forms: "Representações", fraction: "Frações", decimal: "Decimais", percent: "Percentagens", mode: "Comparação", same: "Mesma representação", mixed: "Misto", denominators: "Denominadores", support: "Apoio visual", generate: "Criar ficha de comparação", empty: "Pronto para a primeira ficha de comparação", invalidForms: "Seleciona pelo menos uma representação.", invalidMode: "Seleciona pelo menos duas representações para comparações mistas.", invalidDenominators: "Seleciona pelo menos um denominador.", less: "Menor que", equal: "Igual", greater: "Maior que", comparison: "Sinal de comparação", whole: "Uma unidade", numberLine: "Reta numérica de 0 a 1",
};
export function getComparisonCopy(language: string): Copy { return language === "en" ? en : language === "pt" ? pt : nb; }
