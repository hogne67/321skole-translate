import type { CefrLevel } from "../readingTests/generationGuidance";
import type { PrintableReadingTask } from "../readingTests/print";

export type ListeningTest = {
  version: 1;
  title: string;
  level: CefrLevel;
  language: string;
  script: string;
  tasks: PrintableReadingTask[];
  plays: number;
  playback: "individual" | "teacher";
  audioDataUrl?: string;
  aiVoice?: boolean;
};

export const MAX_LISTENING_AUDIO_BYTES = 8 * 1024 * 1024;
export const LISTENING_AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4", "audio/webm"];

export function validListeningAudio(value: unknown): value is string {
  return typeof value === "string" && value.length <= Math.ceil(MAX_LISTENING_AUDIO_BYTES * 4 / 3) + 100
    && /^data:audio\/(?:mpeg|mp3|wav|x-wav|ogg|mp4|webm);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export function listeningTestError(test: ListeningTest): string | null {
  if (!test.title.trim() || test.title.length > 200 || !test.script.trim() || test.script.length > 4000) return "content";
  if (!["A1", "A2", "B1", "B2", "C1", "C2"].includes(test.level) || !/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(test.language)) return "content";
  if (![1, 2, 3].includes(test.plays) || !["individual", "teacher"].includes(test.playback)) return "content";
  if (!test.tasks.length || test.tasks.length > 24 || new Set(test.tasks.map(task => task.id)).size !== test.tasks.length) return "tasks";
  for (const task of test.tasks) {
    if (!task.id || task.id.length > 100 || !task.prompt.trim() || task.prompt.length > 500 || task.enabled === false) return "tasks";
    if (task.type === "true_false") { if (typeof task.correctAnswer !== "boolean") return "tasks"; }
    else if (task.type === "mcq" || task.type === "best_summary") {
      const options = task.options ?? [];
      if (options.length < 2 || options.length > 4 || options.some(option => !option.trim() || option.length > 500)
        || new Set(options.map(option => option.trim().toLocaleLowerCase())).size !== options.length
        || typeof task.correctAnswer !== "string" || !options.includes(task.correctAnswer)) return "tasks";
    } else return "tasks";
  }
  if (test.audioDataUrl && !validListeningAudio(test.audioDataUrl)) return "audio";
  return null;
}

export function parseListeningTest(raw: unknown): ListeningTest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || typeof value.title !== "string" || typeof value.script !== "string" || typeof value.language !== "string"
    || typeof value.level !== "string" || !Array.isArray(value.tasks) || value.tasks.length > 24) return null;
  const tasks: PrintableReadingTask[] = [];
  for (const [index, item] of value.tasks.entries()) {
    if (!item || typeof item !== "object") return null;
    const task = item as Record<string, unknown>;
    if (typeof task.id !== "string" || typeof task.prompt !== "string" || !["mcq", "true_false", "best_summary"].includes(String(task.type))) return null;
    if (task.options !== undefined && (!Array.isArray(task.options) || !task.options.every(option => typeof option === "string"))) return null;
    if (typeof task.correctAnswer !== "string" && typeof task.correctAnswer !== "boolean") return null;
    tasks.push({id: task.id, prompt: task.prompt, type: task.type as PrintableReadingTask["type"], options: task.options as string[] | undefined, correctAnswer: task.correctAnswer, order: index + 1});
  }
  if (value.audioDataUrl !== undefined && !validListeningAudio(value.audioDataUrl)) return null;
  const test: ListeningTest = {version: 1, title: value.title, script: value.script, level: value.level as CefrLevel, language: value.language, tasks,
    plays: typeof value.plays === "number" ? value.plays : 2, playback: value.playback === "teacher" ? "teacher" : "individual",
    audioDataUrl: value.audioDataUrl as string | undefined, aiVoice: value.aiVoice === true};
  return listeningTestError(test) ? null : test;
}

export function listeningTestFromGenerated(raw: unknown, plays: number, playback: ListeningTest["playback"]): ListeningTest | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string,unknown>;
  if (!value.tasks || typeof value.tasks !== "object") return null;
  const groups=value.tasks as Record<string,unknown>;
  if (!Array.isArray(groups.mcq) || !Array.isArray(groups.trueFalse) || !groups.bestSummary || typeof groups.bestSummary!=="object") return null;
  const tasks=[...groups.mcq.map((task,index)=>({...task,id:`listening-mcq-${index+1}`,type:"mcq"})),
    ...groups.trueFalse.map((task,index)=>({...task,id:`listening-tf-${index+1}`,type:"true_false"})),
    {...groups.bestSummary,id:"listening-summary",type:"best_summary"}];
  const test=parseListeningTest({version:1,title:value.title,level:value.cefrLevel,language:value.language,script:value.text,tasks,plays,playback});
  return test?{...test,tasks:shuffleListeningOptions(test.tasks)}:null;
}

/** Shuffle once when generated; imported packages retain their reviewed order. */
export function shuffleListeningOptions(tasks:PrintableReadingTask[], random:()=>number=Math.random):PrintableReadingTask[] {
  return tasks.map(task=>{
    if(task.type==="true_false"||!task.options)return task;
    const options=[...task.options];
    for(let i=options.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[options[i],options[j]]=[options[j],options[i]];}
    return {...task,options};
  });
}

export type ListeningStudentTest = Omit<ListeningTest, "script" | "version">;

export function listeningStudentTest(test: ListeningTest): ListeningStudentTest {
  return {title:test.title,level:test.level,language:test.language,tasks:test.tasks,plays:test.plays,playback:test.playback,aiVoice:test.aiVoice,
    ...(test.playback==="individual"?{audioDataUrl:test.audioDataUrl}:{})};
}

export function listeningScore(test: Pick<ListeningTest,"tasks">, answers: Record<string, string | boolean>) {
  let correct = 0, answered = 0;
  for (const task of test.tasks) {
    const answer = answers[task.id];
    const present = typeof answer === "boolean" || typeof answer === "string" && answer.trim().length > 0;
    if (present) { answered += 1; if (answer === task.correctAnswer) correct += 1; }
  }
  return {correct, answered, unanswered: test.tasks.length - answered, total: test.tasks.length};
}

export function listeningFilename(title: string) {
  return title.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 80) || "lytteprove";
}
