import Fraction from "fraction.js";
import { normalizeMathWorksheetLanguage, type MathWorksheetLanguage } from "../taxonomy";

export const NUMBER_LINE_TYPES = ["read", "missing", "place"] as const;
export const NUMBER_LINE_MODES = [...NUMBER_LINE_TYPES, "mixed"] as const;
export const NUMBER_LINE_FORMS = ["integers", "decimals", "fractions"] as const;
export const NUMBER_LINE_STEPS = {
  integers: ["1", "2", "5", "10", "20", "50", "100"],
  decimals: ["0.1", "0.2", "0.5", "1"],
  fractions: ["1/2", "1/3", "1/4", "1/5", "1/8", "1/10"],
} as const;
export type NumberLineType = typeof NUMBER_LINE_TYPES[number];
export type NumberLineMode = typeof NUMBER_LINE_MODES[number];
export type NumberLineForm = typeof NUMBER_LINE_FORMS[number];
export type NumberLineSettings = {
  taskType: NumberLineMode; form: NumberLineForm; minimum: number; maximum: number;
  step: string; intervals: number; taskCount: number; showSupport: boolean;
};
export type NumberLineTask = { id: string; type: NumberLineType; start: string; step: string; intervals: number; targetIndex: number };
export type NumberLineWorksheet = {
  version: 1; kind: "number_line"; language: MathWorksheetLanguage; title: string; instructions: string;
  settings: NumberLineSettings; tasks: NumberLineTask[]; showAnswerKey: boolean;
};
export const NUMBER_LINE_TASKS_PER_PAGE = 6;
export const DEFAULT_NUMBER_LINE_SETTINGS: NumberLineSettings = {
  taskType: "mixed", form: "integers", minimum: 0, maximum: 20,
  step: "1", intervals: 10, taskCount: 6, showSupport: false,
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function parseNumberLineAnswer(value: unknown): Fraction | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const text = value.trim().replaceAll("−", "-").replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*[+-]?\d+)?$/.test(text)) return null;
  try {
    const parts = text.split("/");
    const result = parts.length === 2 ? new Fraction(parts[0].trim()).div(parts[1].trim()) : new Fraction(text);
    return Math.abs(result.valueOf()) <= 1000000 ? result : null;
  } catch { return null; }
}

function startBounds(settings: NumberLineSettings): [number, number] {
  const step = new Fraction(settings.step);
  return [new Fraction(settings.minimum).div(step).ceil().valueOf(), new Fraction(settings.maximum).div(step).floor().valueOf() - settings.intervals];
}
export function normalizeNumberLineSettings(value: unknown): NumberLineSettings {
  if (!record(value)) throw new Error("INVALID_SETTINGS");
  if (!NUMBER_LINE_MODES.includes(value.taskType as NumberLineMode)) throw new Error("INVALID_TYPE");
  if (!NUMBER_LINE_FORMS.includes(value.form as NumberLineForm)) throw new Error("INVALID_FORM");
  const form = value.form as NumberLineForm;
  if (typeof value.minimum !== "number" || typeof value.maximum !== "number" || !Number.isFinite(value.minimum) || !Number.isFinite(value.maximum) || value.minimum < -1000 || value.maximum > 1000 || value.minimum >= value.maximum) throw new Error("INVALID_RANGE");
  if (form !== "decimals" && (!Number.isInteger(value.minimum) || !Number.isInteger(value.maximum))) throw new Error("INVALID_RANGE");
  if (typeof value.step !== "string" || !(NUMBER_LINE_STEPS[form] as readonly string[]).includes(value.step)) throw new Error("INVALID_STEP");
  if (!Number.isInteger(value.intervals) || Number(value.intervals) < 4 || Number(value.intervals) > 10) throw new Error("INVALID_INTERVALS");
  if (!Number.isInteger(value.taskCount) || Number(value.taskCount) < 1 || Number(value.taskCount) > 60) throw new Error("INVALID_COUNT");
  if (typeof value.showSupport !== "boolean") throw new Error("INVALID_SUPPORT");
  const settings: NumberLineSettings = {
    taskType: value.taskType as NumberLineMode, form, minimum: value.minimum, maximum: value.maximum,
    step: value.step, intervals: Number(value.intervals), taskCount: Number(value.taskCount), showSupport: value.showSupport,
  };
  const [first, last] = startBounds(settings);
  if (first > last) throw new Error("INVALID_COMBINATIONS");
  return settings;
}

