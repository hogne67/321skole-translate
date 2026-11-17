import { normalizeMathWorksheetLanguage, type MathWorksheetLanguage } from "../taxonomy";
import { VOLUME_MAX_TASK_COUNT, volumePageCapacity } from "./printLayout";

export const VOLUME_TASK_TYPES = ["count_cubes", "calculate", "missing_measure", "word_problems"] as const;
export const VOLUME_MODES = [...VOLUME_TASK_TYPES, "mixed"] as const;
export const VOLUME_SHAPES = ["cube", "cuboid", "cylinder"] as const;
export const VOLUME_LENGTH_UNITS = ["cm", "dm", "m"] as const;
export type VolumeShape = typeof VOLUME_SHAPES[number];
export type VolumeLengthUnit = typeof VOLUME_LENGTH_UNITS[number];
export type VolumeUnit = "cm3" | "dm3" | "m3" | "l";
export type VolumeSettings = {
  taskType: typeof VOLUME_MODES[number]; shapes: VolumeShape[]; lengthUnit: VolumeLengthUnit;
  maximum: number; allowDecimals: boolean; taskCount: number; showSupport: boolean;
};
export type VolumeTask = {
  id: string; type: typeof VOLUME_TASK_TYPES[number]; shape: VolumeShape;
  length: number; width: number; height: number; lengthUnit: VolumeLengthUnit;
  context?: "aquarium" | "box" | "tank" | "container";
};
export type VolumeAnswer = { value: string; unit: string; working: string };
export type VolumeWorksheet = {
  version: 1; kind: "volume"; language: MathWorksheetLanguage; title: string; instructions: string;
  settings: VolumeSettings; tasks: VolumeTask[]; showAnswerKey: boolean;
};
export const DEFAULT_VOLUME_SETTINGS: VolumeSettings = {
  taskType: "mixed", shapes: ["cube", "cuboid"], lengthUnit: "cm", maximum: 10,
  allowDecimals: false, taskCount: volumePageCapacity(false).first, showSupport: false,
};
export const VOLUME_PI = 3.14;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const roundVolume = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export function normalizeVolumeSettings(v: unknown): VolumeSettings {
  if (!record(v)) throw new Error("INVALID_SETTINGS");
  if (!VOLUME_MODES.includes(v.taskType as VolumeSettings["taskType"])) throw new Error("INVALID_TYPE");
  if (!Array.isArray(v.shapes) || !v.shapes.length || v.shapes.length > 3 || new Set(v.shapes).size !== v.shapes.length || !v.shapes.every(s => VOLUME_SHAPES.includes(s as VolumeShape))) throw new Error("INVALID_SHAPES");
  if (v.taskType === "count_cubes" && v.shapes.includes("cylinder")) throw new Error("INVALID_CUBE_SHAPE");
  if (!VOLUME_LENGTH_UNITS.includes(v.lengthUnit as VolumeLengthUnit) || ![5, 10, 20].includes(Number(v.maximum)) || typeof v.maximum !== "number") throw new Error("INVALID_RANGE");
  if (typeof v.allowDecimals !== "boolean" || typeof v.showSupport !== "boolean") throw new Error("INVALID_OPTIONS");
  if (!Number.isInteger(v.taskCount) || Number(v.taskCount) < 1 || Number(v.taskCount) > VOLUME_MAX_TASK_COUNT) throw new Error("INVALID_COUNT");
  return { taskType: v.taskType as VolumeSettings["taskType"], shapes: [...v.shapes] as VolumeShape[], lengthUnit: v.lengthUnit as VolumeLengthUnit,
    maximum: v.maximum, allowDecimals: v.allowDecimals, showSupport: v.showSupport, taskCount: Number(v.taskCount) };
}
export function volumeTaskTypes(settings: VolumeSettings) {
  return settings.taskType === "mixed" ? VOLUME_TASK_TYPES.filter(type => type !== "count_cubes" || settings.shapes.some(s => s !== "cylinder")) : [settings.taskType];
}
export function volumeMagnitude(task: VolumeTask): number {
  return task.shape === "cylinder" ? VOLUME_PI * task.length ** 2 * task.height : task.length * task.width * task.height;
}
export function volumeExpected(task: VolumeTask): number {
  if (task.type === "missing_measure") return task.shape === "cube" ? task.length : task.height;
  if (task.type === "word_problems") return roundVolume(volumeMagnitude(task) * (task.lengthUnit === "cm" ? 0.001 : task.lengthUnit === "m" ? 1000 : 1));
  return roundVolume(volumeMagnitude(task));
}
export function volumeExpectedUnit(task: VolumeTask): VolumeUnit | VolumeLengthUnit {
  return task.type === "missing_measure" ? task.lengthUnit : task.type === "word_problems" ? "l" : `${task.lengthUnit}3`;
}
export function volumeUnitLabel(unit: string): string {
  return unit === "cm3" ? "cm³" : unit === "dm3" ? "dm³" : unit === "m3" ? "m³" : unit;
}
export function volumeAnswerUnits(task: VolumeTask): string[] {
  return task.type === "missing_measure" ? [...VOLUME_LENGTH_UNITS] : ["cm3", "dm3", "m3", "l"];
}
export function formatVolumeNumber(value: number, language: string, digits = 2): string {
  return Number(value.toFixed(digits)).toLocaleString(language === "en" ? "en-GB" : language === "pt" ? "pt-PT" : "nb-NO", { useGrouping: false, maximumFractionDigits: digits });
}
export function volumeAnswerText(task: VolumeTask, language: string): string {
  return `${formatVolumeNumber(volumeExpected(task), language)} ${volumeUnitLabel(volumeExpectedUnit(task))}`;
}
export function volumeGivenMagnitude(task: VolumeTask): number { return Math.round((volumeMagnitude(task) + Number.EPSILON) * 10000) / 10000; }
export function volumeTaskPrompt(task: VolumeTask, language: string): string {
  const copy = getVolumeCopy(language), unit = volumeUnitLabel(volumeExpectedUnit(task));
  if (task.type === "count_cubes") return copy.countPrompt.replace("{unit}", unit);
  if (task.type === "calculate") return copy.calculatePrompt.replace("{unit}", unit);
  if (task.type === "missing_measure") return copy[task.shape === "cube" ? "missingSidePrompt" : "missingHeightPrompt"]
    .replace("{volume}", `${formatVolumeNumber(volumeGivenMagnitude(task), language, 4)} ${volumeUnitLabel(`${task.lengthUnit}3`)}`).replace("{unit}", unit);
  return copy[`${task.context ?? "container"}Prompt`];
}
export function volumeTaskHint(task: VolumeTask, language: string): string {
  const copy = getVolumeCopy(language);
  if (task.type === "count_cubes") return copy.countHint;
  if (task.type === "missing_measure") return copy[task.shape === "cube" ? "cubeMissingHint" : task.shape === "cylinder" ? "cylinderMissingHint" : "prismMissingHint"];
  return `${copy[task.shape === "cube" ? "cubeHint" : task.shape === "cylinder" ? "cylinderHint" : "prismHint"]}${task.type === "word_problems" ? ` ${copy.litreHint}` : ""}`;
}
export function volumeSolution(task: VolumeTask, language: string): string {
  const n = (v: number) => formatVolumeNumber(v, language), u = volumeUnitLabel(`${task.lengthUnit}3`);
  const factors = task.shape === "cylinder" ? `${n(VOLUME_PI)} × ${n(task.length)}² × ${n(task.height)}` : `${n(task.length)} × ${n(task.width)} × ${n(task.height)}`;
  const fullVolume = formatVolumeNumber(volumeGivenMagnitude(task), language, 4);
  if (task.type === "missing_measure") return task.shape === "cube" ? `${n(task.length)} × ${n(task.length)} × ${n(task.length)} = ${fullVolume} ${u}` : `${fullVolume} ÷ (${task.shape === "cylinder" ? `${n(VOLUME_PI)} × ${n(task.length)}²` : `${n(task.length)} × ${n(task.width)}`}) = ${volumeAnswerText(task, language)}`;
  return `${factors} = ${fullVolume} ${u}${task.type === "word_problems" || volumeExpected(task) !== volumeGivenMagnitude(task) ? ` ≈ ${volumeAnswerText(task, language)}` : ""}`;
}
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}
export function generateVolumeWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): VolumeWorksheet {
  const settings = normalizeVolumeSettings(value), lang = normalizeMathWorksheetLanguage(language), copy = getVolumeCopy(lang);
  const types = shuffle([...volumeTaskTypes(settings)], random), shapes = shuffle([...settings.shapes], random), used = new Set<string>();
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const tasks = Array.from({ length: settings.taskCount }, (_, index): VolumeTask => {
    const type = types[index % types.length], eligible = type === "count_cubes" ? shapes.filter(s => s !== "cylinder") : shapes;
    const shape = eligible[(index + (types.length > 1 ? Math.floor(index / types.length) : 0)) % eligible.length];
    let task: VolumeTask, key: string, attempt = 0;
    do {
      const measure = () => type === "count_cubes" ? integer(1, 5) : settings.allowDecimals ? integer(2, settings.maximum * 2) / 2 : integer(1, settings.maximum);
      const length = measure(), width = shape === "cube" ? length : measure(), height = shape === "cube" ? length : measure();
      // Practical capacities use decimetres, keeping litre answers meaningful even for small solids.
      task = { id: `volume_${index + 1}`, type, shape, length, width: shape === "cylinder" ? length : width, height, lengthUnit: type === "word_problems" ? "dm" : settings.lengthUnit,
        ...(type === "word_problems" ? { context: shape === "cylinder" ? index % 2 ? "tank" as const : "container" as const : index % 2 ? "aquarium" as const : "box" as const } : {}) };
      key = JSON.stringify({ ...task, id: "" });
    } while (used.has(key) && ++attempt < 30);
    used.add(key); return task;
  });
  return { version: 1, kind: "volume", language: lang, title: copy.title, instructions: copy.instructions, settings, tasks: shuffle(tasks, random), showAnswerKey };
}
export function sanitizeVolumeWorksheet(value: unknown): VolumeWorksheet | null {
  if (!record(value) || value.kind !== "volume" || value.version !== 1 || !Array.isArray(value.tasks)) return null;
  try {
    const settings = normalizeVolumeSettings(value.settings), ids = new Set<string>();
    if (value.tasks.length !== settings.taskCount) return null;
    const tasks = value.tasks.map((raw): VolumeTask => {
      if (!record(raw) || typeof raw.id !== "string" || !/^[\w-]{1,80}$/.test(raw.id) || ids.has(raw.id)) throw new Error("id");
      ids.add(raw.id);
      if (!volumeTaskTypes(settings).includes(raw.type as VolumeTask["type"]) || !settings.shapes.includes(raw.shape as VolumeShape)) throw new Error("type");
      const type = raw.type as VolumeTask["type"], shape = raw.shape as VolumeShape;
      if (type === "count_cubes" && shape === "cylinder") throw new Error("cubes");
      const max = type === "count_cubes" ? 5 : settings.maximum;
      if (![raw.length, raw.width, raw.height].every(n => typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= max && (type === "count_cubes" || !settings.allowDecimals ? Number.isInteger(n) : Number.isInteger(n * 2)))) throw new Error("measure");
      if (shape === "cube" && (raw.length !== raw.width || raw.length !== raw.height) || shape === "cylinder" && raw.length !== raw.width) throw new Error("shape");
      if (raw.lengthUnit !== (type === "word_problems" ? "dm" : settings.lengthUnit)) throw new Error("unit");
      if (type === "word_problems" && !(shape === "cylinder" ? ["tank", "container"] : ["aquarium", "box"]).includes(String(raw.context))) throw new Error("context");
      return { id: raw.id, type, shape, length: Number(raw.length), width: Number(raw.width), height: Number(raw.height), lengthUnit: raw.lengthUnit as VolumeLengthUnit,
        ...(type === "word_problems" ? { context: raw.context as VolumeTask["context"] } : {}) };
    });
    const language = normalizeMathWorksheetLanguage(value.language), copy = getVolumeCopy(language);
    return { version: 1, kind: "volume", language, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey: value.showAnswerKey === true };
  } catch { return null; }
}
export function readVolumeAnswer(value: unknown): VolumeAnswer {
  return { value: record(value) && typeof value.value === "string" && value.value.length <= 40 ? value.value : "", unit: record(value) && typeof value.unit === "string" && value.unit.length <= 10 ? value.unit : "", working: record(value) && typeof value.working === "string" ? value.working.slice(0, 2000) : "" };
}
export function parseVolumeAnswer(value: string): number | null {
  const text = value.trim();
  if (!/^\+?\d+(?:[.,]\d+)?$/.test(text)) return null;
  const result = Number(text.replace(",", "."));
  return Number.isFinite(result) && result <= 100000000 ? result : null;
}
export function gradeVolumeTask(task: VolumeTask, value: unknown) {
  const answer = readVolumeAnswer(value), numeric = parseVolumeAnswer(answer.value), expected = volumeExpected(task);
  const valueCorrect = numeric !== null && Math.abs(numeric - expected) < 0.000001, unitCorrect = answer.unit === volumeExpectedUnit(task);
  const points = valueCorrect ? unitCorrect ? 1 : 0.8 : 0;
  const isAnswered = record(value) ? [value.value, value.unit, value.working].some(v => typeof v === "string" ? !!v.trim() : v != null) : value != null && String(value).trim() !== "";
  return { type: "volume" as const, isCorrect: points === 1, isPartial: points > 0 && points < 1, points, isAnswered, valueCorrect, unitCorrect, studentAnswer: answer,
    correctAnswer: { value: String(expected), unit: volumeExpectedUnit(task), working: volumeSolution(task, "en") } };
}
export function gradeVolumeWorksheet(worksheet: VolumeWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeVolumeTask(task, answers[task.id])])), entries = Object.values(byTask);
  const correctAuto = entries.filter(e => e.isCorrect).length, partialAuto = entries.filter(e => e.isPartial).length, unansweredAuto = entries.filter(e => !e.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, partialAuto, wrongAuto: entries.length - correctAuto - partialAuto - unansweredAuto, unansweredAuto,
    percentAuto: entries.length ? Math.round(entries.reduce((sum, e) => sum + e.points, 0) / entries.length * 100) : 0, byTask };
}

