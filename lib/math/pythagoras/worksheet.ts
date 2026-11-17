import { normalizeMathWorksheetLanguage, type MathWorksheetLanguage } from "../taxonomy";
import { PYTHAGORAS_MAX_TASK_COUNT, pythagorasPageCapacity } from "./printLayout";

export const PYTHAGORAS_TASK_TYPES = ["hypotenuse", "leg", "check_triangle", "word_problems"] as const;
export const PYTHAGORAS_MODES = [...PYTHAGORAS_TASK_TYPES, "mixed"] as const;
export const PYTHAGORAS_LEVELS = ["whole", "roots", "decimals"] as const;
export const PYTHAGORAS_UNITS = ["cm", "m"] as const;
export type PythagorasSettings = {
  taskType: typeof PYTHAGORAS_MODES[number]; level: typeof PYTHAGORAS_LEVELS[number];
  lengthUnit: typeof PYTHAGORAS_UNITS[number]; maximum: number; taskCount: number;
  showSupport: boolean; rotateFigures: boolean;
};
export type PythagorasTask = {
  id: string; type: typeof PYTHAGORAS_TASK_TYPES[number]; a: number; b: number; c: number;
  missing: "a" | "b" | "c" | null; unit: typeof PYTHAGORAS_UNITS[number];
  orientation: 0 | 1 | 2 | 3; mirrored: boolean;
  context?: "ladder" | "ladder_height" | "diagonal" | "cable";
};
export type PythagorasAnswer = { value: string; unit: string; working: string };
export type PythagorasWorksheet = {
  version: 1; kind: "pythagoras"; language: MathWorksheetLanguage; title: string; instructions: string;
  settings: PythagorasSettings; tasks: PythagorasTask[]; showAnswerKey: boolean;
};
export const DEFAULT_PYTHAGORAS_SETTINGS: PythagorasSettings = {
  taskType: "mixed", level: "whole", lengthUnit: "cm", maximum: 20,
  taskCount: pythagorasPageCapacity(false).first, showSupport: false, rotateFigures: true,
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-8;
export const roundPythagoras = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function normalizePythagorasSettings(value: unknown): PythagorasSettings {
  if (!record(value)) throw new Error("INVALID_SETTINGS");
  if (!PYTHAGORAS_MODES.includes(value.taskType as PythagorasSettings["taskType"])) throw new Error("INVALID_TYPE");
  if (!PYTHAGORAS_LEVELS.includes(value.level as PythagorasSettings["level"])) throw new Error("INVALID_LEVEL");
  if (!PYTHAGORAS_UNITS.includes(value.lengthUnit as PythagorasSettings["lengthUnit"]) || ![10, 20, 50].includes(value.maximum as number)) throw new Error("INVALID_RANGE");
  if (!Number.isInteger(value.taskCount) || Number(value.taskCount) < 1 || Number(value.taskCount) > PYTHAGORAS_MAX_TASK_COUNT) throw new Error("INVALID_COUNT");
  if (typeof value.showSupport !== "boolean" || typeof value.rotateFigures !== "boolean") throw new Error("INVALID_OPTIONS");
  return { taskType: value.taskType as PythagorasSettings["taskType"], level: value.level as PythagorasSettings["level"], lengthUnit: value.lengthUnit as PythagorasSettings["lengthUnit"],
    maximum: Number(value.maximum), taskCount: Number(value.taskCount), showSupport: value.showSupport, rotateFigures: value.rotateFigures };
}
export function pythagorasIsRight(task: PythagorasTask): boolean { return near(task.a ** 2 + task.b ** 2, task.c ** 2); }
export function pythagorasExpected(task: PythagorasTask): number | "yes" | "no" {
  if (task.type === "check_triangle") return pythagorasIsRight(task) ? "yes" : "no";
  return roundPythagoras(task.missing === "c" ? Math.hypot(task.a, task.b) : Math.sqrt(task.c ** 2 - task[task.missing === "a" ? "b" : "a"] ** 2));
}
export function formatPythagorasNumber(value: number, language: string): string {
  return Number(value.toFixed(2)).toLocaleString(language === "en" ? "en-GB" : language === "pt" ? "pt-PT" : "nb-NO", { useGrouping: false, maximumFractionDigits: 2 });
}
export function pythagorasAnswerText(task: PythagorasTask, language: string): string {
  const value = pythagorasExpected(task), copy = getPythagorasCopy(language);
  return typeof value === "number" ? `${formatPythagorasNumber(value, language)} ${task.unit}` : copy[value];
}
export function pythagorasTaskPrompt(task: PythagorasTask, language: string): string {
  const copy = getPythagorasCopy(language), n = (v: number) => `${formatPythagorasNumber(v, language)} ${task.unit}`;
  if (task.type === "check_triangle") return copy.checkPrompt.replace("{a}", n(task.a)).replace("{b}", n(task.b)).replace("{c}", n(task.c));
  if (task.type !== "word_problems") return copy[task.type === "hypotenuse" ? "hypotenusePrompt" : "legPrompt"].replace("{side}", task.missing ?? "c").replace("{unit}", task.unit);
  return copy[`${task.context ?? "ladder"}Prompt`].replace("{a}", n(task.a)).replace("{b}", n(task.b)).replace("{c}", n(task.c)).replace("{unit}", task.unit);
}
export function pythagorasTaskHint(task: PythagorasTask, language: string): string {
  const copy = getPythagorasCopy(language);
  return task.type === "check_triangle" ? copy.checkHint : task.missing === "c" ? copy.hypotenuseHint : copy.legHint.replaceAll("{side}", task.missing ?? "a").replaceAll("{other}", task.missing === "a" ? "b" : "a");
}
export function pythagorasSolution(task: PythagorasTask, language: string): string {
  const n = (v: number) => formatPythagorasNumber(v, language);
  if (task.type === "check_triangle") {
    const left = task.a ** 2 + task.b ** 2, right = task.c ** 2;
    return `${n(task.a)}² + ${n(task.b)}² = ${n(left)}; ${n(task.c)}² = ${n(right)}. ${n(left)} ${pythagorasIsRight(task) ? "=" : "≠"} ${n(right)} → ${pythagorasAnswerText(task, language)}.`;
  }
  const result = pythagorasExpected(task) as number;
  const raw = task.missing === "c" ? Math.hypot(task.a, task.b) : task[task.missing!];
  const expression = task.missing === "c" ? `${n(task.a)}² + ${n(task.b)}²` : `${n(task.c)}² − ${n(task[task.missing === "a" ? "b" : "a"])}²`;
  return `${task.missing} = √(${expression}) ${near(raw, result) ? "=" : "≈"} ${pythagorasAnswerText(task, language)}`;
}
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}
const triples = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]];
export function generatePythagorasWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): PythagorasWorksheet {
  const settings = normalizePythagorasSettings(value), lang = normalizeMathWorksheetLanguage(language), copy = getPythagorasCopy(lang);
  const types = shuffle(settings.taskType === "mixed" ? [...PYTHAGORAS_TASK_TYPES] : [settings.taskType], random), used = new Set<string>();
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const contexts = shuffle<NonNullable<PythagorasTask["context"]>>(["ladder", "ladder_height", "diagonal", "cable"], random);
  // Each measurement shown to pupils is exact. Irrational sides are hidden, never rounded givens.
  const tasks = Array.from({ length: settings.taskCount }, (_, index): PythagorasTask => {
    const type = types[index % types.length];
    const context = type === "word_problems" ? contexts[Math.floor(index / types.length) % contexts.length] : undefined;
    const cycle = Math.floor(index / types.length);
    const missing = type === "check_triangle" ? null : type === "leg" ? cycle % 2 ? "b" : "a" : context === "ladder_height" ? "a" : "c";
    let task: PythagorasTask, key: string, attempts = 0;
    do {
      let a: number, b: number, c: number;
      if (settings.level === "whole" || type === "check_triangle") {
        const choices = triples.filter(t => t[2] <= settings.maximum), triple = choices[integer(0, choices.length - 1)];
        const scale = integer(1, Math.floor(settings.maximum / triple[2])) / (settings.level === "decimals" ? 2 : 1);
        [a, b, c] = triple.map(v => v * scale);
        if (type === "check_triangle" && cycle % 2 === 1) {
          const delta = settings.level === "decimals" ? 0.5 : 1;
          c = c + delta < a + b && c + delta <= settings.maximum ? c + delta : c - delta;
        }
      } else if (missing === "c") {
        const factor = settings.level === "decimals" ? 2 : 1;
        a = integer(2 * factor, Math.floor(settings.maximum * .65) * factor) / factor;
        b = integer(2 * factor, Math.floor(settings.maximum * .65) * factor) / factor;
        c = Math.hypot(a, b);
      } else {
        const factor = settings.level === "decimals" ? 2 : 1;
        c = integer(5 * factor, settings.maximum * factor) / factor;
        const known = integer(Math.ceil(c * .3 * factor), Math.floor(c * .8 * factor)) / factor;
        const unknown = Math.sqrt(c ** 2 - known ** 2);
        a = missing === "a" ? unknown : known; b = missing === "b" ? unknown : known;
      }
      task = { id: `pythagoras_${index + 1}`, type, a, b, c, missing, unit: type === "word_problems" ? "m" : settings.lengthUnit,
        orientation: settings.rotateFigures ? integer(0, 3) as PythagorasTask["orientation"] : 0, mirrored: settings.rotateFigures && random() < .5, ...(context ? { context } : {}) };
      key = JSON.stringify([type, a, b, c, missing, context]);
    } while (used.has(key) && ++attempts < 30);
    used.add(key); return task;
  });
  return { version: 1, kind: "pythagoras", language: lang, title: copy.title, instructions: copy.instructions, settings, tasks: shuffle(tasks, random), showAnswerKey };
}
export function sanitizePythagorasWorksheet(value: unknown): PythagorasWorksheet | null {
  if (!record(value) || value.version !== 1 || value.kind !== "pythagoras" || !Array.isArray(value.tasks)) return null;
  try {
    const settings = normalizePythagorasSettings(value.settings), ids = new Set<string>();
    if (value.tasks.length !== settings.taskCount) return null;
    const tasks = value.tasks.map((raw): PythagorasTask => {
      if (!record(raw) || typeof raw.id !== "string" || !/^[\w-]{1,80}$/.test(raw.id) || ids.has(raw.id)) throw new Error("id");
      ids.add(raw.id);
      if (!PYTHAGORAS_TASK_TYPES.includes(raw.type as PythagorasTask["type"]) || settings.taskType !== "mixed" && raw.type !== settings.taskType) throw new Error("type");
      if (![raw.a, raw.b, raw.c].every(n => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= settings.maximum) || ![0, 1, 2, 3].includes(raw.orientation as number) || typeof raw.mirrored !== "boolean") throw new Error("dimensions");
      if (!settings.rotateFigures && (raw.orientation !== 0 || raw.mirrored)) throw new Error("orientation");
      const type = raw.type as PythagorasTask["type"], a = Number(raw.a), b = Number(raw.b), c = Number(raw.c), missing = raw.missing;
      if (c <= a || c <= b || a + b <= c) throw new Error("triangle");
      if (type === "check_triangle" ? missing !== null : type === "hypotenuse" ? missing !== "c" : type === "leg" ? missing !== "a" && missing !== "b" : !["ladder", "ladder_height", "diagonal", "cable"].includes(String(raw.context)) || missing !== (raw.context === "ladder_height" ? "a" : "c")) throw new Error("missing");
      if (raw.unit !== (type === "word_problems" ? "m" : settings.lengthUnit)) throw new Error("unit");
      const task: PythagorasTask = { id: raw.id, type, a, b, c, missing: missing as PythagorasTask["missing"], unit: raw.unit as PythagorasTask["unit"], orientation: raw.orientation as PythagorasTask["orientation"], mirrored: raw.mirrored,
        ...(type === "word_problems" ? { context: raw.context as PythagorasTask["context"] } : {}) };
      if (type !== "check_triangle" && !pythagorasIsRight(task)) throw new Error("right");
      const shown = (["a", "b", "c"] as const).filter(side => side !== missing).map(side => task[side]);
      if (settings.level === "whole" ? ![a, b, c].every(Number.isInteger) : !shown.every(n => Number.isInteger(n * (settings.level === "decimals" ? 2 : 1)))) throw new Error("level");
      return task;
    });
    const language = normalizeMathWorksheetLanguage(value.language), copy = getPythagorasCopy(language);
    return { version: 1, kind: "pythagoras", language, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey: value.showAnswerKey === true };
  } catch { return null; }
}
export function readPythagorasAnswer(value: unknown): PythagorasAnswer {
  return { value: record(value) && typeof value.value === "string" && value.value.length <= 40 ? value.value : "", unit: record(value) && typeof value.unit === "string" && value.unit.length <= 10 ? value.unit : "", working: record(value) && typeof value.working === "string" ? value.working.slice(0, 2000) : "" };
}
export function gradePythagorasTask(task: PythagorasTask, value: unknown) {
  const answer = readPythagorasAnswer(value), expected = pythagorasExpected(task), numeric = /^\+?\d+(?:[.,]\d+)?$/.test(answer.value.trim()) ? Number(answer.value.trim().replace(",", ".")) : NaN;
  const valueCorrect = typeof expected === "number" ? Number.isFinite(numeric) && near(roundPythagoras(numeric), expected) : answer.value === expected;
  const unitCorrect = task.type === "check_triangle" || answer.unit === task.unit, points = valueCorrect ? unitCorrect ? 1 : .8 : 0;
  const isAnswered = record(value) ? [value.value, value.unit, value.working].some(v => typeof v === "string" ? !!v.trim() : v != null) : value != null && String(value).trim() !== "";
  return { type: "pythagoras" as const, points, isCorrect: points === 1, isPartial: points > 0 && points < 1, isAnswered, valueCorrect, unitCorrect, studentAnswer: answer,
    correctAnswer: { value: String(expected), unit: task.type === "check_triangle" ? "" : task.unit, working: pythagorasSolution(task, "en") } };
}
export function gradePythagorasWorksheet(worksheet: PythagorasWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradePythagorasTask(task, answers[task.id])])), entries = Object.values(byTask);
  const correctAuto = entries.filter(e => e.isCorrect).length, partialAuto = entries.filter(e => e.isPartial).length, unansweredAuto = entries.filter(e => !e.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, partialAuto, wrongAuto: entries.length - correctAuto - partialAuto - unansweredAuto, unansweredAuto,
    percentAuto: entries.length ? Math.round(entries.reduce((sum, e) => sum + e.points, 0) / entries.length * 100) : 0, byTask };
}