export function numberLineValue(task: NumberLineTask, index = task.targetIndex): Fraction {
  return new Fraction(task.start).add(new Fraction(task.step).mul(index));
}
export function formatNumberLineValue(value: Fraction | string, form: NumberLineForm, language: string): string {
  const number = new Fraction(value);
  const text = form === "fractions" ? number.toFraction() : number.toString();
  return language === "en" ? text : text.replace(".", ",");
}
export function numberLinePrompt(task: NumberLineTask, settings: NumberLineSettings, language: string): string {
  const copy = getNumberLineCopy(language);
  return task.type === "place" ? copy.placePrompt.replace("{value}", formatNumberLineValue(numberLineValue(task), settings.form, language)) : task.type === "missing" ? copy.missingPrompt : copy.readPrompt;
}
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}
export function generateNumberLineWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): NumberLineWorksheet {
  const settings = normalizeNumberLineSettings(value), lang = normalizeMathWorksheetLanguage(language), copy = getNumberLineCopy(lang);
  const [first, last] = startBounds(settings);
  const types = settings.taskType === "mixed" ? shuffle([...NUMBER_LINE_TYPES], random) : [settings.taskType];
  const used = new Set<string>();
  const tasks = Array.from({ length: settings.taskCount }, (_, index): NumberLineTask => {
    let start: string, targetIndex: number, key: string, tries = 0;
    const type = types[index % types.length];
    do {
      start = new Fraction(settings.step).mul(first + Math.floor(random() * (last - first + 1))).toFraction();
      targetIndex = 1 + Math.floor(random() * (settings.intervals - 1));
      key = `${type}:${start}:${targetIndex}`;
    } while (used.has(key) && ++tries < 30);
    used.add(key);
    return { id: `number_line_${index + 1}`, type, start, step: settings.step, intervals: settings.intervals, targetIndex };
  });
  return { version: 1, kind: "number_line", language: lang, title: copy.title, instructions: copy.instructions, settings, tasks: shuffle(tasks, random), showAnswerKey };
}

export function sanitizeNumberLineWorksheet(value: unknown): NumberLineWorksheet | null {
  if (!record(value) || value.kind !== "number_line" || value.version !== 1 || !Array.isArray(value.tasks)) return null;
  try {
    const settings = normalizeNumberLineSettings(value.settings);
    if (value.tasks.length !== settings.taskCount) return null;
    const ids = new Set<string>(), [first, last] = startBounds(settings);
    const tasks = value.tasks.map((raw): NumberLineTask => {
      if (!record(raw) || typeof raw.id !== "string" || !/^[\w-]{1,80}$/.test(raw.id) || ids.has(raw.id)) throw new Error("task");
      if (!NUMBER_LINE_TYPES.includes(raw.type as NumberLineType) || (settings.taskType !== "mixed" && raw.type !== settings.taskType) || raw.step !== settings.step || raw.intervals !== settings.intervals) throw new Error("type");
      if (!Number.isInteger(raw.targetIndex) || Number(raw.targetIndex) < 1 || Number(raw.targetIndex) >= settings.intervals) throw new Error("target");
      const start = parseNumberLineAnswer(raw.start);
      if (!start) throw new Error("start");
      const index = start.div(settings.step);
      if (index.d !== BigInt(1) || index.compare(first) < 0 || index.compare(last) > 0) throw new Error("range");
      ids.add(raw.id);
      return { id: raw.id, type: raw.type as NumberLineType, start: start.toFraction(), step: settings.step, intervals: settings.intervals, targetIndex: Number(raw.targetIndex) };
    });
    const language = normalizeMathWorksheetLanguage(value.language), copy = getNumberLineCopy(language);
    return { version: 1, kind: "number_line", language, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey: value.showAnswerKey === true };
  } catch { return null; }
}
export function gradeNumberLineTask(task: NumberLineTask, answer: unknown) {
  const value = parseNumberLineAnswer(answer), expected = numberLineValue(task);
  const isAnswered = typeof answer === "string" ? answer.trim() !== "" : answer !== undefined && answer !== null;
  return { type: "number_line" as const, isCorrect: !!value && value.equals(expected), isAnswered, studentAnswer: answer ?? "", correctAnswer: expected.toFraction() };
}
export function gradeNumberLineWorksheet(worksheet: NumberLineWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeNumberLineTask(task, answers[task.id])]));
  const entries = Object.values(byTask), correctAuto = entries.filter(entry => entry.isCorrect).length, unansweredAuto = entries.filter(entry => !entry.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, wrongAuto: entries.length - correctAuto - unansweredAuto, unansweredAuto, percentAuto: entries.length ? Math.round(correctAuto / entries.length * 100) : 0, byTask };
}

