import { normalizeMathWorksheetLanguage, type MathWorksheetLanguage } from "../taxonomy";
import { POWERS_MAX_TASK_COUNT, powersPageCapacity } from "./printLayout";

export const POWERS_TASK_TYPES = ["write_power", "expand", "evaluate", "power_rules"] as const;
export const POWERS_MODES = [...POWERS_TASK_TYPES, "mixed"] as const;
export const POWERS_RULE_OPERATIONS = ["mixed", "multiply", "divide"] as const;
export type PowersSettings = { taskType: typeof POWERS_MODES[number]; maxBase: number; maxExponent: number; taskCount: number; includeZeroExponent: boolean; ruleOperation: typeof POWERS_RULE_OPERATIONS[number]; showSupport: boolean };
export type PowersTask = { id: string; type: typeof POWERS_TASK_TYPES[number]; base: number; exponent: number; operation: "multiply" | "divide" | null; otherExponent: number | null };
export type PowersAnswer = { base: string; exponent: string; value: string };
export type PowersWorksheet = { version: 1; kind: "powers"; language: MathWorksheetLanguage; title: string; instructions: string; settings: PowersSettings; tasks: PowersTask[]; showAnswerKey: boolean };
export const POWERS_TASKS_PER_PAGE = powersPageCapacity({ taskType: "mixed", showSupport: false }).first;
export function powersTasksPerPage(settings: PowersSettings): number { return powersPageCapacity(settings).first; }
export const DEFAULT_POWERS_SETTINGS: PowersSettings = { taskType: "mixed", maxBase: 10, maxExponent: 4, taskCount: POWERS_TASKS_PER_PAGE, includeZeroExponent: false, ruleOperation: "mixed", showSupport: false };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integerIn = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

