// app/api/teacher/ai-feedback/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import OpenAI from "openai";
import { FieldValue } from "firebase-admin/firestore";

type SourceType = "myContent" | "library";
type TaskType = "mcq" | "truefalse" | "open";

type Task = {
  id?: string;
  order?: number;
  type?: TaskType | string;
  prompt?: string;
  options?: unknown[];
  correctAnswer?: unknown;
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
  return t === "open" || t === "text" || t === "writing";
}

function pickModel(): string {
  // hvis du vil låse den til samme som /api/feedback, sett f.eks OPENAI_MODEL=gpt-4o-mini
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function requireEnv() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
}

function hasAcceptedAttestation(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  const att = profile["attestation"];
  if (!isRecord(att)) return false;
  return Boolean(att["acceptedAt"]);
}

function readMode(profile: unknown): string {
  if (!isRecord(profile)) return "";
  return safeString(profile["mode"]);
}

/** Try to stringify unknown structured objects (e.g., autograde maps) into readable text. */
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

/** Samme struktur/overskrifter som /api/feedback */
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
      "- Do NOT explain or correct multiple-choice / true-false; those are auto-graded.",
      "- Focus on open/free-text answers (the student's writing).",
      "- Use: LOW / MEDIUM / HIGH achievement (relative to the CEFR level).",
      "",
      "Answer using EXACT headings:",
      "1) AUTO RESULT, READING COMPREHENSION AND CEFR",
      "- Summarize the auto result (if present).",
      "- Link the result to CEFR reading skills at the given level:",
      '  • A1–A2: understands very simple information and key words/short sentences.',
      '  • B1: understands main points and important details in clear, simple texts.',
      '  • B2: understands most details, implicit meaning and connections in more complex texts.',
      '  • C1–C2: understands nuanced meaning, tone, and complex/long texts with high precision.',
      "- Give a short judgement (1–2 sentences) about reading comprehension based on the auto result.",
      "",
      "2) OPEN ANSWERS – ACADEMIC ASSESSMENT",
      "a) Does the student answer the question?",
      "- 1–2 sentences.",
      "b) Grammar and spelling (show error -> correction)",
      '- List the most important issues as: "error" -> "correct" (max 6 bullets).',
      "c) Punctuation",
      "- Point out missing / incorrect punctuation and give 2–4 concrete tips.",
      "",
      "3) LEVEL AND NEXT-STEP PROGRESSION (CEFR)",
      "- Choose one: LOW / MEDIUM / HIGH (relative to the stated CEFR level).",
      "- Justify briefly with 2–3 bullets (content, language/grammar, coherence).",
      "",
      "NEXT STEP:",
      "- Give 1–2 realistic tips for the NEXT natural step above the student's current level:",
      "  • A1 → A2: simple full sentences, correct present tense, basic word order.",
      "  • A2 → B1: more varied vocabulary, correct verb tenses, better linking words.",
      "  • B1 → B2: more precise grammar, varied sentence structure, clearer structure.",
      "  • B2 → C1: nuance, more complex sentences, precise punctuation and tense use.",
      "  • C1: precision, idiomatic usage, stylistic control and natural flow.",
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
      "- NÃO faça uma versão completa “corrigida” do texto inteiro.",
      "- NÃO explique nem corrija múltipla escolha / verdadeiro-falso; isso é corrigido automaticamente.",
      "- Foque nas respostas abertas (texto livre).",
      "- Use: BAIXO / MÉDIO / ALTO desempenho (em relação ao CEFR).",
      "",
      "Responda com estes títulos EXATOS:",
      "1) RESULTADO AUTOMÁTICO, COMPREENSÃO DE LEITURA E CEFR",
      "- Resuma o resultado automático (se existir).",
      "- Relacione o resultado às habilidades de leitura no CEFR do nível informado:",
      "  • A1–A2: entende informação muito simples, palavras-chave e frases curtas.",
      "  • B1: entende ideias principais e detalhes importantes em textos claros e simples.",
      "  • B2: entende a maioria dos detalhes, sentidos implícitos e conexões em textos mais complexos.",
      "  • C1–C2: entende nuances, tom e textos longos/complexos com alta precisão.",
      "- Dê um julgamento curto (1–2 frases) sobre a compreensão de leitura com base no resultado.",
      "",
      "2) RESPOSTAS ABERTAS – AVALIAÇÃO",
      "a) O aluno responde à tarefa?",
      "- 1–2 frases.",
      "b) Gramática e ortografia (mostrar erro -> correto)",
      '- Liste os pontos principais como: "erro" -> "correto" (máx. 6 itens).',
      "c) Pontuação",
      "- Mostre onde falta/erra pontuação e dê 2–4 dicas concretas.",
      "",
      "3) NÍVEL E PRÓXIMO PASSO (CEFR)",
      "- Escolha um: BAIXO / MÉDIO / ALTO (em relação ao nível informado).",
      "- Justifique com 2–3 itens (conteúdo, linguagem/gramática, coesão).",
      "",
      "PRÓXIMO PASSO:",
      "- Dê 1–2 dicas realistas para o PRÓXIMO passo natural acima do nível atual:",
      "  • A1 → A2: frases simples completas, presente correto, ordem básica das palavras.",
      "  • A2 → B1: vocabulário mais variado, tempos verbais corretos, conectores melhores.",
      "  • B1 → B2: gramática mais precisa, variedade de estruturas, texto mais bem organizado.",
      "  • B2 → C1: nuances, frases mais complexas, pontuação e tempos mais precisos.",
      "  • C1: precisão, expressões idiomáticas, controle estilístico e fluidez natural.",
      "- Dicas devem ser concretas, curtas e realizáveis.",
      "",
      "Seja conciso. Sem explicações longas de teoria.",
    ].join("\n");
  }

  // no (default)
  return [
    "Du er en erfaren norsklærer/språklærer. Gi kort, presis og nyttig tilbakemelding på elevens arbeid.",
    "Bruk dus-form og skriv direkte til eleven (bruk 'du'). Vær støttende, konkret og motiverende.",
    "Tilpass språk og krav til CEFR-nivået som er oppgitt.",
    "",
    "VIKTIG:",
    "- IKKE lag en 'korrigert versjon' av hele teksten.",
    "- IKKE forklar eller rett flervalg/true-false; de rettes automatisk.",
    "- Fokuser på åpne oppgaver (elevens fritekstsvar).",
    "- Bruk begrepene: LAV / MIDDELS / HØY målopnåelse (i forhold til CEFR-nivå).",
    "",
    "Svar i denne strukturen (bruk nøyaktige overskrifter):",
    "1) AUTORESULTAT, LESEFORSTÅELSE OG CEFR",
    "- Oppsummer autoresultatet (hvis det finnes).",
    "- Knytt resultatet til CEFR-leseforståelse for oppgitt nivå:",
    "  • A1–A2: forstår svært enkel informasjon, nøkkelord og korte setninger.",
    "  • B1: forstår hovedpoeng og viktige detaljer i klare, enkle tekster.",
    "  • B2: forstår de fleste detaljer, antydninger og sammenhenger i mer komplekse tekster.",
    "  • C1–C2: forstår nyanser, tone og komplekse/lange tekster med høy presisjon.",
    "- Gi en kort vurdering (1–2 setninger) av leseforståelsen basert på autoresultatet.",
    "",
    "2) ÅPNE OPPGAVER – FAGLIG VURDERING",
    "a) Svarer eleven på oppgaven?",
    "- Gi 1–2 setninger.",
    "b) Grammatikk og stavefeil (vis feil -> riktig)",
    '- List opp de viktigste feilene som: "feil" -> "riktig" (maks 6 punkt).',
    "c) Tegnsetting",
    "- Pek på hvor det mangler punktum/komma/spørsmålstegn, og gi 2–4 konkrete råd.",
    "",
    "3) NIVÅ OG VIDERE PROGRESJON (CEFR)",
    "- Sett én: LAV / MIDDELS / HØY (i forhold til oppgitt CEFR-nivå).",
    "- Begrunn kort med 2–3 punkter (innhold, språk/grammatikk, sammenheng).",
    "",
    "VIDERE PROGRESJON:",
    "- Gi 1–2 konkrete og realistiske råd for neste naturlige nivå over elevens nåværende nivå:",
    "  • A1 → fokus på enkle hele setninger, riktig verb i presens, grunnleggende ordstilling.",
    "  • A2 → mer variert ordforråd, riktig bøying av verb i ulike tider, bedre setningsbinding.",
    "  • B1 → mer presis grammatikk, variert setningsstruktur, sammenhengende tekst med tydelig struktur.",
    "  • B2 → nyansering, mer komplekse setninger, korrekt tegnsetting og presis bruk av tider.",
    "  • C1 → presist og variert språk, idiomatiske uttrykk, stilistisk kontroll og naturlig flyt.",
    "- Rådene skal være konkrete, korte og gjennomførbare.",
    "",
    "Hold det konsist. Ikke bruk lange teoriforklaringer.",
  ].join("\n");
}

