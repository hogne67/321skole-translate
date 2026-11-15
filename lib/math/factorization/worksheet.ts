import { normalizeMathWorksheetLanguage, type MathWorksheetLanguage } from "../taxonomy";

export const FACTORIZATION_TASK_TYPES = ["factor_pairs", "missing_factor", "prime_factors", "factor_tree"] as const;
export const FACTORIZATION_MODES = [...FACTORIZATION_TASK_TYPES, "mixed"] as const;
export const FACTORIZATION_MAXIMUMS = [20, 50, 100, 200, 1000] as const;
export type FactorizationSettings = { taskType: typeof FACTORIZATION_MODES[number]; maximum: typeof FACTORIZATION_MAXIMUMS[number]; taskCount: number; showSupport: boolean; showPowers: boolean };
export type FactorizationTask = { id: string; type: typeof FACTORIZATION_TASK_TYPES[number]; number: number; givenFactor: number | null };
export type FactorizationAnswer = { value: string; pairs: { left: string; right: string }[]; nodes: Record<string, string> };
export type FactorizationWorksheet = { version: 1; kind: "factorization"; language: MathWorksheetLanguage; title: string; instructions: string; settings: FactorizationSettings; tasks: FactorizationTask[]; showAnswerKey: boolean };
export const FACTORIZATION_TASKS_PER_PAGE = 2;
export const DEFAULT_FACTORIZATION_SETTINGS: FactorizationSettings = { taskType: "mixed", maximum: 100, taskCount: 4, showSupport: false, showPowers: false };
export const MAX_FACTOR_TREE_DEPTH = 8;
export const MAX_FACTOR_TREE_INPUTS = 24;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const own = (v: object, key: string) => Object.prototype.hasOwnProperty.call(v, key);
export function normalizeFactorizationSettings(v: unknown): FactorizationSettings {
  if (!record(v) || !FACTORIZATION_MODES.includes(v.taskType as FactorizationSettings["taskType"]) || typeof v.maximum !== "number" || !FACTORIZATION_MAXIMUMS.includes(v.maximum as FactorizationSettings["maximum"]) || !Number.isInteger(v.taskCount) || Number(v.taskCount) < 1 || Number(v.taskCount) > 60 || typeof v.showSupport !== "boolean" || typeof v.showPowers !== "boolean") throw new Error("INVALID_SETTINGS");
  return { taskType: v.taskType as FactorizationSettings["taskType"], maximum: v.maximum as FactorizationSettings["maximum"], taskCount: Number(v.taskCount), showSupport: v.showSupport, showPowers: v.showPowers };
}
export function factorPairs(number: number): [number, number][] {
  if (!Number.isInteger(number) || number < 1 || number > 1000) return [];
  const pairs: [number, number][] = [];
  for (let factor = 1; factor * factor <= number; factor++) if (number % factor === 0) pairs.push([factor, number / factor]);
  return pairs;
}
export function primeFactors(number: number): number[] {
  if (!Number.isInteger(number) || number < 2 || number > 1000) return [];
  const factors: number[] = [];
  for (let factor = 2; factor * factor <= number; factor++) while (number % factor === 0) { factors.push(factor); number /= factor; }
  if (number > 1) factors.push(number);
  return factors;
}
export function isPrime(number: number): boolean { return Number.isInteger(number) && number >= 2 && primeFactors(number).length === 1; }
export function parseFactorizationInteger(value: unknown): number | null {
  if (typeof value !== "string" || value.length > 12 || !/^\d+$/.test(value.trim())) return null;
  const number = Number(value.trim()); return Number.isInteger(number) && number >= 1 && number <= 1000 ? number : null;
}
const superscripts = "⁰¹²³⁴⁵⁶⁷⁸⁹";
export function formatPrimeFactors(number: number, powers = false): string {
  const factors = primeFactors(number);
  if (!powers) return factors.join(" × ");
  return [...new Set(factors)].map(factor => { const count = factors.filter(n => n === factor).length; return `${factor}${count > 1 ? String(count).split("").map(n => superscripts[Number(n)]).join("") : ""}`; }).join(" × ");
}
/** A small product grammar only: no evaluation, parentheses or arbitrary expressions. */
export function parseFactorProduct(value: string): number[] | null {
  if (!value.trim() || value.length > 240) return null;
  const text = value.trim().replace(/([0-9])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, digit: string, exponent: string) => `${digit}^${[...exponent].map(c => superscripts.indexOf(c)).join("")}`);
  const terms = text.split(/[×*xX·]/);
  if (terms.length > 32) return null;
  const factors: number[] = [];
  for (const term of terms) {
    const match = term.trim().match(/^(\d+)\s*(?:\^\s*(\d+))?$/);
    if (!match) return null;
    const base = Number(match[1]), exponent = match[2] === undefined ? 1 : Number(match[2]);
    if (!Number.isInteger(base) || base < 2 || base > 1000 || !Number.isInteger(exponent) || exponent < 1 || exponent > 9 || factors.length + exponent > 32) return null;
    factors.push(...Array<number>(exponent).fill(base));
  }
  return factors;
}
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]; for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result;
}
export function generateFactorizationWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): FactorizationWorksheet {
  const settings = normalizeFactorizationSettings(value), lang = normalizeMathWorksheetLanguage(language), copy = getFactorizationCopy(lang), types = shuffled(FACTORIZATION_TASK_TYPES, random);
  const numbers = Array.from({ length: settings.maximum - 1 }, (_, i) => i + 2), composites = numbers.filter(n => !isPrime(n)), pools = new Map<FactorizationTask["type"], number[]>();
  const tasks = Array.from({ length: settings.taskCount }, (_, i): FactorizationTask => {
    const type = settings.taskType === "mixed" ? types[i % types.length] : settings.taskType;
    let pool = pools.get(type); if (!pool?.length) { pool = shuffled(type === "factor_pairs" ? numbers : composites, random); pools.set(type, pool); }
    const number = pool.pop()!, divisors = factorPairs(number).slice(1).flat();
    return { id: `factorization_${i + 1}`, type, number, givenFactor: type === "missing_factor" ? divisors[Math.floor(random() * divisors.length)] : null };
  });
  return { version: 1, kind: "factorization", language: lang, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey };
}
export function sanitizeFactorizationWorksheet(value: unknown): FactorizationWorksheet | null {
  if (!record(value) || value.kind !== "factorization" || value.version !== 1 || !Array.isArray(value.tasks)) return null;
  try {
    const settings = normalizeFactorizationSettings(value.settings), ids = new Set<string>(); if (value.tasks.length !== settings.taskCount) return null;
    const tasks = value.tasks.map((raw): FactorizationTask => {
      if (!record(raw) || typeof raw.id !== "string" || !/^[\w-]{1,80}$/.test(raw.id) || ids.has(raw.id) || !FACTORIZATION_TASK_TYPES.includes(raw.type as FactorizationTask["type"]) || settings.taskType !== "mixed" && raw.type !== settings.taskType || typeof raw.number !== "number" || !Number.isInteger(raw.number) || raw.number < 2 || raw.number > settings.maximum || raw.type !== "factor_pairs" && isPrime(raw.number)) throw new Error("task");
      ids.add(raw.id);
      if (raw.type === "missing_factor" ? typeof raw.givenFactor !== "number" || !Number.isInteger(raw.givenFactor) || raw.givenFactor < 2 || raw.givenFactor >= raw.number || raw.number % raw.givenFactor !== 0 : raw.givenFactor !== null) throw new Error("factor");
      return { id: raw.id, type: raw.type as FactorizationTask["type"], number: raw.number, givenFactor: raw.givenFactor as number | null };
    });
    const language = normalizeMathWorksheetLanguage(value.language), copy = getFactorizationCopy(language);
    return { version: 1, kind: "factorization", language, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey: value.showAnswerKey === true };
  } catch { return null; }
}
export function readFactorizationAnswer(value: unknown): FactorizationAnswer {
  const text = typeof value === "string" ? value : record(value) ? value.value : "", pairs = record(value) && Array.isArray(value.pairs) ? value.pairs : [];
  const nodes = record(value) && record(value.nodes) ? Object.entries(value.nodes).filter(([key, entry]) => /^r[01]{1,8}$/.test(key) && typeof entry === "string" && entry.length <= 12).slice(0, 64) : [];
  return { value: typeof text === "string" && text.length <= 240 ? text : "", pairs: pairs.slice(0, 32).map(pair => ({ left: record(pair) && typeof pair.left === "string" && pair.left.length <= 12 ? pair.left : "", right: record(pair) && typeof pair.right === "string" && pair.right.length <= 12 ? pair.right : "" })), nodes: { r0: "", r1: "", ...Object.fromEntries(nodes) } };
}
export function factorTreePaths(nodes: Record<string, string>): string[] {
  const paths = ["r"];
  function visit(path: string) { if (path.length > MAX_FACTOR_TREE_DEPTH || paths.length > 64) return; for (const side of ["0", "1"]) { const child = path + side; paths.push(child); if (own(nodes, child + "0") || own(nodes, child + "1")) visit(child); } }
  visit("r"); return paths;
}
export function splitFactorTree(nodes: Record<string, string>, path: string): Record<string, string> {
  if (!/^r[01]{1,7}$/.test(path) || !own(nodes, path) || Object.keys(nodes).length + 2 > MAX_FACTOR_TREE_INPUTS || own(nodes, path + "0") || own(nodes, path + "1")) return nodes;
  return { ...nodes, [path + "0"]: "", [path + "1"]: "" };
}
export function removeFactorTreeBranch(nodes: Record<string, string>, path: string): Record<string, string> { return Object.fromEntries(Object.entries(nodes).filter(([key]) => key === path || !key.startsWith(path))); }
export function canonicalFactorTree(number: number): Record<string, string> {
  const nodes: Record<string, string> = {};
  function split(factors: number[], path: string) { if (path !== "r") nodes[path] = String(factors.reduce((a, b) => a * b, 1)); if (factors.length < 2) return; const middle = Math.floor(factors.length / 2); split(factors.slice(0, middle), path + "0"); split(factors.slice(middle), path + "1"); }
  split(primeFactors(number), "r"); return nodes;
}
export function factorTreeLayout(nodes: Record<string, string>) {
  const paths = factorTreePaths(nodes), positions = new Map<string, number>(); let leaves = 0;
  function place(path: string): number { const x = paths.includes(path + "0") ? (place(path + "0") + place(path + "1")) / 2 : leaves++; positions.set(path, x); return x; }
  place("r");
  const width = Math.max(300, leaves * 80), depth = Math.max(...paths.map(path => path.length - 1));
  return { width, height: 58 + depth * 64, points: paths.map((path, index) => ({ path, label: index ? String.fromCharCode(64 + index) : "", x: 40 + (positions.get(path) ?? 0) * (width - 80) / Math.max(1, leaves - 1), y: 28 + (path.length - 1) * 64, leaf: !paths.includes(path + "0") })) };
}
function factorTreeGrade(task: FactorizationTask, value: unknown, answer: FactorizationAnswer) {
  const rawNodes = record(value) && record(value.nodes) ? value.nodes : {}, keys = Object.keys(rawNodes), paths = factorTreePaths(answer.nodes), expected = primeFactors(task.number), remaining = [...expected];
  const validShape = keys.length <= 64 && keys.every(key => /^r[01]{1,8}$/.test(key) && typeof rawNodes[key] === "string" && rawNodes[key].length <= 12 && paths.includes(key));
  let splits = 0, leaves = 0;
  function visit(path: string, parentValid: boolean) {
    const number = path === "r" ? task.number : parseFactorizationInteger(answer.nodes[path]), branch = paths.includes(path + "0");
    if (branch) {
      const left = parseFactorizationInteger(answer.nodes[path + "0"]), right = parseFactorizationInteger(answer.nodes[path + "1"]);
      const valid = parentValid && number !== null && left !== null && right !== null && left > 1 && right > 1 && left * right === number;
      if (valid) splits++; visit(path + "0", valid); visit(path + "1", valid);
    } else if (parentValid && number !== null && isPrime(number)) { const i = remaining.indexOf(number); if (i >= 0) { leaves++; remaining.splice(i, 1); } }
  }
  visit("r", true);
  return { points: validShape ? Math.min(1, (splits + leaves) / (2 * expected.length - 1)) : 0, correctSplits: splits, correctPrimeLeaves: leaves, validShape };
}
export function factorizationTaskAnswer(task: FactorizationTask, settings: FactorizationSettings): string {
  return task.type === "factor_pairs" ? factorPairs(task.number).map(pair => pair.join(" × ")).join("; ") : task.type === "missing_factor" ? String(task.number / task.givenFactor!) : formatPrimeFactors(task.number, settings.showPowers);
}
export function gradeFactorizationTask(task: FactorizationTask, value: unknown, settings = DEFAULT_FACTORIZATION_SETTINGS) {
  const answer = readFactorizationAnswer(value); let points = 0, isAnswered = false;
  let treeResult: ReturnType<typeof factorTreeGrade> | undefined;
  if (task.type === "factor_pairs") {
    const rawPairs = record(value) && Array.isArray(value.pairs) ? value.pairs : [];
    isAnswered = rawPairs.some(pair => record(pair) && [pair.left, pair.right].some(v => typeof v === "string" ? !!v.trim() : v != null));
    const submitted = answer.pairs.filter(pair => pair.left.trim() || pair.right.trim()), expected = factorPairs(task.number).map(pair => pair.join(":")), matched = new Set<string>();
    for (const pair of submitted) { const left = parseFactorizationInteger(pair.left), right = parseFactorizationInteger(pair.right); if (left !== null && right !== null) { const key = [Math.min(left, right), Math.max(left, right)].join(":"); if (expected.includes(key)) matched.add(key); } }
    const validPairs = rawPairs.length <= 32 && rawPairs.every(pair => record(pair) && typeof pair.left === "string" && typeof pair.right === "string" && pair.left.length <= 12 && pair.right.length <= 12);
    points = validPairs ? matched.size / Math.max(expected.length, submitted.length) : 0;
  } else if (task.type === "factor_tree") {
    isAnswered = record(value) && record(value.nodes) && Object.values(value.nodes).some(v => typeof v === "string" ? !!v.trim() : v != null);
    treeResult = factorTreeGrade(task, value, answer); points = treeResult.points;
  } else {
    const raw = typeof value === "string" ? value : record(value) ? value.value : null;
    isAnswered = typeof raw === "string" ? !!raw.trim() : raw != null;
    if (task.type === "missing_factor") points = Number(parseFactorizationInteger(answer.value) === task.number / task.givenFactor!);
    else {
      const factors = parseFactorProduct(answer.value), expected = primeFactors(task.number);
      if (factors) { const remaining = [...factors]; let matches = 0; for (const factor of expected) { const i = remaining.indexOf(factor); if (i >= 0) { matches++; remaining.splice(i, 1); } } points = matches / Math.max(expected.length, factors.length); }
    }
  }
  return { type: "factorization" as const, points, isCorrect: points === 1, isPartial: points > 0 && points < 1, isAnswered, studentAnswer: answer, correctAnswer: factorizationTaskAnswer(task, settings), ...(treeResult ? { tree: treeResult } : {}) };
}
export function gradeFactorizationWorksheet(worksheet: FactorizationWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeFactorizationTask(task, answers[task.id], worksheet.settings)])), entries = Object.values(byTask);
  const correctAuto = entries.filter(e => e.isCorrect).length, partialAuto = entries.filter(e => e.isPartial).length, unansweredAuto = entries.filter(e => !e.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, partialAuto, wrongAuto: entries.length - correctAuto - partialAuto - unansweredAuto, unansweredAuto, percentAuto: entries.length ? Math.round(entries.reduce((sum, e) => sum + e.points, 0) / entries.length * 100) : 0, byTask };
}

