// app/api/teacher/ai-feedback/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import OpenAI from "openai";
import { FieldValue } from "firebase-admin/firestore";

type SourceType = "myContent" | "library";
type TaskType = "mcq" | "truefalse" | "open";

type Role = "student" | "teacher" | "admin" | "parent" | "creator";

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

type AnswersMap = Record<string, unknown>;

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
  return typeof v === "object" && v !== null;
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

function getStableTaskId(t: Task, idx: number): string {
  if (t?.id != null && String(t.id).trim()) return String(t.id).trim();

  const orderPart = t?.order != null ? String(t.order) : "x";
  const promptPart = typeof t?.prompt === "string" ? t.prompt.trim().slice(0, 80) : "";
  if (promptPart) return `${orderPart}__${promptPart}`;

  return `${orderPart}__idx${idx}`;
}

function readAnswerMap(a: unknown): AnswersMap {
  if (a && typeof a === "object" && !Array.isArray(a)) return a as AnswersMap;
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

function isOpenLike(type: string): boolean {
  const t = type.toLowerCase();
  return t === "open" || t === "text" || t === "writing" || t === "short_answer";
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

function pickModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function requireEnv() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
}

function readLegacyRole(profile: Record<string, unknown>): Role | null {
  const roles = profile["roles"];
  if (!isRecord(roles)) return null;

  if (roles["admin"] === true) return "admin";
  if (roles["teacher"] === true) return "teacher";
  if (roles["creator"] === true) return "creator";
  if (roles["parent"] === true) return "parent";
  if (roles["student"] === true) return "student";
  return null;
}

function readRole(profile: unknown): Role | null {
  if (!isRecord(profile)) return null;

  const r = profile["role"];
  if (r === "student" || r === "teacher" || r === "admin" || r === "parent" || r === "creator") {
    return r;
  }

  return readLegacyRole(profile);
}

function pickAnyAsText(obj: unknown, keys: string[]): string {
  const rec = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  for (const k of keys) {
    const v = rec?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object") {
      try {
        const json = JSON.stringify(v, null, 2);
        if (json && json !== "{}") return json;
      } catch {
        // ignore
      }
    }
  }
  return "";
}

