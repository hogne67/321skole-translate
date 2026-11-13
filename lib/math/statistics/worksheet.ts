import Fraction from "fraction.js";
import { normalizeMathWorksheetLanguage, type MathWorksheetLanguage } from "../taxonomy";

export const STATISTICS_TASK_TYPES = ["read_chart", "draw_chart", "central_tendency", "frequency_table"] as const;
export const STATISTICS_MODES = [...STATISTICS_TASK_TYPES, "mixed"] as const;
export const STATISTICS_CHARTS = ["bar", "line", "mixed"] as const;
export const STATISTICS_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type StatisticsMode = typeof STATISTICS_MODES[number];
export type StatisticsChart = "bar" | "line";
export type StatisticsSettings = {
  taskType: StatisticsMode; chartType: typeof STATISTICS_CHARTS[number];
  difficulty: typeof STATISTICS_DIFFICULTIES[number]; taskCount: number; showSupport: boolean;
};
export type StatisticsDataset = { theme: "books" | "goals" | "siblings"; values: number[]; frequencies: number[] };
export type StatisticsMetric = "frequency" | "total" | "mode" | "mean" | "median" | "range";
export type StatisticsTask =
  | { id: string; type: "read_chart"; dataset: StatisticsDataset; chart: StatisticsChart; metric: "frequency" | "total" | "mode"; targetValue: number }
  | { id: string; type: "draw_chart"; dataset: StatisticsDataset; chart: StatisticsChart }
  | { id: string; type: "central_tendency"; dataset: StatisticsDataset; metric: "mean" | "median" | "mode" | "range" }
  | { id: string; type: "frequency_table"; dataset: StatisticsDataset; observations: number[] };
export type StatisticsEntriesAnswer = { frequencies: string[] };
export type StatisticsAnswer = string | StatisticsEntriesAnswer;
export type StatisticsWorksheet = {
  version: 1; kind: "statistics"; language: MathWorksheetLanguage; title: string; instructions: string;
  settings: StatisticsSettings; tasks: StatisticsTask[]; showAnswerKey: boolean;
};
export const STATISTICS_TASKS_PER_PAGE = 2;
export const DEFAULT_STATISTICS_SETTINGS: StatisticsSettings = { taskType: "mixed", chartType: "bar", difficulty: "easy", taskCount: 6, showSupport: false };
const levels = { easy: { categories: 4, maximum: 5, start: 2 }, medium: { categories: 5, maximum: 8, start: 4 }, hard: { categories: 6, maximum: 10, start: 8 } };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const themes = ["books", "goals", "siblings"] as const;

export function normalizeStatisticsSettings(v: unknown): StatisticsSettings {
  if (!record(v)) throw new Error("INVALID_SETTINGS");
  if (!STATISTICS_MODES.includes(v.taskType as StatisticsMode)) throw new Error("INVALID_TYPE");
  if (!STATISTICS_CHARTS.includes(v.chartType as StatisticsSettings["chartType"])) throw new Error("INVALID_CHART");
  if (!STATISTICS_DIFFICULTIES.includes(v.difficulty as StatisticsSettings["difficulty"])) throw new Error("INVALID_DIFFICULTY");
  if (!Number.isInteger(v.taskCount) || Number(v.taskCount) < 1 || Number(v.taskCount) > 60) throw new Error("INVALID_COUNT");
  if (typeof v.showSupport !== "boolean") throw new Error("INVALID_SUPPORT");
  return { taskType: v.taskType as StatisticsMode, chartType: v.chartType as StatisticsSettings["chartType"], difficulty: v.difficulty as StatisticsSettings["difficulty"], taskCount: Number(v.taskCount), showSupport: v.showSupport };
}