const nb = {
  title: "Volum og romfigurer", subtitle: "Tell enhetskuber, beregn volum og løs praktiske oppgaver.",
  instructions: "Vis utregningen og svar med enheten oppgaven ber om. Avrund svar til to desimaler ved behov. For sylinder: bruk π ≈ 3,14. Figurene er skisser.",
  taskType: "Oppgavetype", count_cubes: "Tell enhetskuber", calculate: "Beregn volum", missing_measure: "Finn manglende mål", word_problems: "Praktiske tekstoppgaver", mixed: "Blandet",
  shapes: "Romfigurer", cube: "Terning", cuboid: "Rett prisme – rektangulær grunnflate", cylinder: "Sylinder (vanskeligere)", unit: "Enhet", lengthUnit: "Lengdeenhet", maximum: "Største mål", decimals: "Tillat desimaltall i målene", support: "Vis formler og støtte", invalid: "Velg minst én figur og gyldige innstillinger (1–60 oppgaver).", empty: "Klar for første volumark",
  countNote: "Telleoppgaver bruker hele kuber. Sylinder inngår i de tre andre oppgavetypene. Praktiske oppgaver bruker dm og spør etter liter.",
  countPrompt: "Hvor stort er volumet i {unit}? Alle lagene er fulle.", calculatePrompt: "Beregn volumet. Svar i {unit}.",
  missingSidePrompt: "Terningen har volum {volume}. Finn sidelengden i {unit}.", missingHeightPrompt: "Figuren har volum {volume}. Finn høyden i {unit}.",
  aquariumPrompt: "Et akvarium har innvendige mål som vist. Hvor mange liter vann rommer det helt fullt?",
  boxPrompt: "En oppbevaringskasse har innvendige mål som vist. Hvor mange liter rommer den?",
  tankPrompt: "En sylindrisk tank har innvendige mål som vist. Hvor mange liter rommer tanken?",
  containerPrompt: "En sylindrisk beholder har innvendige mål som vist. Hvor mange liter rommer den?",
  countHint: "Tell kuber i ett lag. Gang med antall lag. Ta med kubene som er skjult.", cubeHint: "V = side × side × side.", prismHint: "V = lengde × bredde × høyde.", cylinderHint: "V = π × radius² × høyde. Radius er halvparten av diameteren.",
  cubeMissingHint: "Finn sidelengden: side × side × side = volum.", prismMissingHint: "Høyde = volum ÷ (lengde × bredde).", cylinderMissingHint: "Høyde = volum ÷ (π × radius²).", litreHint: "1 dm³ = 1 liter. Bruk målene inne i figuren.",
  working: "Utregning", answer: "Svar", chooseUnit: "Velg enhet", partialCount: "Delvis riktig", partial: "Riktig tall – sjekk enheten", checkNote: "Riktig tall gir 80 % av oppgavens poeng. Riktig tall og enhet gir full uttelling. Utregningen vurderes av læreren.",
  pageHint: "Første ark: {first} oppgaver, deretter {following} per ark. Antallet tilpasses støtte. Fasit kommer i tillegg.", side: "side", length: "lengde", width: "bredde", height: "høyde", radius: "radius", oneCube: "Én kube", fullLayers: "Alle lag er fulle", figure: "Romfigur", gridDescription: "{length} kuber i lengden, {width} i bredden og {height} lag i høyden.",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  title: "Volume and solids", subtitle: "Count unit cubes, calculate volume and solve practical problems.", instructions: "Show your working and use the requested unit. Round answers to two decimal places where needed. For cylinders: use π ≈ 3.14. Diagrams are sketches.",
  taskType: "Problem type", count_cubes: "Count unit cubes", calculate: "Calculate volume", missing_measure: "Find a missing measurement", word_problems: "Practical word problems", mixed: "Mixed",
  shapes: "Solids", cube: "Cube", cuboid: "Right prism – rectangular base", cylinder: "Cylinder (harder)", unit: "Unit", lengthUnit: "Length unit", maximum: "Largest measurement", decimals: "Allow decimal measurements", support: "Show formulas and hints", invalid: "Choose at least one solid and valid settings (1–60 problems).", empty: "Ready for your first volume worksheet",
  countNote: "Counting problems use whole cubes. Cylinders appear in the other three problem types. Practical problems use dm and ask for litres.",
  countPrompt: "What is the volume in {unit}? Every layer is full.", calculatePrompt: "Calculate the volume. Answer in {unit}.", missingSidePrompt: "The cube has volume {volume}. Find its side length in {unit}.", missingHeightPrompt: "The solid has volume {volume}. Find its height in {unit}.",
  aquariumPrompt: "An aquarium has the inside measurements shown. How many litres of water does it hold when full?", boxPrompt: "A storage box has the inside measurements shown. How many litres does it hold?", tankPrompt: "A cylindrical tank has the inside measurements shown. How many litres does it hold?", containerPrompt: "A cylindrical container has the inside measurements shown. How many litres does it hold?",
  countHint: "Count cubes in one layer, then multiply by the number of layers. Include hidden cubes.", cubeHint: "V = side × side × side.", prismHint: "V = length × width × height.", cylinderHint: "V = π × radius² × height. The radius is half the diameter.", cubeMissingHint: "Find the side length: side × side × side = volume.", prismMissingHint: "Height = volume ÷ (length × width).", cylinderMissingHint: "Height = volume ÷ (π × radius²).", litreHint: "1 dm³ = 1 litre. Use the inside measurements.",
  working: "Working", answer: "Answer", chooseUnit: "Choose a unit", partialCount: "Partly correct", partial: "Correct number – check the unit", checkNote: "The correct number earns 80% of the marks for a problem. The correct number and unit earn full marks. Your teacher assesses your working.",
  pageHint: "First sheet: {first} problems, then {following} per sheet. Counts adjust to hints. The answer key is separate.", side: "side", length: "length", width: "width", height: "height", radius: "radius", oneCube: "One cube", fullLayers: "Every layer is full", figure: "Solid", gridDescription: "{length} cubes in length, {width} in width and {height} layers high.",
};
const pt: Copy = {
  title: "Volume e sólidos geométricos", subtitle: "Conta cubos unitários, calcula volumes e resolve problemas práticos.", instructions: "Mostra os cálculos e usa a unidade pedida. Arredonda as respostas a duas casas decimais quando necessário. Para cilindros: usa π ≈ 3,14. As figuras são esquemas.",
  taskType: "Tipo de exercício", count_cubes: "Contar cubos unitários", calculate: "Calcular o volume", missing_measure: "Encontrar uma medida", word_problems: "Problemas práticos", mixed: "Misto",
  shapes: "Sólidos", cube: "Cubo", cuboid: "Prisma reto – base retangular", cylinder: "Cilindro (mais difícil)", unit: "Unidade", lengthUnit: "Unidade de comprimento", maximum: "Maior medida", decimals: "Permitir medidas decimais", support: "Mostrar fórmulas e pistas", invalid: "Escolhe pelo menos um sólido e definições válidas (1–60 exercícios).", empty: "Pronto para a primeira ficha de volumes",
  countNote: "A contagem usa cubos inteiros. Os cilindros surgem nos outros três tipos. Os problemas práticos usam dm e pedem litros.",
  countPrompt: "Qual é o volume em {unit}? Todas as camadas estão completas.", calculatePrompt: "Calcula o volume. Responde em {unit}.", missingSidePrompt: "O cubo tem volume {volume}. Calcula a medida da aresta em {unit}.", missingHeightPrompt: "O sólido tem volume {volume}. Calcula a altura em {unit}.",
  aquariumPrompt: "Um aquário tem as medidas interiores indicadas. Quantos litros de água leva quando está cheio?", boxPrompt: "Uma caixa tem as medidas interiores indicadas. Quantos litros leva?", tankPrompt: "Um depósito cilíndrico tem as medidas interiores indicadas. Quantos litros leva?", containerPrompt: "Um recipiente cilíndrico tem as medidas interiores indicadas. Quantos litros leva?",
  countHint: "Conta os cubos de uma camada e multiplica pelo número de camadas. Inclui os cubos escondidos.", cubeHint: "V = aresta × aresta × aresta.", prismHint: "V = comprimento × largura × altura.", cylinderHint: "V = π × raio² × altura. O raio é metade do diâmetro.", cubeMissingHint: "Encontra a aresta: aresta × aresta × aresta = volume.", prismMissingHint: "Altura = volume ÷ (comprimento × largura).", cylinderMissingHint: "Altura = volume ÷ (π × raio²).", litreHint: "1 dm³ = 1 litro. Usa as medidas interiores.",
  working: "Cálculos", answer: "Resposta", chooseUnit: "Escolhe a unidade", partialCount: "Parcialmente correto", partial: "Número correto – verifica a unidade", checkNote: "O número correto vale 80% da pontuação. O número e a unidade corretos dão a pontuação total. O professor avalia os cálculos.",
  pageHint: "Primeira ficha: {first} exercícios; seguintes: {following} por ficha. A quantidade adapta-se às pistas. As soluções são apresentadas à parte.", side: "aresta", length: "comprimento", width: "largura", height: "altura", radius: "raio", oneCube: "Um cubo", fullLayers: "Todas as camadas completas", figure: "Sólido geométrico", gridDescription: "{length} cubos no comprimento, {width} na largura e {height} camadas em altura.",
};
export function getVolumeCopy(language: string): Copy { return language === "en" ? en : language === "pt" ? pt : nb; }
