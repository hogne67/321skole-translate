import { normalizeMathWorksheetLanguage, type MathWorksheetLanguage } from "../taxonomy";
import { SCALE_MAX_TASK_COUNT, scalePageCapacity } from "./printLayout";

export const SCALE_TASK_TYPES = ["real_length", "drawing_length", "find_scale", "similar_sides"] as const;
export const SCALE_MODES = [...SCALE_TASK_TYPES, "mixed"] as const;
export const SCALE_LEVELS = ["whole", "units", "advanced"] as const;
export const SCALE_UNITS = ["cm", "m", "km"] as const;
export type ScaleUnit = typeof SCALE_UNITS[number];
export type ScaleSettings = { taskType: typeof SCALE_MODES[number]; level: typeof SCALE_LEVELS[number]; taskCount: number; showSupport: boolean };
export type ScaleMeasurementTask = {
  id: string; type: "real_length" | "drawing_length" | "find_scale";
  drawing: number; real: number; realUnit: ScaleUnit; left: number; right: number;
  context: "map" | "plan" | "model";
};
export type ScaleSimilarTask = {
  id: string; type: "similar_sides"; shape: "rectangle" | "triangle";
  a: number; b: number; factor: number; missing: "small" | "large"; unit: "cm" | "m";
};
export type ScaleTask = ScaleMeasurementTask | ScaleSimilarTask;
export type ScaleAnswer = { value: string; unit: string; ratioLeft: string; ratioRight: string; working: string };
export type ScaleWorksheet = { version: 1; kind: "scale"; language: MathWorksheetLanguage; title: string; instructions: string; settings: ScaleSettings; tasks: ScaleTask[]; showAnswerKey: boolean };
export const DEFAULT_SCALE_SETTINGS: ScaleSettings = { taskType: "mixed", level: "whole", taskCount: scalePageCapacity(false).first, showSupport: false };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-7;
export const roundScale = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const scaleUnitInCm = (unit: ScaleUnit) => unit === "km" ? 100000 : unit === "m" ? 100 : 1;
export function normalizeScaleSettings(v: unknown): ScaleSettings {
  if (!record(v)) throw new Error("INVALID_SETTINGS");
  if (!SCALE_MODES.includes(v.taskType as ScaleSettings["taskType"])) throw new Error("INVALID_TYPE");
  if (!SCALE_LEVELS.includes(v.level as ScaleSettings["level"])) throw new Error("INVALID_LEVEL");
  if (!Number.isInteger(v.taskCount) || Number(v.taskCount) < 1 || Number(v.taskCount) > SCALE_MAX_TASK_COUNT) throw new Error("INVALID_COUNT");
  if (typeof v.showSupport !== "boolean") throw new Error("INVALID_SUPPORT");
  return { taskType: v.taskType as ScaleSettings["taskType"], level: v.level as ScaleSettings["level"], taskCount: Number(v.taskCount), showSupport: v.showSupport };
}
type ScaleChoice = Pick<ScaleMeasurementTask, "left" | "right" | "realUnit" | "context">;
function choices(level: ScaleSettings["level"]): ScaleChoice[] {
  const simple: ScaleChoice[] = [2, 5, 10, 20, 50, 100].map(right => ({ left: 1, right, realUnit: "cm", context: "model" }));
  const conversions: ScaleChoice[] = [50, 100, 200, 10000, 50000, 100000].map(right => ({ left: 1, right, realUnit: right >= 10000 ? "km" : "m", context: right >= 10000 ? "map" : "plan" }));
  return level === "whole" ? simple : level === "units" ? conversions : [...conversions, ...simple, ...[2, 5, 10].map(left => ({ left, right: 1, realUnit: "cm" as const, context: "model" as const }))];
}
export function scaleExpected(task: ScaleTask): number | { left: number; right: number } {
  if (task.type === "similar_sides") return roundScale(task.missing === "large" ? task.b * task.factor : task.b);
  if (task.type === "find_scale") return { left: task.left, right: task.right };
  return roundScale(task.type === "real_length" ? task.drawing * task.right / task.left / scaleUnitInCm(task.realUnit) : task.real * scaleUnitInCm(task.realUnit) * task.left / task.right);
}
export function scaleExpectedUnit(task: ScaleTask): string { return task.type === "similar_sides" ? task.unit : task.type === "find_scale" ? "" : task.type === "drawing_length" ? "cm" : task.realUnit; }
export function formatScaleNumber(value: number, language: string): string {
  return Number(value.toFixed(2)).toLocaleString(language === "en" ? "en-GB" : language === "pt" ? "pt-PT" : "nb-NO", { useGrouping: false, maximumFractionDigits: 2 });
}
export function scaleRatioText(task: ScaleMeasurementTask, language: string): string { return `${formatScaleNumber(task.left, language)} : ${formatScaleNumber(task.right, language)}`; }
export function scaleAnswerText(task: ScaleTask, language: string): string {
  const expected = scaleExpected(task);
  return typeof expected === "number" ? `${formatScaleNumber(expected, language)} ${scaleExpectedUnit(task)}` : `${expected.left} : ${expected.right}`;
}
export function scaleTaskPrompt(task: ScaleTask, language: string): string {
  const copy = getScaleCopy(language);
  if (task.type === "similar_sides") return copy.similarPrompt.replace("{figure}", task.missing === "small" ? "A" : "B").replace("{unit}", task.unit);
  return copy[`${task.type}Prompt`].replace("{drawing}", `${formatScaleNumber(task.drawing, language)} cm`).replace("{real}", `${formatScaleNumber(task.real, language)} ${task.realUnit}`).replace("{ratio}", scaleRatioText(task, language)).replace("{unit}", scaleExpectedUnit(task));
}
export function scaleTaskHint(task: ScaleTask, language: string): string { return getScaleCopy(language)[task.type === "similar_sides" ? "similarHint" : task.type === "find_scale" ? "ratioHint" : "lengthHint"]; }
export function scaleSolution(task: ScaleTask, language: string): string {
  const n = (v: number) => formatScaleNumber(v, language), copy = getScaleCopy(language);
  if (task.type === "similar_sides") return `${copy.factor}: ${n(task.a * task.factor)} ÷ ${n(task.a)} = ${n(task.factor)}. x = ${task.missing === "large" ? `${n(task.b)} × ${n(task.factor)}` : `${n(task.b * task.factor)} ÷ ${n(task.factor)}`} = ${scaleAnswerText(task, language)}`;
  const realCm = roundScale(task.real * scaleUnitInCm(task.realUnit));
  if (task.type === "find_scale") return `${n(task.real)} ${task.realUnit} = ${n(realCm)} cm. ${n(task.drawing)} : ${n(realCm)} = ${scaleRatioText(task, language)}`;
  if (task.type === "drawing_length") return `${n(task.real)} ${task.realUnit} = ${n(realCm)} cm. ${n(realCm)} × ${n(task.left)} ÷ ${n(task.right)} = ${scaleAnswerText(task, language)}`;
  const cm = roundScale(task.drawing * task.right / task.left);
  return `${n(task.drawing)} × ${n(task.right)} ÷ ${n(task.left)} = ${n(cm)} cm${task.realUnit === "cm" ? "" : ` = ${scaleAnswerText(task, language)}`}`;
}
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}
export function generateScaleWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): ScaleWorksheet {
  const settings = normalizeScaleSettings(value), lang = normalizeMathWorksheetLanguage(language), copy = getScaleCopy(lang);
  const types = shuffle(settings.taskType === "mixed" ? [...SCALE_TASK_TYPES] : [settings.taskType], random), configs = shuffle(choices(settings.level).filter(c => c.left === 1), random), enlargements = shuffle(choices(settings.level).filter(c => c.left > 1), random), used = new Set<string>();
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  let measurementCount = 0;
  const tasks = Array.from({ length: settings.taskCount }, (_, index): ScaleTask => {
    const type = types[index % types.length], cycle = Math.floor(index / types.length), measurementIndex = type === "similar_sides" ? 0 : measurementCount++;
    let task: ScaleTask, key: string, attempts = 0;
    do {
      if (type === "similar_sides") {
        const factors = settings.level === "advanced" ? [1.5, 2, 2.5, 3, 4, 5] : [2, 3, 4, 5];
        const measure = () => settings.level === "advanced" ? integer(3, 30) / 2 : integer(2, 15);
        task = { id: `scale_${index + 1}`, type, shape: cycle % 2 ? "triangle" : "rectangle", a: measure(), b: measure(), factor: factors[integer(0, factors.length - 1)], missing: cycle % 4 === 1 || cycle % 4 === 2 ? "small" : "large", unit: settings.level !== "whole" && random() < .5 ? "m" : "cm" };
      } else {
        const pool = settings.level === "advanced" && measurementIndex % 2 ? enlargements : configs;
        const config = pool[(settings.level === "advanced" ? Math.floor(measurementIndex / 2) : measurementIndex) % pool.length];
        const drawing = settings.level === "advanced" ? integer(2, 24) / 2 : integer(1, 8) * (config.right === 50 && config.realUnit === "m" ? 2 : config.right === 10000 ? 10 : config.right === 50000 ? 2 : 1);
        task = { id: `scale_${index + 1}`, type, ...config, drawing, real: roundScale(drawing * config.right / config.left / scaleUnitInCm(config.realUnit)) };
      }
      key = JSON.stringify({ ...task, id: "" });
    } while (used.has(key) && ++attempts < 30);
    used.add(key); return task;
  });
  return { version: 1, kind: "scale", language: lang, title: copy.title, instructions: copy.instructions, settings, tasks: shuffle(tasks, random), showAnswerKey };
}
export function sanitizeScaleWorksheet(value: unknown): ScaleWorksheet | null {
  if (!record(value) || value.version !== 1 || value.kind !== "scale" || !Array.isArray(value.tasks)) return null;
  try {
    const settings = normalizeScaleSettings(value.settings), ids = new Set<string>();
    if (value.tasks.length !== settings.taskCount) return null;
    const tasks = value.tasks.map((raw): ScaleTask => {
      if (!record(raw) || typeof raw.id !== "string" || !/^[\w-]{1,80}$/.test(raw.id) || ids.has(raw.id)) throw new Error("id");
      ids.add(raw.id);
      if (!SCALE_TASK_TYPES.includes(raw.type as ScaleTask["type"]) || settings.taskType !== "mixed" && settings.taskType !== raw.type) throw new Error("type");
      if (raw.type === "similar_sides") {
        const factors = settings.level === "advanced" ? [1.5, 2, 2.5, 3, 4, 5] : [2, 3, 4, 5];
        if (![raw.a, raw.b].every(n => typeof n === "number" && n > 0 && n <= 20 && Number.isInteger(n * (settings.level === "advanced" ? 2 : 1))) || !factors.includes(raw.factor as number)) throw new Error("sides");
        if (!["rectangle", "triangle"].includes(String(raw.shape)) || !["small", "large"].includes(String(raw.missing)) || !["cm", "m"].includes(String(raw.unit)) || settings.level === "whole" && raw.unit !== "cm") throw new Error("figure");
        return { id: raw.id, type: "similar_sides", a: Number(raw.a), b: Number(raw.b), factor: Number(raw.factor), shape: raw.shape as ScaleSimilarTask["shape"], missing: raw.missing as ScaleSimilarTask["missing"], unit: raw.unit as ScaleSimilarTask["unit"] };
      }
      if (!choices(settings.level).some(c => c.left === raw.left && c.right === raw.right && c.realUnit === raw.realUnit && c.context === raw.context)) throw new Error("ratio");
      if (![raw.drawing, raw.real].every(n => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 10000 && near(roundScale(n), n))) throw new Error("length");
      const task: ScaleMeasurementTask = { id: raw.id, type: raw.type as ScaleMeasurementTask["type"], drawing: Number(raw.drawing), real: Number(raw.real), left: Number(raw.left), right: Number(raw.right), realUnit: raw.realUnit as ScaleUnit, context: raw.context as ScaleMeasurementTask["context"] };
      if (!near(task.drawing * task.right / task.left, task.real * scaleUnitInCm(task.realUnit))) throw new Error("relation");
      if (settings.level !== "advanced" && (!Number.isInteger(task.drawing) || !Number.isInteger(task.real))) throw new Error("level");
      return task;
    });
    const language = normalizeMathWorksheetLanguage(value.language), copy = getScaleCopy(language);
    return { version: 1, kind: "scale", language, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey: value.showAnswerKey === true };
  } catch { return null; }
}
export function readScaleAnswer(value: unknown): ScaleAnswer {
  const text = (key: string, max = 40) => record(value) && typeof value[key] === "string" ? (value[key] as string).slice(0, max) : "";
  return { value: text("value"), unit: text("unit", 10), ratioLeft: text("ratioLeft"), ratioRight: text("ratioRight"), working: text("working", 2000) };
}
function numberAnswer(value: string): number {
  if (!/^\+?\d+(?:[.,]\d+)?$/.test(value.trim())) return NaN;
  const n = Number(value.trim().replace(",", ".")); return Number.isFinite(n) && n > 0 && n <= 1000000 ? n : NaN;
}
export function gradeScaleTask(task: ScaleTask, value: unknown) {
  const answer = readScaleAnswer(value), expected = scaleExpected(task);
  const left = numberAnswer(answer.ratioLeft), right = numberAnswer(answer.ratioRight), numeric = numberAnswer(answer.value);
  const valueCorrect = typeof expected === "number" ? Number.isFinite(numeric) && near(roundScale(numeric), expected) : Number.isFinite(left) && Number.isFinite(right) && near(left * expected.right, right * expected.left);
  const formatCorrect = typeof expected === "number" ? answer.unit === scaleExpectedUnit(task) : near(left, expected.left) && near(right, expected.right);
  const points = valueCorrect ? formatCorrect ? 1 : .8 : 0;
  const isAnswered = record(value) ? Object.values(answer).some(v => !!v.trim()) : value != null && String(value).trim() !== "";
  return { type: "scale" as const, points, isCorrect: points === 1, isPartial: points > 0 && points < 1, isAnswered, valueCorrect, formatCorrect, studentAnswer: answer,
    correctAnswer: { value: typeof expected === "number" ? String(expected) : "", unit: scaleExpectedUnit(task), ratioLeft: typeof expected === "number" ? "" : String(expected.left), ratioRight: typeof expected === "number" ? "" : String(expected.right), working: scaleSolution(task, "en") } };
}
export function gradeScaleWorksheet(worksheet: ScaleWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeScaleTask(task, answers[task.id])])), entries = Object.values(byTask);
  const correctAuto = entries.filter(e => e.isCorrect).length, partialAuto = entries.filter(e => e.isPartial).length, unansweredAuto = entries.filter(e => !e.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, partialAuto, wrongAuto: entries.length - correctAuto - partialAuto - unansweredAuto, unansweredAuto,
    percentAuto: entries.length ? Math.round(entries.reduce((sum, e) => sum + e.points, 0) / entries.length * 100) : 0, byTask };
}

