import Fraction from "fraction.js";

export const BASIC_EQUATION_TYPES = ["add", "subtract", "multiply", "divide", "multiply_add", "multiply_subtract"] as const;
export const EQUATION_TYPES = [...BASIC_EQUATION_TYPES, "both_sides", "parentheses", "fraction"] as const;
export type EquationType = typeof EQUATION_TYPES[number];
export const EQUATION_MODES = [...BASIC_EQUATION_TYPES, "mixed", "both_sides", "parentheses", "fraction"] as const;
export type EquationMode = typeof EQUATION_MODES[number];
export const OPERATIONS = ["+", "-", "*", "/"] as const;
export type EquationOperation = typeof OPERATIONS[number];
export type EquationSettings = { minimum: number; maximum: number; taskCount: number; taskType: EquationMode; showSupport: boolean; allowNegative?: boolean; allowDecimals?: boolean };
export type EquationTask = { id: string; type: EquationType; coefficient: number; constant: number; right: number; rightCoefficient?: number; denominator?: number };
export type EquationStepAnswer = { operation: string; operand: string; right: string; operandType?: string; coefficient?: string; constant?: string };
export type EquationStep = { operation: EquationOperation; operand: number; coefficient: number; right: number; constant?: number; collectX?: boolean; expand?: boolean; clearDenominator?: boolean };
export type EquationAnswer = { steps: EquationStepAnswer[] };
export type EquationWorksheet = { version: 1; kind: "equations"; language: "nb" | "en" | "pt"; title: string; instructions: string; settings: EquationSettings; showAnswerKey: boolean; tasks: EquationTask[] };
export const DEFAULT_EQUATION_SETTINGS: EquationSettings = { minimum: 1, maximum: 20, taskCount: 8, taskType: "add", showSupport: true, allowNegative: false, allowDecimals: false };
export function equationTasksPerPage(settings: Pick<EquationSettings, "taskType">) { return ["both_sides", "parentheses", "fraction"].includes(settings.taskType) ? 4 : ["mixed", "multiply_add", "multiply_subtract"].includes(settings.taskType) ? 6 : 8; }
export function equationConstant(task: EquationTask) { return task.type === "parentheses" ? new Fraction(task.constant).mul(task.coefficient).valueOf() : task.constant; }
export function equationSolution(task: EquationTask): Fraction {
  if (task.type === "divide") return new Fraction(task.right).mul(task.coefficient);
  const right = task.type === "fraction" ? new Fraction(task.right).mul(task.denominator!) : new Fraction(task.right);
  return right.sub(equationConstant(task)).div(task.coefficient - (task.rightCoefficient ?? 0));
}
export function equationSteps(task: EquationTask): EquationStep[] {
  const solution = equationSolution(task).valueOf();
  if (task.type === "divide") return [{ operation: "*" as const, operand: task.coefficient, coefficient: 1, right: solution }];
  const steps: EquationStep[] = [], coefficient = task.coefficient - (task.rightCoefficient ?? 0);
  const constant = equationConstant(task);
  const right = task.type === "fraction" ? new Fraction(task.right).mul(task.denominator!).valueOf() : task.right;
  if (task.type === "fraction") steps.push({ operation: "*", operand: task.denominator!, coefficient, constant, right, clearDenominator: true });
  if (task.type === "parentheses") steps.push({ operation: "*", operand: coefficient, coefficient, constant, right: task.right, expand: true });
  if (task.type === "both_sides") steps.push({ operation: "-", operand: task.rightCoefficient!, coefficient, constant: task.constant, right: task.right, collectX: true });
  if (constant !== 0) steps.push({ operation: constant > 0 ? "-" : "+", operand: Math.abs(constant), coefficient, right: new Fraction(right).sub(constant).valueOf() });
  if (coefficient !== 1) steps.push({ operation: "/", operand: coefficient, coefficient: 1, right: solution });
  return steps;
}
export function normalizeEquationSettings(value: unknown): EquationSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_SETTINGS");
  const raw = value as EquationSettings;
  if ((raw.allowNegative !== undefined && typeof raw.allowNegative !== "boolean") || (raw.allowDecimals !== undefined && typeof raw.allowDecimals !== "boolean")) throw new Error("INVALID_SETTINGS");
  const allowNegative = raw.allowNegative ?? false, allowDecimals = raw.allowDecimals ?? false, scale = allowDecimals ? 10 : 1;
  if (!onNumberGrid(raw.minimum, scale) || !onNumberGrid(raw.maximum, scale) || raw.minimum < (allowNegative ? -100 : 1 / scale) || raw.maximum > 100 || raw.minimum > raw.maximum) throw new Error("INVALID_RANGE");
  if (!Number.isInteger(raw.taskCount) || raw.taskCount < 1 || raw.taskCount > 100) throw new Error("INVALID_COUNT");
  if (!EQUATION_MODES.includes(raw.taskType) || typeof raw.showSupport !== "boolean") throw new Error("INVALID_SETTINGS");
  const normalized = { minimum: raw.minimum, maximum: raw.maximum, taskCount: raw.taskCount, taskType: raw.taskType, showSupport: raw.showSupport, allowNegative, allowDecimals };
  if (["divide", "mixed"].includes(raw.taskType) && !equationDivisors(normalized).length) throw new Error("INVALID_COMBINATIONS");
  return normalized;
}
function onNumberGrid(value: number, scale: number) {
  return typeof value === "number" && Number.isFinite(value) && new Fraction(value).mul(scale).d === BigInt(1);
}
function equationDivisors(settings: EquationSettings) {
  const scale = settings.allowDecimals ? 10 : 1;
  const min = new Fraction(settings.minimum).mul(scale).valueOf(), max = new Fraction(settings.maximum).mul(scale).valueOf();
  return Array.from({ length: 8 }, (_, i) => i + 2).filter(n => Math.ceil(min / n) <= Math.floor(max / n));
}
function shuffle<T>(values: T[], random: () => number) {
  for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; }
  return values;
}
function worksheetText(language: string, settings: EquationSettings) {
  const copy = getEquationCopy(language);
  const instructions = settings.taskType === "both_sides" ? copy.bothInstructions : settings.taskType === "parentheses" ? copy.parenthesesInstructions : settings.taskType === "fraction" ? copy.fractionInstructions : copy.instructions;
  return { title: `${copy.title} - ${copy[settings.taskType]}`, instructions: settings.allowDecimals ? `${instructions} ${copy.decimalInstructions}` : instructions };
}
export function generateEquationWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): EquationWorksheet {
  const settings = normalizeEquationSettings(value), lang = language === "en" || language === "pt" ? language : "nb";
  const types = settings.taskType === "mixed" ? shuffle([...BASIC_EQUATION_TYPES], random) : [settings.taskType];
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const scale = settings.allowDecimals ? 10 : 1, min = new Fraction(settings.minimum).mul(scale).valueOf(), max = new Fraction(settings.maximum).mul(scale).valueOf();
  const used = new Set<string>();
  const tasks = Array.from({ length: settings.taskCount }, (_, i) => {
    const type = types[i % types.length];
    let task: EquationTask, key: string, tries = 0;
    do {
      let solutionTicks = integer(min, max);
      let coefficient = ["multiply", "multiply_add", "multiply_subtract", "divide", "parentheses", "fraction"].includes(type) ? integer(2, 9) : 1;
      let rightCoefficient = 0;
      if (type === "both_sides") {
        const difference = integer(2, 8);
        rightCoefficient = integer(1, 9 - difference);
        coefficient = rightCoefficient + difference;
      }
      if (type === "divide") {
        const divisors = equationDivisors(settings);
        coefficient = divisors[integer(0, divisors.length - 1)];
        solutionTicks = coefficient * integer(Math.ceil(min / coefficient), Math.floor(max / coefficient));
      }
      const negative = type === "subtract" || type === "multiply_subtract" || (["both_sides", "parentheses"].includes(type) && integer(0, 1) === 0);
      let constantTicks = ["add", "subtract", "multiply_add", "multiply_subtract", "both_sides", "parentheses"].includes(type) ? integer(1, negative && !settings.allowNegative ? Math.min(20 * scale, (type === "parentheses" ? 1 : coefficient - rightCoefficient) * solutionTicks) : 20 * scale) * (negative ? -1 : 1) : 0;
      let denominator: number | undefined;
      if (type === "fraction") {
        denominator = integer(2, 9);
        // Keep the right side on the same exact number grid as the chosen solution.
        const candidates = Array.from({ length: 40 * scale + 1 }, (_, j) => j - 20 * scale).filter(ticks => ticks !== 0 && (coefficient * solutionTicks + ticks) % denominator! === 0 && (settings.allowNegative || coefficient * solutionTicks + ticks >= 0));
        constantTicks = candidates[integer(0, candidates.length - 1)];
      }
      const solution = new Fraction(solutionTicks, scale), constant = new Fraction(constantTicks, scale).valueOf();
      task = { id: `equation_${i + 1}`, type, coefficient, constant, right: (type === "divide" ? solution.div(coefficient) : type === "parentheses" ? solution.add(constant).mul(coefficient) : type === "fraction" ? solution.mul(coefficient).add(constant).div(denominator!) : solution.mul(coefficient - rightCoefficient).add(constant)).valueOf(), ...(type === "both_sides" ? { rightCoefficient } : {}), ...(type === "fraction" ? { denominator } : {}) };
      key = `${type}:${coefficient}:${rightCoefficient}:${denominator}:${constant}:${task.right}`;
    } while (used.has(key) && ++tries < 30);
    used.add(key);
    return task;
  });
  return { version: 1, kind: "equations", language: lang, ...worksheetText(lang, settings), settings, showAnswerKey, tasks: shuffle(tasks, random) };
}
export function sanitizeEquationWorksheet(value: unknown): EquationWorksheet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== "equations" || raw.version !== 1 || !Array.isArray(raw.tasks)) return null;
  try {
    const settings = normalizeEquationSettings(raw.settings), ids = new Set<string>();
    if (raw.tasks.length !== settings.taskCount) return null;
    const tasks = raw.tasks.map(value => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("task");
      const t = value as EquationTask;
      if (!EQUATION_TYPES.includes(t.type) || (settings.taskType === "mixed" ? !(BASIC_EQUATION_TYPES as readonly string[]).includes(t.type) : t.type !== settings.taskType) || typeof t.id !== "string" || !/^[\w-]{1,80}$/.test(t.id) || ids.has(t.id)) throw new Error("task");
      const scale = settings.allowDecimals ? 10 : 1;
      if (!Number.isInteger(t.coefficient) || t.coefficient < 1 || t.coefficient > 9 || !onNumberGrid(t.constant, scale) || Math.abs(t.constant) > 20 || !onNumberGrid(t.right, scale) || Math.abs(t.right) > (t.type === "parentheses" ? 1080 : 920) || (!settings.allowNegative && t.right < 0)) throw new Error("numbers");
      const single = t.type === "add" || t.type === "subtract", positive = t.type === "add" || t.type === "multiply_add", negative = t.type === "subtract" || t.type === "multiply_subtract";
      if (t.type === "fraction" ? !Number.isInteger(t.denominator) || t.denominator! < 2 || t.denominator! > 9 || Math.abs(t.right) > 460 : t.denominator !== undefined) throw new Error("denominator");
      if (t.type === "both_sides") {
        if (!Number.isInteger(t.rightCoefficient) || t.rightCoefficient! < 1 || t.coefficient - t.rightCoefficient! < 2 || t.constant === 0) throw new Error("shape");
      } else if (t.rightCoefficient !== undefined || (single ? t.coefficient !== 1 : t.coefficient < 2) || (positive ? t.constant <= 0 : negative ? t.constant >= 0 : ["parentheses", "fraction"].includes(t.type) ? t.constant === 0 : t.constant !== 0)) throw new Error("shape");
      const solution = equationSolution(t);
      if (solution.mul(scale).d !== BigInt(1) || solution.compare(settings.minimum) < 0 || solution.compare(settings.maximum) > 0) throw new Error("solution");
      ids.add(t.id);
      return { id: t.id, type: t.type, coefficient: t.coefficient, constant: t.constant, right: t.right, ...(t.type === "both_sides" ? { rightCoefficient: t.rightCoefficient } : {}), ...(t.type === "fraction" ? { denominator: t.denominator } : {}) };
    });
    const language = raw.language === "en" || raw.language === "pt" ? raw.language : "nb";
    return { version: 1, kind: "equations", language, ...worksheetText(language, settings), settings, tasks, showAnswerKey: raw.showAnswerKey === true };
  } catch { return null; }
}
export function readEquationAnswer(value: unknown, task: EquationTask): EquationAnswer {
  const raw = value && typeof value === "object" ? value as { steps?: unknown } : {};
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).slice(0, 18) : "";
  return { steps: equationSteps(task).map((step, i) => {
    const s = steps[i] && typeof steps[i] === "object" ? steps[i] : {};
    return { operation: OPERATIONS.includes(s.operation) ? s.operation : "", operand: text(s.operand), right: text(s.right), ...(step.collectX ? { operandType: s.operandType === "x" || s.operandType === "number" ? s.operandType : "", coefficient: text(s.coefficient) } : {}), ...(step.expand ? { coefficient: text(s.coefficient), constant: text(s.constant) } : {}) };
  }) };
}
export function parseEquationNumber(value: string): Fraction | null {
  const text = value.trim().replace(",", ".");
  if (!/^-?\d{1,8}(?:\.\d{1,6})?$/.test(text)) return null;
  try { return new Fraction(text); } catch { return null; }
}
export function gradeEquationTask(task: EquationTask, value: unknown) {
  const studentAnswer = readEquationAnswer(value, task), expected = equationSteps(task);
  const carriesLine = ["both_sides", "parentheses", "fraction"].includes(task.type);
  const first = studentAnswer.steps[0];
  const writtenCoefficient = carriesLine ? parseEquationNumber(first.coefficient ?? "") : null;
  const writtenConstant = task.type === "parentheses" ? parseEquationNumber(first.constant ?? "") : null;
  const invalidCoefficient = carriesLine && !!first.coefficient?.trim() && (!writtenCoefficient || writtenCoefficient.equals(0));
  const invalidConstant = task.type === "parentheses" && !!first.constant?.trim() && !writtenConstant;
  const steps = expected.map((step, i) => {
    const a = studentAnswer.steps[i], operand = parseEquationNumber(a.operand);
    const targetOperation = task.type === "parentheses" && i === 1 && writtenConstant ? writtenConstant.compare(0) < 0 ? "+" : "-" : step.operation;
    const inverse = targetOperation === "+" ? "-" : targetOperation === "-" ? "+" : null;
    const reciprocal = step.expand ? null : targetOperation === "*" ? "/" : targetOperation === "/" ? "*" : null;
    const targetOperand = carriesLine && i === 2 && writtenCoefficient ? writtenCoefficient : task.type === "parentheses" && i === 1 && writtenConstant ? writtenConstant.abs() : new Fraction(step.operand);
    const setupCorrect = !(i === 2 && invalidCoefficient) && !(i === 1 && invalidConstant) && (!step.collectX || a.operandType === "x") && (i === 1 || !targetOperand.equals(0)) && !!operand && ((a.operation === targetOperation && operand.equals(targetOperand)) || (inverse !== null && a.operation === inverse && operand.equals(targetOperand.neg())) || (reciprocal !== null && a.operation === reciprocal && !targetOperand.equals(0) && operand.equals(targetOperand.inverse())));
    const coefficientCorrect = !(step.collectX || step.expand) || (parseEquationNumber(a.coefficient ?? "")?.equals(step.coefficient) ?? false);
    const constantCorrect = !step.expand || (parseEquationNumber(a.constant ?? "")?.equals(step.constant!) ?? false);
    const canonicalRightCorrect = parseEquationNumber(a.right)?.equals(step.right) ?? false;
    let calculationTarget = new Fraction(step.right);
    let validPreviousLine = !(i === 2 && invalidCoefficient) && !(i > 0 && invalidConstant);
    // Judge later calculations from the student's written line, without erasing the original error.
    if (carriesLine && i > 0) {
      const previousRight = parseEquationNumber(studentAnswer.steps[i - 1].right);
      if (studentAnswer.steps[i - 1].right.trim() && !previousRight) validPreviousLine = false;
      if (previousRight) calculationTarget = i === 2 ? previousRight.div(writtenCoefficient && !writtenCoefficient.equals(0) ? writtenCoefficient : expected[0].coefficient) : previousRight.sub(writtenConstant ?? equationConstant(task));
    }
    const answerCorrect = validPreviousLine && coefficientCorrect && constantCorrect && (parseEquationNumber(a.right)?.equals(calculationTarget) ?? false);
    const followThroughCorrect = answerCorrect && !canonicalRightCorrect;
    return { setupCorrect, answerCorrect, coefficientCorrect, constantCorrect, followThroughCorrect };
  });
  const points = steps.reduce((sum, s) => sum + Number(s.setupCorrect) + Number(s.answerCorrect), 0) / (steps.length * 2);
  return { type: "equations" as const, isCorrect: points === 1, isPartial: points > 0 && points < 1, points, steps,
    isAnswered: studentAnswer.steps.some(s => !!(s.operation || s.operand.trim() || s.right.trim() || s.operandType || s.coefficient?.trim() || s.constant?.trim())), studentAnswer,
    correctAnswer: { steps: expected.map(s => ({ operation: s.operation, operand: String(s.operand), right: String(s.right), ...(s.collectX ? { operandType: "x", coefficient: String(s.coefficient) } : {}), ...(s.expand ? { coefficient: String(s.coefficient), constant: String(s.constant) } : {}) })) } };
}
export function gradeEquationWorksheet(worksheet: EquationWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeEquationTask(task, answers[task.id])])), results = Object.values(byTask);
  return { totalAuto: results.length, correctAuto: results.filter(r => r.isCorrect).length, partialAuto: results.filter(r => r.isPartial).length, wrongAuto: results.filter(r => r.isAnswered && r.points === 0).length, unansweredAuto: results.filter(r => !r.isAnswered).length, percentAuto: results.length ? Math.round(results.reduce((sum, r) => sum + r.points, 0) / results.length * 100) : null, byTask };
}
export function formatEquationNumber(value: number, language = "nb") { return String(value).replace(".", language === "en" ? "." : ","); }
export function equationNumerator(task: EquationTask, language = "nb") { return `${task.coefficient === 1 ? "" : task.coefficient}x${task.constant === 0 ? "" : ` ${task.constant > 0 ? "+" : "-"} ${formatEquationNumber(Math.abs(task.constant), language)}`}`; }
export function equationLeft(task: EquationTask, language = "nb") { const tail = task.constant === 0 ? "" : ` ${task.constant > 0 ? "+" : "-"} ${formatEquationNumber(Math.abs(task.constant), language)}`; return task.type === "divide" ? `x / ${task.coefficient}` : task.type === "parentheses" ? `${task.coefficient}(x${tail})` : task.type === "fraction" ? `(${equationNumerator(task, language)}) / ${task.denominator}` : equationNumerator(task, language); }
export function equationRight(task: EquationTask, language = "nb") { return `${task.type === "both_sides" ? `${task.rightCoefficient === 1 ? "" : task.rightCoefficient}x ${task.right < 0 ? "-" : "+"} ` : ""}${formatEquationNumber(task.type === "both_sides" ? Math.abs(task.right) : task.right, language)}`; }
export function equationPrompt(task: EquationTask, language: string) {
  const c = getEquationCopy(language);
  const inner = `x${task.constant === 0 ? "" : ` ${task.constant > 0 ? c.plus : c.minus} ${formatEquationNumber(Math.abs(task.constant), language)}`}`;
  const numerator = `${task.coefficient === 1 ? "" : `${task.coefficient} ${c.times} `}${inner}`;
  const left = task.type === "divide" ? `x ${c.divided} ${task.coefficient}` : task.type === "parentheses" ? `${task.coefficient} ${c.times} ${c.openParenthesis} ${inner} ${c.closeParenthesis}` : task.type === "fraction" ? `${c.openParenthesis} ${numerator} ${c.closeParenthesis} ${c.divided} ${task.denominator}` : numerator;
  const right = task.type === "both_sides" ? `${task.rightCoefficient === 1 ? "" : `${task.rightCoefficient} ${c.times} `}x ${task.right < 0 ? c.minus : c.plus} ${formatEquationNumber(Math.abs(task.right), language)}` : formatEquationNumber(task.right, language);
  return `${c.solve}: ${left} ${c.equals} ${right}.`;
}
const nb = {
  fraction: "Brøk med nevner", fractionInstructions: "Finn x. Gang først begge sider med nevneren for å fjerne brøkstreken. Fjern så konstantleddet og finn x. Velg samme regneoperasjon på begge sider, og fyll ut neste linje. Fremgangsmåte og utregning i hvert steg teller like mye.", clearDenominator: "Fjern nevneren",
  parentheses: "Parenteser", parenthesesInstructions: "Finn x. Gang tallet utenfor parentesen med hvert ledd inni, og fyll ut neste linje. Fjern så konstantleddet og finn x. Fremgangsmåte og utregning i hvert steg teller like mye.", expand: "Gang inn i parentesen", multiplier: "Tall som ganges med hvert ledd", constant: "Konstantledd med fortegn", openParenthesis: "parentes", closeParenthesis: "parentes slutt",
  both_sides: "x på begge sider", bothInstructions: "Finn x. Samle først x-leddene på venstre side, fjern konstantleddet og finn x. Velg samme regneoperasjon på begge sider, og fyll ut neste linje. Fremgangsmåte og utregning i hvert steg teller like mye.", collectX: "Samle x-leddene", termType: "Type ledd", numberTerm: "Tall", xTerm: "x-ledd", coefficient: "Tallet foran x", followThrough: "Riktig videreføring fra din forrige linje.",
  allowNegative: "Tillat negative tall", allowDecimals: "Tillat desimaltall (én desimal)", decimalInstructions: "Du kan bruke komma eller punktum i desimaltall.", rangeHelp: "Velg gyldige tall mellom -100 og 100 innenfor valgene for negative tall og desimaltall. Antall oppgaver må være 1 til 100.", divisionHelp: "Tallområdet gir ingen divisjonsoppgaver med valgte tall. Utvid tallområdet.",
  title: "Ligninger", subtitle: "Finn x, og vis samme regneoperasjon på begge sider.", add: "x + a = b", subtract: "x - a = b", multiply: "ax = b", divide: "x / a = b", multiply_add: "ax + b = c", multiply_subtract: "ax - b = c", mixed: "Blandet", taskType: "Oppgavetype", range: "Verdien av x", support: "Vis støtteord", generate: "Lag ligningsark", empty: "Klar for første ligningsark", invalid: "Velg hele tall fra 1 til 100, og 1 til 100 oppgaver. Minst må være mindre enn eller lik størst.", combinations: "Tallområdet må inneholde en verdi som kan deles på et helt tall fra 2 til 9.", instructions: "Finn x. Velg samme regneoperasjon på begge sider, og fyll ut neste linje. I to steg fjerner du konstantleddet først. Fremgangsmåte og utregning teller like mye.", operation: "Regneoperasjon", operand: "Tall på begge sider", next: "Neste linje", step: "Steg", method: "Fremgangsmåte", calculation: "Utregning", partial: "Delvis riktig", both: "På begge sider", solve: "Løs ligningen", divided: "delt på", times: "ganger", plus: "pluss", minus: "minus", equals: "er lik", remove: "Fjern konstantleddet", isolate: "Finn x",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  fraction: "Fraction equations", fractionInstructions: "Find x. First multiply both sides by the denominator to remove the fraction. Then remove the constant and find x. Choose the same operation on both sides and complete the next line. Method and calculation in each step are weighted equally.", clearDenominator: "Clear the denominator",
  parentheses: "Parentheses", parenthesesInstructions: "Find x. Multiply each term inside the parentheses by the number outside and complete the next line. Then remove the constant and find x. Method and calculation in each step are weighted equally.", expand: "Expand the parentheses", multiplier: "Number multiplying each term", constant: "Constant including its sign", openParenthesis: "open parenthesis", closeParenthesis: "close parenthesis",
  both_sides: "x on both sides", bothInstructions: "Find x. First collect the x terms on the left, remove the constant, then find x. Choose the same operation on both sides and complete the next line. Method and calculation in each step are weighted equally.", collectX: "Collect the x terms", termType: "Term type", numberTerm: "Number", xTerm: "x term", coefficient: "Coefficient of x", followThrough: "Correct calculation from your previous line.",
  allowNegative: "Allow negative numbers", allowDecimals: "Allow decimals (one decimal place)", decimalInstructions: "You can use a comma or a decimal point.", rangeHelp: "Choose valid numbers between -100 and 100 according to the negative number and decimal settings. Task count must be 1 to 100.", divisionHelp: "No division tasks fit this range with the selected numbers. Widen the range.",
  title: "Equations", subtitle: "Find x, using the same operation on both sides.", add: "x + a = b", subtract: "x - a = b", multiply: "ax = b", divide: "x / a = b", multiply_add: "ax + b = c", multiply_subtract: "ax - b = c", mixed: "Mixed", taskType: "Task type", range: "Value of x", support: "Show support labels", generate: "Create equation worksheet", empty: "Ready for your first equation worksheet", invalid: "Choose whole numbers from 1 to 100 and 1 to 100 tasks. Minimum must not exceed maximum.", combinations: "The range must contain a value divisible by a whole number from 2 to 9.", instructions: "Find x. Choose the same operation on both sides and complete the next line. For two steps, remove the constant first. Method and calculation are weighted equally.", operation: "Operation", operand: "Number on both sides", next: "Next line", step: "Step", method: "Method", calculation: "Calculation", partial: "Partially correct", both: "On both sides", solve: "Solve the equation", divided: "divided by", times: "times", plus: "plus", minus: "minus", equals: "equals", remove: "Remove the constant", isolate: "Find x",
};
const pt: Copy = {
  fraction: "Equações com frações", fractionInstructions: "Calcula x. Multiplica primeiro os dois membros pelo denominador para eliminar a fração. Depois elimina o termo constante e calcula x. Escolhe a mesma operação nos dois membros e completa a linha seguinte. O método e o cálculo de cada passo têm o mesmo peso.", clearDenominator: "Elimina o denominador",
  parentheses: "Parênteses", parenthesesInstructions: "Calcula x. Multiplica cada termo dentro dos parênteses pelo número de fora e completa a linha seguinte. Depois elimina o termo constante e calcula x. O método e o cálculo de cada passo têm o mesmo peso.", expand: "Elimina os parênteses", multiplier: "Número que multiplica cada termo", constant: "Termo constante com sinal", openParenthesis: "abre parênteses", closeParenthesis: "fecha parênteses",
  both_sides: "x nos dois membros", bothInstructions: "Calcula x. Reúne primeiro os termos com x no membro esquerdo, elimina o termo constante e calcula x. Escolhe a mesma operação nos dois membros e completa a linha seguinte. O método e o cálculo de cada passo têm o mesmo peso.", collectX: "Reúne os termos com x", termType: "Tipo de termo", numberTerm: "Número", xTerm: "Termo com x", coefficient: "Coeficiente de x", followThrough: "Cálculo correto a partir da tua linha anterior.",
  allowNegative: "Permitir números negativos", allowDecimals: "Permitir decimais (uma casa decimal)", decimalInstructions: "Podes usar uma vírgula ou um ponto decimal.", rangeHelp: "Escolhe números válidos entre -100 e 100 de acordo com as opções de negativos e decimais. O número de exercícios deve ser de 1 a 100.", divisionHelp: "Não há exercícios de divisão neste intervalo com os números escolhidos. Aumenta o intervalo.",
  title: "Equações", subtitle: "Calcula x usando a mesma operação nos dois membros.", add: "x + a = b", subtract: "x - a = b", multiply: "ax = b", divide: "x / a = b", multiply_add: "ax + b = c", multiply_subtract: "ax - b = c", mixed: "Misto", taskType: "Tipo de exercício", range: "Valor de x", support: "Mostrar palavras de apoio", generate: "Criar ficha de equações", empty: "Pronto para a primeira ficha de equações", invalid: "Escolhe inteiros de 1 a 100 e 1 a 100 exercícios. O mínimo não pode exceder o máximo.", combinations: "O intervalo deve conter um valor divisível por um inteiro de 2 a 9.", instructions: "Calcula x. Escolhe a mesma operação nos dois membros e completa a linha seguinte. Em dois passos, elimina primeiro o termo constante. O método e o cálculo têm o mesmo peso.", operation: "Operação", operand: "Número nos dois membros", next: "Linha seguinte", step: "Passo", method: "Método", calculation: "Cálculo", partial: "Parcialmente correto", both: "Nos dois membros", solve: "Resolve a equação", divided: "dividido por", times: "vezes", plus: "mais", minus: "menos", equals: "é igual a", remove: "Elimina o termo constante", isolate: "Calcula x",
};
export function getEquationCopy(language: string): Copy { return language === "en" ? en : language === "pt" ? pt : nb; }
