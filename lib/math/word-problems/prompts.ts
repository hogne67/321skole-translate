import type { WordProblemsTask, WordProblemsTemplate } from "./worksheet";
import { WORD_PROBLEMS_CONTEXTS, WORD_PROBLEMS_CONTAINERS } from "./catalog";

export function wordProblemsTaskPrompt(task: WordProblemsTask, language: string): string {
  const lang = language === "en" ? 1 : language === "pt" ? 2 : 0;
  const context = WORD_PROBLEMS_CONTEXTS[task.context], containerInfo = WORD_PROBLEMS_CONTAINERS[context.container];
  const nouns = context.nouns[lang], containers = containerInfo.nouns[lang];
  const [a, b, c] = task.values;
  const item = (n: number) => `${n} ${nouns[n === 1 ? 0 : 1]}`;
  const container = (n: number) => `${n} ${containers[n === 1 ? 0 : 1]}`;
  const singular = containers[0], inside = lang === 0 && "on" in containerInfo && containerInfo.on ? "på" : "i";
  const questionNoun = context.unit === "kr" ? ["kroner", "kroner", "coroas"][lang] : nouns[1];
  const t = { n: task.name, a: String(a), b: String(b), c: String(c), ai: item(a), bi: item(b), ci: item(c), ac: container(a), bc: container(b), cc: container(c), s: singular, inside, q: questionNoun, each: "femininePt" in containerInfo && containerInfo.femininePt ? "cada uma" : "cada um" };
  const nb: Record<WordProblemsTemplate, string> = {
    add: "{n} har {ai} og får {bi} til. Hvor mange {q} har {n} nå?",
    subtract: "{n} har {ai} og gir bort {bi}. Hvor mange {q} har {n} igjen?",
    multiply: "{n} har {ac}. Det er {bi} {inside} hver {s}. Hvor mange {q} er det til sammen?",
    divide: "{n} fordeler {ai} likt på {bc}. Hvor mange {q} blir det {inside} hver {s}?",
    add_add: "{n} har {ai}. Først får {n} {bi} til, og deretter {ci} til. Hvor mange {q} har {n} nå?",
    subtract_subtract: "{n} har {ai}. Først gir {n} bort {bi}, og deretter {ci}. Hvor mange {q} har {n} igjen?",
    multiply_multiply: "{n} har {a} esker. Hver eske inneholder {bc}. Det er {ci} {inside} hver {s}. Hvor mange {q} er det til sammen?",
    divide_divide: "{n} fordeler {ai} likt mellom {b} grupper. Hver gruppe fordeler sin andel likt på {cc}. Hvor mange {q} blir det {inside} hver {s}?",
    multiply_subtract: "{n} har {ac} med {bi} {inside} hver {s}. Så gir {n} bort {ci} av det totale innholdet. Hvor mange {q} er det igjen til sammen?",
    add_divide: "{n} har {ai} og får {bi} til. Alt fordeles likt på {cc}. Hvor mange {q} blir det {inside} hver {s}?",
    subtract_multiply: "{n} har {ac} med {ci} {inside} hver {s}. {n} gir bort {bc} med innholdet. Hvor mange {q} er det igjen til sammen?",
    divide_add: "{n} fordeler {ai} likt på {bc}. Deretter legges {ci} til {inside} hver {s}. Hvor mange {q} er det nå {inside} hver {s}?",
  };
  const en: Record<WordProblemsTemplate, string> = {
    add: "{n} has {ai} and receives {bi} more. How many {q} does {n} have now?",
    subtract: "{n} has {ai} and gives away {bi}. How many {q} does {n} have left?",
    multiply: "{n} has {ac}. Each {s} contains {bi}. How many {q} are there altogether?",
    divide: "{n} shares {ai} equally among {bc}. How many {q} are in each {s}?",
    add_add: "{n} has {ai}, receives {bi} more and then another {ci}. How many {q} does {n} have now?",
    subtract_subtract: "{n} has {ai}, gives away {bi} and then another {ci}. How many {q} does {n} have left?",
    multiply_multiply: "{n} has {a} boxes. Each box contains {bc}. Each {s} contains {ci}. How many {q} are there altogether?",
    divide_divide: "{n} shares {ai} equally among {b} groups. Each group shares its portion equally among {cc}. How many {q} are in each {s}?",
    multiply_subtract: "{n} has {ac}, each containing {bi}. Then {n} gives away {ci} from the total contents. How many {q} are left altogether?",
    add_divide: "{n} has {ai} and receives {bi} more. Everything is shared equally among {cc}. How many {q} are in each {s}?",
    subtract_multiply: "{n} has {ac}, each containing {ci}. {n} gives away {bc} with their contents. How many {q} are left altogether?",
    divide_add: "{n} shares {ai} equally among {bc}. Then {ci} more are added to each {s}. How many {q} are now in each {s}?",
  };
  const pt: Record<WordProblemsTemplate, string> = {
    add: "{n} tem {ai} e recebe mais {bi}. Quantos {q} tem agora?",
    subtract: "{n} tem {ai} e dá {bi}. Quantos {q} sobram?",
    multiply: "{n} tem {ac}. Cada {s} contém {bi}. Quantos {q} há ao todo?",
    divide: "{n} distribui {ai} igualmente por {bc}. Quantos {q} ficam em cada {s}?",
    add_add: "{n} tem {ai}, recebe mais {bi} e depois mais {ci}. Quantos {q} tem agora?",
    subtract_subtract: "{n} tem {ai}, dá {bi} e depois mais {ci}. Quantos {q} sobram?",
    multiply_multiply: "{n} tem {a} caixas. Cada caixa contém {bc}. Cada {s} contém {ci}. Quantos {q} há ao todo?",
    divide_divide: "{n} distribui {ai} igualmente por {b} grupos. Cada grupo distribui a sua parte igualmente por {cc}. Quantos {q} ficam em cada {s}?",
    multiply_subtract: "{n} tem {ac}, {each} com {bi}. Depois dá {ci} do conteúdo total. Quantos {q} sobram ao todo?",
    add_divide: "{n} tem {ai} e recebe mais {bi}. Distribui tudo igualmente por {cc}. Quantos {q} ficam em cada {s}?",
    subtract_multiply: "{n} tem {ac}, {each} com {ci}. Dá {bc} com o respetivo conteúdo. Quantos {q} sobram ao todo?",
    divide_add: "{n} distribui {ai} igualmente por {bc}. Depois acrescenta {ci} a cada {s}. Quantos {q} ficam agora em cada {s}?",
  };
  const intro = context.intro?.[lang];
  let result = `${intro ? `${intro} ` : ""}${(lang === 1 ? en : lang === 2 ? pt : nb)[task.type]}`.replace(/\{(\w+)\}/g, (_, key: keyof typeof t) => t[key]);
  if (lang === 2 && context.femininePt) result = result.replaceAll("Quantos ", "Quantas ");
  return result;
}
