import { normalizeMathWorksheetLanguage, type MathWorksheetLanguage } from "../taxonomy";

export const CLOCK_TASK_TYPES = ["read_analog", "draw_hands", "elapsed"] as const;
export const CLOCK_MODES = [...CLOCK_TASK_TYPES, "mixed"] as const;
export const CLOCK_MINUTE_STEPS = [60, 30, 15, 5, 1] as const;
export type ClockTaskType = typeof CLOCK_TASK_TYPES[number];
export type ClockMode = typeof CLOCK_MODES[number];
export type ClockMinuteStep = typeof CLOCK_MINUTE_STEPS[number];
export type ClockTimeFormat = "12h" | "24h";
export type ClockSettings = {
  taskType: ClockMode; minuteStep: ClockMinuteStep; timeFormat: ClockTimeFormat;
  taskCount: number; showSupport: boolean; allowMidnight: boolean; maxDuration: number;
};
export type ClockTask = { id: string; type: "read_analog"; timeMinutes: number }
  | { id: string; type: "draw_hands"; timeMinutes: number }
  | { id: string; type: "elapsed"; startMinutes: number; endMinutes: number };
export type ClockHandsAnswer = { hour: string; minute: string };
export type ClockAnswer = string | ClockHandsAnswer;
export type ClockWorksheet = {
  version: 1; kind: "clock"; language: MathWorksheetLanguage; title: string; instructions: string;
  settings: ClockSettings; tasks: ClockTask[]; showAnswerKey: boolean;
};
export const CLOCK_TASKS_PER_PAGE = 6;
export const DEFAULT_CLOCK_SETTINGS: ClockSettings = {
  taskType: "mixed", minuteStep: 15, timeFormat: "12h", taskCount: 6,
  showSupport: false, allowMidnight: false, maxDuration: 180,
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function normalizeClockSettings(value: unknown): ClockSettings {
  if (!record(value)) throw new Error("INVALID_SETTINGS");
  if (!CLOCK_MODES.includes(value.taskType as ClockMode)) throw new Error("INVALID_TYPE");
  if (!CLOCK_MINUTE_STEPS.includes(value.minuteStep as ClockMinuteStep)) throw new Error("INVALID_STEP");
  if (value.timeFormat !== "12h" && value.timeFormat !== "24h") throw new Error("INVALID_FORMAT");
  if (!Number.isInteger(value.taskCount) || Number(value.taskCount) < 1 || Number(value.taskCount) > 60) throw new Error("INVALID_COUNT");
  if (typeof value.showSupport !== "boolean" || typeof value.allowMidnight !== "boolean") throw new Error("INVALID_SUPPORT");
  if (!Number.isInteger(value.maxDuration) || Number(value.maxDuration) < 60 || Number(value.maxDuration) > 360 || Number(value.maxDuration) % 60 !== 0) throw new Error("INVALID_DURATION");
  return {
    taskType: value.taskType as ClockMode, minuteStep: value.minuteStep as ClockMinuteStep, timeFormat: value.timeFormat,
    taskCount: Number(value.taskCount), showSupport: value.showSupport, allowMidnight: value.allowMidnight, maxDuration: Number(value.maxDuration),
  };
}

export function formatClockTime(minutes: number, format: ClockTimeFormat): string {
  const hour = Math.floor(minutes / 60), minute = minutes % 60;
  return `${format === "24h" ? String(hour).padStart(2, "0") : hour % 12 || 12}:${String(minute).padStart(2, "0")}`;
}
export function parseClockTime(value: unknown): number | null {
  if (typeof value !== "string" || value.length > 12) return null;
  const match = value.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
export function clockDuration(task: Extract<ClockTask, { type: "elapsed" }>): number {
  return (task.endMinutes - task.startMinutes + 1440) % 1440;
}
export function clockHandAngles(minutes: number): { hour: number; minute: number } {
  return { hour: (minutes % 720) / 2, minute: (minutes % 60) * 6 };
}
export function readClockHandsAnswer(value: unknown): ClockHandsAnswer {
  return { hour: record(value) && typeof value.hour === "string" ? value.hour : "", minute: record(value) && typeof value.minute === "string" ? value.minute : "" };
}
export function clockTaskPrompt(task: ClockTask, settings: ClockSettings, language: string): string {
  const copy = getClockCopy(language);
  if (task.type === "read_analog") return copy.readPrompt;
  if (task.type === "draw_hands") return copy.drawPrompt.replace("{time}", formatClockTime(task.timeMinutes, settings.timeFormat));
  return copy.elapsedPrompt.replace("{start}", formatClockTime(task.startMinutes, settings.timeFormat)).replace("{end}", formatClockTime(task.endMinutes, settings.timeFormat)) + (task.endMinutes < task.startMinutes ? ` ${copy.nextDay}.` : "");
}
export function clockTaskAnswer(task: ClockTask, settings: ClockSettings, language: string): string {
  const copy = getClockCopy(language);
  if (task.type === "elapsed") return `${clockDuration(task)} ${copy.minutesShort}`;
  return formatClockTime(task.timeMinutes, settings.timeFormat);
}
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}
export function generateClockWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): ClockWorksheet {
  const settings = normalizeClockSettings(value), lang = normalizeMathWorksheetLanguage(language), copy = getClockCopy(lang);
  const types = settings.taskType === "mixed" ? shuffle([...CLOCK_TASK_TYPES], random) : [settings.taskType];
  const used = new Set<string>();
  const integer = (max: number) => Math.floor(random() * (max + 1));
  const tasks = Array.from({ length: settings.taskCount }, (_, index): ClockTask => {
    const type = types[index % types.length], id = `clock_${index + 1}`;
    let task: ClockTask, key: string, tries = 0;
    do {
      if (type === "elapsed") {
        const duration = (1 + integer(settings.maxDuration / settings.minuteStep - 1)) * settings.minuteStep;
        const lastStart = settings.allowMidnight ? 1439 : 1439 - duration;
        const startMinutes = integer(Math.floor(lastStart / settings.minuteStep)) * settings.minuteStep;
        task = { id, type, startMinutes, endMinutes: (startMinutes + duration) % 1440 };
        key = `${type}:${startMinutes}:${duration}`;
      } else {
        const timeMinutes = integer(1440 / settings.minuteStep - 1) * settings.minuteStep;
        task = { id, type, timeMinutes };
        key = `${type}:${settings.timeFormat === "12h" ? timeMinutes % 720 : timeMinutes}`;
      }
    } while (used.has(key) && ++tries < 30);
    used.add(key);
    return task;
  });
  return { version: 1, kind: "clock", language: lang, title: copy.title, instructions: copy.instructions, settings, tasks: shuffle(tasks, random), showAnswerKey };
}