const nb = {
  title: "Pytagoras", subtitle: "Finn ukjente sider og undersøk rettvinklede trekanter.", instructions: "Vis utregningen. Avrund lengder til to desimaler ved behov og bruk enheten oppgaven ber om. Figurene er skisser. c er den lengste siden; i en rettvinklet trekant er c hypotenusen.",
  taskType: "Oppgavetype", hypotenuse: "Finn hypotenusen", leg: "Finn en katet", check_triangle: "Er trekanten rettvinklet?", word_problems: "Praktiske tekstoppgaver", mixed: "Blandet",
  level: "Nivå", whole: "1 – hele svar", roots: "2 – kvadratrøtter og avrunding", decimals: "3 – desimaltall i målene", lengthUnit: "Lengdeenhet", maximum: "Største sidelengde", rotate: "Varier retning på trekantene", support: "Vis formler og støtte", invalid: "Velg gyldige innstillinger (1–60 oppgaver).", empty: "Klar for første Pytagoras-ark",
  note: "Praktiske oppgaver bruker meter. I oppgaver om rett vinkel må du sammenligne kvadratene; en rett vinkel er ikke markert på forhånd.",
  hypotenusePrompt: "Finn hypotenusen c. Svar i {unit}.", legPrompt: "Finn kateten {side}. Svar i {unit}.", checkPrompt: "Sidene er {a}, {b} og {c}. Er trekanten rettvinklet? Begrunn med utregning.",
  ladderPrompt: "En stige står mot en loddrett vegg på vannrett bakke. Den når {a} opp, og foten står {b} fra veggen. Hvor lang er stigen i {unit}?",
  ladder_heightPrompt: "En {c} lang stige står mot en loddrett vegg på vannrett bakke. Foten står {b} fra veggen. Hvor høyt når stigen i {unit}?",
  diagonalPrompt: "Et rektangulært gulv er {a} langt og {b} bredt. Hvor lang er diagonalen i {unit}?",
  cablePrompt: "En loddrett mast er {a} høy. En stram vaier går fra toppen til bakken, {b} fra mastens fot på vannrett bakke. Hvor lang er vaieren i {unit}?",
  hypotenuseHint: "a² + b² = c² → c = √(a² + b²).", legHint: "{side}² = c² − {other}² → {side} = √(c² − {other}²).", checkHint: "Sammenlign a² + b² med c². Er de like, er trekanten rettvinklet.",
  yes: "Ja", no: "Nei", choose: "Velg svar", working: "Utregning", answer: "Svar", unit: "Enhet", chooseUnit: "Velg enhet", partialCount: "Delvis riktig", partial: "Riktig tall – sjekk enheten", checkNote: "Riktig lengde gir 80 % av poengene, og riktig enhet gir full uttelling. Ja/nei vurderes samlet. Utregningen vurderes av læreren.",
  pageHint: "Første ark: {first} oppgaver, deretter {following} per ark. Antallet tilpasses støtte. Fasit kommer i tillegg.", figure: "Trekant", right: "Rett vinkel mellom a og b", unknown: "ukjent", sketch: "Skisse – ikke i målestokk",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  title: "Pythagoras", subtitle: "Find missing sides and investigate right-angled triangles.", instructions: "Show your working. Round lengths to two decimal places where needed and use the requested unit. Diagrams are sketches. c is the longest side; in a right-angled triangle, c is the hypotenuse.",
  taskType: "Problem type", hypotenuse: "Find the hypotenuse", leg: "Find a leg", check_triangle: "Is the triangle right-angled?", word_problems: "Practical word problems", mixed: "Mixed",
  level: "Level", whole: "1 – whole-number answers", roots: "2 – square roots and rounding", decimals: "3 – decimal measurements", lengthUnit: "Length unit", maximum: "Largest side length", rotate: "Vary triangle orientation", support: "Show formulas and hints", invalid: "Choose valid settings (1–60 problems).", empty: "Ready for your first Pythagoras worksheet",
  note: "Practical problems use metres. In right-angle checks, compare the squares; no right angle is marked in advance.",
  hypotenusePrompt: "Find the hypotenuse c. Answer in {unit}.", legPrompt: "Find leg {side}. Answer in {unit}.", checkPrompt: "The sides are {a}, {b} and {c}. Is the triangle right-angled? Justify with calculations.",
  ladderPrompt: "A ladder rests against a vertical wall on level ground. It reaches {a} high and its foot is {b} from the wall. How long is the ladder in {unit}?", ladder_heightPrompt: "A ladder {c} long rests against a vertical wall on level ground. Its foot is {b} from the wall. How high does it reach in {unit}?", diagonalPrompt: "A rectangular floor is {a} long and {b} wide. How long is its diagonal in {unit}?", cablePrompt: "A vertical mast is {a} high. A taut cable runs from the top to level ground, {b} from the base. How long is the cable in {unit}?",
  hypotenuseHint: "a² + b² = c² → c = √(a² + b²).", legHint: "{side}² = c² − {other}² → {side} = √(c² − {other}²).", checkHint: "Compare a² + b² with c². If they are equal, the triangle is right-angled.",
  yes: "Yes", no: "No", choose: "Choose an answer", working: "Working", answer: "Answer", unit: "Unit", chooseUnit: "Choose a unit", partialCount: "Partly correct", partial: "Correct number – check the unit", checkNote: "The correct length earns 80% of the marks; the correct unit completes full credit. Yes/no is graded as one answer. Your teacher assesses your working.",
  pageHint: "First sheet: {first} problems, then {following} per sheet. Counts adjust to hints. The answer key is separate.", figure: "Triangle", right: "Right angle between a and b", unknown: "unknown", sketch: "Sketch – not to scale",
};
const pt: Copy = {
  title: "Teorema de Pitágoras", subtitle: "Encontra lados desconhecidos e investiga triângulos retângulos.", instructions: "Mostra os cálculos. Arredonda os comprimentos a duas casas decimais quando necessário e usa a unidade pedida. As figuras são esquemas. c é o lado maior; num triângulo retângulo, c é a hipotenusa.",
  taskType: "Tipo de exercício", hypotenuse: "Encontrar a hipotenusa", leg: "Encontrar um cateto", check_triangle: "O triângulo é retângulo?", word_problems: "Problemas práticos", mixed: "Misto",
  level: "Nível", whole: "1 – respostas inteiras", roots: "2 – raízes quadradas e arredondamento", decimals: "3 – medidas decimais", lengthUnit: "Unidade de comprimento", maximum: "Maior comprimento", rotate: "Variar a orientação dos triângulos", support: "Mostrar fórmulas e pistas", invalid: "Escolhe definições válidas (1–60 exercícios).", empty: "Pronto para a primeira ficha de Pitágoras",
  note: "Os problemas práticos usam metros. Para verificar o ângulo reto, compara os quadrados; o ângulo não está marcado de antemão.",
  hypotenusePrompt: "Calcula a hipotenusa c. Responde em {unit}.", legPrompt: "Calcula o cateto {side}. Responde em {unit}.", checkPrompt: "Os lados medem {a}, {b} e {c}. O triângulo é retângulo? Justifica com cálculos.",
  ladderPrompt: "Uma escada apoia-se numa parede vertical sobre solo horizontal. Atinge {a} de altura e o pé fica a {b} da parede. Qual é o comprimento da escada em {unit}?", ladder_heightPrompt: "Uma escada de {c} apoia-se numa parede vertical sobre solo horizontal. O pé fica a {b} da parede. Que altura atinge em {unit}?", diagonalPrompt: "Um chão retangular tem {a} de comprimento e {b} de largura. Qual é o comprimento da diagonal em {unit}?", cablePrompt: "Um mastro vertical tem {a} de altura. Um cabo esticado liga o topo ao solo horizontal, a {b} da base. Qual é o comprimento do cabo em {unit}?",
  hypotenuseHint: "a² + b² = c² → c = √(a² + b²).", legHint: "{side}² = c² − {other}² → {side} = √(c² − {other}²).", checkHint: "Compara a² + b² com c². Se forem iguais, o triângulo é retângulo.",
  yes: "Sim", no: "Não", choose: "Escolhe uma resposta", working: "Cálculos", answer: "Resposta", unit: "Unidade", chooseUnit: "Escolhe a unidade", partialCount: "Parcialmente correto", partial: "Número correto – verifica a unidade", checkNote: "O comprimento correto vale 80% da pontuação; a unidade correta completa a pontuação. Sim/não é avaliado como uma resposta. O professor avalia os cálculos.",
  pageHint: "Primeira ficha: {first} exercícios; seguintes: {following} por ficha. A quantidade adapta-se às pistas. As soluções são apresentadas à parte.", figure: "Triângulo", right: "Ângulo reto entre a e b", unknown: "desconhecido", sketch: "Esquema – sem escala",
};
export function getPythagorasCopy(language: string): Copy { return language === "en" ? en : language === "pt" ? pt : nb; }
