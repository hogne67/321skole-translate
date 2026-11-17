import { normalizeMathWorksheetLanguage, type MathWorksheetLanguage } from "../taxonomy";
import { PLACE_VALUE_MAX_TASK_COUNT, placeValuePageCapacity } from "./printLayout";

export const PLACE_VALUE_TASK_TYPES = ["expand", "compose", "digit_value", "missing_part"] as const;
export const PLACE_VALUE_MODES = [...PLACE_VALUE_TASK_TYPES, "mixed"] as const;
export type PlaceValueSettings = { taskType: typeof PLACE_VALUE_MODES[number]; integerDigits: 1 | 2 | 3 | 4 | 5 | 6; decimalPlaces: 0 | 1 | 2 | 3; taskCount: number; showPlaceValueTable: boolean };
export type PlaceValueTask = { id: string; type: typeof PLACE_VALUE_TASK_TYPES[number]; scaledValue: number; targetExponent: number | null };
export type PlaceValueAnswer = { value: string; table: string[] };
export type PlaceValueWorksheet = { version: 1; kind: "place_value"; language: MathWorksheetLanguage; title: string; instructions: string; settings: PlaceValueSettings; tasks: PlaceValueTask[]; showAnswerKey: boolean };
export const PLACE_VALUE_TASKS_PER_PAGE = placeValuePageCapacity({ taskType: "mixed", integerDigits: 3, decimalPlaces: 0, showPlaceValueTable: true }).first;
export const DEFAULT_PLACE_VALUE_SETTINGS: PlaceValueSettings = { taskType: "mixed", integerDigits: 3, decimalPlaces: 0, taskCount: PLACE_VALUE_TASKS_PER_PAGE, showPlaceValueTable: true };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function normalizePlaceValueSettings(value: unknown): PlaceValueSettings {
  if (!record(value) || !PLACE_VALUE_MODES.includes(value.taskType as PlaceValueSettings["taskType"]) || typeof value.integerDigits !== "number" || ![1, 2, 3, 4, 5, 6].includes(value.integerDigits) || typeof value.decimalPlaces !== "number" || ![0, 1, 2, 3].includes(value.decimalPlaces) || !Number.isInteger(value.taskCount) || Number(value.taskCount) < 1 || Number(value.taskCount) > PLACE_VALUE_MAX_TASK_COUNT || typeof value.showPlaceValueTable !== "boolean") throw new Error("INVALID_SETTINGS");
  return { taskType: value.taskType as PlaceValueSettings["taskType"], integerDigits: value.integerDigits as PlaceValueSettings["integerDigits"], decimalPlaces: value.decimalPlaces as PlaceValueSettings["decimalPlaces"], taskCount: Number(value.taskCount), showPlaceValueTable: value.showPlaceValueTable };
}
export function placeValueExponents(settings: PlaceValueSettings): number[] { return Array.from({ length: settings.integerDigits + settings.decimalPlaces }, (_, i) => settings.integerDigits - 1 - i); }
export function placeValueDigit(task: PlaceValueTask, exponent: number, settings: PlaceValueSettings): number { return Math.floor(task.scaledValue / 10 ** (exponent + settings.decimalPlaces)) % 10; }
export function placeValueParts(task: PlaceValueTask, settings: PlaceValueSettings): { exponent: number; scaled: number }[] {
  const parts = placeValueExponents(settings).map(exponent => ({ exponent, scaled: placeValueDigit(task, exponent, settings) * 10 ** (exponent + settings.decimalPlaces) })).filter(part => part.scaled !== 0);
  return parts.length ? parts : [{ exponent: 0, scaled: 0 }];
}
/** All arithmetic uses integer thousandths (or the selected smaller scale). */
export function formatPlaceValueNumber(scaled: number, decimalPlaces: number, language: string, fixed = false): string {
  const digits = String(scaled).padStart(decimalPlaces + 1, "0"), whole = decimalPlaces ? digits.slice(0, -decimalPlaces) : digits;
  const fraction = decimalPlaces ? fixed ? digits.slice(-decimalPlaces) : digits.slice(-decimalPlaces).replace(/0+$/, "") : "";
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (fraction ? `${language === "en" ? "." : ","}${fraction}` : "");
}
export function placeValueNumberTokens(task: PlaceValueTask, settings: PlaceValueSettings, language: string): { text: string; exponent: number | null }[] {
  const text = formatPlaceValueNumber(task.scaledValue, settings.decimalPlaces, language, true);
  let exponent = String(Math.floor(task.scaledValue / 10 ** settings.decimalPlaces)).length - 1;
  return [...text].map(char => /\d/.test(char) ? { text: char, exponent: exponent-- } : { text: char, exponent: null });
}
export function placeValueExpansion(task: PlaceValueTask, settings: PlaceValueSettings, language: string): string { return placeValueParts(task, settings).map(part => formatPlaceValueNumber(part.scaled, settings.decimalPlaces, language)).join(" + "); }
export function placeValueExpected(task: PlaceValueTask, settings: PlaceValueSettings): number {
  return task.type === "digit_value" || task.type === "missing_part" ? placeValueDigit(task, task.targetExponent!, settings) * 10 ** (task.targetExponent! + settings.decimalPlaces) : task.scaledValue;
}
export function placeValueTaskAnswer(task: PlaceValueTask, settings: PlaceValueSettings, language: string): string { return task.type === "expand" ? placeValueExpansion(task, settings, language) : formatPlaceValueNumber(placeValueExpected(task, settings), settings.decimalPlaces, language); }
export function placeValueMissingEquation(task: PlaceValueTask, settings: PlaceValueSettings, language: string): string {
  return `${formatPlaceValueNumber(task.scaledValue, settings.decimalPlaces, language, true)} = ${placeValueParts(task, settings).map(part => part.exponent === task.targetExponent ? "□" : formatPlaceValueNumber(part.scaled, settings.decimalPlaces, language)).join(" + ")}`;
}
const places = {
  nb: ["hundretusenerplassen", "titusenerplassen", "tusenerplassen", "hundrerplassen", "tierplassen", "enerplassen", "tidelsplassen", "hundredelsplassen", "tusendelsplassen"],
  en: ["hundred thousands place", "ten thousands place", "thousands place", "hundreds place", "tens place", "ones place", "tenths place", "hundredths place", "thousandths place"],
  pt: ["centena de milhar", "dezena de milhar", "unidade de milhar", "centena", "dezena", "unidade", "décima", "centésima", "milésima"],
};
const columns = {
  nb: ["Hundretusener", "Titusener", "Tusener", "Hundrere", "Tiere", "Enere", "Tideler", "Hundredeler", "Tusendeler"],
  en: ["Hundred thousands", "Ten thousands", "Thousands", "Hundreds", "Tens", "Ones", "Tenths", "Hundredths", "Thousandths"],
  pt: ["Centenas de milhar", "Dezenas de milhar", "Unidades de milhar", "Centenas", "Dezenas", "Unidades", "Décimas", "Centésimas", "Milésimas"],
};
export function placeValueColumn(exponent: number, language: string): string { return columns[normalizeMathWorksheetLanguage(language)][5 - exponent]; }
export function placeValueTaskPrompt(task: PlaceValueTask, settings: PlaceValueSettings, language: string): string {
  const copy = getPlaceValueCopy(language), number = formatPlaceValueNumber(task.scaledValue, settings.decimalPlaces, language, true);
  const text = task.type === "expand" ? copy.expandPrompt : task.type === "compose" ? copy.composePrompt : task.type === "digit_value" ? copy.digitPrompt : copy.missingPrompt;
  return text.replace("{number}", number).replace("{sum}", placeValueExpansion(task, settings, language)).replace("{equation}", placeValueMissingEquation(task, settings, language)).replace("{digit}", String(placeValueDigit(task, task.targetExponent ?? 0, settings))).replace("{place}", places[normalizeMathWorksheetLanguage(language)][5 - (task.targetExponent ?? 0)]);
}
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function generatePlaceValueWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): PlaceValueWorksheet {
  const settings = normalizePlaceValueSettings(value), lang = normalizeMathWorksheetLanguage(language), copy = getPlaceValueCopy(lang), exponents = placeValueExponents(settings);
  const types = shuffled(PLACE_VALUE_TASK_TYPES, random), used = new Set<string>(), integer = (max: number) => Math.floor(random() * (max + 1));
  const tasks = Array.from({ length: settings.taskCount }, (_, index): PlaceValueTask => {
    const type = settings.taskType === "mixed" ? types[index % types.length] : settings.taskType;
    let task: PlaceValueTask, key: string, attempts = 0;
    do {
      // Internal zeroes are intentional: 4 083 and 0.07 practise empty places too.
      const digits = exponents.map((_, i) => i === 0 && settings.integerDigits > 1 ? 1 + integer(8) : random() < .25 ? 0 : integer(9));
      const scaledValue = Number(digits.join("")), base = { id: `place_value_${index + 1}`, type, scaledValue, targetExponent: null };
      const visible = exponents.filter(e => e <= Math.max(0, String(Math.floor(scaledValue / 10 ** settings.decimalPlaces)).length - 1));
      const eligible = type === "missing_part" ? placeValueParts(base, settings).map(part => part.exponent) : visible;
      task = { ...base, targetExponent: type === "digit_value" || type === "missing_part" ? eligible[integer(eligible.length - 1)] : null };
      key = `${type}:${scaledValue}:${task.targetExponent}`;
    } while (used.has(key) && ++attempts < 25);
    used.add(key); return task;
  });
  return { version: 1, kind: "place_value", language: lang, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey };
}
export function sanitizePlaceValueWorksheet(value: unknown): PlaceValueWorksheet | null {
  if (!record(value) || value.kind !== "place_value" || value.version !== 1 || !Array.isArray(value.tasks)) return null;
  try {
    const settings = normalizePlaceValueSettings(value.settings), ids = new Set<string>(), exponents = placeValueExponents(settings);
    if (value.tasks.length !== settings.taskCount) return null;
    const tasks = value.tasks.map((raw): PlaceValueTask => {
      if (!record(raw) || typeof raw.id !== "string" || !/^[\w-]{1,80}$/.test(raw.id) || ids.has(raw.id) || !PLACE_VALUE_TASK_TYPES.includes(raw.type as PlaceValueTask["type"]) || settings.taskType !== "mixed" && raw.type !== settings.taskType || typeof raw.scaledValue !== "number" || !Number.isInteger(raw.scaledValue) || raw.scaledValue < 0 || raw.scaledValue >= 10 ** (settings.integerDigits + settings.decimalPlaces)) throw new Error("task");
      ids.add(raw.id);
      const task = { id: raw.id, type: raw.type as PlaceValueTask["type"], scaledValue: raw.scaledValue, targetExponent: raw.targetExponent as number | null };
      if (task.type === "digit_value" || task.type === "missing_part") {
        if (typeof raw.targetExponent !== "number" || !exponents.includes(raw.targetExponent)) throw new Error("place");
        if (task.type === "digit_value" && !placeValueNumberTokens(task, settings, "nb").some(token => token.exponent === task.targetExponent)) throw new Error("invisible");
        if (task.type === "missing_part" && !placeValueParts(task, settings).some(part => part.exponent === task.targetExponent)) throw new Error("missing");
      } else if (raw.targetExponent !== null) throw new Error("target");
      return task;
    });
    const language = normalizeMathWorksheetLanguage(value.language), copy = getPlaceValueCopy(language);
    return { version: 1, kind: "place_value", language, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey: value.showAnswerKey === true };
  } catch { return null; }
}
export function readPlaceValueAnswer(value: unknown, count: number): PlaceValueAnswer {
  const text = typeof value === "string" ? value : record(value) ? value.value : "", table = record(value) && Array.isArray(value.table) ? value.table : [];
  return { value: typeof text === "string" && text.length <= 240 ? text : "", table: Array.from({ length: count }, (_, i) => typeof table[i] === "string" ? table[i].slice(0, 1) : "") };
}
export function parsePlaceValueNumber(value: string, decimalPlaces: number): number | null {
  if (value.length > 40) return null;
  const text = value.trim();
  if (!/^\+?(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,]\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.replace(/[ \u00a0\u202f+]/g, "").split(/[.,]/);
  if (fraction.slice(decimalPlaces).replaceAll("0", "")) return null;
  const scaled = Number(whole) * 10 ** decimalPlaces + Number(fraction.slice(0, decimalPlaces).padEnd(decimalPlaces, "0"));
  return Number.isSafeInteger(scaled) && scaled <= 1_000_000_000 ? scaled : null;
}
export function gradePlaceValueTask(task: PlaceValueTask, settings: PlaceValueSettings, value: unknown) {
  const answer = readPlaceValueAnswer(value, settings.integerDigits + settings.decimalPlaces);
  const isAnswered = record(value) ? typeof value.value === "string" ? !!value.value.trim() : value.value != null : typeof value === "string" ? !!value.trim() : value != null;
  let points = 0;
  if (task.type === "expand") {
    const terms = answer.value.trim().split("+").map(term => parsePlaceValueNumber(term, settings.decimalPlaces));
    if (terms.length <= 20 && terms.every((term): term is number => term !== null)) {
      const expected = placeValueParts(task, settings).map(part => part.scaled), nonzero = terms.filter(term => term !== 0), remaining = [...nonzero];
      let matches = 0;
      for (const part of expected.filter(n => n !== 0)) { const i = remaining.indexOf(part); if (i >= 0) { matches++; remaining.splice(i, 1); } }
      points = expected.every(n => n === 0) ? Number(nonzero.length === 0) : matches / Math.max(expected.length, nonzero.length);
    }
  } else points = Number(parsePlaceValueNumber(answer.value, settings.decimalPlaces) === placeValueExpected(task, settings));
  return { type: "place_value" as const, points, isCorrect: points === 1, isPartial: points > 0 && points < 1, isAnswered, studentAnswer: answer, correctAnswer: placeValueTaskAnswer(task, settings, "nb") };
}
export function gradePlaceValueWorksheet(worksheet: PlaceValueWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, { ...gradePlaceValueTask(task, worksheet.settings, answers[task.id]), correctAnswer: placeValueTaskAnswer(task, worksheet.settings, worksheet.language) }])), entries = Object.values(byTask);
  const correctAuto = entries.filter(e => e.isCorrect).length, partialAuto = entries.filter(e => e.isPartial).length, unansweredAuto = entries.filter(e => !e.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, partialAuto, wrongAuto: entries.length - correctAuto - partialAuto - unansweredAuto, unansweredAuto, percentAuto: entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.points, 0) / entries.length * 100) : 0, byTask };
}

