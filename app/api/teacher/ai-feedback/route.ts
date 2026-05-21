// app/api/teacher/ai-feedback/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import OpenAI from "openai";
import { FieldValue } from "firebase-admin/firestore";
import {
  getServerFeatureStatusFromProfile,
  consumeServerFeature,
} from "@/lib/serverFeatureGuard";

type SourceType = "myContent" | "library";
type TaskType = "mcq" | "truefalse" | "open" | "multiple_choice" | "text" | "writing" | "short_answer";
type Role = "student" | "teacher" | "admin" | "parent" | "creator";
type Lang = "no" | "en" | "pt";

type Task = {
  id?: string;
  order?: number;
  type?: TaskType | string;
  prompt?: string;
  options?: unknown[];
  correctAnswer?: unknown;
  sentence?: string;
  textWithGap?: string;
};

type ImageWritingTask = {
  id?: string;
  imageUrl?: string;
  imageSource?: string;
  imagePrompt?: string;
  imageDescription?: string;
  instruction?: string;
  supportWords?: unknown[];
  successCriteria?: unknown[];
};

type AnswersMap = Record<string, unknown>;

type MathWorksheetTask = {
  id?: string;
  prompt?: string;
  type?: string;
  expected?: {
    shapeName?: string;
    perimeterValue?: number | null;
    areaValue?: number | null;
  } | null;
};

type MathWorksheet = {
  title?: string;
  level?: string;
  topic?: string;
  language?: string;
  tasks?: MathWorksheetTask[];
};

type GeometryAnswerRow = {
  taskId?: string;
  shapeName?: string;
  perimeterValue?: number | null;
  areaValue?: number | null;
};

type GeometryTaskAuto = {
  shapeName?: {
    isCorrect?: boolean;
    studentValue?: unknown;
    expectedValue?: unknown;
  };
  perimeterValue?: {
    isCorrect?: boolean;
    studentValue?: unknown;
    expectedValue?: unknown;
  };
  areaValue?: {
    isCorrect?: boolean;
    studentValue?: unknown;
    expectedValue?: unknown;
  };
};

type GeometryAutoResult = {
  total?: number;
  correct?: number;
  partial?: number;
  wrong?: number;
  unanswered?: number;
  percent?: number | null;
  byTaskId?: Record<string, GeometryTaskAuto>;
};