export function sanitizeClockWorksheet(value: unknown): ClockWorksheet | null {
  if (!record(value) || value.version !== 1 || value.kind !== "clock" || !Array.isArray(value.tasks)) return null;
  try {
    const settings = normalizeClockSettings(value.settings), ids = new Set<string>();
    if (value.tasks.length !== settings.taskCount) return null;
    const validTime = (time: unknown): time is number => typeof time === "number" && Number.isInteger(time) && time >= 0 && time < 1440 && time % settings.minuteStep === 0;
    const tasks = value.tasks.map((raw): ClockTask => {
      if (!record(raw) || typeof raw.id !== "string" || !/^[\w-]{1,80}$/.test(raw.id) || ids.has(raw.id)) throw new Error("id");
      if (!CLOCK_TASK_TYPES.includes(raw.type as ClockTaskType) || (settings.taskType !== "mixed" && raw.type !== settings.taskType)) throw new Error("type");
      ids.add(raw.id);
      if (raw.type === "elapsed") {
        if (!validTime(raw.startMinutes) || !validTime(raw.endMinutes)) throw new Error("time");
        const task: ClockTask = { id: raw.id, type: "elapsed", startMinutes: raw.startMinutes, endMinutes: raw.endMinutes };
        if (clockDuration(task) < settings.minuteStep || clockDuration(task) > settings.maxDuration || (!settings.allowMidnight && task.endMinutes < task.startMinutes)) throw new Error("duration");
        return task;
      }
      if (!validTime(raw.timeMinutes)) throw new Error("time");
      return { id: raw.id, type: raw.type as "read_analog" | "draw_hands", timeMinutes: raw.timeMinutes };
    });
    const language = normalizeMathWorksheetLanguage(value.language), copy = getClockCopy(language);
    return { version: 1, kind: "clock", language, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey: value.showAnswerKey === true };
  } catch { return null; }
}
export function gradeClockTask(task: ClockTask, value: unknown, settings: ClockSettings) {
  let points = 0;
  let isAnswered = typeof value === "string" ? value.trim() !== "" : value !== undefined && value !== null;
  let hourCorrect = false, minuteCorrect = false;
  if (task.type === "draw_hands") {
    const answer = readClockHandsAnswer(value);
    if (record(value)) isAnswered = answer.hour.trim() !== "" || answer.minute.trim() !== "";
    hourCorrect = /^\d{1,2}$/.test(answer.hour) && Number(answer.hour) >= 1 && Number(answer.hour) <= 12 && Number(answer.hour) % 12 === Math.floor(task.timeMinutes / 60) % 12;
    minuteCorrect = /^\d{1,2}$/.test(answer.minute) && Number(answer.minute) >= 0 && Number(answer.minute) <= 59 && Number(answer.minute) === task.timeMinutes % 60;
    points = Number(hourCorrect) * .5 + Number(minuteCorrect) * .5;
  } else if (task.type === "read_analog") {
    const parsed = parseClockTime(value);
    points = parsed !== null && (settings.timeFormat === "12h" ? parsed % 720 === task.timeMinutes % 720 : parsed === task.timeMinutes) ? 1 : 0;
  } else {
    points = typeof value === "string" && /^\d{1,3}$/.test(value.trim()) && Number(value.trim()) === clockDuration(task) ? 1 : 0;
  }
  return { type: "clock" as const, isCorrect: points === 1, isPartial: points > 0 && points < 1, points, isAnswered, hourCorrect, minuteCorrect, studentAnswer: value ?? "", correctAnswer: task.type === "elapsed" ? clockDuration(task) : task.type === "draw_hands" ? { hour: String(Math.floor(task.timeMinutes / 60) % 12 || 12), minute: String(task.timeMinutes % 60) } : formatClockTime(task.timeMinutes, settings.timeFormat) };
}
export function gradeClockWorksheet(worksheet: ClockWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeClockTask(task, answers[task.id], worksheet.settings)]));
  const entries = Object.values(byTask), correctAuto = entries.filter(entry => entry.isCorrect).length, partialAuto = entries.filter(entry => entry.isPartial).length, unansweredAuto = entries.filter(entry => !entry.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, partialAuto, wrongAuto: entries.length - correctAuto - partialAuto - unansweredAuto, unansweredAuto, percentAuto: entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.points, 0) / entries.length * 100) : 0, byTask };
}

