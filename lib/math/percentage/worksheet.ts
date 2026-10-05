import Fraction from "fraction.js";

export const SIMPLE_PERCENTAGES = [10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90] as const;
export const BASIC_PERCENTAGE_TASK_TYPES = ["find_percentage", "find_part", "find_whole"] as const;
export const PERCENTAGE_TASK_TYPES = [...BASIC_PERCENTAGE_TASK_TYPES, "discount", "increase"] as const;
export type PercentageTaskType = typeof PERCENTAGE_TASK_TYPES[number];
export const PERCENTAGE_MODES = [...BASIC_PERCENTAGE_TASK_TYPES, "mixed", "discount", "increase"] as const;
export type PercentageMode = typeof PERCENTAGE_MODES[number];
export type PercentageSettings = { minimum: number; maximum: number; taskCount: number; showSupport: boolean; showConclusion?: boolean; taskType?: PercentageMode };
export type PercentageTask = { id: string; type: PercentageTaskType; part: number; whole: number; percent: number };
export type PercentageAnswer = { numerator: string; denominator: string; percent: string; multiplier?: string; result?: string; change?: string; finalValue?: string; conclusion?: string };
export type PercentageWorksheet = {
  version: 1; kind: "percentage"; language: "nb" | "en" | "pt"; title: string; instructions: string;
  settings: PercentageSettings; showAnswerKey: boolean; tasks: PercentageTask[];
};
export const DEFAULT_PERCENTAGE_SETTINGS: PercentageSettings = { minimum: 20, maximum: 200, taskCount: 12, showSupport: true, showConclusion: false, taskType: "find_percentage" };
export function isPercentageChange(type: PercentageMode | undefined): boolean {
  return type === "discount" || type === "increase";
}
export function percentageTasksPerPage(settings: Pick<PercentageSettings, "taskType" | "showConclusion">): number {
  return isPercentageChange(settings.taskType) ? settings.showConclusion ? 8 : 10 : settings.showConclusion ? 10 : 12;
}
export function percentageFinalValue(task: PercentageTask): number {
  return task.type === "discount" ? task.whole - task.part : task.whole + task.part;
}
export function normalizePercentageSettings(value: unknown): PercentageSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_SETTINGS");
  const raw = value as PercentageSettings;
  if (!Number.isInteger(raw.minimum) || !Number.isInteger(raw.maximum) || raw.minimum < 1 || raw.maximum > 10000 || raw.minimum > raw.maximum) throw new Error("INVALID_RANGE");
  if (!Number.isInteger(raw.taskCount) || raw.taskCount < 1 || raw.taskCount > 100) throw new Error("INVALID_COUNT");
  if (typeof raw.showSupport !== "boolean") throw new Error("INVALID_SUPPORT");
  if (raw.showConclusion !== undefined && typeof raw.showConclusion !== "boolean") throw new Error("INVALID_CONCLUSION");
  const taskType = raw.taskType === undefined ? "find_percentage" : raw.taskType;
  if (!PERCENTAGE_MODES.includes(taskType)) throw new Error("INVALID_TYPE");
  return { minimum: raw.minimum, maximum: raw.maximum, taskCount: raw.taskCount, showSupport: raw.showSupport, showConclusion: raw.showConclusion ?? false, taskType };
}
export function percentageChoices(settings: PercentageSettings) {
  return SIMPLE_PERCENTAGES.flatMap(percent => {
    const step = Number(new Fraction(percent, 100).d);
    const first = Math.ceil(settings.minimum / step), last = Math.floor(settings.maximum / step);
    return first <= last ? [{ percent, step, first, last }] : [];
  });
}
function shuffle<T>(values: T[], random: () => number) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
export function generatePercentageWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): PercentageWorksheet {
  const settings = normalizePercentageSettings(value), choices = shuffle(percentageChoices(settings), random);
  if (!choices.length) throw new Error("INVALID_COMBINATIONS");
  const lang = language === "en" || language === "pt" ? language : "nb";
  const types = settings.taskType === "mixed" ? shuffle([...BASIC_PERCENTAGE_TASK_TYPES], random) : [settings.taskType ?? "find_percentage"];
  const used = new Set<string>();
  const tasks = Array.from({ length: settings.taskCount }, (_, i): PercentageTask => {
    const choice = choices[i % choices.length], type = types[i % types.length];
    let whole: number, key: string, attempts = 0;
    do {
      whole = (choice.first + Math.floor(random() * (choice.last - choice.first + 1))) * choice.step;
      key = `${type}:${whole}:${choice.percent}`;
    } while (used.has(key) && ++attempts < 30);
    used.add(key);
    return { id: `percentage_${i + 1}`, type, whole, part: new Fraction(whole).mul(choice.percent).div(100).valueOf(), percent: choice.percent };
  });
  return { version: 1, kind: "percentage", language: lang, ...worksheetText(lang, settings.taskType, settings.showConclusion), settings, showAnswerKey, tasks: shuffle(tasks, random) };
}
export function sanitizePercentageWorksheet(value: unknown): PercentageWorksheet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== "percentage" || raw.version !== 1 || !Array.isArray(raw.tasks)) return null;
  try {
    const settings = normalizePercentageSettings(raw.settings);
    if (raw.tasks.length !== settings.taskCount) return null;
    const ids = new Set<string>();
    const tasks = raw.tasks.map((value): PercentageTask => {
      if (!value || typeof value !== "object") throw new Error("task");
      const task = value as PercentageTask;
      if (!PERCENTAGE_TASK_TYPES.includes(task.type) || (settings.taskType === "mixed" ? !(BASIC_PERCENTAGE_TASK_TYPES as readonly string[]).includes(task.type) : task.type !== settings.taskType) || typeof task.id !== "string" || !/^[\w-]{1,80}$/.test(task.id) || ids.has(task.id) ||
          !Number.isInteger(task.whole) || task.whole < settings.minimum || task.whole > settings.maximum || !Number.isInteger(task.part) || task.part <= 0 || task.part >= task.whole) throw new Error("task");
      ids.add(task.id);
      const percent = new Fraction(task.part, task.whole).mul(100);
      if (percent.d !== BigInt(1) || !(SIMPLE_PERCENTAGES as readonly number[]).includes(percent.valueOf())) throw new Error("percent");
      return { id: task.id, type: task.type, whole: task.whole, part: task.part, percent: percent.valueOf() };
    });
    const language = raw.language === "en" || raw.language === "pt" ? raw.language : "nb";
    return { version: 1, kind: "percentage", language, ...worksheetText(language, settings.taskType, settings.showConclusion), settings, tasks, showAnswerKey: raw.showAnswerKey === true };
  } catch { return null; }
}
export function readPercentageAnswer(value: unknown, taskType: PercentageTaskType = "find_percentage"): PercentageAnswer {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
  // Older percentage submissions used a fixed × 100 outside the fraction.
  const legacyPercentage = taskType === "find_percentage" && raw.multiplier === undefined && [raw.numerator, raw.denominator, raw.percent].some(value => text(value).trim() !== "");
  return { numerator: text(raw.numerator), denominator: text(raw.denominator), percent: taskType === "find_percentage" ? text(raw.percent) : "", multiplier: legacyPercentage ? "100" : text(raw.multiplier), ...(taskType !== "find_percentage" ? { result: text(raw.result) } : {}), ...(isPercentageChange(taskType) ? { change: text(raw.change), finalValue: text(raw.finalValue) } : {}), conclusion: text(raw.conclusion).slice(0, 500) };
}
function parseNumber(value: string): Fraction | null {
  const text = value.trim().replace(",", ".");
  if (!/^\d{1,10}(?:\.\d{1,6})?$/.test(text)) return null;
  try { return new Fraction(text); } catch { return null; }
}
export function gradePercentageTask(task: PercentageTask, value: unknown) {
  const answer = readPercentageAnswer(value, task.type), numerator = parseNumber(answer.numerator), denominator = parseNumber(answer.denominator);
  const productTask = task.type !== "find_percentage", findWhole = task.type === "find_whole", changeTask = isPercentageChange(task.type);
  const multiplier = parseNumber(answer.multiplier ?? "");
  const expected = new Fraction(findWhole ? task.whole : productTask ? task.part : task.percent);
  const fractionSetupCorrect = !!numerator && !!denominator && !!multiplier && denominator.compare(0) > 0 && numerator.mul(multiplier).div(denominator).equals(expected);
  const changeCorrect = parseNumber(productTask ? answer.result ?? "" : answer.percent)?.equals(expected) ?? false;
  const transitionSetupCorrect = changeTask && (parseNumber(answer.change ?? "")?.equals(task.part) ?? false);
  const finalCorrect = changeTask && (parseNumber(answer.finalValue ?? "")?.equals(percentageFinalValue(task)) ?? false);
  const setupCorrect = fractionSetupCorrect && (!changeTask || transitionSetupCorrect);
  const answerCorrect = changeCorrect && (!changeTask || finalCorrect);
  const points = (changeTask ? [fractionSetupCorrect, changeCorrect, transitionSetupCorrect, finalCorrect].filter(Boolean).length / 4 : (setupCorrect ? .5 : 0) + (answerCorrect ? .5 : 0)) as 0 | .25 | .5 | .75 | 1;
  const firstFactor = productTask && !findWhole ? task.percent : task.part, secondFactor = productTask && !findWhole ? task.whole : 100, divisor = findWhole ? task.percent : productTask ? 100 : task.whole;
  const directSetup = denominator?.equals(divisor) === true && ((numerator?.equals(firstFactor) === true && multiplier?.equals(secondFactor) === true) || (numerator?.equals(secondFactor) === true && multiplier?.equals(firstFactor) === true));
  return { type: "percentage" as const, setupCorrect, answerCorrect, fractionSetupCorrect, changeCorrect, transitionSetupCorrect, finalCorrect, directSetup, isCorrect: points === 1, isPartial: points > 0 && points < 1, points,
    isAnswered: [answer.numerator, answer.denominator, answer.multiplier ?? "", productTask ? answer.result ?? "" : answer.percent, answer.change ?? "", answer.finalValue ?? ""].some(text => text.trim() !== ""), studentAnswer: answer,
    correctAnswer: { numerator: String(firstFactor), multiplier: String(secondFactor), denominator: String(divisor), ...(productTask ? { result: expected.toString() } : { percent: expected.toString() }), ...(changeTask ? { change: String(task.part), finalValue: String(percentageFinalValue(task)) } : {}) } };
}
export function gradePercentageWorksheet(worksheet: PercentageWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradePercentageTask(task, answers[task.id])]));
  const results = Object.values(byTask);
  return { totalAuto: results.length, correctAuto: results.filter(result => result.isCorrect).length,
    partialAuto: results.filter(result => result.isPartial).length, wrongAuto: results.filter(result => result.isAnswered && result.points === 0).length,
    unansweredAuto: results.filter(result => !result.isAnswered).length,
    percentAuto: results.length ? Math.round(results.reduce((sum, result) => sum + result.points, 0) / results.length * 100) : null, byTask };
}
export function percentagePrompt(task: PercentageTask, language: string): string {
  if (task.type === "discount") return language === "en" ? `${task.whole} kr with a ${task.percent}% discount. What is the new price?` : language === "pt" ? `${task.whole} kr com ${task.percent}% de desconto. Qual é o novo preço?` : `${task.whole} kr med ${task.percent} % rabatt. Hva blir ny pris?`;
  if (task.type === "increase") return language === "en" ? `A price of ${task.whole} kr increases by ${task.percent}%. What is the new price?` : language === "pt" ? `Um preço de ${task.whole} kr aumenta ${task.percent}%. Qual é o novo preço?` : `Prisen på ${task.whole} kr øker med ${task.percent} %. Hva blir ny pris?`;
  if (task.type === "find_whole") return language === "en" ? `${task.part} is ${task.percent}% of a number. What is the whole number?` : language === "pt" ? `${task.part} representa ${task.percent}% de um número. Qual é o total?` : `${task.part} er ${task.percent} % av et tall. Hva er hele tallet?`;
  if (task.type === "find_part") return language === "en" ? `What is ${task.percent}% of ${task.whole}?` : language === "pt" ? `Quanto é ${task.percent}% de ${task.whole}?` : `Hva er ${task.percent} % av ${task.whole}?`;
  return language === "en" ? `What percentage is ${task.part} of ${task.whole}?` : language === "pt" ? `Que percentagem representa ${task.part} de ${task.whole}?` : `Hvor mange prosent er ${task.part} av ${task.whole}?`;
}
const nb = {
  discount: "Rabatt", increase: "Prosentvis økning", discountTitle: "Prosentregning – rabatt", increaseTitle: "Prosentregning – prosentvis økning", originalPrice: "Førpris", newPrice: "Ny pris", discountAmount: "Rabatt", increaseAmount: "Økning", newPriceSetup: "Oppsett for ny pris", changeSupport: "Vis støtteord", priceRange: "Prisen før endring",
  discountInstructions: "Finn rabatten med brøken, og trekk den fra førprisen. Skriv bare tall i regnefeltene. Oppsett og svar i hvert steg teller like mye.", increaseInstructions: "Finn økningen med brøken, og legg den til førprisen. Skriv bare tall i regnefeltene. Oppsett og svar i hvert steg teller like mye.", changeSetupHelp: "Prosenttallet og førprisen skal multipliseres over delestreken, med 100 under.", discountSetupHelp: "Trekk rabatten fra førprisen.", increaseSetupHelp: "Legg økningen til førprisen.",
  conclusionCalculationInstructions: "Sett opp brøken og regn ut svaret. Skriv bare tall i regnefeltene, uten prosenttegn. Oppsett og svar teller like mye.",
  percentNumber: "Prosenttall", conclusion: "Svar med en setning", showConclusion: "Plass til svar med en setning", conclusionInstructions: "Avslutt med en setning som forklarer svaret.", percentageSetupHelp: "Delen og 100 skal multipliseres over delestreken, med helheten under.",
  title: "Prosentregning", subtitle: "Sett opp brøken og regn med prosent.", worksheetTitle: "Prosentregning – finn prosenten",
  taskType: "Oppgavetype", find_percentage: "Finn prosenten", find_part: "Finn delen", partTitle: "Prosentregning – finn delen", partInstructions: "Sett opp brøken og finn delen. Skriv bare tall i feltene, uten prosenttegn. Oppsett og svar teller like mye.", partSupport: "Vis prosent og helhet", hundred: "Hundre", multiplier: "Andre faktor over delestreken", partSetupHelp: "Prosenttallet og helheten skal multipliseres over delestreken, med 100 under.", equivalentSetup: "Riktig, med et likeverdig oppsett.", invalidType: "Velg en gyldig oppgavetype.",
  find_whole: "Finn helheten", mixed: "Blandet", wholeTitle: "Prosentregning – finn helheten", mixedTitle: "Prosentregning – blandet", wholeInstructions: "Sett opp brøken og finn helheten. Skriv bare tall i feltene, uten prosenttegn. Oppsett og svar teller like mye.", mixedInstructions: "Finn det oppgaven spør etter: prosenten, delen eller helheten. Sett opp brøken og regn ut svaret. Skriv bare tall i feltene. Oppsett og svar teller like mye.", wholeSupport: "Vis del og prosent", mixedSupport: "Vis støtteord", wholeSetupHelp: "Delen og 100 skal multipliseres over delestreken, med prosenttallet under.",
  instructions: "Sett opp brøken og regn ut prosenten. Skriv bare tall i feltene. Oppsett og svar teller like mye.",
  range: "Helheten i oppgaven", support: "Vis del og helhet", generate: "Lag prosentark", empty: "Klar for første prosentark",
  invalidRange: "Velg hele tall fra 1 til 10 000, med minst ≤ størst.", invalidCombinations: "Tallområdet gir ingen oppgaver med hele tall og enkle prosentsvar. Endre tallområdet.",
  numerator: "Tallet over delestreken", denominator: "Tallet under delestreken", percent: "Prosent", part: "Del", whole: "Helhet", setup: "Oppsett", partial: "Delvis riktig",
  equivalent: "Riktig, med en likeverdig brøk.", setupHelp: "Se på hva som er del og helhet.", answerHelp: "Se på utregningen.", numberHelp: "Bruk bare tall i brøken, uten prosenttegn.",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  discount: "Discount", increase: "Percentage increase", discountTitle: "Percentages – discount", increaseTitle: "Percentages – percentage increase", originalPrice: "Original price", newPrice: "New price", discountAmount: "Discount", increaseAmount: "Increase", newPriceSetup: "New price setup", changeSupport: "Show support labels", priceRange: "Price before the change",
  discountInstructions: "Find the discount using the fraction, then subtract it from the original price. Write only numbers. Each setup and answer has equal weight.", increaseInstructions: "Find the increase using the fraction, then add it to the original price. Write only numbers. Each setup and answer has equal weight.", changeSetupHelp: "Multiply the percentage number and the original price above the fraction bar, with 100 below.", discountSetupHelp: "Subtract the discount from the original price.", increaseSetupHelp: "Add the increase to the original price.",
  conclusionCalculationInstructions: "Set up the fraction and calculate the answer. Write only numbers in the calculation boxes, without percentage signs. Setup and answer are weighted equally.",
  percentNumber: "Percent", conclusion: "Answer in a sentence", showConclusion: "Space for an answer in a sentence", conclusionInstructions: "Finish with a sentence explaining the answer.", percentageSetupHelp: "Multiply the part and 100 above the fraction bar, with the whole below.",
  title: "Percentages", subtitle: "Set up the fraction and calculate percentages.", worksheetTitle: "Percentages – find the percentage",
  taskType: "Task type", find_percentage: "Find the percentage", find_part: "Find the part", partTitle: "Percentages – find the part", partInstructions: "Set up the fraction and find the part. Write only numbers in the boxes, without percentage signs. Setup and answer are weighted equally.", partSupport: "Show percentage and whole", hundred: "Hundred", multiplier: "Second factor above the fraction bar", partSetupHelp: "Multiply the percentage number and the whole above the fraction bar, with 100 below.", equivalentSetup: "Correct, using an equivalent setup.", invalidType: "Choose a valid task type.",
  find_whole: "Find the whole", mixed: "Mixed", wholeTitle: "Percentages – find the whole", mixedTitle: "Percentages – mixed", wholeInstructions: "Set up the fraction and find the whole. Write only numbers in the boxes, without percentage signs. Setup and answer are weighted equally.", mixedInstructions: "Find what each task asks for: the percentage, part or whole. Set up the fraction and calculate the answer. Write only numbers in the boxes. Setup and answer are weighted equally.", wholeSupport: "Show part and percentage", mixedSupport: "Show support labels", wholeSetupHelp: "Multiply the part and 100 above the fraction bar, with the percentage number below.",
  instructions: "Set up the fraction and calculate the percentage. Write only numbers in the boxes. Setup and answer are weighted equally.",
  range: "Whole in the task", support: "Show part and whole", generate: "Create percentage worksheet", empty: "Ready for your first percentage worksheet",
  invalidRange: "Choose whole numbers from 1 to 10,000, with minimum ≤ maximum.", invalidCombinations: "No tasks with whole numbers and simple percentage answers fit this range. Change the range.",
  numerator: "Number above the fraction bar", denominator: "Number below the fraction bar", percent: "Percentage", part: "Part", whole: "Whole", setup: "Setup", partial: "Partially correct",
  equivalent: "Correct, using an equivalent fraction.", setupHelp: "Check which number is the part and which is the whole.", answerHelp: "Check your calculation.", numberHelp: "Use only numbers in the fraction, without percentage signs.",
};
const pt: Copy = {
  discount: "Desconto", increase: "Aumento percentual", discountTitle: "Percentagens – desconto", increaseTitle: "Percentagens – aumento percentual", originalPrice: "Preço inicial", newPrice: "Novo preço", discountAmount: "Desconto", increaseAmount: "Aumento", newPriceSetup: "Cálculo do novo preço", changeSupport: "Mostrar palavras de apoio", priceRange: "Preço antes da alteração",
  discountInstructions: "Calcula o desconto usando a fração e subtrai-o do preço inicial. Escreve apenas números. O cálculo e a resposta de cada passo têm o mesmo peso.", increaseInstructions: "Calcula o aumento usando a fração e adiciona-o ao preço inicial. Escreve apenas números. O cálculo e a resposta de cada passo têm o mesmo peso.", changeSetupHelp: "Multiplica a percentagem pelo preço inicial acima da barra da fração, com 100 abaixo.", discountSetupHelp: "Subtrai o desconto do preço inicial.", increaseSetupHelp: "Adiciona o aumento ao preço inicial.",
  conclusionCalculationInstructions: "Escreve a fração e calcula a resposta. Escreve apenas números nas caixas de cálculo, sem sinais de percentagem. A fração e a resposta têm o mesmo peso.",
  percentNumber: "Percentagem", conclusion: "Responde com uma frase", showConclusion: "Espaço para uma resposta com uma frase", conclusionInstructions: "Termina com uma frase que explique a resposta.", percentageSetupHelp: "Multiplica a parte por 100 acima da barra da fração, com o total abaixo.",
  title: "Percentagens", subtitle: "Escreve a fração e calcula percentagens.", worksheetTitle: "Percentagens – calcular a percentagem",
  taskType: "Tipo de exercício", find_percentage: "Calcular a percentagem", find_part: "Calcular a parte", partTitle: "Percentagens – calcular a parte", partInstructions: "Escreve a fração e calcula a parte. Escreve apenas números nas caixas, sem sinais de percentagem. A fração e a resposta têm o mesmo peso.", partSupport: "Mostrar percentagem e total", hundred: "Cem", multiplier: "Segundo fator acima da barra da fração", partSetupHelp: "Multiplica o valor da percentagem pelo total acima da barra da fração, com 100 abaixo.", equivalentSetup: "Correto, com um cálculo equivalente.", invalidType: "Escolhe um tipo de exercício válido.",
  find_whole: "Calcular o total", mixed: "Misto", wholeTitle: "Percentagens – calcular o total", mixedTitle: "Percentagens – misto", wholeInstructions: "Escreve a fração e calcula o total. Escreve apenas números nas caixas, sem sinais de percentagem. A fração e a resposta têm o mesmo peso.", mixedInstructions: "Calcula o que cada exercício pede: a percentagem, a parte ou o total. Escreve a fração e calcula a resposta. Escreve apenas números nas caixas. A fração e a resposta têm o mesmo peso.", wholeSupport: "Mostrar parte e percentagem", mixedSupport: "Mostrar palavras de apoio", wholeSetupHelp: "Multiplica a parte por 100 acima da barra da fração, com o valor da percentagem abaixo.",
  instructions: "Escreve a fração e calcula a percentagem. Escreve apenas números nas caixas. A fração e a resposta têm o mesmo peso.",
  range: "Total no exercício", support: "Mostrar parte e total", generate: "Criar ficha de percentagens", empty: "Pronto para a primeira ficha de percentagens",
  invalidRange: "Escolhe números inteiros de 1 a 10 000, com mínimo ≤ máximo.", invalidCombinations: "Não há exercícios com números inteiros e percentagens simples neste intervalo. Altera o intervalo.",
  numerator: "Número acima da barra da fração", denominator: "Número abaixo da barra da fração", percent: "Percentagem", part: "Parte", whole: "Total", setup: "Fração", partial: "Parcialmente correto",
  equivalent: "Correto, com uma fração equivalente.", setupHelp: "Verifica qual é a parte e qual é o total.", answerHelp: "Verifica o cálculo.", numberHelp: "Usa apenas números na fração, sem sinais de percentagem.",
};
export function getPercentageCopy(language: string): Copy { return language === "en" ? en : language === "pt" ? pt : nb; }

function worksheetText(language: string, mode: PercentageMode = "find_percentage", showConclusion = false) {
  const copy = getPercentageCopy(language);
  const titles = { find_percentage: copy.worksheetTitle, find_part: copy.partTitle, find_whole: copy.wholeTitle, mixed: copy.mixedTitle, discount: copy.discountTitle, increase: copy.increaseTitle };
  const instructions = { find_percentage: copy.instructions, find_part: copy.partInstructions, find_whole: copy.wholeInstructions, mixed: copy.mixedInstructions, discount: copy.discountInstructions, increase: copy.increaseInstructions };
  return { title: titles[mode], instructions: showConclusion ? `${isPercentageChange(mode) ? instructions[mode] : copy.conclusionCalculationInstructions} ${copy.conclusionInstructions}` : instructions[mode] };
}