const nb = {
  title: "Tallinje", subtitle: "Les av, finn manglende tall og plasser tall på tallinjen.",
  instructions: "Se på tallinjen og løs oppgavene. Merkene har like stor avstand. Du kan skrive brøk eller desimaltall som svar.",
  taskType: "Oppgavetype", read: "Les av markert tall", missing: "Finn tallet som mangler", place: "Plasser et tall", mixed: "Blandet",
  form: "Talltype", integers: "Heltall", decimals: "Desimaltall", fractions: "Brøk", range: "Tallområde", step: "Avstand mellom merkene", intervals: "Antall intervaller", support: "Vis flere støttetall", empty: "Klar for første tallinjeark",
  readPrompt: "Hvilket tall er merket med A?", missingPrompt: "Skriv tallet som mangler i ruten.", placePrompt: "Plasser {value} på tallinjen.",
  selectMark: "Velg et merke på tallinjen, eller skriv tallet i svarfeltet.", mark: "Merke", lineDescription: "Tallinje fra {start} til {end} med {count} like store intervaller.", marked: "A er ved merke {index}, regnet fra venstre endepunkt som merke 0.",
  missingPosition: "Ruten er ved merke {index}, regnet fra venstre endepunkt som merke 0.", positionKey: "Merkenummer viser antall intervaller fra venstre endepunkt, som er merke 0.",
  invalid: "Velg et gyldig tallområde mellom −1000 og 1000, 4–10 intervaller og 1–60 oppgaver. Bruk hele grenser for heltall og brøk.", incompatible: "Tallområdet er for lite for denne avstanden og dette antallet intervaller. Utvid området eller velg færre intervaller eller mindre avstand.",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  title: "Number line", subtitle: "Read marked numbers, find missing numbers and place numbers on a number line.",
  instructions: "Look at each number line and complete the tasks. The marks are equally spaced. You may answer with a fraction or a decimal.",
  taskType: "Task type", read: "Read a marked number", missing: "Find the missing number", place: "Place a number", mixed: "Mixed",
  form: "Number type", integers: "Integers", decimals: "Decimals", fractions: "Fractions", range: "Number range", step: "Distance between marks", intervals: "Number of intervals", support: "Show extra reference numbers", empty: "Ready for your first number line worksheet",
  readPrompt: "Which number is marked A?", missingPrompt: "Write the number missing from the box.", placePrompt: "Place {value} on the number line.",
  selectMark: "Choose a mark on the number line, or type the number in the answer field.", mark: "Mark", lineDescription: "Number line from {start} to {end} with {count} equal intervals.", marked: "A is at mark {index}, counting from the left endpoint as mark 0.",
  missingPosition: "The box is at mark {index}, counting the left endpoint as mark 0.", positionKey: "Mark numbers count intervals from the left endpoint, which is mark 0.",
  invalid: "Choose a valid range between −1000 and 1000, 4–10 intervals and 1–60 tasks. Use whole-number bounds for integers and fractions.", incompatible: "The range is too small for this spacing and number of intervals. Widen the range, reduce the number of intervals or use smaller spacing.",
};
const pt: Copy = {
  title: "Reta numérica", subtitle: "Ler números assinalados, encontrar números em falta e colocar números na reta numérica.",
  instructions: "Observa cada reta numérica e resolve os exercícios. As marcas estão à mesma distância. Podes responder com uma fração ou um número decimal.",
  taskType: "Tipo de exercício", read: "Ler um número assinalado", missing: "Encontrar o número em falta", place: "Colocar um número", mixed: "Misto",
  form: "Tipo de número", integers: "Números inteiros", decimals: "Números decimais", fractions: "Frações", range: "Intervalo de números", step: "Distância entre marcas", intervals: "Número de intervalos", support: "Mostrar mais números de referência", empty: "Pronto para a primeira ficha de retas numéricas",
  readPrompt: "Que número está assinalado com A?", missingPrompt: "Escreve o número que falta na caixa.", placePrompt: "Coloca {value} na reta numérica.",
  selectMark: "Escolhe uma marca na reta numérica ou escreve o número no campo de resposta.", mark: "Marca", lineDescription: "Reta numérica de {start} a {end} com {count} intervalos iguais.", marked: "A está na marca {index}, contando a extremidade esquerda como marca 0.",
  missingPosition: "A caixa está na marca {index}, contando a extremidade esquerda como marca 0.", positionKey: "Os números das marcas contam os intervalos a partir da extremidade esquerda, que é a marca 0.",
  invalid: "Escolhe um intervalo válido entre −1000 e 1000, 4–10 intervalos e 1–60 exercícios. Usa limites inteiros para números inteiros e frações.", incompatible: "O intervalo é demasiado pequeno para esta distância e este número de intervalos. Aumenta o intervalo, reduz o número de intervalos ou usa uma distância menor.",
};
export function getNumberLineCopy(language: string): Copy { return language === "en" ? en : language === "pt" ? pt : nb; }