function readAutoGradeSummaryFromSubmission(subDoc: Record<string, unknown>): string {
  // Støtt både gamle/nye navn – og objektet "auto" som du allerede lagrer.
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
  locale?: string; // ✅ ny: for å styre språket som /api/feedback
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

    // ✅ Role check via user profile doc
    const profileSnap = await db.collection("users").doc(uid).get();
    const profile = profileSnap.exists ? profileSnap.data() : null;

    const mode = readMode(profile);
    const attOk = hasAcceptedAttestation(profile);

    const isTeacherish = mode === "teacher" || mode === "creator" || mode === "admin";
    if (!isTeacherish || !attOk) {
      return json({ error: "Not allowed (mode/attestation)" }, 403);
    }

    // ✅ Read submission
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

    // ✅ Read assignment
    const aRef = db.collection("spaces").doc(spaceId).collection("lessons").doc(assignmentId);
    const aSnap = await aRef.get();
    const assignment = (aSnap.exists ? aSnap.data() || {} : {}) as Record<string, unknown>;

    const sourceType = (safeString(assignment.sourceType) || "library") as SourceType;
    const sourceId = safeString(assignment.sourceId).trim();
    if (!sourceId) return json({ error: "Assignment missing sourceId" }, 400);

    // ✅ Read lesson (library vs myContent)
    const lessonRef =
      sourceType === "library"
        ? db.collection("published_lessons").doc(sourceId)
        : db.collection("lessons").doc(sourceId);

    const lessonSnap = await lessonRef.get();
    const lesson = (lessonSnap.exists ? lessonSnap.data() || {} : {}) as Record<string, unknown>;
    const tasks = safeTasksArray(lesson.tasks);

    // ✅ Filter open tasks + gather student answers
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

    if (openItems.length === 0) {
      const msg = "Ingen åpne oppgaver ble funnet i denne innleveringen (eller oppgavene mangler).";
      return json({ text: msg, skipped: true }, 200);
    }

    // ✅ Build prompt in SAME STYLE as /api/feedback
    const lessonTitle = safeString(lesson.title) || safeString(assignment.title) || "Oppgave";
    const level = safeString(lesson.level) || safeString(assignment.level) || "A2";
    const languageHint = safeString(lesson.language) || safeString(assignment.language) || "";
    const sourceText = safeString(lesson.sourceText) || safeString(lesson.text) || "";

    // auto result (autosvar/autograde) fra submission (viktig!)
    const autoResultat = readAutoGradeSummaryFromSubmission(subDoc);

    const systemPrompt = buildSystemPrompt(locale);

    // Vi gir AI én "oppgave-tekst" (samler alle åpne spørsmål/svar)
    const oppgaveTekst =
      `Oppgave: ${lessonTitle}\n` +
      (languageHint ? `Språk (hint): ${languageHint}\n` : "") +
      `Åpne deloppgaver:\n` +
      openItems
        .map(
          (x) =>
            `#${x.n}\n` +
            `OPPGAVE: ${x.prompt || "(ingen prompt)"}\n` +
            `SVAR: ${x.answer || "(ikke besvart)"}`
        )
        .join("\n\n");

    const userContent =
      `CEFR level: ${level}\n` +
      (autoResultat ? `\nAuto result (from automatic grading):\n${autoResultat}\n` : "\nAuto result: (not provided)\n") +
      (sourceText.trim() ? `\nReading text (context):\n${sourceText}\n\n` : "\nReading text (context): (not provided)\n\n") +
      `Task:\n${oppgaveTekst}\n`;

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

    // ✅ Save to Firestore (nested + index)
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