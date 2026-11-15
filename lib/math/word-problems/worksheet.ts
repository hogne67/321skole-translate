import { normalizeMathWorksheetLanguage, type MathWorksheetLanguage } from "../taxonomy";
import { WORD_PROBLEMS_CONTEXTS, WORD_PROBLEMS_MEASUREMENT_UNITS, WORD_PROBLEMS_NAMES, wordProblemsContextsForTheme, type WordProblemsContext, type WordProblemsTheme } from "./catalog";

export const WORD_PROBLEMS_OPERATIONS = ["add", "subtract", "multiply", "divide", "mixed"] as const;
export const WORD_PROBLEMS_THEMES = ["objects", "money", "length", "weight", "volume", "mixed"] as const;
export type WordProblemsSettings = { operation: typeof WORD_PROBLEMS_OPERATIONS[number]; steps: 1 | 2 | "mixed"; theme: typeof WORD_PROBLEMS_THEMES[number]; maximum: 20 | 100 | 1000; taskCount: number; showSupport: boolean };
export type WordProblemsTemplate = "add" | "subtract" | "multiply" | "divide" | "add_add" | "subtract_subtract" | "multiply_multiply" | "divide_divide" | "multiply_subtract" | "add_divide" | "subtract_multiply" | "divide_add";
export type WordProblemsTask = { id: string; type: WordProblemsTemplate; context: WordProblemsContext; name: typeof WORD_PROBLEMS_NAMES[number]; values: number[] };
export type WordProblemsAnswer = { value: string; unit: string; working: string };
export type WordProblemsWorksheet = { version: 1; kind: "word_problems"; language: MathWorksheetLanguage; title: string; instructions: string; settings: WordProblemsSettings; tasks: WordProblemsTask[]; showAnswerKey: boolean };
export const WORD_PROBLEMS_TASKS_PER_PAGE = 3;
export const DEFAULT_WORD_PROBLEMS_SETTINGS: WordProblemsSettings = { operation: "mixed", steps: "mixed", theme: "mixed", maximum: 100, taskCount: 6, showSupport: false };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const templates: WordProblemsTemplate[] = ["add", "subtract", "multiply", "divide", "add_add", "subtract_subtract", "multiply_multiply", "divide_divide", "multiply_subtract", "add_divide", "subtract_multiply", "divide_add"];
export const wordProblemsSymbols = { add: "+", subtract: "−", multiply: "×", divide: "÷" };
export function normalizeWordProblemsSettings(v: unknown): WordProblemsSettings {
  if (!record(v) || !WORD_PROBLEMS_OPERATIONS.includes(v.operation as WordProblemsSettings["operation"]) || ![1, 2, "mixed"].includes(v.steps as number) || !WORD_PROBLEMS_THEMES.includes(v.theme as WordProblemsSettings["theme"]) || ![20, 100, 1000].includes(Number(v.maximum)) || typeof v.maximum !== "number" || !Number.isInteger(v.taskCount) || Number(v.taskCount) < 1 || Number(v.taskCount) > 60 || typeof v.showSupport !== "boolean") throw new Error("INVALID_SETTINGS");
  return { operation: v.operation as WordProblemsSettings["operation"], steps: v.steps as WordProblemsSettings["steps"], theme: v.theme as WordProblemsSettings["theme"], maximum: v.maximum as WordProblemsSettings["maximum"], taskCount: Number(v.taskCount), showSupport: v.showSupport };
}
export function wordProblemsPlan(task: WordProblemsTask) {
  const [a, b, c] = task.values, ops = task.type.split("_") as (keyof typeof wordProblemsSymbols)[];
  const calculate = (x: number, op: keyof typeof wordProblemsSymbols, y: number) => op === "add" ? x + y : op === "subtract" ? x - y : op === "multiply" ? x * y : x / y;
  const first = calculate(a, ops[0], b);
  return [{ left: a, operation: ops[0], right: b, result: first }, ...(ops.length === 2 ? [{ left: first, operation: ops[1], right: c, result: calculate(first, ops[1], c) }] : [])];
}
export function wordProblemsExpected(task: WordProblemsTask): number { return wordProblemsPlan(task).at(-1)!.result; }
export function wordProblemsUnit(task: WordProblemsTask): string { return WORD_PROBLEMS_CONTEXTS[task.context].unit; }
export function wordProblemsUnitOptions(task: WordProblemsTask): string[] {
  const { theme, unit } = WORD_PROBLEMS_CONTEXTS[task.context];
  const alternatives = theme === "weight" ? ["kg", "g", "m", "l"] : theme === "volume" ? ["l", "dl", "kg", "cm"] : ["books", "apples", "marbles", "kr", "m", "cm"];
  return [...new Set([...alternatives, unit])];
}
export function wordProblemsUnitLabel(unit: string, language: string): string {
  const lang = language === "en" ? 1 : language === "pt" ? 2 : 0;
  return WORD_PROBLEMS_MEASUREMENT_UNITS[unit]?.[lang] ?? Object.values(WORD_PROBLEMS_CONTEXTS).find(context => context.unit === unit)?.nouns[lang][1] ?? "";
}
export function wordProblemsAnswerText(task: WordProblemsTask, language: string): string {
  const value = wordProblemsExpected(task), context = WORD_PROBLEMS_CONTEXTS[task.context], lang = language === "en" ? 1 : language === "pt" ? 2 : 0;
  return `${value} ${value === 1 && context.theme === "objects" ? context.nouns[lang][0] : wordProblemsUnitLabel(context.unit, language)}`;
}
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function generateWordProblemsWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): WordProblemsWorksheet {
  const settings = normalizeWordProblemsSettings(value), lang = normalizeMathWorksheetLanguage(language), copy = getWordProblemsCopy(lang), m = settings.maximum;
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const operations = ["add", "subtract", "multiply", "divide"] as const;
  const themes = WORD_PROBLEMS_THEMES.filter((theme): theme is WordProblemsTheme => theme !== "mixed");
  let namePool: (typeof WORD_PROBLEMS_NAMES[number])[] = [], themePool: WordProblemsTheme[] = [];
  const contextPools = new Map<WordProblemsTheme, WordProblemsContext[]>();
  const tasks = Array.from({ length: settings.taskCount }, (_, i): WordProblemsTask => {
    // Separate cycles keep both lengths and all four operations represented in mixed sheets.
    const count = settings.steps === "mixed" ? i % 2 + 1 : settings.steps;
    const cycle = settings.steps === "mixed" ? Math.floor(i / 2) : i;
    const operation = settings.operation === "mixed" ? operations[cycle % 4] : settings.operation;
    const cross = { add: "add_divide", subtract: "subtract_multiply", multiply: "multiply_subtract", divide: "divide_add" } as const;
    const repeated = { add: "add_add", subtract: "subtract_subtract", multiply: "multiply_multiply", divide: "divide_divide" } as const;
    const type: WordProblemsTemplate = count === 1 ? operation : settings.operation === "mixed" && Math.floor(cycle / 4) % 2 === 0 ? cross[operation] : repeated[operation];
    let a = 0, b = 0, c = 0;
    switch (type) {
      case "add": a = int(1, m - 1); b = int(1, m - a); break;
      case "subtract": a = int(2, m); b = int(1, a); break;
      case "multiply": a = int(2, Math.min(10, Math.floor(m / 2))); b = int(1, Math.floor(m / a)); break;
      case "divide": b = int(2, Math.min(10, m)); a = b * int(1, Math.floor(m / b)); break;
      case "add_add": a = int(1, m - 2); b = int(1, m - a - 1); c = int(1, m - a - b); break;
      case "subtract_subtract": a = int(3, m); b = int(1, a - 1); c = int(1, a - b); break;
      case "multiply_multiply": a = int(2, Math.min(5, Math.floor(m / 2))); b = int(2, Math.min(5, Math.floor(m / a))); c = int(1, Math.floor(m / (a * b))); break;
      case "divide_divide": b = int(2, Math.min(5, Math.floor(m / 2))); c = int(2, Math.min(5, Math.floor(m / b))); a = b * c * int(1, Math.floor(m / (b * c))); break;
      case "multiply_subtract": a = int(2, Math.min(10, Math.floor(m / 2))); b = int(1, Math.floor(m / a)); c = int(1, a * b); break;
      case "add_divide": c = int(2, Math.min(10, Math.floor(m / 2))); { const total = c * int(1, Math.floor(m / c)); a = int(1, total - 1); b = total - a; } break;
      case "subtract_multiply": c = int(1, Math.min(10, m)); { const remaining = int(1, Math.min(Math.floor(m / c), m - 1)); b = int(1, m - remaining); a = remaining + b; } break;
      case "divide_add": b = int(2, Math.min(10, m)); { const share = int(1, Math.min(Math.floor(m / b), m - 1)); a = b * share; c = int(1, m - share); } break;
    }
    if (!namePool.length) namePool = shuffled(WORD_PROBLEMS_NAMES, random);
    if (!themePool.length) themePool = shuffled(themes, random);
    const theme = settings.theme === "mixed" ? themePool.pop()! : settings.theme;
    let pool = contextPools.get(theme);
    if (!pool?.length) { pool = shuffled(wordProblemsContextsForTheme(theme), random); contextPools.set(theme, pool); }
    return { id: `word_problems_${i + 1}`, type, context: pool.pop()!, name: namePool.pop()!, values: count === 1 ? [a, b] : [a, b, c] };
  });
  return { version: 1, kind: "word_problems", language: lang, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey };
}
export function sanitizeWordProblemsWorksheet(value: unknown): WordProblemsWorksheet | null {
  if (!record(value) || value.kind !== "word_problems" || value.version !== 1 || !Array.isArray(value.tasks)) return null;
  try {
    const settings = normalizeWordProblemsSettings(value.settings), ids = new Set<string>();
    if (value.tasks.length !== settings.taskCount) return null;
    const tasks = value.tasks.map((raw): WordProblemsTask => {
      if (!record(raw) || typeof raw.id !== "string" || !/^[\w-]{1,80}$/.test(raw.id) || ids.has(raw.id) || !templates.includes(raw.type as WordProblemsTemplate) || !WORD_PROBLEMS_NAMES.includes(raw.name as typeof WORD_PROBLEMS_NAMES[number])) throw new Error("task");
      ids.add(raw.id);
      const type = raw.type as WordProblemsTemplate, count = type.includes("_") ? 2 : 1;
      if (settings.steps !== "mixed" && count !== settings.steps || settings.operation !== "mixed" && type.split("_").some(op => op !== settings.operation)) throw new Error("mode");
      const available: readonly string[] = settings.theme === "mixed" ? Object.keys(WORD_PROBLEMS_CONTEXTS) : wordProblemsContextsForTheme(settings.theme);
      if (typeof raw.context !== "string" || !available.includes(raw.context) || !Array.isArray(raw.values) || raw.values.length !== count + 1 || !raw.values.every(n => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= settings.maximum)) throw new Error("values");
      const task = { id: raw.id, type, context: raw.context as WordProblemsTask["context"], name: raw.name as WordProblemsTask["name"], values: raw.values as number[] };
      if (wordProblemsPlan(task).some(step => !Number.isInteger(step.result) || step.result < 0 || step.result > settings.maximum)) throw new Error("result");
      return task;
    });
    const language = normalizeMathWorksheetLanguage(value.language), copy = getWordProblemsCopy(language);
    return { version: 1, kind: "word_problems", language, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey: value.showAnswerKey === true };
  } catch { return null; }
}
export function readWordProblemsAnswer(value: unknown): WordProblemsAnswer {
  return { value: record(value) && typeof value.value === "string" && value.value.length <= 40 ? value.value : "", unit: record(value) && typeof value.unit === "string" && value.unit.length <= 20 ? value.unit : "", working: record(value) && typeof value.working === "string" ? value.working.slice(0, 2000) : "" };
}
function parseAnswer(value: string): number | null {
  const text = value.trim().replaceAll("−", "-");
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(text)) return null;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) && Math.abs(number) <= 1000000 ? number : null;
}
export function gradeWordProblemsTask(task: WordProblemsTask, value: unknown) {
  const answer = readWordProblemsAnswer(value), valueCorrect = parseAnswer(answer.value) === wordProblemsExpected(task), unitCorrect = answer.unit === wordProblemsUnit(task);
  const points = valueCorrect ? unitCorrect ? 1 : 0.8 : 0;
  const isAnswered = record(value) ? [value.value, value.unit, value.working].some(v => typeof v === "string" ? !!v.trim() : v != null) : typeof value === "string" ? !!value.trim() : value != null;
  return { type: "word_problems" as const, isCorrect: points === 1, isPartial: points > 0 && points < 1, points, isAnswered, valueCorrect, unitCorrect, studentAnswer: answer, correctAnswer: { value: String(wordProblemsExpected(task)), unit: wordProblemsUnit(task), working: wordProblemsPlan(task).map(s => `${s.left} ${wordProblemsSymbols[s.operation]} ${s.right} = ${s.result}`).join("; ") } };
}
export function gradeWordProblemsWorksheet(worksheet: WordProblemsWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeWordProblemsTask(task, answers[task.id])])), entries = Object.values(byTask);
  const correctAuto = entries.filter(e => e.isCorrect).length, partialAuto = entries.filter(e => e.isPartial).length, unansweredAuto = entries.filter(e => !e.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, partialAuto, wrongAuto: entries.length - correctAuto - partialAuto - unansweredAuto, unansweredAuto, percentAuto: entries.length ? Math.round(entries.reduce((s, e) => s + e.points, 0) / entries.length * 100) : 0, byTask };
}