export function statisticsObservations(data: StatisticsDataset): number[] {
  return data.values.flatMap((value, i) => Array.from({ length: data.frequencies[i] }, () => value));
}
export function statisticsModes(data: StatisticsDataset): number[] {
  const max = Math.max(...data.frequencies);
  return data.values.filter((_, i) => data.frequencies[i] === max);
}
export function statisticsMetricValue(task: Extract<StatisticsTask, { type: "read_chart" | "central_tendency" }>): Fraction {
  const data = task.dataset, observations = statisticsObservations(data), total = observations.length;
  switch (task.metric) {
    case "frequency": return new Fraction(data.frequencies[data.values.indexOf(task.type === "read_chart" ? task.targetValue : -1)]);
    case "total": return new Fraction(total);
    case "mode": return new Fraction(statisticsModes(data)[0]);
    case "range": return new Fraction(observations[total - 1] - observations[0]);
    case "median": return new Fraction(observations[Math.floor((total - 1) / 2)] + observations[Math.floor(total / 2)], 2);
    case "mean": return new Fraction(data.values.reduce((sum, value, i) => sum + value * data.frequencies[i], 0), total);
  }
}
function roundedMean(value: Fraction): Fraction { return value.mul(10).add(new Fraction(1, 2)).floor().div(10); }
export function parseStatisticsNumber(value: unknown): Fraction | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const text = value.trim().replaceAll("−", "-").replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*[+-]?\d+)?$/.test(text)) return null;
  try {
    const parts = text.split("/");
    const result = parts.length === 2 ? new Fraction(parts[0].trim()).div(parts[1].trim()) : new Fraction(text);
    return Math.abs(result.valueOf()) <= 1000000 ? result : null;
  } catch { return null; }
}
export function readStatisticsEntries(value: unknown, count: number): string[] {
  const entries = record(value) && Array.isArray(value.frequencies) ? value.frequencies : [];
  return Array.from({ length: count }, (_, i) => typeof entries[i] === "string" ? entries[i] : "");
}
export function formatStatisticsNumber(value: Fraction | number, language: string): string {
  return new Intl.NumberFormat(language === "en" ? "en-GB" : language === "pt" ? "pt-PT" : "nb-NO", { maximumFractionDigits: 1 }).format(typeof value === "number" ? value : value.valueOf());
}
export function statisticsAxis(data: StatisticsDataset): { maximum: number; step: number } {
  const max = Math.max(...data.frequencies), step = max > 5 ? 2 : 1;
  return { maximum: Math.max(step, Math.ceil(max / step) * step), step };
}
export function statisticsTaskPrompt(task: StatisticsTask, language: string): string {
  const copy = getStatisticsCopy(language);
  if (task.type === "frequency_table") return copy.tablePrompt;
  if (task.type === "draw_chart") return task.chart === "bar" ? copy.drawBarPrompt : copy.drawLinePrompt;
  return copy[`${task.metric}Prompt`].replace("{value}", task.type === "read_chart" ? String(task.targetValue) : "");
}
export function statisticsTaskAnswer(task: StatisticsTask, language: string): string {
  if (task.type === "draw_chart" || task.type === "frequency_table") return task.dataset.values.map((value, i) => `${value}: ${task.dataset.frequencies[i]}`).join(" · ");
  const result = statisticsMetricValue(task);
  return formatStatisticsNumber(task.metric === "mean" ? roundedMean(result) : result, language);
}
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}
export function generateStatisticsWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): StatisticsWorksheet {
  const settings = normalizeStatisticsSettings(value), level = levels[settings.difficulty], lang = normalizeMathWorksheetLanguage(language), copy = getStatisticsCopy(lang);
  const types = settings.taskType === "mixed" ? shuffle([...STATISTICS_TASK_TYPES], random) : [settings.taskType];
  const integer = (max: number) => Math.floor(random() * (max + 1)), used = new Set<string>();
  const tasks = Array.from({ length: settings.taskCount }, (_, index): StatisticsTask => {
    const type = types[index % types.length], id = `statistics_${index + 1}`;
    const metric = type === "read_chart" ? (["frequency", "total", "mode"] as const)[index % 3] : (["mean", "median", "mode", "range"] as const)[Math.floor(index / types.length) % 4];
    let dataset: StatisticsDataset, key: string, attempts = 0;
    do {
      const start = integer(level.start), step = settings.difficulty === "hard" ? 1 + integer(1) : 1;
      const maximum = type === "frequency_table" ? 4 : level.maximum;
      const frequencies = Array.from({ length: level.categories }, () => integer(maximum));
      if (frequencies.filter(n => n > 0).length < 2) { frequencies[0] = 2; frequencies[level.categories - 1] = 1; }
      if (frequencies.reduce((sum, n) => sum + n, 0) < 3) frequencies[0] = 2;
      if (metric === "mode" && (type === "read_chart" || type === "central_tendency")) {
        const max = Math.max(...frequencies), top = frequencies.indexOf(max);
        if (max === 1) frequencies[top] = 2;
        else for (let i = 0; i < frequencies.length; i++) if (i !== top && frequencies[i] === max) frequencies[i]--;
      }
      const values = Array.from({ length: level.categories }, (_, i) => start + i * step);
      const availableThemes = themes.filter(theme => theme === "books" || values[values.length - 1] <= (theme === "siblings" ? 5 : 9));
      dataset = { theme: availableThemes[integer(availableThemes.length - 1)], values, frequencies };
      key = `${type}:${metric}:${JSON.stringify(dataset)}`;
    } while (used.has(key) && ++attempts < 30);
    used.add(key);
    const chart = settings.chartType === "mixed" ? Math.floor(index / types.length) % 2 === 0 ? "bar" : "line" : settings.chartType;
    if (type === "frequency_table") return { id, type, dataset, observations: shuffle(statisticsObservations(dataset), random) };
    if (type === "draw_chart") return { id, type, dataset, chart };
    if (type === "read_chart") return { id, type, dataset, chart, metric: metric as "frequency" | "total" | "mode", targetValue: dataset.values[integer(dataset.values.length - 1)] };
    return { id, type, dataset, metric: metric as "mean" | "median" | "mode" | "range" };
  });
  return { version: 1, kind: "statistics", language: lang, title: copy.title, instructions: copy.instructions, settings, tasks: shuffle(tasks, random), showAnswerKey };
}
export function sanitizeStatisticsWorksheet(value: unknown): StatisticsWorksheet | null {
  if (!record(value) || value.version !== 1 || value.kind !== "statistics" || !Array.isArray(value.tasks)) return null;
  try {
    const settings = normalizeStatisticsSettings(value.settings), level = levels[settings.difficulty], ids = new Set<string>();
    if (value.tasks.length !== settings.taskCount) return null;
    const tasks = value.tasks.map((raw): StatisticsTask => {
      if (!record(raw) || typeof raw.id !== "string" || !/^[\w-]{1,80}$/.test(raw.id) || ids.has(raw.id)) throw new Error("id");
      ids.add(raw.id);
      if (!STATISTICS_TASK_TYPES.includes(raw.type as typeof STATISTICS_TASK_TYPES[number]) || settings.taskType !== "mixed" && raw.type !== settings.taskType) throw new Error("type");
      if (!record(raw.dataset) || !themes.includes(raw.dataset.theme as StatisticsDataset["theme"])) throw new Error("dataset");
      const { values, frequencies } = raw.dataset;
      if (!Array.isArray(values) || !Array.isArray(frequencies) || values.length !== level.categories || frequencies.length !== values.length) throw new Error("length");
      const step = values[1] - values[0];
      if (!values.every(v => Number.isInteger(v) && v >= 0 && v <= 20) || values[0] > level.start || !(step === 1 || settings.difficulty === "hard" && step === 2) || !values.every((v, i) => v === values[0] + i * step)) throw new Error("values");
      if (!frequencies.every(f => Number.isInteger(f) && f >= 0 && f <= (raw.type === "frequency_table" ? 4 : level.maximum)) || frequencies.filter(f => f > 0).length < 2 || frequencies.reduce((sum, n) => sum + n, 0) < 3) throw new Error("frequencies");
      const dataset: StatisticsDataset = { theme: raw.dataset.theme as StatisticsDataset["theme"], values: [...values], frequencies: [...frequencies] };
      const id = raw.id;
      if (raw.type === "frequency_table") {
        if (!Array.isArray(raw.observations) || raw.observations.length !== statisticsObservations(dataset).length || !raw.observations.every(n => Number.isInteger(n) && dataset.values.includes(n)) || !dataset.values.every((v, i) => (raw.observations as number[]).filter(n => n === v).length === dataset.frequencies[i])) throw new Error("observations");
        return { id, type: "frequency_table", dataset, observations: [...raw.observations] };
      }
      if (raw.type === "central_tendency") {
        if (!["mean", "median", "mode", "range"].includes(String(raw.metric)) || raw.metric === "mode" && statisticsModes(dataset).length !== 1) throw new Error("metric");
        return { id, type: "central_tendency", dataset, metric: raw.metric as "mean" | "median" | "mode" | "range" };
      }
      if (raw.chart !== "bar" && raw.chart !== "line" || settings.chartType !== "mixed" && settings.chartType !== raw.chart) throw new Error("chart");
      if (raw.type === "draw_chart") return { id, type: "draw_chart", dataset, chart: raw.chart };
      if (!["frequency", "total", "mode"].includes(String(raw.metric)) || raw.metric === "mode" && statisticsModes(dataset).length !== 1 || !dataset.values.includes(Number(raw.targetValue)) || typeof raw.targetValue !== "number") throw new Error("metric");
      return { id, type: "read_chart", dataset, chart: raw.chart, metric: raw.metric as "frequency" | "total" | "mode", targetValue: raw.targetValue };
    });
    const language = normalizeMathWorksheetLanguage(value.language), copy = getStatisticsCopy(language);
    return { version: 1, kind: "statistics", language, title: copy.title, instructions: copy.instructions, settings, tasks, showAnswerKey: value.showAnswerKey === true };
  } catch { return null; }
}
export function gradeStatisticsTask(task: StatisticsTask, value: unknown) {
  let points = 0, isAnswered = typeof value === "string" ? value.trim() !== "" : value != null;
  let correctByEntry: boolean[] = [];
  if (task.type === "draw_chart" || task.type === "frequency_table") {
    const entries = readStatisticsEntries(value, task.dataset.values.length);
    if (record(value)) isAnswered = entries.some(entry => entry.trim() !== "");
    correctByEntry = entries.map((entry, i) => parseStatisticsNumber(entry)?.equals(task.dataset.frequencies[i]) === true);
    points = correctByEntry.filter(Boolean).length / entries.length;
  } else {
    const parsed = parseStatisticsNumber(value), expected = statisticsMetricValue(task);
    points = parsed && (parsed.equals(expected) || task.metric === "mean" && parsed.equals(roundedMean(expected))) ? 1 : 0;
  }
  return { type: "statistics" as const, isCorrect: points === 1, isPartial: points > 0 && points < 1, points, isAnswered, correctByEntry, studentAnswer: value ?? "", correctAnswer: task.type === "draw_chart" || task.type === "frequency_table" ? { frequencies: task.dataset.frequencies.map(String) } : statisticsMetricValue(task).toFraction() };
}
export function gradeStatisticsWorksheet(worksheet: StatisticsWorksheet, answers: Record<string, unknown>) {
  const byTask = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeStatisticsTask(task, answers[task.id])]));
  const entries = Object.values(byTask), correctAuto = entries.filter(e => e.isCorrect).length, partialAuto = entries.filter(e => e.isPartial).length, unansweredAuto = entries.filter(e => !e.isAnswered).length;
  return { totalAuto: entries.length, correctAuto, partialAuto, wrongAuto: entries.length - correctAuto - partialAuto - unansweredAuto, unansweredAuto, percentAuto: entries.length ? Math.round(entries.reduce((sum, e) => sum + e.points, 0) / entries.length * 100) : 0, byTask };
}

