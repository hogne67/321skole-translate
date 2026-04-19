// app/api/feedback/route.ts
import OpenAI from "openai";

export const runtime = "nodejs";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function toErrorString(err: unknown): string {
  if (!err) return "Feedback failed";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const message = typeof o.message === "string" ? o.message : "";
    const code = typeof o.code === "string" ? o.code : "";
    return message || code || "Feedback failed";
  }

  return "Feedback failed";
}

function pickString(obj: unknown, keys: string[]) {
  const rec = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;

  for (const k of keys) {
    const v = rec?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

// Try to stringify unknown structured objects (e.g., autograde maps) into readable text.
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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as unknown;

    const lesetekst = pickString(body, ["lesetekst", "leseTekst", "sourceText", "text"]);
    const oppgave = pickString(body, ["oppgave", "prompt", "task"]);
    const svar = pickString(body, ["svar", "answer"]);
    const nivå = pickString(body, ["nivå", "level"]) || "A2";

    // NEW: locale from client
    const localeRaw = pickString(body, ["locale", "lang", "language", "uiLocale"]) || "no";
    const locale = normalizeLocale(localeRaw);

    const autoResultat = pickAnyAsText(body, [
      "autoResultat",
      "autoResult",
      "autoGradeSummary",
      "autoGrade",
      "autograde",
      "result",
      "score",
    ]);

    const oppgaveType = pickString(body, ["oppgaveType", "taskType", "type"]);

    if (!lesetekst) return Response.json({ error: "Mangler lesetekst." }, { status: 400 });
    if (!oppgave) return Response.json({ error: "Mangler oppgave." }, { status: 400 });
    if (!svar && !autoResultat) {
      return Response.json({ error: "Mangler svar." }, { status: 400 });
    }

    const systemPrompt = buildSystemPrompt(locale);

    const userContent =
      `CEFR level: ${nivå}\n` +
      (oppgaveType ? `Task type (hint): ${oppgaveType}\n` : "") +
      (autoResultat
        ? `\nAuto result (from automatic grading):\n${autoResultat}\n`
        : "\nAuto result: (not provided)\n") +
      `\nReading text (context):\n${lesetekst}\n\n` +
      `Task:\n${oppgave}\n\n` +
      `Student open answer:\n${svar}\n`;

    const r = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const feedback = r.output_text?.trim() ?? "";
    return Response.json({ feedback, locale });
  } catch (err: unknown) {
    console.error("Feedback route error:", err);
    return Response.json({ error: toErrorString(err) }, { status: 500 });
  }
}