const nb = {
  title: "Klokka og tid", subtitle: "Les analog klokke, still viserne og regn ut tidsforskjeller.",
  instructions: "Les klokkene og løs oppgavene. Skriv klokkeslett med kolon, for eksempel 3:15. Oppgi tidsforskjeller i minutter.",
  taskType: "Oppgavetype", read_analog: "Les analog klokke", draw_hands: "Fra digital til analog", elapsed: "Finn tidsforskjellen", mixed: "Blandet",
  precision: "Minuttinndeling", wholeHours: "Hele timer", halfHours: "Halvtimer", quarterHours: "Kvarter", fiveMinutes: "Fem minutter", everyMinute: "Ett minutt",
  timeFormat: "Tidsformat", format12: "12-timers klokke", format24: "24-timers klokke", support: "Vis minuttall rundt klokka", allowMidnight: "Ta med tidsforskjeller over midnatt", maxDuration: "Lengste tidsforskjell", hours: "timer", oneHour: "time",
  readPrompt: "Hva viser klokka? Skriv klokkeslettet.", drawPrompt: "Still eller tegn viserne slik at klokka viser {time}.", elapsedPrompt: "Hvor mange minutter går det fra {start} til {end}?", nextDay: "Sluttiden er neste dag",
  hourHand: "Timeviser", minuteHand: "Minuttviser", hour: "Time", minute: "Minutt", minutesShort: "min", start: "Fra", end: "Til", partial: "Delvis riktig", empty: "Klar for første klokkeark",
  periodMorning: "Kl. 00–11", periodAfternoon: "Kl. 12–23", blankClock: "Klokke uten visere", clock: "Analog klokke", hourDescription: "Timeviseren er i timen som starter ved {hour}.", minuteDescription: "Minuttviseren står ved minuttmerke {minute}, regnet med klokka fra 0 øverst.",
  invalid: "Velg en gyldig oppgavetype, minuttinndeling, 1–60 oppgaver og en lengste tidsforskjell på 1–6 timer.",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  title: "Clocks and time", subtitle: "Read analogue clocks, set the hands and calculate elapsed time.",
  instructions: "Read the clocks and complete the tasks. Write times with a colon, for example 3:15. Give elapsed time in minutes.",
  taskType: "Task type", read_analog: "Read an analogue clock", draw_hands: "Digital to analogue", elapsed: "Find elapsed time", mixed: "Mixed",
  precision: "Minute intervals", wholeHours: "Whole hours", halfHours: "Half hours", quarterHours: "Quarter hours", fiveMinutes: "Five minutes", everyMinute: "One minute",
  timeFormat: "Time format", format12: "12-hour clock", format24: "24-hour clock", support: "Show minute numbers around the clock", allowMidnight: "Include elapsed time across midnight", maxDuration: "Longest elapsed time", hours: "hours", oneHour: "hour",
  readPrompt: "What time does the clock show? Write the time.", drawPrompt: "Set or draw the hands to show {time}.", elapsedPrompt: "How many minutes pass from {start} to {end}?", nextDay: "The end time is the next day",
  hourHand: "Hour hand", minuteHand: "Minute hand", hour: "Hour", minute: "Minute", minutesShort: "min", start: "From", end: "To", partial: "Partly correct", empty: "Ready for your first clock worksheet",
  periodMorning: "Hours 00–11", periodAfternoon: "Hours 12–23", blankClock: "Clock without hands", clock: "Analogue clock", hourDescription: "The hour hand is within the hour starting at {hour}.", minuteDescription: "The minute hand is at minute mark {minute}, counting clockwise from 0 at the top.",
  invalid: "Choose a valid task type, minute interval, 1–60 tasks and a longest elapsed time of 1–6 hours.",
};
const pt: Copy = {
  title: "Relógios e tempo", subtitle: "Ler relógios analógicos, acertar os ponteiros e calcular intervalos de tempo.",
  instructions: "Lê os relógios e resolve os exercícios. Escreve as horas com dois pontos, por exemplo 3:15. Indica os intervalos de tempo em minutos.",
  taskType: "Tipo de exercício", read_analog: "Ler um relógio analógico", draw_hands: "Digital para analógico", elapsed: "Calcular o intervalo de tempo", mixed: "Misto",
  precision: "Intervalos dos minutos", wholeHours: "Horas certas", halfHours: "Meias horas", quarterHours: "Quartos de hora", fiveMinutes: "Cinco minutos", everyMinute: "Um minuto",
  timeFormat: "Formato das horas", format12: "Relógio de 12 horas", format24: "Relógio de 24 horas", support: "Mostrar os minutos à volta do relógio", allowMidnight: "Incluir intervalos que passam a meia-noite", maxDuration: "Maior intervalo de tempo", hours: "horas", oneHour: "hora",
  readPrompt: "Que horas marca o relógio? Escreve as horas.", drawPrompt: "Acerta ou desenha os ponteiros para marcar {time}.", elapsedPrompt: "Quantos minutos passam das {start} às {end}?", nextDay: "A hora final é no dia seguinte",
  hourHand: "Ponteiro das horas", minuteHand: "Ponteiro dos minutos", hour: "Hora", minute: "Minuto", minutesShort: "min", start: "Das", end: "Às", partial: "Parcialmente correto", empty: "Pronto para a primeira ficha de relógios",
  periodMorning: "Horas 00–11", periodAfternoon: "Horas 12–23", blankClock: "Relógio sem ponteiros", clock: "Relógio analógico", hourDescription: "O ponteiro das horas está na hora que começa em {hour}.", minuteDescription: "O ponteiro dos minutos está na marca {minute}, contando no sentido dos ponteiros a partir do 0 no topo.",
  invalid: "Escolhe um tipo de exercício válido, intervalo dos minutos, 1–60 exercícios e um intervalo máximo de 1–6 horas.",
};
export function getClockCopy(language: string): Copy { return language === "en" ? en : language === "pt" ? pt : nb; }