const nb = {
  pageHint: "Med disse valgene har første ark plass til {first} oppgaver og navn, dato og klasse. Deretter er det plass til {following} oppgaver per ark. Velg eget antall ved behov.",
  title: "Tallforståelse og utvidet form", subtitle: "Del opp og sett sammen tall, finn sifferverdier og øv på plassverdi.", instructions: "Skriv på utvidet form, sett sammen tallet eller finn verdien som mangler. På utvidet form skriver du hvert siffer med verdi større enn null som et eget ledd, adskilt med +. Du kan bruke komma eller punktum som desimaltegn.",
  taskType: "Oppgavetype", expand: "Skriv på utvidet form", compose: "Sett sammen tallet", digit_value: "Finn sifferets verdi", missing_part: "Finn den manglende delen", mixed: "Blandet", integerDigits: "Antall siffer før komma", decimals: "Ta med desimaltall", decimalPlaces: "Antall desimaler", table: "Vis plassverditabell", empty: "Klar for første plassverdiark", invalid: "Velg gyldig oppgavetype, 1–6 siffer, 0–3 desimaler og 1–60 oppgaver.", answer: "Svar", partial: "Delvis riktig", tableHelp: "Bruk tabellen som støtte. Skriv svaret i svarfeltet.", markedDigit: "Markert siffer", comma: "Desimaltegn", expandPrompt: "Skriv {number} på utvidet form.", composePrompt: "Sett sammen tallet: {sum} = □", digitPrompt: "Hva er verdien til sifferet {digit} på {place} i tallet {number}?", missingPrompt: "Finn den manglende delen: {equation}",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  pageHint: "With these settings, the first sheet fits {first} tasks and name, date and class. Each following sheet fits {following} tasks. Choose a custom count if needed.", title: "Place value and expanded form", subtitle: "Partition and compose numbers, find digit values and practise place value.", instructions: "Write in expanded form, compose the number or find the missing value. In expanded form, write the value of each nonzero digit as a separate term, separated by +. You may use a comma or a point as the decimal separator.", taskType: "Task type", expand: "Write in expanded form", compose: "Compose the number", digit_value: "Find the digit value", missing_part: "Find the missing part", mixed: "Mixed", integerDigits: "Digits before the decimal separator", decimals: "Include decimals", decimalPlaces: "Decimal places", table: "Show place-value table", empty: "Ready for your first place-value worksheet", invalid: "Choose a valid task type, 1–6 digits, 0–3 decimal places and 1–60 tasks.", answer: "Answer", partial: "Partly correct", tableHelp: "Use the table for support. Write your answer in the answer field.", markedDigit: "Highlighted digit", comma: "Decimal separator", expandPrompt: "Write {number} in expanded form.", composePrompt: "Compose the number: {sum} = □", digitPrompt: "What is the value of the digit {digit} in the {place} in {number}?", missingPrompt: "Find the missing part: {equation}" };