const nb = {
  title: "Statistikk og diagram", subtitle: "Les og lag diagrammer og frekvenstabeller. Øv på typetall, median, gjennomsnitt og variasjonsbredde.",
  instructions: "Bruk opplysningene til å løse oppgavene. Gjennomsnitt avrundes til én desimal hvis det trengs. I tabeller og diagrammer skal alle verdiene tas med, også når frekvensen er 0.",
  taskType: "Oppgavetype", read_chart: "Les av diagram", draw_chart: "Lag diagram", central_tendency: "Sentralmål og variasjonsbredde", frequency_table: "Lag frekvenstabell", mixed: "Blandet",
  chartType: "Diagramtype", bar: "Søylediagram", line: "Linjediagram", difficulty: "Vanskelighetsgrad", easy: "Enkel", medium: "Middels", hard: "Vanskelig", support: "Vis støttetall og forklaringer", empty: "Klar for første statistikkark",
  frequencyPrompt: "Hvor mange observasjoner har verdien {value}?", totalPrompt: "Hvor mange observasjoner er det til sammen?", modePrompt: "Finn typetallet.", medianPrompt: "Finn medianen.", meanPrompt: "Finn gjennomsnittet. Avrund til én desimal hvis det trengs.", rangePrompt: "Finn variasjonsbredden.",
  tablePrompt: "Lag en frekvenstabell for observasjonene.", drawBarPrompt: "Lag et søylediagram fra frekvenstabellen.", drawLinePrompt: "Lag et linjediagram fra frekvenstabellen. Koble sammen punktene i rekkefølge.",
  books: "Bøker lest i en klasse", goals: "Mål per kamp", siblings: "Antall søsken i en klasse", booksAxis: "Antall bøker", goalsAxis: "Antall mål", siblingsAxis: "Antall søsken", students: "Antall elever", games: "Antall kamper", value: "Verdi", frequency: "Frekvens", observations: "Observasjoner", partial: "Delvis riktig",
  modeHint: "Typetallet er verdien som forekommer flest ganger.", medianHint: "Sorter observasjonene. Ved et partall observasjoner tar du gjennomsnittet av de to midterste.", meanHint: "Legg sammen alle observasjonene og del på antallet observasjoner. Husk frekvensene.", rangeHint: "Trekk den minste observerte verdien fra den største observerte verdien.",
  blankChart: "Tomt diagramrutenett", studentChart: "Ditt diagram", chartDescription: "Frekvensene er", invalid: "Velg en gyldig oppgavetype, diagramtype, vanskelighetsgrad og 1–60 oppgaver.",
  unset: "ikke satt", plotHint: "Klikk i diagrammet for å plassere søyler eller punkter. Du kan også bruke tallfeltene, eller piltastene opp og ned når en diagramkolonne har fokus.",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  title: "Statistics and charts", subtitle: "Read and create charts and frequency tables. Practise mode, median, mean and range.",
  instructions: "Use the data to complete the tasks. Round means to one decimal place where necessary. Include every value in tables and charts, even when its frequency is 0.",
  taskType: "Task type", read_chart: "Read a chart", draw_chart: "Draw a chart", central_tendency: "Averages and range", frequency_table: "Create a frequency table", mixed: "Mixed",
  chartType: "Chart type", bar: "Bar chart", line: "Line chart", difficulty: "Difficulty", easy: "Easy", medium: "Medium", hard: "Hard", support: "Show supporting numbers and explanations", empty: "Ready for your first statistics worksheet",
  frequencyPrompt: "How many observations have the value {value}?", totalPrompt: "How many observations are there altogether?", modePrompt: "Find the mode.", medianPrompt: "Find the median.", meanPrompt: "Find the mean. Round to one decimal place where necessary.", rangePrompt: "Find the range.",
  tablePrompt: "Create a frequency table for the observations.", drawBarPrompt: "Draw a bar chart using the frequency table.", drawLinePrompt: "Draw a line chart using the frequency table. Connect the points in order.",
  books: "Books read in a class", goals: "Goals per match", siblings: "Number of siblings in a class", booksAxis: "Number of books", goalsAxis: "Number of goals", siblingsAxis: "Number of siblings", students: "Number of pupils", games: "Number of matches", value: "Value", frequency: "Frequency", observations: "Observations", partial: "Partly correct",
  modeHint: "The mode is the value that occurs most often.", medianHint: "Sort the observations. With an even number of observations, find the mean of the middle two.", meanHint: "Add all observations and divide by the number of observations. Remember the frequencies.", rangeHint: "Subtract the smallest observed value from the largest observed value.",
  blankChart: "Empty chart grid", studentChart: "Your chart", chartDescription: "The frequencies are", invalid: "Choose a valid task type, chart type, difficulty and 1–60 tasks.",
  unset: "not set", plotHint: "Click in the chart to place bars or points. You can also use the number fields, or the up and down arrow keys when a chart column has focus.",
};
const pt: Copy = {
  title: "Estatística e gráficos", subtitle: "Ler e criar gráficos e tabelas de frequências. Praticar moda, mediana, média e amplitude.",
  instructions: "Usa os dados para resolver os exercícios. Arredonda as médias a uma casa decimal quando necessário. Inclui todos os valores nas tabelas e nos gráficos, mesmo quando a frequência é 0.",
  taskType: "Tipo de exercício", read_chart: "Ler um gráfico", draw_chart: "Construir um gráfico", central_tendency: "Medidas de localização e amplitude", frequency_table: "Criar uma tabela de frequências", mixed: "Misto",
  chartType: "Tipo de gráfico", bar: "Gráfico de barras", line: "Gráfico de linhas", difficulty: "Dificuldade", easy: "Fácil", medium: "Média", hard: "Difícil", support: "Mostrar números de apoio e explicações", empty: "Pronto para a primeira ficha de estatística",
  frequencyPrompt: "Quantas observações têm o valor {value}?", totalPrompt: "Quantas observações existem no total?", modePrompt: "Calcula a moda.", medianPrompt: "Calcula a mediana.", meanPrompt: "Calcula a média. Arredonda a uma casa decimal quando necessário.", rangePrompt: "Calcula a amplitude.",
  tablePrompt: "Cria uma tabela de frequências para as observações.", drawBarPrompt: "Constrói um gráfico de barras a partir da tabela de frequências.", drawLinePrompt: "Constrói um gráfico de linhas a partir da tabela de frequências. Liga os pontos por ordem.",
  books: "Livros lidos numa turma", goals: "Golos por jogo", siblings: "Número de irmãos numa turma", booksAxis: "Número de livros", goalsAxis: "Número de golos", siblingsAxis: "Número de irmãos", students: "Número de alunos", games: "Número de jogos", value: "Valor", frequency: "Frequência", observations: "Observações", partial: "Parcialmente correto",
  modeHint: "A moda é o valor que ocorre mais vezes.", medianHint: "Ordena as observações. Com um número par de observações, calcula a média dos dois valores centrais.", meanHint: "Soma todas as observações e divide pelo número de observações. Lembra-te das frequências.", rangeHint: "Subtrai o menor valor observado ao maior valor observado.",
  blankChart: "Grelha de gráfico vazia", studentChart: "O teu gráfico", chartDescription: "As frequências são", invalid: "Escolhe um tipo de exercício, gráfico, dificuldade e 1–60 exercícios válidos.",
  unset: "por definir", plotHint: "Clica no gráfico para colocar barras ou pontos. Também podes usar os campos numéricos, ou as setas para cima e para baixo quando uma coluna do gráfico tem o foco.",
};
export function getStatisticsCopy(language: string): Copy { return language === "en" ? en : language === "pt" ? pt : nb; }
