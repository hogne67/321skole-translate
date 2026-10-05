import Fraction from "fraction.js";

export const LENGTH_UNITS = ["mil", "km", "m", "dm", "cm", "mm"] as const;
export const MASS_UNITS = ["t", "kg", "hg", "g", "mg"] as const;
export const VOLUME_UNITS = ["l", "dl", "cl", "ml"] as const;
export const MEASUREMENT_CATEGORIES = ["length", "mass", "volume"] as const;
export type MeasurementCategory = typeof MEASUREMENT_CATEGORIES[number];
export type MeasurementUnit = typeof LENGTH_UNITS[number] | typeof MASS_UNITS[number] | typeof VOLUME_UNITS[number];
export type MeasurementSettings = {
  category?: MeasurementCategory;
  units: MeasurementUnit[];
  minimum: number;
  maximum: number;
  allowDecimals: boolean;
  taskCount: number;
};
export type MeasurementTask = {
  id: string;
  type: "length_conversion" | "unit_conversion";
  quantity: string;
  fromUnit: MeasurementUnit;
  toUnit: MeasurementUnit;
  answer: string;
};
export type MeasurementWorksheet = {
  version: 1;
  kind: "length" | "measurement";
  language: "nb" | "en" | "pt";
  title: string;
  instructions: string;
  settings: MeasurementSettings;
  showAnswerKey: boolean;
  tasks: MeasurementTask[];
};

const exponents: Record<MeasurementUnit, number> = { mil: 7, km: 6, m: 3, dm: 2, cm: 1, mm: 0, t: 9, kg: 6, hg: 5, g: 3, mg: 0, l: 3, dl: 2, cl: 1, ml: 0 };
export const DEFAULT_MEASUREMENT_SETTINGS: MeasurementSettings = {
  category: "length", units: ["m", "cm"], minimum: 1, maximum: 1000, allowDecimals: false, taskCount: 36,
};
export function getMeasurementUnits(category: MeasurementCategory): readonly MeasurementUnit[] {
  return category === "mass" ? MASS_UNITS : category === "volume" ? VOLUME_UNITS : LENGTH_UNITS;
}
export function getMeasurementDefaults(category: MeasurementCategory): MeasurementSettings {
  return { ...DEFAULT_MEASUREMENT_SETTINGS, category, units: category === "mass" ? ["kg", "hg"] : category === "volume" ? ["l", "dl"] : ["m", "cm"] };
}
export function isMeasurementUnit(value: unknown): value is MeasurementUnit {
  return [...LENGTH_UNITS, ...MASS_UNITS, ...VOLUME_UNITS].includes(value as MeasurementUnit);
}
function categoryOfUnit(unit: MeasurementUnit): MeasurementCategory {
  return MEASUREMENT_CATEGORIES.find(category => getMeasurementUnits(category).includes(unit))!;
}
export function parseMeasurementNumber(value: unknown): Fraction | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim().replace(",", ".");
  if (!/^\d{1,16}(?:\.\d{1,12})?$/.test(text)) return null;
  try { return new Fraction(text); } catch { return null; }
}
export function convertMeasurement(quantity: string, from: MeasurementUnit, to: MeasurementUnit): string {
  if (!isMeasurementUnit(from) || !isMeasurementUnit(to) || categoryOfUnit(from) !== categoryOfUnit(to)) throw new Error("INVALID_UNITS");
  const value = parseMeasurementNumber(quantity);
  if (!value) throw new Error("INVALID_NUMBER");
  return value.mul(new Fraction(10).pow(exponents[from] - exponents[to])).toString();
}
export function normalizeMeasurementSettings(value: unknown): MeasurementSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_SETTINGS");
  const raw = value as Record<string, unknown>;
  const category = raw.category ?? "length";
  if (!MEASUREMENT_CATEGORIES.includes(category as MeasurementCategory)) throw new Error("INVALID_CATEGORY");
  const allowed = getMeasurementUnits(category as MeasurementCategory);
  if (!Array.isArray(raw.units) || raw.units.some(unit => !allowed.includes(unit as MeasurementUnit))) throw new Error("INVALID_UNITS");
  const units = [...new Set(raw.units)] as MeasurementUnit[];
  if (units.length < 2) throw new Error("INVALID_UNITS");
  const { minimum, maximum, taskCount, allowDecimals } = raw;
  if (typeof minimum !== "number" || typeof maximum !== "number" || !Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum > 100000 || minimum > maximum ||
      new Fraction(String(minimum)).mul(100).d !== BigInt(1) || new Fraction(String(maximum)).mul(100).d !== BigInt(1) ||
      typeof allowDecimals !== "boolean" || (!allowDecimals && (!Number.isInteger(minimum) || !Number.isInteger(maximum)))) throw new Error("INVALID_RANGE");
  if (typeof taskCount !== "number" || !Number.isInteger(taskCount) || taskCount < 1 || taskCount > 100) throw new Error("INVALID_COUNT");
  return { category: category as MeasurementCategory, units, minimum, maximum, allowDecimals, taskCount };
}

