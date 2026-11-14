import { normalizeMathWorksheetLanguage, type MathWorksheetLanguage } from "../taxonomy";

export const COORDINATES_TASK_TYPES = ["read_points", "place_points", "draw_figure", "reflect"] as const;
export const COORDINATES_MODES = [...COORDINATES_TASK_TYPES, "mixed"] as const;
export const COORDINATES_EXTENTS = [5, 10, 20] as const;
export const COORDINATES_AXES = ["x", "y", "mixed"] as const;
export type CoordinatesMode = typeof COORDINATES_MODES[number];
export type CoordinatesAxis = "x" | "y";
export type CoordinatesPoint = { x: number; y: number };
export type CoordinatesSettings = {
  taskType: CoordinatesMode; quadrants: "positive" | "all"; extent: typeof COORDINATES_EXTENTS[number];
  step: number; pointCount: number; reflectionAxis: typeof COORDINATES_AXES[number]; taskCount: number; showSupport: boolean;
};
export type CoordinatesTask = { id: string; type: "read_points" | "place_points" | "draw_figure"; points: CoordinatesPoint[] }
  | { id: string; type: "reflect"; axis: CoordinatesAxis; points: CoordinatesPoint[] };
export type CoordinatesAnswer = { points: { x: string; y: string }[] };
export type CoordinatesWorksheet = {
  version: 1; kind: "coordinates"; language: MathWorksheetLanguage; title: string; instructions: string;
  settings: CoordinatesSettings; tasks: CoordinatesTask[]; showAnswerKey: boolean;
};
export const COORDINATES_TASKS_PER_PAGE = 2;
export const DEFAULT_COORDINATES_SETTINGS: CoordinatesSettings = { taskType: "mixed", quadrants: "all", extent: 5, step: 1, pointCount: 3, reflectionAxis: "mixed", taskCount: 4, showSupport: false };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const labels = "ABCDE";
export function coordinatesSteps(extent: number, quadrants: "positive" | "all"): number[] {
  return [1, 2, 5].filter(step => extent % step === 0 && extent * (quadrants === "all" ? 2 : 1) / step >= 4 && extent * (quadrants === "all" ? 2 : 1) / step <= 20);
}
export function coordinatesTaskTypes(settings: CoordinatesSettings) {
  return settings.taskType === "mixed" ? COORDINATES_TASK_TYPES.filter(type => type !== "reflect" || settings.quadrants === "all") : [settings.taskType];
}
export function normalizeCoordinatesSettings(v: unknown): CoordinatesSettings {
  if (!record(v)) throw new Error("INVALID_SETTINGS");
  if (!COORDINATES_MODES.includes(v.taskType as CoordinatesMode)) throw new Error("INVALID_TYPE");
  if (v.quadrants !== "positive" && v.quadrants !== "all") throw new Error("INVALID_QUADRANTS");
  if (!COORDINATES_EXTENTS.includes(v.extent as CoordinatesSettings["extent"]) || !coordinatesSteps(Number(v.extent), v.quadrants).includes(Number(v.step)) || typeof v.step !== "number") throw new Error("INVALID_SCALE");
  if (!Number.isInteger(v.pointCount) || Number(v.pointCount) < (v.taskType === "draw_figure" || v.taskType === "mixed" ? 3 : 1) || Number(v.pointCount) > 5) throw new Error("INVALID_POINTS");
  if (!COORDINATES_AXES.includes(v.reflectionAxis as CoordinatesSettings["reflectionAxis"])) throw new Error("INVALID_AXIS");
  if (v.taskType === "reflect" && v.quadrants !== "all") throw new Error("INVALID_REFLECTION_RANGE");
  if (!Number.isInteger(v.taskCount) || Number(v.taskCount) < 1 || Number(v.taskCount) > 60) throw new Error("INVALID_COUNT");
  if (typeof v.showSupport !== "boolean") throw new Error("INVALID_SUPPORT");
  return { taskType: v.taskType as CoordinatesMode, quadrants: v.quadrants, extent: v.extent as CoordinatesSettings["extent"], step: v.step, pointCount: Number(v.pointCount), reflectionAxis: v.reflectionAxis as CoordinatesSettings["reflectionAxis"], taskCount: Number(v.taskCount), showSupport: v.showSupport };
}
export function reflectCoordinates(point: CoordinatesPoint, axis: CoordinatesAxis): CoordinatesPoint {
  return axis === "x" ? { x: point.x, y: point.y === 0 ? 0 : -point.y } : { x: point.x === 0 ? 0 : -point.x, y: point.y };
}
export function coordinatesExpected(task: CoordinatesTask): CoordinatesPoint[] {
  return task.type === "reflect" ? task.points.map(point => reflectCoordinates(point, task.axis)) : task.points.map(point => ({ ...point }));
}
export function coordinatesLabel(index: number, reflected = false): string { return `${labels[index]}${reflected ? "′" : ""}`; }
export function coordinatesClosed(task: CoordinatesTask): boolean { return task.type === "draw_figure" || task.type === "reflect" && task.points.length >= 3; }
export function parseCoordinatesValue(value: unknown): number | null {
  if (typeof value !== "string" || value.length > 20) return null;
  const text = value.trim().replaceAll("−", "-");
  if (!/^[+-]?\d+(?:[.,]0+)?$/.test(text)) return null;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) && Math.abs(number) <= 1000 ? number === 0 ? 0 : number : null;
}
export function readCoordinatesAnswer(value: unknown, count: number): CoordinatesAnswer {
  const points = record(value) && Array.isArray(value.points) ? value.points : [];
  return { points: Array.from({ length: count }, (_, i) => ({ x: record(points[i]) && typeof points[i].x === "string" ? points[i].x : "", y: record(points[i]) && typeof points[i].y === "string" ? points[i].y : "" })) };
}
export function coordinatesAnswerPoints(value: unknown, count: number): (CoordinatesPoint | null)[] {
  return readCoordinatesAnswer(value, count).points.map(point => {
    const x = parseCoordinatesValue(point.x), y = parseCoordinatesValue(point.y);
    return x === null || y === null ? null : { x, y };
  });
}
export function coordinatesTaskPrompt(task: CoordinatesTask, language: string): string {
  const copy = getCoordinatesCopy(language);
  return task.type === "reflect" ? copy.reflectPrompt.replace("{axis}", task.axis).replace("{labels}", task.points.map((_, i) => coordinatesLabel(i, true)).join(", ")) : copy[`${task.type}Prompt`];
}
export function coordinatesTaskAnswer(task: CoordinatesTask): string {
  return coordinatesExpected(task).map((p, i) => `${coordinatesLabel(i, task.type === "reflect")} = (${p.x}, ${p.y})`).join(" · ");
}
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}
const figures: Record<number, CoordinatesPoint[]> = {
  3: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 2 }],
  4: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }],
  5: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 2 }, { x: 1, y: 3 }, { x: 0, y: 2 }],
};
export function generateCoordinatesWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): CoordinatesWorksheet {
  const settings = normalizeCoordinatesSettings(value), lang = normalizeMathWorksheetLanguage(language), copy = getCoordinatesCopy(lang);
  const types = shuffle([...coordinatesTaskTypes(settings)], random), min = settings.quadrants === "all" ? -settings.extent : 0;
  const units = (settings.extent - min) / settings.step, integer = (max: number) => Math.floor(random() * (max + 1));
  const lattice = Array.from({ length: units + 1 }, (_, x) => Array.from({ length: units + 1 }, (_, y) => ({ x: min + x * settings.step, y: min + y * settings.step }))).flat();
  const used = new Set<string>();
  const tasks = Array.from({ length: settings.taskCount }, (_, index): CoordinatesTask => {
    const type = types[index % types.length], id = `coordinates_${index + 1}`;
    let points: CoordinatesPoint[], attempts = 0, key: string;
    do {
      if (type === "draw_figure" || type === "reflect" && settings.pointCount >= 3) {
        let template = figures[settings.pointCount].map(point => ({ ...point }));
        if (integer(1)) template = template.map(point => ({ x: point.y, y: point.x }));
        if (integer(1)) { const width = Math.max(...template.map(p => p.x)); template = template.map(p => ({ x: width - p.x, y: p.y })); }
        const scale = 1 + integer(Math.min(3, Math.floor(units / Math.max(...template.map(p => Math.max(p.x, p.y))))) - 1);
        template = template.map(p => ({ x: p.x * scale, y: p.y * scale }));
        const width = Math.max(...template.map(p => p.x)), height = Math.max(...template.map(p => p.y));
        const dx = integer(units - width), dy = integer(units - height);
        points = template.map(point => ({ x: min + (point.x + dx) * settings.step, y: min + (point.y + dy) * settings.step }));
      } else points = shuffle([...lattice], random).slice(0, settings.pointCount);
      key = `${type}:${JSON.stringify(points)}`;
    } while (used.has(key) && ++attempts < 25);
    used.add(key);
    if (type === "reflect") return { id, type, points, axis: settings.reflectionAxis === "mixed" ? Math.floor(index / types.length) % 2 === 0 ? "x" : "y" : settings.reflectionAxis };
    return { id, type, points };
  });
  return { version: 1, kind: "coordinates", language: lang, title: copy.title, instructions: copy.instructions, settings, tasks: shuffle(tasks, random), showAnswerKey };
}
function validPolygon(points: CoordinatesPoint[]): boolean {
  if (points.length < 3) return false;
  const cross = (a: CoordinatesPoint, b: CoordinatesPoint, c: CoordinatesPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const turns = points.map((p, i) => cross(p, points[(i + 1) % points.length], points[(i + 2) % points.length]));
  return turns.every(turn => turn > 0) || turns.every(turn => turn < 0);
}
export function sanitizeCoordinatesWorksheet(value: unknown): CoordinatesWorksheet | null {
  if (!record(value) || value.kind !== "coordinates" || value.version !== 1 || !Array.isArray(value.tasks)) return null;
  try {
    const settings = normalizeCoordinatesSettings(value.settings), min = settings.quadrants === "all" ? -settings.extent : 0, ids = new Set<string>();
    if (value.tasks.length !== settings.taskCount) return null;
    const tasks = value.tasks.map((raw): CoordinatesTask => {
      if (!record(raw) || typeof raw.id !== "string" || !/^[\w-]{1,80}$/.test(raw.id) || ids.has(raw.id)) throw new Error("id");
      ids.add(raw.id);
      if (!coordinatesTaskTypes(settings).includes(raw.type as typeof COORDINATES_TASK_TYPES[number]) || !Array.isArray(raw.points) || raw.points.length !== settings.pointCount) throw new Error("type");
      const keys = new Set<string>();
      const points = raw.points.map((p): CoordinatesPoint => {
        if (!record(p) || typeof p.x !== "number" || typeof p.y !== "number" || ![p.x, p.y].every(n => Number.isInteger(n) && n >= min && n <= settings.extent && n % settings.step === 0)) throw new Error("point");
        const key = `${p.x}:${p.y}`; if (keys.has(key)) throw new Error("duplicate"); keys.add(key);
        return { x: p.x === 0 ? 0 : p.x, y: p.y === 0 ? 0 : p.y };
      });
      if ((raw.type === "draw_figure" || raw.type === "reflect" && points.length >= 3) && !validPolygon(points)) throw new Error("polygon");
      if (raw.type === "reflect") {
        if (raw.axis !== "x" && raw.axis !== "y" || settings.quadrants !== "all" || settings.reflectionAxis !== "mixed" && raw.axis !== settings.reflectionAxis) throw new Error("axis");
        return { id: raw.id, type: "reflect", points, axis: raw.axis };
      }
      return { id: raw.id, type: raw.type as "read_points" | "place_points" | "draw_figure", points };
    });
    const language = normalizeMathWorksheetLanguage(value.language), copy = getCoordinatesCopy(language);
    return { version: 1, kind: "coordinates", language, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey: value.showAnswerKey === true };
  } catch { return null; }
}
export function gradeCoordinatesTask(task: CoordinatesTask, value: unknown) {
  const answer = readCoordinatesAnswer(value, task.points.length), expected = coordinatesExpected(task);
  const byPoint = expected.map((p, i) => {
    const xCorrect = parseCoordinatesValue(answer.points[i].x) === p.x, yCorrect = parseCoordinatesValue(answer.points[i].y) === p.y;
    return { xCorrect, yCorrect, isCorrect: xCorrect && yCorrect };
  });
  const points = byPoint.reduce((sum, p) => sum + Number(p.xCorrect) + Number(p.yCorrect), 0) / (expected.length * 2);
  const isAnswered = record(value) ? answer.points.some(p => p.x.trim() !== "" || p.y.trim() !== "") : typeof value === "string" ? value.trim() !== "" : value != null;
  return { type: "coordinates" as const, isCorrect: points === 1, isPartial: points > 0 && points < 1, points, isAnswered, byPoint, studentAnswer: value ?? "", correctAnswer: { points: expected.map(p => ({ x: String(p.x), y: String(p.y) })) } };
}
export function gradeCoordinatesWorksheet(worksheet: CoordinatesWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeCoordinatesTask(task, answers[task.id])]));
  const entries = Object.values(byTask), correctAuto = entries.filter(e => e.isCorrect).length, partialAuto = entries.filter(e => e.isPartial).length, unansweredAuto = entries.filter(e => !e.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, partialAuto, wrongAuto: entries.length - correctAuto - partialAuto - unansweredAuto, unansweredAuto, percentAuto: entries.length ? Math.round(entries.reduce((sum, e) => sum + e.points, 0) / entries.length * 100) : 0, byTask };
}