export function normalizePowersSettings(value: unknown): PowersSettings {
  if (!record(value) || !POWERS_MODES.includes(value.taskType as PowersSettings["taskType"]) || !integerIn(value.maxBase, 2, 12) || !integerIn(value.maxExponent, 2, 6) || !integerIn(value.taskCount, 1, POWERS_MAX_TASK_COUNT) || typeof value.includeZeroExponent !== "boolean" || !POWERS_RULE_OPERATIONS.includes(value.ruleOperation as PowersSettings["ruleOperation"]) || typeof value.showSupport !== "boolean") throw new Error("INVALID_SETTINGS");
  return { taskType: value.taskType as PowersSettings["taskType"], maxBase: value.maxBase, maxExponent: value.maxExponent, taskCount: value.taskCount, includeZeroExponent: value.includeZeroExponent, ruleOperation: value.ruleOperation as PowersSettings["ruleOperation"], showSupport: value.showSupport };
}
const superscripts = "⁰¹²³⁴⁵⁶⁷⁸⁹";
export function formatPower(base: number, exponent: number): string { return `${base}${String(exponent).split("").map(n => superscripts[Number(n)]).join("")}`; }
export function powersResultExponent(task: Pick<PowersTask, "type" | "exponent" | "operation" | "otherExponent">): number { return task.type !== "power_rules" ? task.exponent : task.operation === "multiply" ? task.exponent + task.otherExponent! : task.exponent - task.otherExponent!; }
export function powersProduct(task: PowersTask): string { return Array<string>(task.exponent).fill(String(task.base)).join(" × "); }
function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
function candidates(type: PowersTask["type"], settings: PowersSettings, operation: PowersTask["operation"]): Omit<PowersTask, "id">[] {
  const result: Omit<PowersTask, "id">[] = [], minimum = settings.includeZeroExponent ? 0 : 1;
  for (let base = 2; base <= settings.maxBase; base++) {
    for (let exponent = type === "expand" || type === "write_power" ? 2 : minimum; exponent <= settings.maxExponent; exponent++) {
      if (type !== "power_rules") { result.push({ type, base, exponent, operation: null, otherExponent: null }); continue; }
      for (let otherExponent = minimum; otherExponent <= settings.maxExponent; otherExponent++) {
        const task = { type, base, exponent, operation, otherExponent }, answerExponent = powersResultExponent(task);
        if (answerExponent >= minimum && answerExponent <= settings.maxExponent) result.push(task);
      }
    }
  }
  return result;
}
export function generatePowersWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): PowersWorksheet {
  const settings = normalizePowersSettings(value), lang = normalizeMathWorksheetLanguage(language), copy = getPowersCopy(lang);
  const types = shuffled(POWERS_TASK_TYPES, random), operations = shuffled(["multiply", "divide"] as const, random), pools = new Map<string, Omit<PowersTask, "id">[]>();
  let ruleIndex = 0;
  const tasks = Array.from({ length: settings.taskCount }, (_, i): PowersTask => {
    const type = settings.taskType === "mixed" ? types[i % types.length] : settings.taskType;
    const operation = type === "power_rules" ? settings.ruleOperation === "mixed" ? operations[ruleIndex++ % 2] : settings.ruleOperation : null;
    const key = `${type}_${operation}`;
    let pool = pools.get(key);
    if (!pool?.length) { pool = shuffled(candidates(type, settings, operation), random); pools.set(key, pool); }
    return { ...pool.pop()!, id: `powers_${i + 1}` };
  });
  return { version: 1, kind: "powers", language: lang, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey };
}
export function sanitizePowersWorksheet(value: unknown): PowersWorksheet | null {
  if (!record(value) || value.kind !== "powers" || value.version !== 1 || !Array.isArray(value.tasks)) return null;
  try {
    const settings = normalizePowersSettings(value.settings), ids = new Set<string>();
    if (value.tasks.length !== settings.taskCount) return null;
    const minimum = settings.includeZeroExponent ? 0 : 1;
    const tasks = value.tasks.map((raw): PowersTask => {
      if (!record(raw) || typeof raw.id !== "string" || !/^[\w-]{1,80}$/.test(raw.id) || ids.has(raw.id) || !POWERS_TASK_TYPES.includes(raw.type as PowersTask["type"]) || settings.taskType !== "mixed" && raw.type !== settings.taskType || !integerIn(raw.base, 2, settings.maxBase) || !integerIn(raw.exponent, raw.type === "expand" || raw.type === "write_power" ? 2 : minimum, settings.maxExponent)) throw new Error("INVALID_TASK");
      const type = raw.type as PowersTask["type"];
      if (type === "power_rules") {
        if (raw.operation !== "multiply" && raw.operation !== "divide" || settings.ruleOperation !== "mixed" && raw.operation !== settings.ruleOperation || !integerIn(raw.otherExponent, minimum, settings.maxExponent)) throw new Error("INVALID_RULE");
      } else if (raw.operation !== null || raw.otherExponent !== null) throw new Error("INVALID_TASK");
      const task: PowersTask = { id: raw.id, type, base: raw.base, exponent: raw.exponent, operation: raw.operation as PowersTask["operation"], otherExponent: raw.otherExponent as number | null };
      if (type === "power_rules" && !integerIn(powersResultExponent(task), minimum, settings.maxExponent)) throw new Error("INVALID_RULE_RESULT");
      ids.add(task.id); return task;
    });
    const language = normalizeMathWorksheetLanguage(typeof value.language === "string" ? value.language : "nb"), copy = getPowersCopy(language);
    return { version: 1, kind: "powers", language, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey: value.showAnswerKey === true };
  } catch { return null; }
}
/** Parse a single power only; never evaluate an expression. */
export function parsePower(value: string): { base: string; exponent: string } | null {
  if (value.length > 80) return null;
  const text = value.trim().replace(/([0-9])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, digit: string, exponent: string) => `${digit}^${[...exponent].map(c => superscripts.indexOf(c)).join("")}`);
  const match = text.match(/^(\d{1,8})\s*\^\s*(\d{1,3})$/);
  return match ? { base: match[1], exponent: match[2] } : null;
}
export function readPowersAnswer(value: unknown): PowersAnswer {
  const field = (v: unknown, length: number) => typeof v === "string" ? v.slice(0, length) : "";
  if (typeof value === "string") return { ...(parsePower(value) ?? { base: "", exponent: "" }), value: field(value, 240) };
  if (!record(value)) return { base: "", exponent: "", value: "" };
  return { base: field(value.base, 12), exponent: field(value.exponent, 12), value: field(value.value, 240) };
}
function parseInteger(value: string, maximum: number): number | null {
  if (value.length > 40 || !/^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)$/.test(value.trim())) return null;
  const result = Number(value.trim().replace(/[ \u00a0\u202f]/g, ""));
  return Number.isSafeInteger(result) && result >= 0 && result <= maximum ? result : null;
}
export function parsePowersProduct(value: string): number[] | null {
  if (!value.trim() || value.length > 240) return null;
  const parts = value.split(/[×*xX·]/);
  if (parts.length < 2 || parts.length > 24) return null;
  const terms = parts.map(part => /^\s*\d{1,8}\s*$/.test(part) ? Number(part.trim()) : null);
  return terms.every((term): term is number => term !== null && term >= 1 && term <= 10000000) ? terms : null;
}
export function powersTaskAnswer(task: PowersTask): string {
  return task.type === "expand" ? powersProduct(task) : task.type === "evaluate" ? String(task.base ** task.exponent) : formatPower(task.base, powersResultExponent(task));
}
export function gradePowersTask(task: PowersTask, value: unknown) {
  const answer = readPowersAnswer(value);
  const powerTask = task.type === "write_power" || task.type === "power_rules";
  const isAnswered = record(value) ? powerTask ? [value.base, value.exponent, value.value].some(v => typeof v === "string" ? !!v.trim() : v != null) : typeof value.value === "string" ? !!value.value.trim() : value.value != null : typeof value === "string" ? !!value.trim() : value != null;
  let points = 0;
  if (powerTask) {
    const parsed = !answer.base.trim() && !answer.exponent.trim() ? parsePower(answer.value) : null;
    const base = parseInteger(parsed?.base ?? answer.base, 10000000), exponent = parseInteger(parsed?.exponent ?? answer.exponent, 999);
    points = (Number(base === task.base) + Number(exponent === powersResultExponent(task))) / 2;
  } else if (task.type === "expand") {
    const terms = parsePowersProduct(answer.value);
    if (terms) points = Math.min(task.exponent, terms.filter(n => n === task.base).length) / Math.max(task.exponent, terms.length);
  } else points = Number(parseInteger(answer.value, 12 ** 6) === task.base ** task.exponent);
  return { type: "powers" as const, points, isCorrect: points === 1, isPartial: points > 0 && points < 1, isAnswered, studentAnswer: answer, correctAnswer: powersTaskAnswer(task) };
}
export function gradePowersWorksheet(worksheet: PowersWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradePowersTask(task, answers[task.id])])), entries = Object.values(byTask);
  const correctAuto = entries.filter(e => e.isCorrect).length, partialAuto = entries.filter(e => e.isPartial).length, unansweredAuto = entries.filter(e => !e.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, partialAuto, wrongAuto: entries.length - correctAuto - partialAuto - unansweredAuto, unansweredAuto, percentAuto: entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.points, 0) / entries.length * 100) : 0, byTask };
}