export function measurementPairs(settings: MeasurementSettings) {
  const precision = settings.allowDecimals ? 2 : 0;
  const resultPrecision = settings.allowDecimals ? 3 : 0;
  const scale = 10 ** precision;
  return settings.units.flatMap(fromUnit => settings.units.flatMap(toUnit => {
    if (fromUnit === toUnit) return [];
    // Tick steps guarantee exact answers within the permitted decimal precision.
    const step = 10 ** Math.max(0, precision - resultPrecision - exponents[fromUnit] + exponents[toUnit]);
    const first = new Fraction(String(settings.minimum)).mul(scale).div(step).ceil().valueOf();
    const last = new Fraction(String(settings.maximum)).mul(scale).div(step).floor().valueOf();
    return first <= last ? [{ fromUnit, toUnit, step, first, last, scale }] : [];
  }));
}
export function generateMeasurementWorksheet(settingsValue: unknown, language: string = "nb", showAnswerKey = false, random = Math.random): MeasurementWorksheet {
  const settings = normalizeMeasurementSettings(settingsValue);
  const pairs = measurementPairs(settings);
  if (!pairs.length) throw new Error("INVALID_COMBINATIONS");
  const lang = language === "en" || language === "pt" ? language : "nb";
  const copy = getMeasurementCopy(lang, settings.category);
  const tasks: MeasurementTask[] = Array.from({ length: settings.taskCount }, (_, i) => {
    const pair = pairs[i % pairs.length];
    const tick = (pair.first + Math.floor(random() * (pair.last - pair.first + 1))) * pair.step;
    const quantity = new Fraction(tick, pair.scale).toString();
    return { id: `measurement_${i + 1}`, type: "unit_conversion", quantity, fromUnit: pair.fromUnit, toUnit: pair.toUnit, answer: convertMeasurement(quantity, pair.fromUnit, pair.toUnit) };
  });
  for (let i = tasks.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
  }
  return { version: 1, kind: "measurement", language: lang, title: copy.worksheetTitle, instructions: settings.allowDecimals ? copy.decimalInstructions : copy.instructions, settings, showAnswerKey, tasks };
}
export function sanitizeMeasurementWorksheet(value: unknown): MeasurementWorksheet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if ((raw.kind !== "length" && raw.kind !== "measurement") || raw.version !== 1 || !Array.isArray(raw.tasks)) return null;
  try {
    const settings = normalizeMeasurementSettings(raw.settings);
    if (raw.kind === "length" && settings.category !== "length") return null;
    if (raw.tasks.length !== settings.taskCount) return null;
    const ids = new Set<string>();
    const tasks: MeasurementTask[] = raw.tasks.map(value => {
      if (!value || typeof value !== "object") throw new Error("task");
      const task = value as Record<string, unknown>;
      if ((task.type !== "length_conversion" && task.type !== "unit_conversion") || (task.type === "length_conversion" && settings.category !== "length") || typeof task.id !== "string" || !/^[\w-]{1,80}$/.test(task.id) || ids.has(task.id) || !isMeasurementUnit(task.fromUnit) || !isMeasurementUnit(task.toUnit) || task.fromUnit === task.toUnit || !settings.units.includes(task.fromUnit) || !settings.units.includes(task.toUnit)) throw new Error("task");
      ids.add(task.id);
      const quantity = parseMeasurementNumber(task.quantity);
      if (!quantity || quantity.compare(settings.minimum) < 0 || quantity.compare(settings.maximum) > 0 || quantity.mul(settings.allowDecimals ? 100 : 1).d !== BigInt(1)) throw new Error("quantity");
      const answer = convertMeasurement(quantity.toString(), task.fromUnit, task.toUnit);
      if (new Fraction(answer).mul(settings.allowDecimals ? 1000 : 1).d !== BigInt(1)) throw new Error("answer");
      return { id: task.id, type: task.type, quantity: quantity.toString(), fromUnit: task.fromUnit, toUnit: task.toUnit, answer };
    });
    const language = raw.language === "en" || raw.language === "pt" ? raw.language : "nb";
    const copy = getMeasurementCopy(language, settings.category);
    return { version: 1, kind: raw.kind, language, title: copy.worksheetTitle, instructions: settings.allowDecimals ? copy.decimalInstructions : copy.instructions, settings, tasks, showAnswerKey: raw.showAnswerKey === true };
  } catch { return null; }
}
export function isMeasurementWorksheet(value: unknown): value is MeasurementWorksheet {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.title === "string" && typeof raw.instructions === "string" &&
    ["nb", "en", "pt"].includes(String(raw.language)) && typeof raw.showAnswerKey === "boolean" &&
    sanitizeMeasurementWorksheet(value) !== null;
}
export function gradeMeasurementTask(task: MeasurementTask, answer: unknown) {
  const student = parseMeasurementNumber(answer);
  const expected = convertMeasurement(task.quantity, task.fromUnit, task.toUnit);
  const isAnswered = answer !== undefined && answer !== null && String(answer).trim() !== "";
  return { type: "measurement" as const, isCorrect: student?.equals(new Fraction(expected)) ?? false, isAnswered, studentAnswer: answer ?? "", correctAnswer: expected };
}
export function gradeMeasurementWorksheet(worksheet: MeasurementWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeMeasurementTask(task, answers[task.id])]));
  const entries = Object.values(byTask);
  const correctAuto = entries.filter(entry => entry.isCorrect).length;
  const unansweredAuto = entries.filter(entry => !entry.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, wrongAuto: entries.length - correctAuto - unansweredAuto, unansweredAuto, percentAuto: entries.length ? Math.round(correctAuto / entries.length * 100) : 0, byTask };
}
const nb = {
  generatorTitle: "Omregning av enheter", category: "Måling", length: "Lengde", mass: "Vekt", volume: "Volum", tonne: "t (tonn)", generatorSubtitle: "Lengde, vekt og volum.",
  title: "Lengde", subtitle: "Omregning mellom lengdeenheter.", worksheetTitle: "Lengde – omregning av enheter",
  instructions: "Gjør om til enheten som står etter svarfeltet. Skriv bare tallet.",
  decimalInstructions: "Gjør om til enheten som står etter svarfeltet. Skriv bare tallet. Du kan bruke komma eller punktum i desimaltall.",
  units: "Enheter", count: "Antall oppgaver", range: "Tall i oppgaven", minimum: "Minst", maximum: "Størst", decimals: "Tillat desimaltall", key: "Vis fasit",
  generate: "Lag lengdeark", save: "Lagre til mitt innhold", share: "Del til Spaces", print: "Skriv ut / lagre som PDF", empty: "Klar for første lengdeark",
  invalidUnits: "Velg minst to enheter.", invalidRange: "Velg et gyldig tallområde fra 0 til 100 000. Bruk hele tall når desimaltall er slått av.", invalidCount: "Velg fra 1 til 100 oppgaver.", invalidCombinations: "Tallområdet gir ingen omregninger uten avrunding. Endre tallområdet, enhetene eller tillat desimaltall.",
  limitedPairs: "Noen retninger krever andre tall. Arket bruker retningene som går nøyaktig opp i valgt tallområde.",
  mil: "mil (10 km)", name: "Navn", date: "Dato", className: "Klasse", answer: "Svar", task: "Oppgave", correct: "Riktig", wrong: "Feil", unanswered: "Ubesvart", score: "Score", answerKey: "Fasit", worksheet: "Arbeidsark",
  busy: "Jobber…", saved: "Lagret til mitt innhold.", shared: "Delt til Spaces.", login: "Logg inn for å lagre og dele.", failed: "Noe gikk galt. Prøv igjen.", openContent: "Åpne Mitt innhold", selectSpace: "Velg Space", close: "Lukk", noSpaces: "Ingen Spaces funnet.", searchSpaces: "Søk i Spaces", shareHere: "Del her",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  generatorTitle: "Unit conversion", category: "Measurement", length: "Length", mass: "Mass", volume: "Volume", tonne: "t (tonne)", generatorSubtitle: "Length, mass and volume.",
  title: "Length", subtitle: "Convert between units of length.", worksheetTitle: "Length – unit conversion", instructions: "Convert to the unit after the answer box. Write only the number.", decimalInstructions: "Convert to the unit after the answer box. Write only the number. You may use a comma or a decimal point.",
  units: "Units", count: "Number of tasks", range: "Numbers in tasks", minimum: "Minimum", maximum: "Maximum", decimals: "Allow decimals", key: "Show answer key", generate: "Create worksheet", save: "Save to My Content", share: "Share to Spaces", print: "Print / save as PDF", empty: "Ready for your first length worksheet",
  invalidUnits: "Select at least two units.", invalidRange: "Choose a valid range from 0 to 100,000. Use whole numbers when decimals are off.", invalidCount: "Choose 1 to 100 tasks.", invalidCombinations: "No exact conversions fit this range. Change the numbers, units or allow decimals.", limitedPairs: "Some directions need other numbers. This worksheet uses directions with exact answers in your range.",
  mil: "Norwegian mil (10 km)", name: "Name", date: "Date", className: "Class", answer: "Answer", task: "Task", correct: "Correct", wrong: "Incorrect", unanswered: "Unanswered", score: "Score", answerKey: "Answer key", worksheet: "Worksheet", busy: "Working…", saved: "Saved to My Content.", shared: "Shared to Spaces.", login: "Sign in to save and share.", failed: "Something went wrong. Please try again.", openContent: "Open My Content", selectSpace: "Select Space", close: "Close", noSpaces: "No Spaces found.", searchSpaces: "Search Spaces", shareHere: "Share here",
};
const pt: Copy = {
  ...en,
  generatorTitle: "Conversão de unidades", category: "Grandeza", length: "Comprimento", mass: "Massa", volume: "Volume", tonne: "t (tonelada)", generatorSubtitle: "Comprimento, massa e volume.",
  title: "Comprimento", subtitle: "Conversão entre unidades de comprimento.", worksheetTitle: "Comprimento – conversão de unidades", instructions: "Converte para a unidade depois da caixa de resposta. Escreve apenas o número.", decimalInstructions: "Converte para a unidade depois da caixa de resposta. Escreve apenas o número. Podes usar vírgula ou ponto decimal.", units: "Unidades", count: "Número de exercícios", range: "Números nos exercícios", minimum: "Mínimo", maximum: "Máximo", decimals: "Permitir decimais", key: "Mostrar soluções", generate: "Criar ficha", save: "Guardar no Meu conteúdo", share: "Partilhar nos Spaces", print: "Imprimir / guardar como PDF", empty: "Pronto para a primeira ficha", invalidUnits: "Seleciona pelo menos duas unidades.", invalidRange: "Escolhe um intervalo válido entre 0 e 100 000. Usa números inteiros quando os decimais estão desativados.", invalidCount: "Escolhe entre 1 e 100 exercícios.", invalidCombinations: "Não há conversões exatas neste intervalo. Altera os números, as unidades ou permite decimais.", limitedPairs: "Algumas direções precisam de outros números. A ficha usa direções com respostas exatas neste intervalo.", mil: "mil norueguês (10 km)", name: "Nome", date: "Data", className: "Turma", answer: "Resposta", task: "Exercício", correct: "Correto", wrong: "Incorreto", unanswered: "Sem resposta", score: "Pontuação", answerKey: "Soluções", worksheet: "Ficha", busy: "A processar…", saved: "Guardado no Meu conteúdo.", shared: "Partilhado nos Spaces.", login: "Inicia sessão para guardar e partilhar.", failed: "Ocorreu um erro. Tenta novamente.", openContent: "Abrir Meu conteúdo", selectSpace: "Selecionar Space", close: "Fechar", noSpaces: "Nenhum Space encontrado.", searchSpaces: "Pesquisar Spaces", shareHere: "Partilhar aqui",
};
export function getMeasurementCopy(language: string, category: MeasurementCategory = "length"): Copy {
  const copy = language === "en" ? en : language === "pt" ? pt : nb;
  if (category === "length") return copy;
  const title = copy[category];
  return { ...copy, title, worksheetTitle: language === "en" ? `${title} – unit conversion` : language === "pt" ? `${title} – conversão de unidades` : `${title} – omregning av enheter`,
    generate: language === "en" ? "Create worksheet" : language === "pt" ? "Criar ficha" : category === "mass" ? "Lag vektark" : "Lag volumark",
    empty: language === "en" ? `Ready for your first ${title.toLowerCase()} worksheet` : language === "pt" ? "Pronto para a primeira ficha" : category === "mass" ? "Klar for første vektark" : "Klar for første volumark" };
}
export function formatMeasurement(value: string, language: string) { return language === "en" ? value : value.replace(".", ","); }