function normalizeLocale(raw: string): "no" | "en" | "pt" {
  const v = (raw || "").toLowerCase().trim();
  if (v === "en") return "en";
  if (v === "pt" || v === "pt-br" || v === "pt_br") return "pt";
  return "no";
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

function buildSystemPrompt(lang: "no" | "en" | "pt") {
  if (lang === "en") {
    return [
      "You are an experienced Norwegian language teacher.",
      "Address the student directly using 'you'. Be supportive, clear, and motivating.",
      "Give short, precise, and helpful feedback on the student's work.",
      "Adapt your language and expectations to the provided CEFR level.",
      "",
      "IMPORTANT:",
      "- Do NOT write a full corrected version of the entire text.",
      "- You MAY comment briefly on automatically graded reading tasks, but do not spend much space explaining each item.",
      "- Focus first on reading result/understanding, then on any open/free-text answers if present.",
      "- Use: LOW / MEDIUM / HIGH achievement (relative to the CEFR level).",
      "",
      "ABOUT TIME / READING SPEED:",
      "- Time is only a SUPPORTIVE signal.",
      "- Never conclude quality from time alone.",
      "- A high score + slow time may mean careful reading.",
      "- A low score + very fast time may mean the student read too quickly.",
      "- A high score + normal/fast time may suggest secure reading fluency.",
      "- Be cautious and phrase time observations as indications, not facts.",
      "",
      "Answer using EXACT headings:",
      "1) AUTO RESULT, READING COMPREHENSION AND CEFR",
      "- Summarize the auto result.",
      "- If timing data exists, comment briefly on what the time may indicate about reading pace and strategy.",
      "- Link the result to CEFR reading skills at the given level.",
      "- Give a short judgement (1–3 sentences) about reading comprehension based mainly on the auto result, and secondarily on time.",
      "",
      "2) OPEN ANSWERS – ACADEMIC ASSESSMENT",
      "- If open answers exist, evaluate them.",
      "- If there are no open answers, say that the assessment is mainly based on reading result and automatic scoring.",
      "a) Does the student answer the task?",
      "- 1–2 sentences.",
      "b) Grammar and spelling (show error -> correction)",
      '- List the most important issues as: "error" -> "correct" (max 6 bullets).',
      "c) Punctuation",
      "- Point out missing / incorrect punctuation and give 2–4 concrete tips.",
      "",
      "3) LEVEL AND NEXT-STEP PROGRESSION (CEFR)",
      "- Choose one: LOW / MEDIUM / HIGH (relative to the stated CEFR level).",
      "- Justify briefly with 2–3 bullets (reading result, language if relevant, pace/strategy if relevant).",
      "",
      "NEXT STEP:",
      "- Give 1–2 realistic tips for the next natural step.",
      "- Keep tips concrete, short, and doable.",
      "",
      "Keep it concise. No long theory explanations.",
    ].join("\n");
  }

  if (lang === "pt") {
    return [
      "Você é um professor experiente de norueguês/língua.",
      "Fale diretamente com o aluno usando 'você'. Seja claro, encorajador e específico.",
      "Dê um feedback curto, preciso e útil sobre o trabalho do aluno.",
      "Adapte sua linguagem e exigências ao nível CEFR informado.",
      "",
      "IMPORTANTE:",
      "- NÃO faça uma versão completa corrigida do texto inteiro.",
      "- Você PODE comentar brevemente o resultado automático das tarefas de leitura, mas sem explicar item por item.",
      "- Foque primeiro no resultado de leitura/compreensão e depois nas respostas abertas, se existirem.",
      "- Use: BAIXO / MÉDIO / ALTO desempenho (em relação ao nível CEFR).",
      "",
      "SOBRE TEMPO / VELOCIDADE DE LEITURA:",
      "- O tempo é apenas um sinal de apoio.",
      "- Nunca conclua a qualidade apenas pelo tempo.",
      "- Pontuação alta + tempo lento pode indicar leitura cuidadosa.",
      "- Pontuação baixa + tempo muito rápido pode indicar leitura rápida demais.",
      "- Pontuação alta + tempo normal/rápido pode indicar fluência de leitura mais segura.",
      "- Seja cauteloso e formule observações sobre tempo como indícios, não como fatos absolutos.",
      "",
      "Responda com estes títulos EXATOS:",
      "1) RESULTADO AUTOMÁTICO, COMPREENSÃO DE LEITURA E CEFR",
      "- Resuma o resultado automático.",
      "- Se houver dados de tempo, comente brevemente o que o tempo pode indicar sobre ritmo e estratégia de leitura.",
      "- Relacione o resultado ao nível CEFR.",
      "- Dê uma avaliação curta (1–3 frases) baseada principalmente no resultado automático e, em segundo lugar, no tempo.",
      "",
      "2) RESPOSTAS ABERTAS – AVALIAÇÃO",
      "- Se houver respostas abertas, avalie-as.",
      "- Se não houver respostas abertas, diga que a avaliação se baseia principalmente no resultado de leitura e na correção automática.",
      "a) O aluno responde à tarefa?",
      "b) Gramática e ortografia (erro -> correto)",
      "c) Pontuação",
      "",
      "3) NÍVEL E PRÓXIMO PASSO (CEFR)",
      "- Escolha BAIXO / MÉDIO / ALTO.",
      "- Justifique com 2–3 itens (resultado de leitura, linguagem se relevante, ritmo/estratégia se relevante).",
      "",
      "PRÓXIMO PASSO:",
      "- Dê 1–2 dicas realistas e curtas.",
      "",
      "Seja conciso.",
    ].join("\n");
  }

  return [
    "Du er en erfaren norsklærer/språklærer. Gi kort, presis og nyttig tilbakemelding på elevens arbeid.",
    "Bruk dus-form og skriv direkte til eleven (bruk 'du'). Vær støttende, konkret og motiverende.",
    "Tilpass språk og krav til CEFR-nivået som er oppgitt.",
    "",
    "VIKTIG:",
    "- IKKE lag en korrigert versjon av hele teksten.",
    "- Du KAN kommentere kort på automatisk rettede leseoppgaver, men ikke bruk mye plass på å forklare hvert enkelt spørsmål.",
    "- Fokuser først på leseresultat/leseforståelse, deretter på åpne svar hvis de finnes.",
    "- Bruk begrepene: LAV / MIDDELS / HØY målopnåelse (i forhold til CEFR-nivå).",
    "",
    "OM TID / LESEFART:",
    "- Tid er bare et STØTTESIGNAL.",
    "- Du skal aldri konkludere kun ut fra tid.",
    "- Høy score + lang tid kan tyde på grundig og strategisk lesing.",
    "- Lav score + svært kort tid kan tyde på at eleven leste for raskt eller overflatisk.",
    "- Høy score + normal/rask tid kan tyde på trygg leseflyt.",
    "- Formuler alltid tidsvurderinger forsiktig som tegn/indikasjoner, ikke som sikre fakta.",
    "",
    "Svar i denne strukturen (bruk nøyaktige overskrifter):",
    "1) AUTORESULTAT, LESEFORSTÅELSE OG CEFR",
    "- Oppsummer autoresultatet.",
    "- Hvis tidsdata finnes, kommenter kort hva tiden kan si om lesehastighet og strategi.",
    "- Knytt resultatet til CEFR-leseforståelse for oppgitt nivå.",
    "- Gi en kort vurdering (1–3 setninger) av leseforståelsen basert først og fremst på autoresultatet, og deretter på tid.",
    "",
    "2) ÅPNE OPPGAVER – FAGLIG VURDERING",
    "- Hvis det finnes åpne svar, vurder dem.",
    "- Hvis det ikke finnes åpne svar, si tydelig at vurderingen hovedsakelig bygger på leseoppgavene og autoresultatet.",
    "a) Svarer eleven på oppgaven?",
    "- Gi 1–2 setninger.",
    "b) Grammatikk og stavefeil (vis feil -> riktig)",
    '- List opp de viktigste feilene som: "feil" -> "riktig" (maks 6 punkt).',
    "c) Tegnsetting",
    "- Pek på mangler i punktum/komma/spørsmålstegn, og gi 2–4 konkrete råd.",
    "",
    "3) NIVÅ OG VIDERE PROGRESJON (CEFR)",
    "- Sett én: LAV / MIDDELS / HØY (i forhold til oppgitt CEFR-nivå).",
    "- Begrunn kort med 2–3 punkter (leseresultat, språk hvis relevant, tempo/strategi hvis relevant).",
    "",
    "VIDERE PROGRESJON:",
    "- Gi 1–2 konkrete og realistiske råd for neste naturlige steg.",
    "- Rådene skal være korte, konkrete og gjennomførbare.",
    "",
    "Hold det konsist. Ikke bruk lange teoriforklaringer.",
  ].join("\n");
}

function readAutoGradeSummaryFromSubmission(subDoc: Record<string, unknown>): string {
  const autoResultat = pickAnyAsText(subDoc, [
    "autoResultat",
    "autoResult",
    "autoGradeSummary",
    "autoGradeSummaryText",
    "autoGradeDetails",
    "autoGrade",
    "autograde",
    "autogradeSummary",
    "autogradeText",
    "result",
    "score",
    "auto",
  ]);

  return autoResultat;
}

type Body = {
  spaceId: string;
  assignmentId: string;
  subId: string;
  locale?: string;
};

export async function POST(req: Request) {
  try {
    requireEnv();

    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization bearer token" }, 401);

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const spaceId = safeString(body.spaceId).trim();
    const assignmentId = safeString(body.assignmentId).trim();
    const subId = safeString(body.subId).trim();
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
    const answers = readAnswerMap(subDoc.answers);

    const aRef = db.collection("spaces").doc(spaceId).collection("lessons").doc(assignmentId);
    const aSnap = await aRef.get();
    const assignment = (aSnap.exists ? aSnap.data() || {} : {}) as Record<string, unknown>;

    const sourceType = (safeString(assignment.sourceType) || "library") as SourceType;
    const sourceId = safeString(assignment.sourceId).trim();
    if (!sourceId) return json({ error: "Assignment missing sourceId" }, 400);

    const lessonRef =
      sourceType === "library"
        ? db.collection("published_lessons").doc(sourceId)
        : db.collection("lessons").doc(sourceId);

    const lessonSnap = await lessonRef.get();
    const lesson = (lessonSnap.exists ? lessonSnap.data() || {} : {}) as Record<string, unknown>;
    const tasks = safeTasksArray(lesson.tasks);

    const openItems = tasks
      .slice()
      .sort((x, y) => Number(x?.order ?? 999) - Number(y?.order ?? 999))
      .map((task, idx) => {
        const stableId = getStableTaskId(task, idx);
        const type = safeString(task?.type || "open");
        if (!isOpenLike(type)) return null;

        const prompt = safeString(task?.prompt);
        const ans = asText(answers[stableId]).trim();

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

    const lessonTitle = safeString(lesson.title) || safeString(assignment.title) || "Oppgave";
    const level = safeString(lesson.level) || safeString(assignment.level) || "A2";
    const languageHint = safeString(lesson.language) || safeString(assignment.language) || "";
    const sourceText = safeString(lesson.sourceText) || safeString(lesson.text) || "";
    const sourceWordCount = countWords(sourceText);

    const autoResultat = readAutoGradeSummaryFromSubmission(subDoc);

    const readingTimeLimitSeconds = safeNumber(subDoc.readingTestTimeLimitSeconds);
    const readingTimeUsedSeconds =
      safeNumber(subDoc.readingTestTimeUsedSeconds) ?? safeNumber(subDoc.timeSpentSeconds);
    const readingTimedOut = safeBoolean(subDoc.readingTestTimedOut);
    const readingSubmittedManually = safeBoolean(subDoc.readingTestSubmittedManually);

    const timeSignal = buildTimeSignal(sourceWordCount, readingTimeUsedSeconds);
    const isReadingTest =
      safeString(lesson.lessonType).toLowerCase() === "reading_test" || readingTasks.length > 0;

    const systemPrompt = buildSystemPrompt(locale);

    const openTasksBlock =
      openItems.length > 0
        ? openItems
            .map(
              (x) =>
                `#${x.n}\n` +
                `OPPGAVE: ${x.prompt || "(ingen prompt)"}\n` +
                `SVAR: ${x.answer || "(ikke besvart)"}`
            )
            .join("\n\n")
        : "(Ingen åpne svar i denne innleveringen.)";

    const readingModeBlock = isReadingTest
      ? [
          "Reading test metadata:",
          `- Reading text word count: ${sourceWordCount || "unknown"}`,
          `- Time limit: ${readingTimeLimitSeconds != null ? `${readingTimeLimitSeconds} seconds (${formatDuration(readingTimeLimitSeconds)})` : "unknown"}`,
          `- Time used: ${readingTimeUsedSeconds != null ? `${readingTimeUsedSeconds} seconds (${formatDuration(readingTimeUsedSeconds)})` : "unknown"}`,
          `- Submitted manually: ${readingSubmittedManually === true ? "yes" : readingSubmittedManually === false ? "no" : "unknown"}`,
          `- Timed out: ${readingTimedOut === true ? "yes" : readingTimedOut === false ? "no" : "unknown"}`,
          `- ${timeSignal.summary}`,
        ].join("\n")
      : "Reading test metadata: not a reading test or no timing data.";

    const taskOverviewBlock =
      tasks.length > 0
        ? tasks
            .slice()
            .sort((x, y) => Number(x?.order ?? 999) - Number(y?.order ?? 999))
            .map((task, idx) => {
              const type = safeString(task.type || "open");
              const stableId = getStableTaskId(task, idx);
              const prompt = safeString(task.prompt);
              const answer = asText(answers[stableId]).trim() || "(ikke besvart)";
              return `#${task.order ?? idx + 1} [${type}] ${prompt || "(ingen prompt)"}\nSVAR: ${answer}`;
            })
            .join("\n\n")
        : "(Ingen oppgaver funnet.)";

    const userContent =
      `CEFR level: ${level}\n` +
      (languageHint ? `Language hint: ${languageHint}\n` : "") +
      `Lesson title: ${lessonTitle}\n` +
      `Is reading test: ${isReadingTest ? "yes" : "no"}\n\n` +
      `Auto result (from automatic grading):\n${autoResultat || "(not provided)"}\n\n` +
      `Reading text (context):\n${sourceText.trim() || "(not provided)"}\n\n` +
      `${readingModeBlock}\n\n` +
      `All tasks and student answers:\n${taskOverviewBlock}\n\n` +
      `Open tasks and answers:\n${openTasksBlock}\n\n` +
      `Instruction:\n` +
      `Write teacher feedback in the required structure. ` +
      `Base the reading assessment mainly on the auto result. ` +
      `Use time only as a cautious supporting signal. ` +
      `If there are open answers, assess them too. ` +
      `If there are no open answers, still give a useful reading-test evaluation based on auto result, CEFR and timing.\n`;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = pickModel();

    const resp = await client.responses.create({
      model,
      temperature: 0.3,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const textOut = (resp.output_text || "").trim();
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

    return json({ text: textOut }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Unknown error" }, 500);
  }
}