const nb = {
  title: "Koordinatsystem og speiling", subtitle: "Les og plasser punkter, tegn figurer og speil dem om x- eller y-aksen.",
  instructions: "Koordinater skrives (x, y): først vannrett, deretter loddrett. Tegn figurer ved å forbinde punktene i oppgitt rekkefølge og tilbake til start. Ved speiling merkes speilbildet A′, B′ og så videre.",
  taskType: "Oppgavetype", read_points: "Les av punkter", place_points: "Plasser punkter", draw_figure: "Tegn en figur", reflect: "Speil punkter og figurer", mixed: "Blandet",
  quadrants: "Koordinatområde", positive: "Bare positive koordinater og null", all: "Alle fire kvadranter", extent: "Største akseverdi", step: "Verdi per rute", pointCount: "Antall punkter", reflectionAxis: "Speilingsakse", x: "x-aksen", y: "y-aksen", support: "Vis flere aksetall og forklaringer", empty: "Klar for første koordinatark",
  read_pointsPrompt: "Skriv koordinatene til de markerte punktene.", place_pointsPrompt: "Plasser punktene i koordinatsystemet og skriv riktig bokstav ved hvert punkt.", draw_figurePrompt: "Plasser punktene og forbind dem i rekkefølge. Lukk figuren ved å gå tilbake til A.", reflectPrompt: "Speil punktene eller figuren om {axis}-aksen. Merk speilbildet med {labels}.",
  grid: "Koordinatsystem", blankGrid: "Tomt koordinatsystem", source: "Opprinnelige punkter", student: "Dine punkter", point: "Punkt", activePoint: "Punkt som plasseres", partial: "Delvis riktig", unset: "ikke satt",
  gridStep: "Én rute tilsvarer {step} på begge aksene.", plotHint: "Velg en bokstav og klikk i rutenettet. Du kan også bruke koordinatfeltene, eller piltastene når rutenettet har fokus. Enter plasserer punktet, og Home plasserer punktet i origo.", readHint: "Les x-verdien langs den vannrette aksen og y-verdien langs den loddrette aksen.", reflectHint: "Ved speiling om x-aksen bytter y fortegn. Ved speiling om y-aksen bytter x fortegn.", positiveNote: "Speiling trenger alle fire kvadranter. Med bare positive koordinater blander vi de tre andre oppgavetypene.", invalid: "Velg gyldig oppgavetype, koordinatområde, rutestørrelse, antall punkter og 1–60 oppgaver.",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  title: "Coordinates and reflection", subtitle: "Read and plot points, draw shapes and reflect them in the x- or y-axis.",
  instructions: "Write coordinates as (x, y): horizontal first, then vertical. Draw shapes by connecting the points in the given order and back to the start. Label reflected points A′, B′ and so on.",
  taskType: "Task type", read_points: "Read coordinates", place_points: "Plot points", draw_figure: "Draw a shape", reflect: "Reflect points and shapes", mixed: "Mixed",
  quadrants: "Coordinate region", positive: "Positive coordinates and zero", all: "All four quadrants", extent: "Largest axis value", step: "Value per square", pointCount: "Number of points", reflectionAxis: "Axis of reflection", x: "x-axis", y: "y-axis", support: "Show more axis numbers and explanations", empty: "Ready for your first coordinate worksheet",
  read_pointsPrompt: "Write the coordinates of the marked points.", place_pointsPrompt: "Plot the points and label each with the correct letter.", draw_figurePrompt: "Plot and connect the points in order. Close the shape by returning to A.", reflectPrompt: "Reflect the points or shape in the {axis}-axis. Label the image {labels}.",
  grid: "Coordinate grid", blankGrid: "Empty coordinate grid", source: "Original points", student: "Your points", point: "Point", activePoint: "Point to plot", partial: "Partly correct", unset: "not set",
  gridStep: "Each square represents {step} on both axes.", plotHint: "Choose a letter and click in the grid. You can also use the coordinate fields, or the arrow keys when the grid has focus. Enter plots the point; Home moves the point to the origin.", readHint: "Read x along the horizontal axis and y along the vertical axis.", reflectHint: "Reflecting in the x-axis changes the sign of y. Reflecting in the y-axis changes the sign of x.", positiveNote: "Reflections need all four quadrants. With positive coordinates only, mixed uses the other three task types.", invalid: "Choose a valid task type, coordinate region, scale, point count and 1–60 tasks.",
};
const pt: Copy = {
  title: "Coordenadas e reflexão", subtitle: "Ler e marcar pontos, desenhar figuras e refletir nos eixos x ou y.",
  instructions: "Escreve as coordenadas como (x, y): primeiro a horizontal, depois a vertical. Desenha as figuras ligando os pontos pela ordem indicada e voltando ao início. Identifica os pontos refletidos com A′, B′ e assim por diante.",
  taskType: "Tipo de exercício", read_points: "Ler coordenadas", place_points: "Marcar pontos", draw_figure: "Desenhar uma figura", reflect: "Refletir pontos e figuras", mixed: "Misto",
  quadrants: "Região de coordenadas", positive: "Coordenadas positivas e zero", all: "Os quatro quadrantes", extent: "Maior valor dos eixos", step: "Valor de cada quadrícula", pointCount: "Número de pontos", reflectionAxis: "Eixo de reflexão", x: "Eixo x", y: "Eixo y", support: "Mostrar mais valores e explicações", empty: "Pronto para a primeira ficha de coordenadas",
  read_pointsPrompt: "Escreve as coordenadas dos pontos assinalados.", place_pointsPrompt: "Marca os pontos e identifica cada um com a letra correta.", draw_figurePrompt: "Marca e liga os pontos pela ordem indicada. Fecha a figura voltando a A.", reflectPrompt: "Reflete os pontos ou a figura no eixo {axis}. Identifica a imagem com {labels}.",
  grid: "Referencial cartesiano", blankGrid: "Referencial vazio", source: "Pontos originais", student: "Os teus pontos", point: "Ponto", activePoint: "Ponto a marcar", partial: "Parcialmente correto", unset: "por definir",
  gridStep: "Cada quadrícula representa {step} nos dois eixos.", plotHint: "Escolhe uma letra e clica no referencial. Também podes usar os campos das coordenadas ou as setas quando o referencial tem o foco. Enter marca o ponto; Home coloca o ponto na origem.", readHint: "Lê x no eixo horizontal e y no eixo vertical.", reflectHint: "A reflexão no eixo x troca o sinal de y. A reflexão no eixo y troca o sinal de x.", positiveNote: "As reflexões precisam dos quatro quadrantes. Só com coordenadas positivas, o modo misto usa os outros três tipos.", invalid: "Escolhe um tipo de exercício, região, escala, número de pontos e 1–60 exercícios válidos.",
};
export function getCoordinatesCopy(language: string): Copy { return language === "en" ? en : language === "pt" ? pt : nb; }