const nb = {
  title: "Målestokk og formlikhet", subtitle: "Regn mellom tegning og virkelighet og finn sider i formlike figurer.", instructions: "Bruk målene som er oppgitt. Figurene er skisser og skal ikke måles. Vis utregningen og svar med riktig enhet. Skriv målestokk som tegning : virkelighet, med det minste tallet lik 1.",
  taskType: "Oppgavetype", real_length: "Finn virkelig lengde", drawing_length: "Finn lengden på tegningen", find_scale: "Finn målestokken", similar_sides: "Finn side i formlike figurer", mixed: "Blandet",
  level: "Nivå", whole: "1 – hele tall og samme enhet", units: "2 – med enhetsomregning", advanced: "3 – desimaltall og forstørrelse", support: "Vis formler og støtte", invalid: "Velg gyldige innstillinger (1–60 oppgaver).", empty: "Klar for første målestokkark", note: "Tegninger bruker cm. Nivå 2 og 3 har også m og km i virkeligheten. Nivå 3 inkluderer både forminskning og forstørrelse.",
  real_lengthPrompt: "Målestokken er {ratio}. Lengden på tegningen er {drawing}. Finn virkelig lengde i {unit}.", drawing_lengthPrompt: "Målestokken er {ratio}. Virkelig lengde er {real}. Finn lengden på tegningen i cm.", find_scalePrompt: "{drawing} på tegningen tilsvarer {real} i virkeligheten. Finn målestokken som tegning : virkelighet. La det minste tallet være 1.", similarPrompt: "Figur A og B er formlike. Finn siden x i figur {figure}. Svar i {unit}.",
  lengthHint: "Målestokk = tegning : virkelighet. Bruk samme enhet før du ganger eller deler.", ratioHint: "Gjør om til samme enhet. Del begge tallene i forholdet på det minste tallet.", similarHint: "Finn forholdet mellom de kjente, tilsvarende sidene. Bruk samme faktor på den andre siden.",
  drawing: "Tegning", reality: "Virkelighet", ratio: "Målestokk", figureA: "Figur A", figureB: "Figur B", rectangle: "rektangel", triangle: "trekant", map: "Kart", plan: "Plantegning", model: "Modell", sketch: "Skisse – bruk oppgitte mål", factor: "Faktor fra A til B", working: "Utregning", answer: "Svar", unit: "Enhet", chooseUnit: "Velg enhet", partialCount: "Delvis riktig", partial: "Riktig tall – sjekk enheten", ratioPartial: "Riktig forhold – forkort målestokken", checkNote: "Riktig lengde gir 80 %; riktig enhet gir full uttelling. Riktig forhold gir 80 %; forkortet målestokk gir full uttelling. Utregningen vurderes av læreren.", pageHint: "Første ark: {first} oppgaver, deretter {following} per ark. Antallet tilpasses støtte. Fasit kommer i tillegg.",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  title: "Scale and similarity", subtitle: "Calculate drawing and real-life lengths and find sides in similar figures.", instructions: "Use the stated measurements. Diagrams are sketches and must not be measured. Show your working and use the requested unit. Write scale as drawing : real life, with the smaller number equal to 1.",
  taskType: "Problem type", real_length: "Find the real-life length", drawing_length: "Find the drawing length", find_scale: "Find the scale", similar_sides: "Find a side in similar figures", mixed: "Mixed", level: "Level", whole: "1 – whole numbers and matching units", units: "2 – unit conversions", advanced: "3 – decimals and enlargement", support: "Show formulas and hints", invalid: "Choose valid settings (1–60 problems).", empty: "Ready for your first scale worksheet", note: "Drawings use cm. Levels 2 and 3 also use m and km in real life. Level 3 includes both reduction and enlargement.",
  real_lengthPrompt: "The scale is {ratio}. The drawing length is {drawing}. Find the real-life length in {unit}.", drawing_lengthPrompt: "The scale is {ratio}. The real-life length is {real}. Find the drawing length in cm.", find_scalePrompt: "{drawing} on the drawing represents {real} in real life. Find the scale as drawing : real life. Make the smaller number 1.", similarPrompt: "Figures A and B are similar. Find side x in figure {figure}. Answer in {unit}.", lengthHint: "Scale = drawing : real life. Convert to the same unit before multiplying or dividing.", ratioHint: "Convert to the same unit. Divide both numbers in the ratio by the smaller number.", similarHint: "Find the ratio between the known corresponding sides. Apply the same factor to the other side.",
  drawing: "Drawing", reality: "Real life", ratio: "Scale", figureA: "Figure A", figureB: "Figure B", rectangle: "rectangle", triangle: "triangle", map: "Map", plan: "Floor plan", model: "Model", sketch: "Sketch – use stated measurements", factor: "Factor from A to B", working: "Working", answer: "Answer", unit: "Unit", chooseUnit: "Choose a unit", partialCount: "Partly correct", partial: "Correct number – check the unit", ratioPartial: "Correct ratio – simplify the scale", checkNote: "The correct length earns 80%; the correct unit completes full credit. An equivalent ratio earns 80%; the simplified scale completes full credit. Your teacher assesses your working.", pageHint: "First sheet: {first} problems, then {following} per sheet. Counts adjust to hints. The answer key is separate.",
};
const pt: Copy = {
  title: "Escalas e semelhança", subtitle: "Calcula comprimentos no desenho e na realidade e lados de figuras semelhantes.", instructions: "Usa as medidas indicadas. As figuras são esquemas e não devem ser medidas. Mostra os cálculos e usa a unidade pedida. Escreve a escala como desenho : realidade, com o menor número igual a 1.",
  taskType: "Tipo de exercício", real_length: "Encontrar o comprimento real", drawing_length: "Encontrar o comprimento no desenho", find_scale: "Encontrar a escala", similar_sides: "Encontrar um lado em figuras semelhantes", mixed: "Misto", level: "Nível", whole: "1 – inteiros e unidades iguais", units: "2 – conversão de unidades", advanced: "3 – decimais e ampliação", support: "Mostrar fórmulas e pistas", invalid: "Escolhe definições válidas (1–60 exercícios).", empty: "Pronto para a primeira ficha de escalas", note: "Os desenhos usam cm. Os níveis 2 e 3 também usam m e km na realidade. O nível 3 inclui redução e ampliação.",
  real_lengthPrompt: "A escala é {ratio}. O comprimento no desenho é {drawing}. Calcula o comprimento real em {unit}.", drawing_lengthPrompt: "A escala é {ratio}. O comprimento real é {real}. Calcula o comprimento no desenho em cm.", find_scalePrompt: "{drawing} no desenho representa {real} na realidade. Calcula a escala como desenho : realidade. O menor número deve ser 1.", similarPrompt: "As figuras A e B são semelhantes. Calcula o lado x na figura {figure}. Responde em {unit}.", lengthHint: "Escala = desenho : realidade. Converte para a mesma unidade antes de multiplicar ou dividir.", ratioHint: "Converte para a mesma unidade. Divide ambos os números da razão pelo menor número.", similarHint: "Calcula a razão entre os lados correspondentes conhecidos. Usa o mesmo fator no outro lado.",
  drawing: "Desenho", reality: "Realidade", ratio: "Escala", figureA: "Figura A", figureB: "Figura B", rectangle: "retângulo", triangle: "triângulo", map: "Mapa", plan: "Planta", model: "Modelo", sketch: "Esquema – usa as medidas indicadas", factor: "Fator de A para B", working: "Cálculos", answer: "Resposta", unit: "Unidade", chooseUnit: "Escolhe a unidade", partialCount: "Parcialmente correto", partial: "Número correto – verifica a unidade", ratioPartial: "Razão correta – simplifica a escala", checkNote: "O comprimento correto vale 80%; a unidade correta completa a pontuação. Uma razão equivalente vale 80%; a escala simplificada completa a pontuação. O professor avalia os cálculos.", pageHint: "Primeira ficha: {first} exercícios; seguintes: {following} por ficha. A quantidade adapta-se às pistas. As soluções são apresentadas à parte.",
};
export function getScaleCopy(language: string): Copy { return language === "en" ? en : language === "pt" ? pt : nb; }