const pt: Copy = {
  pageHint: "Com estas opções, a primeira folha inclui {first} exercícios e nome, data e turma. Cada folha seguinte inclui {following} exercícios. Podes escolher outra quantidade.", title: "Valor posicional e forma decomposta", subtitle: "Decompõe e compõe números, identifica o valor dos algarismos e pratica o valor posicional.", instructions: "Escreve na forma decomposta, compõe o número ou descobre o valor em falta. Na forma decomposta, escreve o valor de cada algarismo não nulo como uma parcela, separada por +. Podes usar vírgula ou ponto como separador decimal.", taskType: "Tipo de exercício", expand: "Escrever na forma decomposta", compose: "Compor o número", digit_value: "Descobrir o valor do algarismo", missing_part: "Descobrir a parcela em falta", mixed: "Misto", integerDigits: "Algarismos antes da vírgula", decimals: "Incluir números decimais", decimalPlaces: "Casas decimais", table: "Mostrar quadro de valor posicional", empty: "Pronto para a primeira ficha de valor posicional", invalid: "Escolhe um tipo válido, 1–6 algarismos, 0–3 casas decimais e 1–60 exercícios.", answer: "Resposta", partial: "Parcialmente correto", tableHelp: "Usa o quadro como apoio. Escreve a resposta no campo de resposta.", markedDigit: "Algarismo destacado", comma: "Separador decimal", expandPrompt: "Escreve {number} na forma decomposta.", composePrompt: "Compõe o número: {sum} = □", digitPrompt: "Qual é o valor do algarismo {digit} na posição de {place} no número {number}?", missingPrompt: "Descobre a parcela em falta: {equation}" };
export function getPlaceValueCopy(language: string): Copy { return language === "en" ? en : language === "pt" ? pt : nb; }