const nb = {
  pageHint: "Med disse valgene har første ark plass til {first} oppgaver og navn, dato og klasse. Deretter er det plass til {following} oppgaver per ark. Velg eget antall ved behov.",
  title: "Potensregning", subtitle: "Skriv og regn med potenser, gjentatt multiplikasjon og potensregler.",
  instructions: "Skriv som potens, skriv som produkt, regn ut eller bruk potensregler. Som potens beholder du grunntallet og finner eksponenten. Som produkt skriver du like faktorer med × mellom. Regn ut betyr at du skriver tallverdien.",
  taskType: "Oppgavetype", write_power: "Skriv som potens", expand: "Skriv som produkt", evaluate: "Regn ut potensen", power_rules: "Bruk potensregler", mixed: "Blandet", maxBase: "Største grunntall", maxExponent: "Største eksponent", operation: "Potensregler", multiply: "Multiplikasjon", divide: "Divisjon", zero: "Ta med eksponenten 0", support: "Vis forklaringer og støtte", empty: "Klar for første potensark", invalid: "Velg gyldig oppgavetype, grunntall 2–12, eksponent 2–6 og 1–60 oppgaver.", answer: "Svar", base: "Grunntall", exponent: "Eksponent", partial: "Delvis riktig",
  zeroHelp: "Eksponenten 0 brukes i «Regn ut potensen» og «Bruk potensregler». Grunntallet er alltid minst 2.", exponentHelp: "Gjelder både oppgaven og svaret i potensreglene.",
  powerPrompt: "Skriv {product} som én potens.", expandPrompt: "Skriv {power} som et produkt av like faktorer.", evaluatePrompt: "Regn ut {power}.", rulePrompt: "Skriv som én potens med samme grunntall: {expression}",
  powerHint: "Grunntallet er faktoren som gjentas. Eksponenten forteller hvor mange like faktorer det er.", expandHint: "Eksponenten forteller hvor mange ganger grunntallet skal stå som faktor.", evaluateHint: "Multipliser like faktorer. Eksempel: 3² = 3 × 3 = 9. For et grunntall større enn 0 er a⁰ = 1.", multiplyHint: "Samme grunntall: behold grunntallet og legg sammen eksponentene. aᵐ × aⁿ = aᵐ⁺ⁿ.", divideHint: "Samme grunntall: behold grunntallet og trekk fra eksponentene. aᵐ : aⁿ = aᵐ⁻ⁿ.",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  pageHint: "With these settings, the first sheet fits {first} tasks and name, date and class. Each following sheet fits {following} tasks. Choose a custom count if needed.",
  title: "Powers and exponents", subtitle: "Write and calculate powers, repeated multiplication and exponent rules.", instructions: "Write as a power, expand as a product, calculate or use exponent rules. For a power, keep the base and find the exponent. For a product, write equal factors separated by ×. Calculate means write the numerical value.",
  taskType: "Task type", write_power: "Write as a power", expand: "Expand as a product", evaluate: "Calculate the power", power_rules: "Use exponent rules", mixed: "Mixed", maxBase: "Largest base", maxExponent: "Largest exponent", operation: "Exponent rules", multiply: "Multiplication", divide: "Division", zero: "Include exponent 0", support: "Show explanations and support", empty: "Ready for your first powers worksheet", invalid: "Choose a valid task type, base 2–12, exponent 2–6 and 1–60 tasks.", answer: "Answer", base: "Base", exponent: "Exponent", partial: "Partly correct", zeroHelp: "Exponent 0 is used in calculation and exponent-rule tasks. The base is always at least 2.", exponentHelp: "Applies to both the question and the answer in exponent rules.", powerPrompt: "Write {product} as a single power.", expandPrompt: "Write {power} as a product of equal factors.", evaluatePrompt: "Calculate {power}.", rulePrompt: "Write as a single power with the same base: {expression}", powerHint: "The base is the repeated factor. The exponent tells you how many equal factors there are.", expandHint: "The exponent tells you how many times to write the base as a factor.", evaluateHint: "Multiply equal factors. Example: 3² = 3 × 3 = 9. For a positive base, a⁰ = 1.", multiplyHint: "Same base: keep the base and add the exponents. aᵐ × aⁿ = aᵐ⁺ⁿ.", divideHint: "Same base: keep the base and subtract the exponents. aᵐ : aⁿ = aᵐ⁻ⁿ.",
};
const pt: Copy = {
  pageHint: "Com estas opções, a primeira folha inclui {first} exercícios e nome, data e turma. Cada folha seguinte inclui {following} exercícios. Podes escolher outra quantidade.",
  title: "Potências", subtitle: "Escrever e calcular potências, multiplicação repetida e regras das potências.", instructions: "Escreve como potência, como produto, calcula ou aplica as regras das potências. Numa potência, mantém a base e encontra o expoente. Num produto, escreve fatores iguais separados por ×. Calcular significa escrever o valor numérico.",
  taskType: "Tipo de exercício", write_power: "Escrever como potência", expand: "Escrever como produto", evaluate: "Calcular a potência", power_rules: "Aplicar as regras das potências", mixed: "Misto", maxBase: "Maior base", maxExponent: "Maior expoente", operation: "Regras das potências", multiply: "Multiplicação", divide: "Divisão", zero: "Incluir o expoente 0", support: "Mostrar explicações e apoio", empty: "Pronto para a primeira ficha de potências", invalid: "Escolhe um tipo válido, base de 2 a 12, expoente de 2 a 6 e de 1 a 60 exercícios.", answer: "Resposta", base: "Base", exponent: "Expoente", partial: "Parcialmente correto", zeroHelp: "O expoente 0 é usado nos exercícios de cálculo e de regras das potências. A base é sempre pelo menos 2.", exponentHelp: "Aplica-se à pergunta e à resposta nas regras das potências.", powerPrompt: "Escreve {product} como uma única potência.", expandPrompt: "Escreve {power} como um produto de fatores iguais.", evaluatePrompt: "Calcula {power}.", rulePrompt: "Escreve como uma única potência com a mesma base: {expression}", powerHint: "A base é o fator que se repete. O expoente indica quantos fatores iguais existem.", expandHint: "O expoente indica quantas vezes a base deve aparecer como fator.", evaluateHint: "Multiplica fatores iguais. Exemplo: 3² = 3 × 3 = 9. Para uma base positiva, a⁰ = 1.", multiplyHint: "Mesma base: mantém a base e soma os expoentes. aᵐ × aⁿ = aᵐ⁺ⁿ.", divideHint: "Mesma base: mantém a base e subtrai os expoentes. aᵐ : aⁿ = aᵐ⁻ⁿ.",
};
export function getPowersCopy(language: string): Copy { return normalizeMathWorksheetLanguage(language) === "pt" ? pt : normalizeMathWorksheetLanguage(language) === "en" ? en : nb; }
export function powersTaskPrompt(task: PowersTask, language = "nb"): string {
  const copy = getPowersCopy(language), power = formatPower(task.base, task.exponent);
  return task.type === "write_power" ? copy.powerPrompt.replace("{product}", powersProduct(task)) : task.type === "expand" ? copy.expandPrompt.replace("{power}", power) : task.type === "evaluate" ? copy.evaluatePrompt.replace("{power}", power) : copy.rulePrompt.replace("{expression}", `${power} ${task.operation === "multiply" ? "×" : ":"} ${formatPower(task.base, task.otherExponent!)}`);
}
export function powersTaskHint(task: PowersTask, language = "nb"): string {
  const copy = getPowersCopy(language);
  return task.type === "write_power" ? copy.powerHint : task.type === "expand" ? copy.expandHint : task.type === "evaluate" ? copy.evaluateHint : task.operation === "multiply" ? copy.multiplyHint : copy.divideHint;
}
