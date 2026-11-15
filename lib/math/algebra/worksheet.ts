import { normalizeMathWorksheetLanguage, type MathWorksheetLanguage } from "../taxonomy";
import { formatAlgebraPolynomial, parseAlgebraExpression, sameAlgebraPolynomial } from "./expression";

export const ALGEBRA_LEVELS = ["collect", "products", "mixed"] as const;
export type AlgebraSettings = { level: typeof ALGEBRA_LEVELS[number]; maxCoefficient: number; taskCount: number; allowNegative: boolean; showSupport: boolean; includeSquares: boolean; includeParentheses: boolean };
export type AlgebraTask = { id: string; type: AlgebraSettings["level"]; expression: string };
export type AlgebraAnswer = { value: string };
export type AlgebraWorksheet = { version: 1; kind: "algebra"; language: MathWorksheetLanguage; title: string; instructions: string; settings: AlgebraSettings; tasks: AlgebraTask[]; showAnswerKey: boolean };
export const DEFAULT_ALGEBRA_SETTINGS: AlgebraSettings = { level: "collect", maxCoefficient: 6, taskCount: 16, allowNegative: false, showSupport: false, includeSquares: true, includeParentheses: true };
export function algebraTasksPerPage(settings: AlgebraSettings, printMode = false): number { return printMode ? settings.showSupport ? 8 : 16 : settings.showSupport ? 4 : 6; }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function normalizeAlgebraSettings(v: unknown): AlgebraSettings {
  if (!record(v) || !ALGEBRA_LEVELS.includes(v.level as AlgebraSettings["level"]) || typeof v.maxCoefficient !== "number" || !Number.isInteger(v.maxCoefficient) || v.maxCoefficient < 2 || v.maxCoefficient > 12 || typeof v.taskCount !== "number" || !Number.isInteger(v.taskCount) || v.taskCount < 1 || v.taskCount > 60 || typeof v.allowNegative !== "boolean" || typeof v.showSupport !== "boolean" || v.includeSquares !== undefined && typeof v.includeSquares !== "boolean" || v.includeParentheses !== undefined && typeof v.includeParentheses !== "boolean") throw new Error("INVALID_SETTINGS");
  return { level: v.level as AlgebraSettings["level"], maxCoefficient: v.maxCoefficient, taskCount: v.taskCount, allowNegative: v.allowNegative, showSupport: v.showSupport, includeSquares: v.includeSquares === true, includeParentheses: v.includeParentheses === true };
}
export function generateAlgebraWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): AlgebraWorksheet {
  const settings = normalizeAlgebraSettings(value), lang = normalizeMathWorksheetLanguage(language), copy = getAlgebraCopy(lang);
  const number = () => 2 + Math.floor(random() * (settings.maxCoefficient - 1));
  const literal = (n: number, letter: string) => `${n === 1 ? "" : n}${letter}`;
  const signed = (terms: string[]) => terms.map((term, i) => `${i ? settings.allowNegative && random() < .4 ? " − " : " + " : settings.allowNegative && random() < .2 ? "−" : ""}${term}`).join("");
  const tasks = Array.from({ length: settings.taskCount }, (_, i): AlgebraTask => {
    const p = number(), q = number(), r = number(), s = number(), variant = i % 5;
    let expression: string;
    if (settings.level === "collect") {
      expression = variant === 4 ? signed(["a", "b"]) : settings.allowNegative && variant === 3 ? `${p}a − ${p}a + ${q}b − ${q}b` : variant % 2 ? signed([literal(p, "a"), literal(q, "b"), "a", literal(r, "b"), String(s)]) : signed([literal(p, "a"), "a", literal(q, "b"), String(r)]);
    } else if (settings.level === "products") {
      const sign = settings.allowNegative && random() < .5 ? "−" : "";
      expression = sign + (variant === 0 ? `${p} · a · ${q} · b` : variant === 1 ? `${p} · a · a` : variant === 2 ? `b · b` : variant === 3 ? `${p} · ${q} · a` : `${p}a · ${q}b`);
    } else expression = variant === 0 ? signed([literal(p, "a"), "a", "b · b", String(q)]) : variant === 1 ? signed([`${p} · a · ${q}`, literal(r, "a"), literal(s, "b"), "b"]) : variant === 2 ? signed([literal(p, "a"), literal(q, "b"), `${p} · a · ${q} · b`, "a", "b"]) : variant === 3 ? signed([`${p} · a · a`, literal(q, "b"), literal(r, "a"), "b"]) : signed(["a · a", `${p} · b · b`, "a · a", String(q), String(r)]);
    const squared = settings.includeSquares && i % 3 !== 2, letter = squared ? "a²" : "a";
    if (settings.includeParentheses && i % 2 === 0) {
      if (settings.level === "collect") expression = signed([`${p}${letter}`, `(${q}${letter} + ${r}b)`, String(s)]);
      else if (settings.level === "products") expression = `${settings.allowNegative && random() < .5 ? "−" : ""}${p} · (${q} · ${squared ? "b²" : "a"})`;
      else expression = signed([`${p}(${letter} + b)`, `${q}${letter}`, `${r}b`, String(s)]);
    } else if (squared) {
      if (settings.level === "collect") expression = signed([`${p}b²`, "a", `${q}b²`, `${r}a`, String(s)]);
      else if (settings.level === "products") expression = `${settings.allowNegative && random() < .5 ? "−" : ""}${p} · b² · ${q}`;
      else expression = signed([`${p}b²`, `${q}a`, "b · b", "a", String(r)]);
    }
    return { id: `algebra_${i + 1}`, type: settings.level, expression };
  });
  return { version: 1, kind: "algebra", language: lang, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey };
}
export function sanitizeAlgebraWorksheet(value: unknown): AlgebraWorksheet | null {
  if (!record(value) || value.kind !== "algebra" || value.version !== 1 || !Array.isArray(value.tasks)) return null;
  try {
    const settings = normalizeAlgebraSettings(value.settings), ids = new Set<string>(); if (value.tasks.length !== settings.taskCount) return null;
    const tasks = value.tasks.map((raw): AlgebraTask => {
      if (!record(raw) || typeof raw.id !== "string" || !/^[\w-]{1,80}$/.test(raw.id) || ids.has(raw.id) || raw.type !== settings.level || typeof raw.expression !== "string" || raw.expression.length > 140 || /[\^⁰¹³⁴⁵⁶]/.test(raw.expression) || !settings.includeSquares && /²/.test(raw.expression) || !settings.includeParentheses && /[()]/.test(raw.expression) || !settings.allowNegative && /[−–-]/.test(raw.expression)) throw new Error("INVALID_TASK");
      const parsed = parseAlgebraExpression(raw.expression);
      if (!parsed || parsed.degree > 2 || parsed.terms.length > 8 || parsed.numbers.some(n => n < 1 || n > settings.maxCoefficient)) throw new Error("INVALID_EXPRESSION");
      if (raw.type === "collect" && (parsed.degree > (settings.includeSquares ? 2 : 1) || /[·×*]/.test(raw.expression)) || raw.type === "products" && parsed.terms.length !== 1 || raw.type === "mixed" && (parsed.terms.length < 2 || !parsed.hasProductsToSimplify || !parsed.hasLikeTerms)) throw new Error("INVALID_LEVEL");
      ids.add(raw.id); return { id: raw.id, type: settings.level, expression: raw.expression };
    });
    const language = normalizeMathWorksheetLanguage(typeof value.language === "string" ? value.language : "nb"), copy = getAlgebraCopy(language);
    return { version: 1, kind: "algebra", language, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey: value.showAnswerKey === true };
  } catch { return null; }
}
export function readAlgebraAnswer(value: unknown): AlgebraAnswer { const text = typeof value === "string" ? value : record(value) ? value.value : ""; return { value: typeof text === "string" ? text.slice(0, 240) : "" }; }
export function algebraTaskAnswer(task: AlgebraTask): string { const parsed = parseAlgebraExpression(task.expression); return parsed ? formatAlgebraPolynomial(parsed.polynomial) : ""; }
export function gradeAlgebraTask(task: AlgebraTask, value: unknown) {
  const answer = readAlgebraAnswer(value), raw = typeof value === "string" ? value : record(value) ? value.value : value;
  const isAnswered = typeof raw === "string" ? !!raw.trim() : raw != null;
  const parsed = typeof raw === "string" ? parseAlgebraExpression(raw) : null, expected = parseAlgebraExpression(task.expression);
  let points = 0, reason: "blank" | "invalid" | "unfinished" | "partial" | "wrong" | "correct" = !isAnswered ? "blank" : !parsed ? "invalid" : "wrong";
  if (parsed && expected) {
    const equivalent = sameAlgebraPolynomial(parsed.polynomial, expected.polynomial);
    if (equivalent) { points = parsed.isSimplified ? 1 : .5; reason = parsed.isSimplified ? "correct" : "unfinished"; }
    else {
      const keys = Object.keys(expected.polynomial), matches = keys.filter(k => parsed.polynomial[k] === expected.polynomial[k]).length;
      points = keys.length ? .5 * matches / Math.max(keys.length, Object.keys(parsed.polynomial).length) : 0;
      if (points > 0) reason = "partial";
    }
  }
  return { type: "algebra" as const, points, isCorrect: points === 1, isPartial: points > 0 && points < 1, isAnswered, studentAnswer: answer, correctAnswer: algebraTaskAnswer(task), reason };
}
export function gradeAlgebraWorksheet(worksheet: AlgebraWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeAlgebraTask(task, answers[task.id])])), entries = Object.values(byTask);
  const correctAuto = entries.filter(e => e.isCorrect).length, partialAuto = entries.filter(e => e.isPartial).length, unansweredAuto = entries.filter(e => !e.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, partialAuto, wrongAuto: entries.length - correctAuto - partialAuto - unansweredAuto, unansweredAuto, percentAuto: entries.length ? Math.round(entries.reduce((sum, e) => sum + e.points, 0) / entries.length * 100) : 0, byTask };
}
const nb = {
  title: "Forenkling av algebraiske uttrykk", subtitle: "Trekk sammen like ledd, forenkle produkter og øv på blandede uttrykk.", instructions: "Forenkle uttrykkene så langt som mulig. Regn ferdig produktene og trekk sammen like ledd. a + b kan ikke trekkes sammen til ab: ab betyr a · b. Ledd som ikke er like, skal stå hver for seg.",
  squares: "Ta med a² og b² i oppgavene", parentheses: "Ta med parenteser", parenthesesHint: "Fjern parentesene riktig. Gang en faktor foran parentesen inn i hvert ledd. Et minus foran parentesen skifter fortegn på alle leddene.",
  level: "Nivå", collect: "1. Trekk sammen like ledd", products: "2. Forenkle produkter", mixed: "3. Blandede uttrykk", maximum: "Største tall i oppgaven", negative: "Ta med negative ledd", support: "Vis forklaringer og støtte", empty: "Klar for første algebraark", invalidSettings: "Velg nivå, tall fra 2 til 12 og 1–60 oppgaver.", answer: "Svar", preview: "Slik vises svaret", insert: "Sett inn", partial: "Delvis riktig", unfinished: "Uttrykket har riktig verdi, men er ikke ferdig forenklet. Fjern parentesene, regn ferdig produktene og trekk sammen like ledd.", invalidAnswer: "Skriv et uttrykk med heltall, a og b. Du kan bruke parenteser, +, −, ·, * og potenser som a² eller b^2.", inputHelp: "Du kan skrive 3a + b^2 + 4 eller bruke knappene. Rekkefølgen på leddene kan variere.", prompt: "Forenkle: {expression}", collectHint: "Trekk sammen ledd med samme bokstavdel. a + a = 2a, men a + b blir stående.", productsHint: "Gang sammen tallfaktorene. Like bokstaver blir potenser: b · b = b². a · b = ab.", mixedHint: "Regn ferdig produktene først. Trekk deretter sammen ledd med lik bokstavdel. a, b, ab og b² er ulike bokstavdeler.",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = { squares: "Include a² and b² in questions", parentheses: "Include parentheses", parenthesesHint: "Remove parentheses correctly. Multiply each term by the factor outside. A minus before parentheses changes the sign of every term.", title: "Simplifying algebraic expressions", subtitle: "Collect like terms, simplify products and practise mixed expressions.", instructions: "Simplify each expression fully. Complete the products and collect like terms. a + b cannot be combined into ab: ab means a · b. Unlike terms stay separate.", level: "Level", collect: "1. Collect like terms", products: "2. Simplify products", mixed: "3. Mixed expressions", maximum: "Largest number in the question", negative: "Include negative terms", support: "Show explanations and support", empty: "Ready for your first algebra worksheet", invalidSettings: "Choose a level, numbers from 2 to 12 and 1–60 tasks.", answer: "Answer", preview: "Your expression", insert: "Insert", partial: "Partly correct", unfinished: "The expression is equivalent but is not fully simplified. Expand parentheses, complete the products and collect like terms.", invalidAnswer: "Write an expression with integers, a and b. You may use parentheses, +, −, ·, * and powers such as a² or b^2.", inputHelp: "Type 3a + b^2 + 4 or use the buttons. Terms may appear in any order.", prompt: "Simplify: {expression}", collectHint: "Collect terms with the same variable part. a + a = 2a, but a + b stays separate.", productsHint: "Multiply the numerical factors. Repeated letters become powers: b · b = b². a · b = ab.", mixedHint: "Complete the products first, then collect terms with the same variable part. a, b, ab and b² are different variable parts." };
const pt: Copy = { squares: "Incluir a² e b² nos exercícios", parentheses: "Incluir parênteses", parenthesesHint: "Elimina corretamente os parênteses. Multiplica cada termo pelo fator exterior. Um sinal de menos antes dos parênteses muda o sinal de todos os termos.", title: "Simplificação de expressões algébricas", subtitle: "Reduzir termos semelhantes, simplificar produtos e praticar expressões mistas.", instructions: "Simplifica completamente cada expressão. Calcula os produtos e reduz os termos semelhantes. a + b não se transforma em ab: ab significa a · b. Termos não semelhantes ficam separados.", level: "Nível", collect: "1. Reduzir termos semelhantes", products: "2. Simplificar produtos", mixed: "3. Expressões mistas", maximum: "Maior número no exercício", negative: "Incluir termos negativos", support: "Mostrar explicações e apoio", empty: "Pronto para a primeira ficha de álgebra", invalidSettings: "Escolhe um nível, números de 2 a 12 e de 1 a 60 exercícios.", answer: "Resposta", preview: "A tua expressão", insert: "Inserir", partial: "Parcialmente correto", unfinished: "A expressão é equivalente, mas ainda não está completamente simplificada. Elimina os parênteses, calcula os produtos e reduz os termos semelhantes.", invalidAnswer: "Escreve uma expressão com números inteiros, a e b. Podes usar parênteses, +, −, ·, * e potências como a² ou b^2.", inputHelp: "Escreve 3a + b^2 + 4 ou usa os botões. Os termos podem aparecer por qualquer ordem.", prompt: "Simplifica: {expression}", collectHint: "Reduz os termos com a mesma parte literal. a + a = 2a, mas a + b fica separado.", productsHint: "Multiplica os fatores numéricos. Letras repetidas formam potências: b · b = b². a · b = ab.", mixedHint: "Calcula primeiro os produtos. Depois reduz os termos com a mesma parte literal. a, b, ab e b² têm partes literais diferentes." };
export function getAlgebraCopy(language: string): Copy { const lang = normalizeMathWorksheetLanguage(language); return lang === "pt" ? pt : lang === "en" ? en : nb; }
export function algebraTaskPrompt(task: AlgebraTask, language = "nb"): string { return getAlgebraCopy(language).prompt.replace("{expression}", task.expression); }
export function algebraTaskHint(task: AlgebraTask, language = "nb"): string { const copy = getAlgebraCopy(language); return task.expression.includes("(") ? copy.parenthesesHint : task.type === "collect" ? copy.collectHint : task.type === "products" ? copy.productsHint : copy.mixedHint; }