type Body = {
  spaceId: string;
  assignmentId: string;
  subId: string;
  locale?: string;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function safeBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function safeTasksArray(tasks: unknown): Task[] {
  if (Array.isArray(tasks)) return tasks as Task[];
  if (typeof tasks === "string") {
    try {
      const parsed: unknown = JSON.parse(tasks);
      return Array.isArray(parsed) ? (parsed as Task[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function safeImageTasksArray(tasks: unknown): ImageWritingTask[] {
  if (!Array.isArray(tasks)) return [];
  return tasks.filter(isRecord).map((task) => task as ImageWritingTask);
}

function isMathWorksheet(value: unknown): value is MathWorksheet {
  if (!isRecord(value)) return false;
  return Array.isArray(value.tasks) && typeof value.title === "string";
}

function hasAssignmentSnapshotContent(a: Record<string, unknown> | null): boolean {
  if (!a) return false;
  const hasText = safeString(a.sourceText).trim().length > 0 || safeString(a.text).trim().length > 0;
  const hasTasks = safeTasksArray(a.tasks).length > 0;
  const hasImage = safeString(a.coverImageUrl).trim().length > 0;
  const hasMathWorksheet = isMathWorksheet(a.mathWorksheet);
  return hasText || hasTasks || hasImage || hasMathWorksheet;
}

function getStableTaskId(t: Task, idx: number): string {
  if (t?.id != null && String(t.id).trim()) return String(t.id).trim();

  const orderPart = t?.order != null ? String(t.order) : "x";
  const promptPart = typeof t?.prompt === "string" ? t.prompt.trim().slice(0, 80) : "";
  if (promptPart) return `${orderPart}__${promptPart}`;

  return `${orderPart}__idx${idx}`;
}

function readAnswerMap(a: unknown): AnswersMap {
  if (isRecord(a)) return a;
  return {};
}

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return "";
  }
}

function normalizeLocale(raw: string): Lang {
  const v = (raw || "").toLowerCase().trim();
  if (v === "en") return "en";
  if (v === "pt" || v === "pt-br" || v === "pt_br") return "pt";
  return "no";
}

function normalizeContentLanguage(raw: string): string {
  const v = (raw || "").toLowerCase().trim();
  if (!v) return "unknown";
  if (v === "nb" || v === "nn" || v === "no" || v.includes("norsk") || v.includes("norwegian")) return "Norwegian";
  if (v === "en" || v.includes("english")) return "English";
  if (v === "pt" || v === "pt-br" || v === "pt_br" || v.includes("portugu")) return "Portuguese";
  return raw;
}

function isOpenLike(type: string): boolean {
  const t = type.toLowerCase();
  return t === "open" || t === "text" || t === "writing" || t === "short_answer";
}

function isClosedChoiceLike(type: string): boolean {
  const t = type.toLowerCase();
  return t === "mcq" || t === "multiple_choice" || t === "truefalse" || t === "true_false";
}

function isReadingTestType(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t === "word_choice" ||
    t === "sentence_placement" ||
    t === "best_summary" ||
    t === "fill_in_word"
  );
}

function readTaskAnswer(args: {
  answers: AnswersMap;
  answersByTaskId: AnswersMap;
  task: Task;
  stableId: string;
  idx: number;
}): string {
  const { answers, answersByTaskId, task, stableId, idx } = args;

  const id = task.id ? String(task.id).trim() : "";
  const order = task.order != null ? String(task.order).trim() : "";

  const candidates = [
    answers[stableId],
    answersByTaskId[stableId],
    id ? answers[id] : undefined,
    id ? answersByTaskId[id] : undefined,
    order ? answers[order] : undefined,
    order ? answersByTaskId[order] : undefined,
    answers[`task_${idx + 1}`],
    answersByTaskId[`task_${idx + 1}`],
  ];

  const raw = candidates.find((v) => v !== undefined && v !== null && asText(v).trim() !== "");
  if (raw === undefined || raw === null) return "";

  if (isRecord(raw)) {
    const picked =
      raw.answer ??
      raw.value ??
      raw.selected ??
      raw.selectedAnswer ??
      raw.selectedOption ??
      raw.selectedOptionId ??
      raw.optionId ??
      raw.choice ??
      raw.choiceId ??
      raw.text;

    return asText(picked ?? raw).trim();
  }

  return asText(raw).trim();
}

function summarizeChoiceTask(task: Task, rawAnswer: string, lang: Lang): string {
  const t = getPromptText(lang);
  const answer = rawAnswer.trim();
  if (answer) return answer;

  // Important: For closed tasks, missing text in this overview must not make AI claim the task was unanswered.
  // The automatic result block is the source of truth for whether closed tasks were answered/correct.
  if (isClosedChoiceLike(safeString(task.type))) {
    if (lang === "pt") return "(respondido; veja os dados do resultado automático)";
    if (lang === "en") return "(answered; see automatic result data)";
    return "(besvart; se automatiske resultatdata)";
  }

  return t.notAnswered;
}

function pickModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function requireEnv() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
}

function readLegacyRole(profile: Record<string, unknown>): Role | null {
  const roles = profile.roles;
  if (!isRecord(roles)) return null;

  if (roles.admin === true) return "admin";
  if (roles.teacher === true) return "teacher";
  if (roles.creator === true) return "creator";
  if (roles.parent === true) return "parent";
  if (roles.student === true) return "student";
  return null;
}

function readRole(profile: unknown): Role | null {
  if (!isRecord(profile)) return null;

  const r = profile.role;
  if (r === "student" || r === "teacher" || r === "admin" || r === "parent" || r === "creator") {
    return r;
  }

  return readLegacyRole(profile);
}

function countWords(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function formatDuration(totalSeconds: number | null): string {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds)) return "unknown";
  const secs = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildTimeSignal(wordCount: number, usedSeconds: number | null): {
  wordsPerMinute: number | null;
  summary: string;
} {
  if (!wordCount || typeof usedSeconds !== "number" || !Number.isFinite(usedSeconds) || usedSeconds <= 0) {
    return {
      wordsPerMinute: null,
      summary: "No reliable timing data available.",
    };
  }

  const minutes = usedSeconds / 60;
  const wpm = Math.round(wordCount / minutes);

  let band = "";
  if (wpm < 60) band = "slow";
  else if (wpm <= 140) band = "normal";
  else if (wpm <= 180) band = "fast";
  else band = "very fast";

  return {
    wordsPerMinute: wpm,
    summary: `Estimated reading pace: about ${wpm} words per minute (${band}). Treat this as a supportive signal only, not as proof by itself.`,
  };
}

function cleanAiFeedback(text: string): string {
  return text
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*\d+\)\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getReadingHeadings(lang: Lang) {
  if (lang === "en") {
    return {
      h1: "AUTORESULTS, READING COMPREHENSION AND CEFR",
      h2: "OPEN TASKS – SUBJECT ASSESSMENT",
      h3: "LEVEL AND NEXT STEPS (CEFR)",
    };
  }

  if (lang === "pt") {
    return {
      h1: "RESULTADOS AUTOMÁTICOS, COMPREENSÃO DE LEITURA E CEFR",
      h2: "TAREFAS ABERTAS – AVALIAÇÃO ACADÊMICA",
      h3: "NÍVEL E PRÓXIMOS PASSOS (CEFR)",
    };
  }

  return {
    h1: "AUTORESULTAT, LESEFORSTÅELSE OG CEFR",
    h2: "ÅPNE OPPGAVER – FAGLIG VURDERING",
    h3: "NIVÅ OG VIDERE PROGRESJON (CEFR)",
  };
}

function getGeneralHeadings(lang: Lang) {
  if (lang === "en") {
    return {
      h1: "TASK COMPLETION AND CONTENT",
      h2: "LANGUAGE",
      h3: "NEXT STEPS",
    };
  }

  if (lang === "pt") {
    return {
      h1: "RESOLUÇÃO DAS TAREFAS E CONTEÚDO",
      h2: "LINGUAGEM",
      h3: "PRÓXIMOS PASSOS",
    };
  }

  return {
    h1: "OPPGAVELØSNING OG INNHOLD",
    h2: "SPRÅK",
    h3: "NESTE STEG",
  };
}

function getGeometryHeadings(lang: Lang) {
  if (lang === "en") {
    return {
      h1: "WHAT YOU DID WELL",
      h2: "WHAT YOU SHOULD PRACTISE MORE",
      h3: "NEXT STEPS",
    };
  }

  if (lang === "pt") {
    return {
      h1: "O QUE VOCÊ CONSEGUIU FAZER BEM",
      h2: "O QUE VOCÊ DEVE PRATICAR MAIS",
      h3: "PRÓXIMOS PASSOS",
    };
  }

  return {
    h1: "DET DU HAR FÅTT TIL",
    h2: "DET DU BØR ØVE MER PÅ",
    h3: "NESTE STEG",
  };
}

function getPromptText(lang: Lang) {
  if (lang === "en") {
    return {
      unknown: "unknown",
      notProvided: "(not provided)",
      noPrompt: "(no prompt)",
      notAnswered: "(not answered)",
      noOpenAnswers: "(No open answers in this submission.)",
      noTasksFound: "(No tasks found.)",
      noGeometryTasks: "(No geometry worksheet tasks found.)",
      yes: "yes",
      no: "no",

      lessonTitle: "Lesson title",
      level: "Level",
      feedbackLanguage: "Feedback language",
      contentLanguage: "Task/content language",
      languageHint: "Language hint",
      cefrLevel: "CEFR level",
      isReadingTest: "Is reading test",
      taskType: "Task type",
      normalTask: "normal task",
      autoResult: "Automatic result data",
      readingText: "Reading text",
      sourceContext: "Source text / task context",
      geometryAutoSummary: "Geometry auto summary",
      geometryTasksAndAnswers: "Geometry tasks and student answers",
      allTasksAndAnswers: "All tasks and student answers",
      openTasksAndAnswers: "Open tasks and answers",
      instruction: "Instruction",
      readingMetadata: "Reading test metadata",

      wordCount: "Reading text word count",
      timeLimit: "Time limit",
      timeUsed: "Time used",
      submittedManually: "Submitted manually",
      timedOut: "Timed out",

      task: "TASK",
      answer: "ANSWER",

      worksheetTitle: "Worksheet title",
      taskId: "Task id",
      prompt: "Prompt",
      expectedShape: "Expected shape",
      expectedPerimeter: "Expected perimeter",
      expectedArea: "Expected area",
      studentShape: "Student shape",
      studentPerimeter: "Student perimeter",
      studentArea: "Student area",
      shapeCorrect: "Shape correct",
      perimeterCorrect: "Perimeter correct",
      areaCorrect: "Area correct",

      languageSafetyInstruction:
        "The interface/feedback language may differ from the task/content language. Do not treat language mismatch as missing, wrong, or unanswered work.",
      closedTaskSafetyInstruction:
        "If automatic result data shows that closed tasks were answered, do not claim that multiple-choice or true/false tasks were unanswered, even if detailed answer text is missing from the task overview.",

      geometryInstruction:
        "Write teacher feedback for the student in the required structure. Use the auto-check actively. Mention what the student understands, what is partly correct or wrong, and what should be practised next. Write the headings in the same language as the feedback language.",

      readingInstruction:
        "Write teacher feedback in the required structure. Base the reading assessment mainly on the auto result. Use time only as a cautious supporting signal. Evaluate whether short open answers are sufficient for the task itself, and when they are too thin, give concrete advice for how the student can improve them. Write the headings in the same language as the feedback language.",

      generalInstruction:
        "Write short teacher feedback in the required structure. Focus on whether the student has understood the task, answered relevantly, and responded to the open tasks. Use automatic result data as support when it exists. In the language section, comment on grammar and point out concrete errors that should be corrected. Judge short answers in light of what the task asks for. If short answers are acceptable for that task, say so. If the answer is too thin for the task, explain what is missing and give concrete advice on how the student can expand or improve it. Write the headings in the same language as the feedback language. Do not set a CEFR level.",
    };
  }

  if (lang === "pt") {
    return {
      unknown: "desconhecido",
      notProvided: "(não informado)",
      noPrompt: "(sem enunciado)",
      notAnswered: "(não respondido)",
      noOpenAnswers: "(Não há respostas abertas nesta entrega.)",
      noTasksFound: "(Nenhuma tarefa encontrada.)",
      noGeometryTasks: "(Nenhuma tarefa de geometria encontrada.)",
      yes: "sim",
      no: "não",

      lessonTitle: "Título da atividade",
      level: "Nível",
      feedbackLanguage: "Idioma do feedback",
      contentLanguage: "Idioma da tarefa/do conteúdo",
      languageHint: "Indicação de idioma",
      cefrLevel: "Nível CEFR",
      isReadingTest: "É teste de leitura",
      taskType: "Tipo de tarefa",
      normalTask: "tarefa normal",
      autoResult: "Dados do resultado automático",
      readingText: "Texto de leitura",
      sourceContext: "Texto-base / contexto da tarefa",
      geometryAutoSummary: "Resumo da autocorreção de geometria",
      geometryTasksAndAnswers: "Tarefas de geometria e respostas do aluno",
      allTasksAndAnswers: "Todas as tarefas e respostas do aluno",
      openTasksAndAnswers: "Tarefas abertas e respostas",
      instruction: "Instrução",
      readingMetadata: "Metadados do teste de leitura",

      wordCount: "Número de palavras do texto de leitura",
      timeLimit: "Tempo limite",
      timeUsed: "Tempo usado",
      submittedManually: "Enviado manualmente",
      timedOut: "Tempo esgotado",

      task: "TAREFA",
      answer: "RESPOSTA",

      worksheetTitle: "Título da ficha",
      taskId: "ID da tarefa",
      prompt: "Enunciado",
      expectedShape: "Forma esperada",
      expectedPerimeter: "Perímetro esperado",
      expectedArea: "Área esperada",
      studentShape: "Forma do aluno",
      studentPerimeter: "Perímetro do aluno",
      studentArea: "Área do aluno",
      shapeCorrect: "Forma correta",
      perimeterCorrect: "Perímetro correto",
      areaCorrect: "Área correta",

      languageSafetyInstruction:
        "O idioma da interface/do feedback pode ser diferente do idioma da tarefa/do conteúdo. Não trate diferença de idioma como resposta ausente, errada ou não respondida.",
      closedTaskSafetyInstruction:
        "Se os dados do resultado automático mostram que as tarefas fechadas foram respondidas, não diga que tarefas de múltipla escolha ou verdadeiro/falso ficaram sem resposta, mesmo que o texto detalhado da resposta esteja ausente na visão geral das tarefas.",

      geometryInstruction:
        "Escreva um feedback do professor para o aluno na estrutura exigida. Use ativamente a autocorreção. Diga o que o aluno compreende, o que está parcialmente correto ou errado e o que deve praticar a seguir. Escreva os títulos no mesmo idioma do feedback.",

      readingInstruction:
        "Escreva um feedback do professor na estrutura exigida. Baseie a avaliação de leitura principalmente no resultado automático. Use o tempo apenas como um sinal de apoio cuidadoso. Avalie se respostas abertas curtas são suficientes para a própria tarefa e, quando forem curtas demais, dê conselhos concretos sobre como o aluno pode melhorá-las. Escreva os títulos no mesmo idioma do feedback.",

      generalInstruction:
        "Escreva um feedback curto do professor na estrutura exigida. Foque se o aluno compreendeu a tarefa, respondeu de forma relevante e respondeu às tarefas abertas. Use dados automáticos como apoio quando existirem. Na parte de linguagem, comente a gramática e aponte erros concretos que devem ser corrigidos. Julgue respostas curtas de acordo com o que a tarefa pede. Se respostas curtas forem aceitáveis para aquela tarefa, diga isso. Se a resposta estiver pobre demais para a tarefa, explique o que falta e dê conselhos concretos sobre como o aluno pode ampliar ou melhorar a resposta. Escreva os títulos no mesmo idioma do feedback. Não defina nível CEFR.",
    };
  }

  return {
    unknown: "ukjent",
    notProvided: "(ikke oppgitt)",
    noPrompt: "(ingen prompt)",
    notAnswered: "(ikke besvart)",
    noOpenAnswers: "(Ingen åpne svar i denne innleveringen.)",
    noTasksFound: "(Ingen oppgaver funnet.)",
    noGeometryTasks: "(Ingen geometrioppgaver funnet.)",
    yes: "ja",
    no: "nei",

    lessonTitle: "Tittel",
    level: "Nivå",
    feedbackLanguage: "Feedbackspråk",
    contentLanguage: "Oppgave-/innholdsspråk",
    languageHint: "Språkhint",
    cefrLevel: "CEFR-nivå",
    isReadingTest: "Er lesetest",
    taskType: "Oppgavetype",
    normalTask: "vanlig oppgave",
    autoResult: "Automatiske resultatdata",
    readingText: "Lesetekst",
    sourceContext: "Kildetekst / oppgavekontekst",
    geometryAutoSummary: "Oppsummering av geometry-autokorrektur",
    geometryTasksAndAnswers: "Geometrioppgaver og elevsvar",
    allTasksAndAnswers: "Alle oppgaver og elevsvar",
    openTasksAndAnswers: "Åpne oppgaver og svar",
    instruction: "Instruksjon",
    readingMetadata: "Metadata for lesetest",

    wordCount: "Antall ord i leseteksten",
    timeLimit: "Tidsgrense",
    timeUsed: "Brukt tid",
    submittedManually: "Levert manuelt",
    timedOut: "Tiden gikk ut",

    task: "OPPGAVE",
    answer: "SVAR",

    worksheetTitle: "Tittel på arbeidsark",
    taskId: "Oppgave-ID",
    prompt: "Oppgavetekst",
    expectedShape: "Forventet figur",
    expectedPerimeter: "Forventet omkrets",
    expectedArea: "Forventet areal",
    studentShape: "Elevens figur",
    studentPerimeter: "Elevens omkrets",
    studentArea: "Elevens areal",
    shapeCorrect: "Figur riktig",
    perimeterCorrect: "Omkrets riktig",
    areaCorrect: "Areal riktig",

    languageSafetyInstruction:
      "Språket i grensesnittet/feedbacken kan være forskjellig fra språket i oppgaven/innholdet. Ikke tolk språkforskjell som manglende, feil eller ubesvart arbeid.",
    closedTaskSafetyInstruction:
      "Hvis automatiske resultatdata viser at lukkede oppgaver er besvart, skal du ikke si at flervalg eller sant/usant er ubesvart, selv om detaljert svartekst mangler i oppgaveoversikten.",

    geometryInstruction:
      "Skriv lærerfeedback til eleven i den påkrevde strukturen. Bruk autokorrekturen aktivt. Nevn hva eleven forstår, hva som er delvis riktig eller feil, og hva eleven bør øve på videre. Skriv overskriftene på samme språk som feedbackspråket.",

    readingInstruction:
      "Skriv lærerfeedback i den påkrevde strukturen. Basér lesevurderingen hovedsakelig på autoresultatet. Bruk tid bare som et forsiktig støttesignal. Vurder om korte åpne svar er tilstrekkelige for selve oppgaven, og når de er for tynne, gi konkrete råd om hvordan eleven kan forbedre dem. Skriv overskriftene på samme språk som feedbackspråket.",

    generalInstruction:
      "Skriv kort lærerfeedback i den påkrevde strukturen. Fokuser på om eleven har forstått oppgaven, svart relevant og besvart de åpne oppgavene. Bruk automatiske resultatdata som støtte når de finnes. I språkseksjonen skal du kommentere grammatikk og peke på konkrete feil som bør rettes. Vurder korte svar ut fra hva oppgaven ber om. Hvis korte svar er akseptable for den oppgaven, si det. Hvis svaret er for tynt i forhold til oppgaven, forklar hva som mangler og gi konkrete råd om hvordan eleven kan utvide eller forbedre svaret. Skriv overskriftene på samme språk som feedbackspråket. Ikke sett CEFR-nivå.",
  };
}

function buildCommonSafetyLines(lang: Lang): string[] {
  const t = getPromptText(lang);
  return [
    `- ${t.languageSafetyInstruction}`,
    `- ${t.closedTaskSafetyInstruction}`,
    "- Automatic result data is the source of truth for closed tasks such as multiple-choice and true/false.",
  ];
}

function buildReadingSystemPrompt(lang: Lang) {
  const headings = getReadingHeadings(lang);
  const safety = buildCommonSafetyLines(lang);

  if (lang === "en") {
    return [
      "You are an experienced Norwegian language teacher.",
      "Address the student directly using 'you'. Be supportive, clear, and motivating.",
      "Give short, precise, and helpful feedback on the student's work.",
      "Adapt your language and expectations to the provided CEFR level.",
      "Do NOT write a full corrected version of the entire text.",
      "Use: LOW / MEDIUM / HIGH achievement relative to CEFR.",
      "",
      "IMPORTANT:",
      "- Base the reading assessment mainly on automatic results.",
      ...safety,
      "- Time is only a supportive signal, never proof by itself.",
      "- If open answers exist, assess them briefly too.",
      "- Evaluate short open answers in light of what the task actually asks for.",
      "- Short answers can be fully acceptable when the task asks for facts, simple information, keywords, or a fixed number of short sentences.",
      "- Expect more development when the task asks the student to explain, justify, compare, reflect, or write more connected content.",
      "- If an answer is too short for the task, say so clearly but kindly, and give concrete advice on how to improve it.",
      "- Give practical advice such as: read the task carefully again, check whether the task asks for more than one point, find more details from the text, explain a little more, or answer all parts of the question.",
      "",
      "FORMATTING:",
      "- Use plain text headings only.",
      "- Do not use markdown.",
      "- Do not use ###, ##, #, bullet markers, or numbered heading formatting.",
      "",
      "Use these exact headings:",
      headings.h1,
      headings.h2,
      headings.h3,
      "",
      "Keep it concise.",
    ].join("\n");
  }

  if (lang === "pt") {
    return [
      "Você é um professor experiente de norueguês/língua.",
      "Fale diretamente com o aluno usando 'você'. Seja claro, encorajador e específico.",
      "Dê um feedback curto, preciso e útil.",
      "Adapte ao nível CEFR informado.",
      "Não escreva uma versão corrigida completa do texto.",
      "",
      "IMPORTANTE:",
      "- Baseie a avaliação de leitura principalmente no resultado automático.",
      ...safety,
      "- O tempo é apenas um sinal de apoio, nunca uma prova por si só.",
      "- Se houver respostas abertas, avalie-as brevemente também.",
      "- Avalie respostas curtas de acordo com o que a tarefa realmente pede.",
      "- Respostas curtas podem ser totalmente adequadas quando a tarefa pede fatos, informações simples, palavras-chave ou um número fixo de frases curtas.",
      "- Espere mais desenvolvimento quando a tarefa pedir explicação, justificativa, comparação, reflexão ou um texto mais conectado.",
      "- Se a resposta estiver curta demais para a tarefa, diga isso com clareza e gentileza, e dê conselhos concretos sobre como melhorar.",
      "- Dê conselhos práticos como: leia a tarefa com atenção outra vez, veja se a tarefa pede mais de um ponto, encontre mais detalhes no texto, explique um pouco mais ou responda todas as partes da pergunta.",
      "",
      "FORMATAÇÃO:",
      "- Use títulos em texto simples.",
      "- Não use markdown.",
      "- Não use ###, ##, #, marcadores ou numeração de headings.",
      "",
      "Use estes títulos exatos:",
      headings.h1,
      headings.h2,
      headings.h3,
      "",
      "Seja conciso.",
    ].join("\n");
  }

  return [
    "Du er en erfaren norsklærer/språklærer.",
    "Skriv direkte til eleven med 'du'. Vær støttende, konkret og motiverende.",
    "Gi kort, presis og nyttig tilbakemelding tilpasset oppgitt CEFR-nivå.",
    "Ikke skriv en fullstendig korrigert versjon av hele teksten.",
    "Bruk: LAV / MIDDELS / HØY målopnåelse i forhold til nivå.",
    "",
    "VIKTIG:",
    "- Lesetest vurderes først og fremst ut fra autoresultat.",
    ...safety,
    "- Tidsbruk er bare et støttesignal.",
    "- Hvis åpne svar finnes, vurder dem kort også.",
    "- Vurder korte åpne svar ut fra hva oppgaven faktisk ber om.",
    "- Korte svar kan være helt gode nok når oppgaven ber om fakta, enkle opplysninger, nøkkelord eller et fast antall korte setninger.",
    "- Forvent mer utviklede svar når oppgaven ber om å forklare, begrunne, sammenligne, reflektere eller skrive mer sammenhengende.",
    "- Hvis et svar er for kort i forhold til oppgaven, si det tydelig, men vennlig, og gi konkrete råd om hvordan eleven kan utvide svaret.",
    "- Gi praktiske råd som: les oppgaven nøye en gang til, se om oppgaven spør om flere ting, finn flere detaljer i teksten, forklar litt mer, eller svar på alle deler av spørsmålet.",
    "",
    "FORMATERING:",
    "- Bruk rene overskrifter som vanlig tekst.",
    "- Ikke bruk markdown.",
    "- Ikke bruk ###, ##, #, punktlister eller nummererte overskrifter.",
    "",
    "Bruk nøyaktig disse overskriftene:",
    headings.h1,
    headings.h2,
    headings.h3,
    "",
    "Hold det konsist.",
  ].join("\n");
}

function buildGeneralSystemPrompt(lang: Lang) {
  const headings = getGeneralHeadings(lang);
  const safety = buildCommonSafetyLines(lang);

  if (lang === "en") {
    return [
      "You are an experienced language teacher.",
      "Address the student directly using 'you'. Be supportive, clear, and motivating.",
      "Give short, precise, and useful feedback.",
      "Focus on whether the tasks are answered correctly, reading comprehension according to autoscore, and whether open tasks are answered relevantly.",
      "Assess language with particular attention to grammar, and point out concrete errors that should be corrected.",
      "Do NOT write a full corrected version of the whole text.",
      "",
      "IMPORTANT:",
      ...safety,
      "- Evaluate open answers in light of what the task actually asks for.",
      "- Short answers can be good enough when the task asks for facts, simple statements, keywords, or a limited number of short sentences.",
      "- Expect more content when the task asks the student to explain, justify, compare, reflect, describe causes and consequences, or write more connected text.",
      "- Do not criticize an answer just for being short. Judge whether it is sufficient for that exact task.",
      "- If the answer is too thin for the task, explain this clearly and kindly.",
      "- Give concrete improvement advice, for example: read the task carefully again, check whether all parts of the task are answered, find more relevant details, explain ideas more clearly, or add more examples from the text or topic.",
      "",
      "FORMATTING:",
      "- Use plain text headings only.",
      "- Do not use markdown.",
      "- Do not use ###, ##, #, bullet markers, or numbered heading formatting.",
      "",
      "Use these exact headings:",
      headings.h1,
      headings.h2,
      headings.h3,
      "",
      "Keep it concise.",
    ].join("\n");
  }

  if (lang === "pt") {
    return [
      "Você é um professor experiente de língua.",
      "Fale diretamente com o aluno usando 'você'.",
      "Dê um feedback curto, preciso e útil.",
      "Foque se as tarefas foram respondidas corretamente, na compreensão de leitura de acordo com a pontuação automática, e se as tarefas abertas foram respondidas de forma relevante.",
      "Avalie a linguagem com atenção especial à gramática e aponte erros concretos que devem ser corrigidos.",
      "Não escreva uma versão completa corrigida do texto inteiro.",
      "",
      "IMPORTANTE:",
      ...safety,
      "- Avalie respostas abertas de acordo com o que a tarefa realmente pede.",
      "- Respostas curtas podem ser suficientes quando a tarefa pede fatos, frases simples, palavras-chave ou um número limitado de frases curtas.",
      "- Espere mais conteúdo quando a tarefa pedir explicação, justificativa, comparação, reflexão, causas e consequências ou um texto mais conectado.",
      "- Não critique uma resposta apenas por ser curta. Avalie se ela é suficiente para aquela tarefa específica.",
      "- Se a resposta estiver pobre demais para a tarefa, explique isso com clareza e gentileza.",
      "- Dê conselhos concretos, por exemplo: leia a tarefa com atenção outra vez, veja se todas as partes da tarefa foram respondidas, encontre mais detalhes relevantes, explique melhor as ideias ou acrescente mais exemplos do texto ou do tema.",
      "",
      "FORMATAÇÃO:",
      "- Use títulos em texto simples.",
      "- Não use markdown.",
      "- Não use ###, ##, #, marcadores ou numeração de headings.",
      "",
      "Use estes títulos exatos:",
      headings.h1,
      headings.h2,
      headings.h3,
      "",
      "Seja conciso.",
    ].join("\n");
  }

  return [
    "Du er en erfaren språk- og norsklærer.",
    "Skriv direkte til eleven med 'du'. Vær støttende, konkret og motiverende.",
    "Gi kort, presis og nyttig tilbakemelding.",
    "Fokuser på om oppgavene er besvart riktig, leseforståelse i henhold til autoscore, og om åpne oppgaver er besvart relevant.",
    "Vurder språk med særlig fokus på grammatikk, og pek på konkrete feil som bør rettes.",
    "Ikke skriv en fullstendig korrigert versjon av hele teksten.",
    "",
    "VIKTIG:",
    ...safety,
    "- Vurder åpne svar ut fra hva oppgaven faktisk ber om.",
    "- Korte svar kan være gode nok når oppgaven ber om fakta, enkle setninger, nøkkelord eller et begrenset antall korte svar.",
    "- Forvent mer innhold når oppgaven ber eleven forklare, begrunne, sammenligne, reflektere, beskrive årsaker og virkninger eller skrive mer sammenhengende tekst.",
    "- Ikke kritiser et svar bare fordi det er kort. Vurder om det er tilstrekkelig for akkurat den oppgaven.",
    "- Hvis svaret er for tynt i forhold til oppgaven, forklar det tydelig og vennlig.",
    "- Gi konkrete råd, for eksempel: les oppgaven nøye en gang til, sjekk om alle delene av oppgaven er besvart, finn flere relevante detaljer, forklar tankene tydeligere, eller ta med flere eksempler fra teksten eller temaet.",
    "",
    "FORMATERING:",
    "- Bruk rene overskrifter som vanlig tekst.",
    "- Ikke bruk markdown.",
    "- Ikke bruk ###, ##, #, punktlister eller nummererte overskrifter.",
    "",
    "Bruk nøyaktig disse overskriftene:",
    headings.h1,
    headings.h2,
    headings.h3,
    "",
    "Hold det konsist.",
  ].join("\n");
}

function buildGeometrySystemPrompt(lang: Lang) {
  const headings = getGeometryHeadings(lang);
  const safety = buildCommonSafetyLines(lang);

  if (lang === "en") {
    return [
      "You are an experienced math teacher giving feedback to a student.",
      "Write directly to the student using 'you'.",
      "Be supportive, concrete, and short.",
      "Use the geometry auto-check actively.",
      "Mention what the student got right, what needs improvement, and what to practice next.",
      "Do not invent scores that are not provided.",
      "Do not explain every single task in detail.",
      "",
      "IMPORTANT:",
      ...safety,
      "",
      "FORMATTING:",
      "- Use plain text headings only.",
      "- Do not use markdown.",
      "- Do not use ###, ##, #, bullet markers, or numbered heading formatting.",
      "",
      "Use these exact headings:",
      headings.h1,
      headings.h2,
      headings.h3,
      "",
      "Keep it concise and teacher-like.",
    ].join("\n");
  }

  if (lang === "pt") {
    return [
      "Você é um professor experiente de matemática dando feedback ao aluno.",
      "Fale diretamente com o aluno usando 'você'.",
      "Seja encorajador, concreto e breve.",
      "Use ativamente o resultado da autocorreção de geometria.",
      "",
      "IMPORTANTE:",
      ...safety,
      "",
      "FORMATAÇÃO:",
      "- Use títulos em texto simples.",
      "- Não use markdown.",
      "- Não use ###, ##, #, marcadores ou numeração de headings.",
      "",
      "Use estes títulos exatos:",
      headings.h1,
      headings.h2,
      headings.h3,
      "",
      "Seja conciso.",
    ].join("\n");
  }

  return [
    "Du er en erfaren matematikklærer som gir tilbakemelding til en elev.",
    "Skriv direkte til eleven med 'du'.",
    "Vær vennlig, konkret og kort.",
    "Bruk geometry-autokorrekturen aktivt.",
    "Trekk fram hva eleven har fått til, hva som bør forbedres, og hva neste øvingspunkt bør være.",
    "Ikke forklar hver enkelt oppgave i detalj.",
    "",
    "VIKTIG:",
    ...safety,
    "",
    "FORMATERING:",
    "- Bruk rene overskrifter som vanlig tekst.",
    "- Ikke bruk markdown.",
    "- Ikke bruk ###, ##, #, punktlister eller nummererte overskrifter.",
    "",
    "Bruk nøyaktig disse overskriftene:",
    headings.h1,
    headings.h2,
    headings.h3,
    "",
    "Hold det kort og læreraktig.",
  ].join("\n");
}

function summarizeAutoResult(auto: unknown, lang: Lang): string {
  const t = getPromptText(lang);

  if (!isRecord(auto)) return t.notProvided;

  const totalAuto = safeNumber(auto.totalAuto);
  const correctAuto = safeNumber(auto.correctAuto);
  const wrongAuto = safeNumber(auto.wrongAuto);
  const unansweredAuto = safeNumber(auto.unansweredAuto);
  const percentAuto = safeNumber(auto.percentAuto);

  if (
    totalAuto == null &&
    correctAuto == null &&
    wrongAuto == null &&
    unansweredAuto == null &&
    percentAuto == null
  ) {
    try {
      return JSON.stringify(auto, null, 2);
    } catch {
      return t.notProvided;
    }
  }

  return [
    `total: ${totalAuto ?? t.unknown}`,
    `correct: ${correctAuto ?? t.unknown}`,
    `wrong: ${wrongAuto ?? t.unknown}`,
    `unanswered: ${unansweredAuto ?? t.unknown}`,
    `percent: ${percentAuto ?? t.unknown}`,
  ].join("\n");
}

function summarizeGeometryAuto(auto: unknown, lang: Lang): string {
  const t = getPromptText(lang);

  if (!isRecord(auto)) return t.notProvided;

  const total = safeNumber(auto.total);
  const correct = safeNumber(auto.correct);
  const partial = safeNumber(auto.partial);
  const wrong = safeNumber(auto.wrong);
  const unanswered = safeNumber(auto.unanswered);
  const percent = safeNumber(auto.percent);

  return [
    `total: ${total ?? t.unknown}`,
    `correct: ${correct ?? t.unknown}`,
    `partial: ${partial ?? t.unknown}`,
    `wrong: ${wrong ?? t.unknown}`,
    `unanswered: ${unanswered ?? t.unknown}`,
    `percent: ${percent ?? t.unknown}`,
  ].join("\n");
}

function summarizeGeometryWorksheet(
  worksheet: MathWorksheet | null,
  answersByTaskId: AnswersMap,
  geometryAuto: GeometryAutoResult | null,
  lang: Lang
): string {
  const t = getPromptText(lang);

  if (!worksheet || !Array.isArray(worksheet.tasks) || worksheet.tasks.length === 0) {
    return t.noGeometryTasks;
  }

  return worksheet.tasks
    .map((task, idx) => {
      const taskId = safeString(task.id).trim() || `task_${idx + 1}`;
      const answerRaw = answersByTaskId[taskId];
      const answer = isRecord(answerRaw) ? (answerRaw as GeometryAnswerRow) : {};
      const autoByTask = geometryAuto?.byTaskId?.[taskId];

      const lines = [
        `#${idx + 1}`,
        `${t.taskId}: ${taskId}`,
        `${t.prompt}: ${safeString(task.prompt) || t.noPrompt}`,
        `${t.expectedShape}: ${task.expected?.shapeName ?? t.unknown}`,
        `${t.expectedPerimeter}: ${task.expected?.perimeterValue ?? t.unknown}`,
        `${t.expectedArea}: ${task.expected?.areaValue ?? t.unknown}`,
        `${t.studentShape}: ${answer.shapeName ?? t.notAnswered}`,
        `${t.studentPerimeter}: ${answer.perimeterValue ?? t.notAnswered}`,
        `${t.studentArea}: ${answer.areaValue ?? t.notAnswered}`,
      ];

      if (autoByTask) {
        lines.push(
          `${t.shapeCorrect}: ${safeBoolean(autoByTask.shapeName?.isCorrect) === true ? t.yes : safeBoolean(autoByTask.shapeName?.isCorrect) === false ? t.no : t.unknown}`,
          `${t.perimeterCorrect}: ${safeBoolean(autoByTask.perimeterValue?.isCorrect) === true ? t.yes : safeBoolean(autoByTask.perimeterValue?.isCorrect) === false ? t.no : t.unknown}`,
          `${t.areaCorrect}: ${safeBoolean(autoByTask.areaValue?.isCorrect) === true ? t.yes : safeBoolean(autoByTask.areaValue?.isCorrect) === false ? t.no : t.unknown}`
        );
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

function buildLanguageContextBlock(args: {
  lang: Lang;
  contentLanguage: string;
  languageHint: string;
}): string {
  const { lang, contentLanguage, languageHint } = args;
  const t = getPromptText(lang);

  return [
    `${t.feedbackLanguage}: ${lang}`,
    `${t.contentLanguage}: ${contentLanguage}`,
    languageHint ? `${t.languageHint}: ${languageHint}` : "",
    `IMPORTANT: ${t.languageSafetyInstruction}`,
    `IMPORTANT: ${t.closedTaskSafetyInstruction}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildGeometryUserContent(args: {
  lang: Lang;
  contentLanguage: string;
  lessonTitle: string;
  level: string;
  languageHint: string;
  mathWorksheet: MathWorksheet | null;
  geometryAuto: GeometryAutoResult | null;
  answersByTaskId: AnswersMap;
}) {
  const { lang, contentLanguage, lessonTitle, level, languageHint, mathWorksheet, geometryAuto, answersByTaskId } = args;
  const t = getPromptText(lang);

  return (
    `${buildLanguageContextBlock({ lang, contentLanguage, languageHint })}\n\n` +
    `${t.worksheetTitle}: ${mathWorksheet?.title || lessonTitle}\n` +
    `${t.level}: ${level}\n\n` +
    `${t.geometryAutoSummary}:\n${summarizeGeometryAuto(geometryAuto, lang)}\n\n` +
    `${t.geometryTasksAndAnswers}:\n${summarizeGeometryWorksheet(mathWorksheet, answersByTaskId, geometryAuto, lang)}\n\n` +
    `${t.instruction}:\n${t.geometryInstruction}`
  );
}

function buildReadingUserContent(args: {
  lang: Lang;
  contentLanguage: string;
  level: string;
  languageHint: string;
  lessonTitle: string;
  autoResultat: string;
  sourceText: string;
  readingModeBlock: string;
  taskOverviewBlock: string;
  openTasksBlock: string;
}) {
  const {
    lang,
    contentLanguage,
    level,
    languageHint,
    lessonTitle,
    autoResultat,
    sourceText,
    readingModeBlock,
    taskOverviewBlock,
    openTasksBlock,
  } = args;
  const t = getPromptText(lang);

  return (
    `${buildLanguageContextBlock({ lang, contentLanguage, languageHint })}\n\n` +
    `${t.cefrLevel}: ${level}\n` +
    `${t.lessonTitle}: ${lessonTitle}\n` +
    `${t.isReadingTest}: ${lang === "pt" ? "sim" : lang === "en" ? "yes" : "ja"}\n\n` +
    `${t.autoResult}:\n${autoResultat || t.notProvided}\n\n` +
    `${t.readingText}:\n${sourceText.trim() || t.notProvided}\n\n` +
    `${readingModeBlock}\n\n` +
    `${t.allTasksAndAnswers}:\n${taskOverviewBlock}\n\n` +
    `${t.openTasksAndAnswers}:\n${openTasksBlock}\n\n` +
    `${t.instruction}:\n${t.readingInstruction}`
  );
}

function buildGeneralUserContent(args: {
  lang: Lang;
  contentLanguage: string;
  languageHint: string;
  lessonTitle: string;
  autoResultat: string;
  sourceText: string;
  taskOverviewBlock: string;
  openTasksBlock: string;
}) {
  const { lang, contentLanguage, languageHint, lessonTitle, autoResultat, sourceText, taskOverviewBlock, openTasksBlock } = args;
  const t = getPromptText(lang);

  return (
    `${buildLanguageContextBlock({ lang, contentLanguage, languageHint })}\n\n` +
    `${t.lessonTitle}: ${lessonTitle}\n` +
    `${t.taskType}: ${t.normalTask}\n\n` +
    `${t.autoResult}:\n${autoResultat || t.notProvided}\n\n` +
    `${t.sourceContext}:\n${sourceText.trim() || t.notProvided}\n\n` +
    `${t.allTasksAndAnswers}:\n${taskOverviewBlock}\n\n` +
    `${t.openTasksAndAnswers}:\n${openTasksBlock}\n\n` +
    `${t.instruction}:\n${t.generalInstruction}`
  );
}

function buildImageWritingUserContent(args: {
  lang: Lang;
  contentLanguage: string;
  languageHint: string;
  lessonTitle: string;
  level: string;
  taskType: string;
  imageTask: ImageWritingTask | null;
  studentAnswer: string;
}) {
  const { lang, contentLanguage, languageHint, lessonTitle, level, taskType, imageTask, studentAnswer } = args;
  const t = getPromptText(lang);
  const instruction = safeString(imageTask?.instruction).trim();
  const imageDescription = safeString(imageTask?.imageDescription).trim();
  const imagePrompt = safeString(imageTask?.imagePrompt).trim();
  const supportWords = Array.isArray(imageTask?.supportWords)
    ? imageTask.supportWords.map((word) => asText(word).trim()).filter(Boolean).join(", ")
    : "";
  const successCriteria = Array.isArray(imageTask?.successCriteria)
    ? imageTask.successCriteria.map((item) => asText(item).trim()).filter(Boolean).join("; ")
    : "";

  return [
    buildLanguageContextBlock({ lang, contentLanguage, languageHint }),
    "",
    "Dette er en skriveoppgave basert på et bilde.",
    `${t.lessonTitle}: ${lessonTitle}`,
    `${t.level}: ${level}`,
    `${t.taskType}: ${taskType || "image_writing"}`,
    imagePrompt ? `Image prompt: ${imagePrompt}` : "",
    supportWords ? `Support words: ${supportWords}` : "",
    successCriteria ? `Success criteria: ${successCriteria}` : "",
    "",
    `Bildebeskrivelse:\n${imageDescription || t.notProvided}`,
    "",
    `Oppgave:\n${instruction || t.noPrompt}`,
    "",
    `Elevtekst:\n${studentAnswer || t.notAnswered}`,
    "",
    `${t.instruction}:\nGi tilbakemelding på innhold, grammatikk, ordvalg og om teksten passer til bildet og oppgaven. Vær konkret, kort og støttende. Skriv i samme språk som feedback-språket.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export async function POST(req: Request) {
  try {
    requireEnv();

    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization bearer token" }, 401);

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const spaceId = safeString(body.spaceId).trim();
    const assignmentId = safeString(body.assignmentId).trim();
    const subId = safeString(body.subId).trim();

    // This is the UI/feedback language, not necessarily the language of the task/content.
    const locale = normalizeLocale(safeString(body.locale || "no"));

    if (!spaceId || !assignmentId || !subId) {
      return json({ error: "Missing spaceId/assignmentId/subId" }, 400);
    }

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);

    const uid = decoded.uid;
    if (!uid) return json({ error: "Unauthorized" }, 401);

    const profileSnap = await db.collection("users").doc(uid).get();
    const profile = profileSnap.exists ? profileSnap.data() : null;

    const role = readRole(profile);
    const isTeacherish = role === "teacher" || role === "creator" || role === "admin";

    if (!isTeacherish) {
      return json({ error: "Not allowed (role)" }, 403);
    }

    const featureStatus = await getServerFeatureStatusFromProfile({
      db,
      uid,
      role,
      plan: isRecord(profile) ? safeString(profile.plan) : null,
      billing: isRecord(profile) && isRecord(profile.billing)
        ? profile.billing
        : null,
      partnerAccess: isRecord(profile) ? profile.partnerAccess === true : false,
      partnerStatus: isRecord(profile) ? safeString(profile.partnerStatus) : null,
      feature: "ai_feedback",
    });

    if (!featureStatus.allowed) {
      return json(
        {
          error: "AI feedback limit reached",
          reason: featureStatus.reason ?? "limit_reached",
          used: featureStatus.used,
          limit: featureStatus.limit,
          remaining: featureStatus.remaining,
        },
        429
      );
    }

    const subRef = db
      .collection("spaces")
      .doc(spaceId)
      .collection("lessons")
      .doc(assignmentId)
      .collection("submissions")
      .doc(subId);

    const subSnap = await subRef.get();
    if (!subSnap.exists) return json({ error: "Submission not found" }, 404);
    const subDoc = (subSnap.data() || {}) as Record<string, unknown>;

    const aRef = db.collection("spaces").doc(spaceId).collection("lessons").doc(assignmentId);
    const aSnap = await aRef.get();
    const assignment = (aSnap.exists ? aSnap.data() || {} : {}) as Record<string, unknown>;

    let lesson: Record<string, unknown> = {};
    if (hasAssignmentSnapshotContent(assignment)) {
      lesson = assignment;
    } else {
      const sourceType = (safeString(assignment.sourceType) || "library") as SourceType;
      const sourceId = safeString(assignment.sourceId).trim();

      if (!sourceId) {
        return json({ error: "Assignment missing sourceId and no snapshot content" }, 400);
      }

      const lessonRef =
        sourceType === "library"
          ? db.collection("published_lessons").doc(sourceId)
          : db.collection("lessons").doc(sourceId);

      const lessonSnap = await lessonRef.get();
      lesson = (lessonSnap.exists ? lessonSnap.data() || {} : {}) as Record<string, unknown>;
    }

    const lessonTitle = safeString(lesson.title) || safeString(assignment.title) || "Oppgave";
    const level = safeString(lesson.level) || safeString(assignment.level) || "A2";
    const languageHint = safeString(lesson.language) || safeString(assignment.language) || "";
    const contentLanguage = normalizeContentLanguage(languageHint || safeString(lesson.locale) || safeString(assignment.locale) || "");

    const lessonType = safeString(lesson.lessonType || assignment.lessonType).toLowerCase().trim();
    const taskType = safeString(lesson.taskType || assignment.taskType).toLowerCase().trim();
    const mathWorksheet = isMathWorksheet(lesson.mathWorksheet) ? (lesson.mathWorksheet as MathWorksheet) : null;

    const isGeometry = lessonType === "math_geometry" || taskType === "math_geometry" || !!mathWorksheet;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = pickModel();

    if (isGeometry) {
      const answersByTaskId = readAnswerMap(subDoc.answersByTaskId);
      const geometryAuto = (subDoc.auto ?? null) as GeometryAutoResult | null;

      const systemPrompt = buildGeometrySystemPrompt(locale);
      const userContent = buildGeometryUserContent({
        lang: locale,
        contentLanguage,
        lessonTitle,
        level,
        languageHint,
        mathWorksheet,
        geometryAuto,
        answersByTaskId,
      });

      const resp = await client.responses.create({
        model,
        temperature: 0.3,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      });

      const textOut = cleanAiFeedback((resp.output_text || "").trim());
      if (!textOut) return json({ error: "Empty AI response" }, 502);

      const payload = {
        aiFeedback: {
          text: textOut,
          updatedAt: FieldValue.serverTimestamp(),
          teacherUid: uid,
          createdAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      };

      const batch = db.batch();
      batch.set(subRef, payload, { merge: true });
      batch.set(db.collection("spaceSubmissions").doc(subId), payload, { merge: true });
      await batch.commit();

      await consumeServerFeature({
        db,
        uid,
        feature: "ai_feedback",
      });

      return json({ text: textOut }, 200);
    }

    const t = getPromptText(locale);
    const tasks = safeTasksArray(lesson.tasks);
    const answers = readAnswerMap(subDoc.answers);
    const answersByTaskId = readAnswerMap(subDoc.answersByTaskId);

    const openItems = tasks
      .slice()
      .sort((x, y) => Number(x?.order ?? 999) - Number(y?.order ?? 999))
      .map((task, idx) => {
        const stableId = getStableTaskId(task, idx);
        const type = safeString(task?.type || "open");
        if (!isOpenLike(type)) return null;

        const prompt = safeString(task?.prompt);
        const ans = readTaskAnswer({ answers, answersByTaskId, task, stableId, idx });

        return {
          n: Number(task?.order ?? idx + 1),
          prompt: prompt.trim(),
          answer: ans,
        };
      })
      .filter(Boolean) as Array<{ n: number; prompt: string; answer: string }>;

    const readingTasks = tasks
      .slice()
      .sort((x, y) => Number(x?.order ?? 999) - Number(y?.order ?? 999))
      .filter((task) => isReadingTestType(safeString(task?.type)));

    const sourceText = safeString(lesson.sourceText) || safeString(lesson.text) || "";
    const sourceWordCount = countWords(sourceText);

    const autoResultat = summarizeAutoResult(subDoc.auto, locale);

    const readingTimeLimitSeconds = safeNumber(subDoc.readingTestTimeLimitSeconds);
    const readingTimeUsedSeconds = safeNumber(subDoc.readingTestTimeUsedSeconds) ?? safeNumber(subDoc.timeSpentSeconds);
    const readingTimedOut = safeBoolean(subDoc.readingTestTimedOut);
    const readingSubmittedManually = safeBoolean(subDoc.readingTestSubmittedManually);

    const timeSignal = buildTimeSignal(sourceWordCount, readingTimeUsedSeconds);
    const isReadingTest = lessonType === "reading_test" || readingTasks.length > 0;
    const isImageWriting = lessonType === "image_writing";

    const systemPrompt = isReadingTest ? buildReadingSystemPrompt(locale) : buildGeneralSystemPrompt(locale);

    const openTasksBlock =
      openItems.length > 0
        ? openItems
          .map(
            (x) =>
              `#${x.n}\n` +
              `${t.task}: ${x.prompt || t.noPrompt}\n` +
              `${t.answer}: ${x.answer || t.notAnswered}`
          )
          .join("\n\n")
        : t.noOpenAnswers;

    const readingModeBlock = isReadingTest
      ? [
        `${t.readingMetadata}:`,
        `- ${t.wordCount}: ${sourceWordCount || t.unknown}`,
        `- ${t.timeLimit}: ${readingTimeLimitSeconds != null ? `${readingTimeLimitSeconds} (${formatDuration(readingTimeLimitSeconds)})` : t.unknown}`,
        `- ${t.timeUsed}: ${readingTimeUsedSeconds != null ? `${readingTimeUsedSeconds} (${formatDuration(readingTimeUsedSeconds)})` : t.unknown}`,
        `- ${t.submittedManually}: ${readingSubmittedManually === true ? t.yes : readingSubmittedManually === false ? t.no : t.unknown}`,
        `- ${t.timedOut}: ${readingTimedOut === true ? t.yes : readingTimedOut === false ? t.no : t.unknown}`,
        `- ${timeSignal.summary}`,
      ].join("\n")
      : "";

    const taskOverviewBlock =
      tasks.length > 0
        ? tasks
          .slice()
          .sort((x, y) => Number(x?.order ?? 999) - Number(y?.order ?? 999))
          .map((task, idx) => {
            const type = safeString(task.type || "open");
            const stableId = getStableTaskId(task, idx);
            const prompt = safeString(task.prompt);
            const rawAnswer = readTaskAnswer({ answers, answersByTaskId, task, stableId, idx });
            const answer = summarizeChoiceTask(task, rawAnswer, locale);

            return `#${task.order ?? idx + 1} [${type}] ${prompt || t.noPrompt}\n${t.answer}: ${answer}`;
          })
          .join("\n\n")
        : t.noTasksFound;

    const imageTask = safeImageTasksArray(lesson.imageTasks)[0] ?? null;
    const imageWritingAnswer =
      openItems.find((item) => item.answer.trim())?.answer.trim() ||
      Object.values(answers)
        .map((value) => asText(value).trim())
        .find(Boolean) ||
      Object.values(answersByTaskId)
        .map((value) => asText(value).trim())
        .find(Boolean) ||
      "";

    const userContent = isImageWriting
      ? buildImageWritingUserContent({
        lang: locale,
        contentLanguage,
        languageHint,
        lessonTitle,
        level,
        taskType,
        imageTask,
        studentAnswer: imageWritingAnswer,
      })
      : isReadingTest
      ? buildReadingUserContent({
        lang: locale,
        contentLanguage,
        level,
        languageHint,
        lessonTitle,
        autoResultat,
        sourceText,
        readingModeBlock,
        taskOverviewBlock,
        openTasksBlock,
      })
      : buildGeneralUserContent({
        lang: locale,
        contentLanguage,
        languageHint,
        lessonTitle,
        autoResultat,
        sourceText,
        taskOverviewBlock,
        openTasksBlock,
      });

    const resp = await client.responses.create({
      model,
      temperature: 0.3,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const textOut = cleanAiFeedback((resp.output_text || "").trim());
    if (!textOut) return json({ error: "Empty AI response" }, 502);

    const payload = {
      aiFeedback: {
        text: textOut,
        updatedAt: FieldValue.serverTimestamp(),
        teacherUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.set(subRef, payload, { merge: true });
    batch.set(db.collection("spaceSubmissions").doc(subId), payload, { merge: true });
    await batch.commit();

    await consumeServerFeature({
      db,
      uid,
      feature: "ai_feedback",
    });

    return json({ text: textOut }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Unknown error" }, 500);
  }
}