const nb = {
  title: "Tekstoppgaver", subtitle: "Løs hverdagshistorier med de fire regneartene, i ett eller to steg.", instructions: "Les oppgaven, vis utregningen og skriv svaret med enhet. Bruk enheten oppgaven spør etter.",
  operation: "Regneart", add: "Addisjon", subtract: "Subtraksjon", multiply: "Multiplikasjon", divide: "Divisjon", mixed: "Blandet", steps: "Antall steg", one: "Ett steg", two: "To steg", theme: "Tema", objects: "Ting og antall", money: "Penger (kroner)", length: "Lengde og materialer", weight: "Vekt og matvarer", volume: "Volum og væsker", maximum: "Største tall og mellomresultat", support: "Vis støtte til framgangsmåten", empty: "Klar for første ark med tekstoppgaver", invalid: "Velg gyldige innstillinger og 1–60 oppgaver.", working: "Utregning", answer: "Svar", unit: "Enhet", chooseUnit: "Velg enhet", partialCount: "Delvis riktig", partial: "Riktig tall – sjekk enheten", example: "Eksempel på utregning", checkNote: "Automatisk retting vurderer tallet og enheten i svaret. Utregningen kan læreren vurdere.", hint: "Finn hva du vet, hva du skal finne og hvilken regneart du trenger.", twoHint: "Finn et mellomresultat først. Bruk det videre i det andre steget.",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = { title: "Word problems", subtitle: "Solve everyday stories using the four operations, in one or two steps.", instructions: "Read the problem, show your working and write the answer with its unit. Use the unit requested in the question.", operation: "Operation", add: "Addition", subtract: "Subtraction", multiply: "Multiplication", divide: "Division", mixed: "Mixed", steps: "Number of steps", one: "One step", two: "Two steps", theme: "Theme", objects: "Objects and quantities", money: "Money (kroner)", length: "Length and materials", weight: "Weight and food", volume: "Volume and liquids", maximum: "Largest number and intermediate result", support: "Show method hints", empty: "Ready for your first word-problem worksheet", invalid: "Choose valid settings and 1–60 tasks.", working: "Working", answer: "Answer", unit: "Unit", chooseUnit: "Choose a unit", partialCount: "Partly correct", partial: "Correct number – check the unit", example: "Example working", checkNote: "Automatic marking checks the final number and unit. The teacher can assess your working.", hint: "Identify what you know, what you need to find and which operation you need.", twoHint: "Find an intermediate result first. Use it in the second step." };
const pt: Copy = { title: "Problemas matemáticos", subtitle: "Resolve situações do quotidiano com as quatro operações, num ou em dois passos.", instructions: "Lê o problema, mostra os cálculos e escreve a resposta com a unidade pedida na pergunta.", operation: "Operação", add: "Adição", subtract: "Subtração", multiply: "Multiplicação", divide: "Divisão", mixed: "Misto", steps: "Número de passos", one: "Um passo", two: "Dois passos", theme: "Tema", objects: "Objetos e quantidades", money: "Dinheiro (coroas)", length: "Comprimento e materiais", weight: "Massa e alimentos", volume: "Volume e líquidos", maximum: "Maior número e resultado intermédio", support: "Mostrar pistas para a resolução", empty: "Pronto para a primeira ficha de problemas", invalid: "Escolhe definições válidas e 1–60 exercícios.", working: "Cálculos", answer: "Resposta", unit: "Unidade", chooseUnit: "Escolhe a unidade", partialCount: "Parcialmente correto", partial: "Número correto – verifica a unidade", example: "Exemplo de resolução", checkNote: "A correção automática avalia o número e a unidade finais. O professor pode avaliar os cálculos.", hint: "Identifica os dados, o que precisas de descobrir e a operação necessária.", twoHint: "Calcula primeiro um resultado intermédio. Usa-o no segundo passo." };
export function getWordProblemsCopy(language: string): Copy { return language === "en" ? en : language === "pt" ? pt : nb; }