const nb = {
  title: "Faktorisering", subtitle: "Finn faktorpar og manglende faktorer, primtallsfaktoriser og bygg faktortrær.", instructions: "Bruk hele positive faktorer. Ta med 1 × tallet når du finner alle faktorpar, og skriv hvert par én gang. Primtallsfaktorisering og faktortrær skal ende i primtall. Ikke bruk 1 i primtallsprodukter eller faktortrær.",
  taskType: "Oppgavetype", factor_pairs: "Finn alle faktorpar", missing_factor: "Finn manglende faktor", prime_factors: "Primtallsfaktorisering", factor_tree: "Bygg et faktortre", mixed: "Blandet", maximum: "Største tall", support: "Vis forklaringer og støtte", powers: "Vis potenser i fasiten", empty: "Klar for første faktoriseringsark", invalid: "Velg gyldig oppgavetype, tallområde og 1–60 oppgaver.", answer: "Svar", partial: "Delvis riktig", leftFactor: "Første faktor", rightFactor: "Andre faktor", pair: "Faktorpar", factor: "Faktor", split: "Del videre", remove: "Fjern grenene", tree: "Faktortre", treeHelp: "Fyll inn to faktorer under starttallet. Bruk «Del videre» på sammensatte faktorer. Avslutt når alle ytterste faktorer er primtall.", paperTreeHelp: "Fortsett å tegne grener til alle ytterste faktorer er primtall.", treeLimit: "Treet har nå maksimal størrelse.", pairHint: "Prøv å dele på 1, 2, 3 og så videre. Et kvadrattall har ett par med to like faktorer.", primeHint: "Et primtall har akkurat to positive divisorer: 1 og tallet selv. 1 er ikke et primtall. Du kan skrive 2 × 2 × 3 eller 2² × 3.", missingHint: "Del tallet på den kjente faktoren.", factor_pairsPrompt: "Finn alle positive faktorpar til {number}.", missing_factorPrompt: "Finn den manglende faktoren: {factor} × □ = {number}.", prime_factorsPrompt: "Skriv {number} som et produkt av primtall.", factor_treePrompt: "Bygg et faktortre for {number}.", treeExample: "Eksempel på faktortre",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = { title: "Factorisation", subtitle: "Find factor pairs and missing factors, prime-factorise and build factor trees.", instructions: "Use positive whole-number factors. Include 1 × the number when listing all factor pairs, and list each pair once. Prime factorisations and factor trees must end in primes. Do not use 1 in prime products or factor trees.", taskType: "Task type", factor_pairs: "Find all factor pairs", missing_factor: "Find the missing factor", prime_factors: "Prime factorisation", factor_tree: "Build a factor tree", mixed: "Mixed", maximum: "Largest number", support: "Show explanations and hints", powers: "Show powers in the answer key", empty: "Ready for your first factorisation worksheet", invalid: "Choose a valid task type, number range and 1–60 tasks.", answer: "Answer", partial: "Partly correct", leftFactor: "First factor", rightFactor: "Second factor", pair: "Factor pair", factor: "Factor", split: "Split further", remove: "Remove branches", tree: "Factor tree", treeHelp: "Enter two factors below the starting number. Use “Split further” on composite factors. Finish when all outer factors are prime.", paperTreeHelp: "Keep drawing branches until all outer factors are prime.", treeLimit: "The tree has reached its maximum size.", pairHint: "Try dividing by 1, 2, 3 and so on. A square number has one pair of equal factors.", primeHint: "A prime has exactly two positive divisors: 1 and itself. 1 is not prime. You may write 2 × 2 × 3 or 2² × 3.", missingHint: "Divide the number by the known factor.", factor_pairsPrompt: "Find all positive factor pairs of {number}.", missing_factorPrompt: "Find the missing factor: {factor} × □ = {number}.", prime_factorsPrompt: "Write {number} as a product of primes.", factor_treePrompt: "Build a factor tree for {number}.", treeExample: "Example factor tree" };
const pt: Copy = { title: "Fatorização", subtitle: "Descobre pares de fatores e fatores em falta, decompõe em fatores primos e constrói árvores de fatores.", instructions: "Usa fatores inteiros positivos. Inclui 1 × o número nos pares de fatores e escreve cada par uma vez. A decomposição e as árvores devem terminar em números primos. Não uses 1 nos produtos de primos nem nas árvores.", taskType: "Tipo de exercício", factor_pairs: "Descobrir todos os pares de fatores", missing_factor: "Descobrir o fator em falta", prime_factors: "Decomposição em fatores primos", factor_tree: "Construir uma árvore de fatores", mixed: "Misto", maximum: "Maior número", support: "Mostrar explicações e pistas", powers: "Mostrar potências nas soluções", empty: "Pronto para a primeira ficha de fatorização", invalid: "Escolhe um tipo válido, intervalo e 1–60 exercícios.", answer: "Resposta", partial: "Parcialmente correto", leftFactor: "Primeiro fator", rightFactor: "Segundo fator", pair: "Par de fatores", factor: "Fator", split: "Decompor mais", remove: "Remover ramos", tree: "Árvore de fatores", treeHelp: "Escreve dois fatores abaixo do número inicial. Usa «Decompor mais» nos fatores compostos. Termina quando todos os fatores exteriores forem primos.", paperTreeHelp: "Continua a desenhar ramos até todos os fatores exteriores serem primos.", treeLimit: "A árvore atingiu o tamanho máximo.", pairHint: "Experimenta dividir por 1, 2, 3 e assim por diante. Um quadrado perfeito tem um par com fatores iguais.", primeHint: "Um primo tem exatamente dois divisores positivos: 1 e ele próprio. 1 não é primo. Podes escrever 2 × 2 × 3 ou 2² × 3.", missingHint: "Divide o número pelo fator conhecido.", factor_pairsPrompt: "Descobre todos os pares de fatores positivos de {number}.", missing_factorPrompt: "Descobre o fator em falta: {factor} × □ = {number}.", prime_factorsPrompt: "Escreve {number} como produto de números primos.", factor_treePrompt: "Constrói uma árvore de fatores para {number}.", treeExample: "Exemplo de árvore de fatores" };
export function getFactorizationCopy(language: string): Copy { return language === "en" ? en : language === "pt" ? pt : nb; }
export function factorizationTaskPrompt(task: FactorizationTask, language: string): string { return getFactorizationCopy(language)[`${task.type}Prompt`].replace("{number}", String(task.number)).replace("{factor}", String(task.givenFactor ?? "")); }
