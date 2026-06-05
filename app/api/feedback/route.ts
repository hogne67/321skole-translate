// app/api/feedback/route.ts
import OpenAI from "openai";
import {
  buildReadingSignalsPayload,
  countReadingTestWords,
} from "@/lib/readingTests/readingSignals";

export const runtime = "nodejs";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Lang = "no" | "en" | "pt";

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

function pickRecord(obj: unknown, keys: string[]): Record<string, unknown> | null {
  const rec = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  for (const k of keys) {
    const v = rec?.[k];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return null;
}

function pickArray(obj: unknown, keys: string[]): unknown[] {
  const rec = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  for (const k of keys) {
    const v = rec?.[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function normalizeLocale(raw: string): Lang {
  const v = (raw || "").toLowerCase().trim();
  if (v === "en") return "en";
  if (v === "pt" || v === "pt-br" || v === "pt_br") return "pt";
  return "no";
}

function cleanAiFeedback(text: string): string {
  return text
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*\d+\)\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getHeadings(lang: Lang) {
  if (lang === "en") {
    return {
      h1: "AUTO RESULTS AND READING COMPREHENSION",
      h2: "RESPONSE TO THE TASK",
      h3: "GRAMMAR AND LANGUAGE",
      h4: "NEXT STEPS",
    };
  }

  if (lang === "pt") {
    return {
      h1: "RESULTADOS AUTOMÁTICOS E COMPREENSÃO DE LEITURA",
      h2: "RESPOSTA À TAREFA",
      h3: "GRAMÁTICA E LINGUAGEM",
      h4: "PRÓXIMOS PASSOS",
    };
  }

  return {
    h1: "AUTORESULTAT OG LESEFORSTÅELSE",
    h2: "SVAR PÅ OPPGAVEN",
    h3: "GRAMMATIKK OG SPRÅK",
    h4: "NESTE STEG",
  };
}

function getPromptText(lang: Lang) {
  if (lang === "en") {
    return {
      notProvided: "(not provided)",
      lessonText: "Reading text (context)",
      task: "Task",
      studentAnswer: "Student answer",
      autoResult: "Automatic result",
      level: "Level",
      taskType: "Task type hint",
      instruction: "Instruction",

      guidance:
        "Write short, supportive, and concrete feedback directly to the student using 'you'. Use plain text headings only. Do not use markdown, ###, bullet points, or numbered headings. Do not write a full corrected version of the whole answer. Do not act like an official examiner or give a final CEFR judgement. Use the stated CEFR level only as background guidance for expectations.",

      autoRule:
        "If automatic result data exists, use it actively. Summarize what the student appears to understand from multiple-choice, true/false, gap tasks, and other auto-graded tasks. Connect this carefully to reading comprehension, but do not overclaim. Treat automatic results as a strong signal for reading understanding, not as the whole picture.",

      taskClassificationRule:
        "Before you evaluate the answer, identify what kind of task this is. Use one of these internal categories: FACT, EXPLANATION, REFLECTION, or PROCEDURE. Adapt the feedback to that task type.",

      taskTypeGuidance:
        "If the task is FACT, judge correctness, relevance, and whether the answer stays within the required number or format. Do not ask for long explanations. If the task is EXPLANATION, look for clear reasoning and understanding. If the task is REFLECTION, look for relevance and support for the student's thinking. If the task is PROCEDURE, look for whether the student shows a sensible method or sequence.",

      taskRule:
        "Judge the student's answer in light of what the task actually asks for. Before commenting on length, first check the task requirement carefully.",

      lengthRule:
        "Respect the exact scope of the task. If the task asks for two sentences, three examples, five facts, a short answer, keywords, or another limited format, do not tell the student to write more than the task requires. Only ask for more development when the task itself asks for explanation, justification, comparison, reflection, or a more connected text.",

      relevanceRule:
        "Say clearly whether the student answers the task relevantly and within the required format. If something is missing, explain exactly what is missing: for example one missing point, unclear wording, or that only part of the task is answered.",

      grammarRule:
        "Use a separate grammar section. Give concrete and limited feedback on grammar, spelling, word order, verb forms, and punctuation when relevant. Point out only the most important issues. Choose a maximum of 3 to 5 important issues, and prioritize errors that affect understanding. Show short examples in the format: 'error' -> 'better form'. Do not overload the student.",

      nextStepRule:
        "Give 1 to 3 realistic next-step tips. These must fit the actual task type. For FACT tasks, focus on precision and correct language. For EXPLANATION tasks, focus on explaining more clearly and developing the answer when the task asks for it. For REFLECTION tasks, focus on relevance and support for ideas. For PROCEDURE tasks, focus on steps and structure. Do not tell the student to write longer answers if the task asked for short or limited answers.",

      finalInstruction:
        "Use these exact headings in the same language as the chosen locale. Keep the feedback concise, concrete, and fair.",
    };
  }

  if (lang === "pt") {
    return {
      notProvided: "(não informado)",
      lessonText: "Texto de leitura (contexto)",
      task: "Tarefa",
      studentAnswer: "Resposta do aluno",
      autoResult: "Resultado automático",
      level: "Nível",
      taskType: "Indicação do tipo de tarefa",
      instruction: "Instrução",

      guidance:
        "Escreva um feedback curto, encorajador e concreto diretamente para o aluno usando 'você'. Use apenas títulos em texto simples. Não use markdown, ###, marcadores ou títulos numerados. Não escreva uma versão totalmente corrigida da resposta. Não aja como um examinador oficial nem dê um julgamento final de CEFR. Use o nível CEFR informado apenas como orientação de fundo.",

      autoRule:
        "Se houver resultado automático, use-o ativamente. Resuma o que o aluno parece compreender a partir de múltipla escolha, verdadeiro/falso, lacunas e outras tarefas corrigidas automaticamente. Relacione isso com a compreensão de leitura de forma cuidadosa, sem exagerar. Trate os resultados automáticos como um sinal forte de compreensão de leitura, mas não como o quadro inteiro.",

      taskClassificationRule:
        "Antes de avaliar a resposta, identifique que tipo de tarefa é esta. Use internamente uma destas categorias: FATO, EXPLICAÇÃO, REFLEXÃO ou PROCEDIMENTO. Adapte o feedback ao tipo de tarefa.",

      taskTypeGuidance:
        "Se a tarefa for de FATO, avalie correção, relevância e se a resposta fica dentro do número ou formato pedido. Não peça explicações longas. Se a tarefa for de EXPLICAÇÃO, procure raciocínio claro e compreensão. Se a tarefa for de REFLEXÃO, procure relevância e apoio para as ideias do aluno. Se a tarefa for de PROCEDIMENTO, procure se o aluno mostra um método ou sequência adequada.",

      taskRule:
        "Julgue a resposta do aluno de acordo com o que a tarefa realmente pede. Antes de comentar o tamanho da resposta, verifique com cuidado a exigência da tarefa.",

      lengthRule:
        "Respeite exatamente o formato e a extensão pedidos pela tarefa. Se a tarefa pedir duas frases, três exemplos, cinco fatos, uma resposta curta, palavras-chave ou outro formato limitado, não diga ao aluno para escrever mais do que a tarefa exige. Peça mais desenvolvimento apenas quando a própria tarefa pedir explicação, justificativa, comparação, reflexão ou um texto mais conectado.",

      relevanceRule:
        "Diga com clareza se o aluno responde à tarefa de forma relevante e dentro do formato pedido. Se faltar algo, explique exatamente o que falta: por exemplo um ponto ausente, formulação pouco clara ou que apenas parte da tarefa foi respondida.",

      grammarRule:
        "Use uma seção separada de gramática. Dê feedback concreto e limitado sobre gramática, ortografia, ordem das palavras, formas verbais e pontuação quando for relevante. Aponte apenas os problemas mais importantes. Escolha no máximo 3 a 5 pontos importantes e priorize erros que prejudiquem a compreensão. Mostre exemplos curtos no formato: 'erro' -> 'forma melhor'. Não sobrecarregue o aluno.",

      nextStepRule:
        "Dê de 1 a 3 dicas realistas para o próximo passo. Elas devem combinar com o tipo real da tarefa. Para tarefas de FATO, foque em precisão e linguagem correta. Para tarefas de EXPLICAÇÃO, foque em explicar com mais clareza e desenvolver a resposta quando a tarefa pedir isso. Para tarefas de REFLEXÃO, foque em relevância e apoio para as ideias. Para tarefas de PROCEDIMENTO, foque em passos e estrutura. Não diga ao aluno para escrever respostas mais longas se a tarefa pedia respostas curtas ou limitadas.",

      finalInstruction:
        "Use estes títulos exatos no mesmo idioma do locale escolhido. Mantenha o feedback conciso, concreto e justo.",
    };
  }

  return {
    notProvided: "(ikke oppgitt)",
    lessonText: "Lesetekst (kontekst)",
    task: "Oppgave",
    studentAnswer: "Elevsvar",
    autoResult: "Autoresultat",
    level: "Nivå",
    taskType: "Hint om oppgavetype",
    instruction: "Instruksjon",

    guidance:
      "Skriv kort, støttende og konkret tilbakemelding direkte til eleven med 'du'. Bruk bare rene overskrifter som vanlig tekst. Ikke bruk markdown, ###, punktlister eller nummererte overskrifter. Ikke skriv en fullstendig korrigert versjon av hele svaret. Ikke opptre som en offisiell sensor og ikke gi en endelig CEFR-dom. Bruk oppgitt CEFR-nivå bare som en bakgrunn for forventninger.",

    autoRule:
      "Hvis autoresultat finnes, bruk det aktivt. Oppsummer hva eleven ser ut til å forstå ut fra flervalg, sant/usant, hulloppgaver og andre automatisk rettede oppgaver. Knytt dette forsiktig til leseforståelse, men uten å overtolke. Automatiske resultater skal regnes som et sterkt signal om leseforståelse, men ikke hele bildet.",

    taskClassificationRule:
      "Før du vurderer svaret, må du identifisere hvilken type oppgave dette er. Bruk internt én av disse kategoriene: FAKTA, FORKLARING, REFLEKSJON eller PROSEDYRE. Tilpass vurderingen etter oppgavetype.",

    taskTypeGuidance:
      "Hvis oppgaven er av typen FAKTA, skal du vurdere om svarene er korrekte, relevante og innenfor antall eller format. Du skal ikke kreve lange forklaringer. Hvis oppgaven er FORKLARING, skal du se etter om eleven forklarer sammenheng og viser forståelse. Hvis oppgaven er REFLEKSJON, skal du vurdere relevans og begrunnelse, ikke fasitsvar. Hvis oppgaven er PROSEDYRE, skal du vurdere om eleven viser en fornuftig framgangsmåte eller rekkefølge.",

    taskRule:
      "Vurder elevens svar ut fra hva oppgaven faktisk ber om. Før du kommenterer lengde, må du først sjekke oppgavekravet nøye.",

    lengthRule:
      "Respekter oppgavens nøyaktige ramme. Hvis oppgaven ber om to setninger, tre eksempler, fem fakta, et kort svar, nøkkelord eller et annet avgrenset format, skal du ikke be eleven skrive mer enn oppgaven krever. Be bare om mer utvikling når oppgaven selv ber om forklaring, begrunnelse, sammenligning, refleksjon eller mer sammenhengende tekst.",

    relevanceRule:
      "Si tydelig om eleven svarer relevant på oppgaven og innenfor formatet som er bedt om. Hvis noe mangler, forklar nøyaktig hva som mangler: for eksempel ett manglende poeng, uklar formulering eller at bare deler av oppgaven er besvart.",

    grammarRule:
      "Bruk et eget punkt for grammatikk. Gi konkret og begrenset tilbakemelding på grammatikk, rettskriving, ordstilling, verbformer og tegnsetting når det er relevant. Pek bare på de viktigste tingene. Velg maks 3 til 5 viktige feil, og prioriter feil som påvirker forståelsen. Vis korte eksempler i formatet: 'feil' -> 'bedre form'. Ikke overless eleven.",

    nextStepRule:
      "Gi 1 til 3 realistiske råd om neste steg. Rådene må passe til den faktiske oppgavetypen. For FAKTA-oppgaver skal rådene handle om presisjon og korrekt språk. For FORKLARING skal rådene handle om å forklare tydeligere og utdype når oppgaven ber om det. For REFLEKSJON skal rådene handle om relevans og begrunnelse. For PROSEDYRE skal rådene handle om steg og struktur. Ikke be eleven skrive lengre svar hvis oppgaven ba om korte eller avgrensede svar.",

    finalInstruction:
      "Bruk nøyaktig disse overskriftene på samme språk som valgt locale. Hold tilbakemeldingen kort, konkret og rettferdig.",
  };
}

function buildSystemPrompt(lang: Lang) {
  const headings = getHeadings(lang);
  const t = getPromptText(lang);

  if (lang === "en") {
    return [
      "You are an experienced teacher.",
      t.guidance,
      "",
      "IMPORTANT:",
      t.autoRule,
      t.taskClassificationRule,
      t.taskTypeGuidance,
      t.taskRule,
      t.lengthRule,
      t.relevanceRule,
      t.grammarRule,
      t.nextStepRule,
      "",
      "Use these exact headings:",
      headings.h1,
      headings.h2,
      headings.h3,
      headings.h4,
      "",
      "Section guidance:",
      `${headings.h1}: Briefly summarize the auto result and what it suggests about reading comprehension.`,
      `${headings.h2}: Say whether the student answers the task relevantly and within the required scope.`,
      `${headings.h3}: Give concrete grammar and language feedback with a few short examples.`,
      `${headings.h4}: Give 1 to 3 realistic next-step tips that match the actual task.`,
      "",
      t.finalInstruction,
    ].join("\n");
  }

  if (lang === "pt") {
    return [
      "Você é um professor experiente.",
      t.guidance,
      "",
      "IMPORTANTE:",
      t.autoRule,
      t.taskClassificationRule,
      t.taskTypeGuidance,
      t.taskRule,
      t.lengthRule,
      t.relevanceRule,
      t.grammarRule,
      t.nextStepRule,
      "",
      "Use estes títulos exatos:",
      headings.h1,
      headings.h2,
      headings.h3,
      headings.h4,
      "",
      "Orientação das seções:",
      `${headings.h1}: Resuma brevemente o resultado automático e o que ele sugere sobre a compreensão de leitura.`,
      `${headings.h2}: Diga se o aluno responde à tarefa de forma relevante e dentro do formato pedido.`,
      `${headings.h3}: Dê feedback concreto de gramática e linguagem com alguns exemplos curtos.`,
      `${headings.h4}: Dê de 1 a 3 dicas realistas para o próximo passo de acordo com a tarefa real.`,
      "",
      t.finalInstruction,
    ].join("\n");
  }

  return [
    "Du er en erfaren lærer.",
    t.guidance,
    "",
    "VIKTIG:",
    t.autoRule,
    t.taskClassificationRule,
    t.taskTypeGuidance,
    t.taskRule,
    t.lengthRule,
    t.relevanceRule,
    t.grammarRule,
    t.nextStepRule,
    "",
    "Bruk nøyaktig disse overskriftene:",
    headings.h1,
    headings.h2,
    headings.h3,
    headings.h4,
    "",
    "Veiledning for delene:",
    `${headings.h1}: Oppsummer kort autoresultatet og hva det tyder på om leseforståelsen.`,
    `${headings.h2}: Si om eleven svarer relevant på oppgaven og innenfor rammen som er bedt om.`,
    `${headings.h3}: Gi konkret grammatikk- og språkhjelp med noen få korte eksempler.`,
    `${headings.h4}: Gi 1 til 3 realistiske råd om neste steg som passer den faktiske oppgaven.`,
    "",
    t.finalInstruction,
  ].join("\n");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as unknown;

    const lesetekst = pickString(body, ["lesetekst", "leseTekst", "sourceText", "text"]);
    const oppgave = pickString(body, ["oppgave", "prompt", "task"]);
    const svar = pickString(body, ["svar", "answer"]);
    const nivå = pickString(body, ["nivå", "level"]) || "A2";

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
    const lessonType = pickString(body, ["lessonType"]);
    const imageDescription = pickString(body, ["imageDescription"]);
    const imageInstruction = pickString(body, ["imageInstruction"]);
    const isImageWriting = lessonType.toLowerCase() === "image_writing";
    const isReadingTest = lessonType.toLowerCase() === "reading_test";

    if (!lesetekst && !isImageWriting) return Response.json({ error: "Mangler lesetekst." }, { status: 400 });
    if (isImageWriting && !imageDescription && !lesetekst) {
      return Response.json({ error: "Mangler bildebeskrivelse." }, { status: 400 });
    }
    if (!oppgave) return Response.json({ error: "Mangler oppgave." }, { status: 400 });
    if (!svar && !autoResultat) {
      return Response.json({ error: "Mangler svar." }, { status: 400 });
    }

    const t = getPromptText(locale);
    const systemPrompt = isReadingTest
      ? buildReadingTestSystemPrompt(locale)
      : isImageWriting
        ? buildImageWritingSystemPrompt(locale)
        : buildSystemPrompt(locale);

    const readingAnswers = pickRecord(body, ["readingAnswers", "answers"]) || {};
    const readingTasks = pickArray(body, ["readingTasks", "tasks"]);
    const readingTestConfig = pickRecord(body, ["readingTestConfig"]);
    const readingProgress = pickRecord(body, ["readingProgress"]);
    const hasReadingOpenTasks = readingTasks.some((rawTask) => {
      const task = rawTask && typeof rawTask === "object" ? (rawTask as Record<string, unknown>) : {};
      const type = String(task.type ?? "").trim().toLowerCase();
      if (type !== "open" && type !== "short_answer") return false;
      const id = safeString(task.id);
      const order = safeString(task.order);
      const answer = readingAnswers[id] ?? readingAnswers[order];
      return safeString(answer).length > 0 || safeString(task.prompt).length > 0;
    });
    const readingSignalsText = isReadingTest
      ? JSON.stringify(
        buildReadingSignalsPayload({
          tasks: readingTasks,
          answers: readingAnswers,
          wordCount: countReadingTestWords(lesetekst, readingTasks),
          timeSpentSeconds:
            typeof readingProgress?.secondsUsed === "number"
              ? readingProgress.secondsUsed
              : null,
        }),
        null,
        2
      )
      : "";

    const userContent = isReadingTest
      ? buildReadingTestUserContent({
        lesetekst,
        nivå,
        autoResultat,
        readingSignalsText,
        tasks: readingTasks,
        answers: readingAnswers,
        config: readingTestConfig,
        progress: readingProgress,
        hasOpenTasks: hasReadingOpenTasks,
      })
      : isImageWriting
      ? [
        `${t.level}: ${nivå}`,
        oppgaveType ? `${t.taskType}: ${oppgaveType}` : "",
        "",
        "Dette er en skriveoppgave basert på et bilde.",
        `Bildebeskrivelse:\n${imageDescription || lesetekst || t.notProvided}`,
        "",
        `${t.task}:\n${imageInstruction || oppgave}`,
        "",
        `${t.studentAnswer}:\n${svar || t.notProvided}`,
      ].filter(Boolean).join("\n")
      : `${t.level}: ${nivå}\n` +
        (oppgaveType ? `${t.taskType}: ${oppgaveType}\n` : "") +
        `\n${t.autoResult}:\n${autoResultat || t.notProvided}\n` +
        `\n${t.lessonText}:\n${lesetekst}\n\n` +
        `${t.task}:\n${oppgave}\n\n` +
        `${t.studentAnswer}:\n${svar || t.notProvided}\n`;

    const r = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const feedback = cleanAiFeedback(r.output_text?.trim() ?? "");
    return Response.json({ feedback, locale });
  } catch (err: unknown) {
    console.error("Feedback route error:", err);
    return Response.json({ error: toErrorString(err) }, { status: 500 });
  }
}

function safeString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((item) => safeString(item)).filter(Boolean).join(", ");
  return "";
}

function formatDuration(totalSeconds: unknown): string {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds)) return "(ikke oppgitt)";
  const secs = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(secs / 60);
  const seconds = secs % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readingHeadings(lang: Lang) {
  if (lang === "en") {
    return {
      h1: "AUTO RESULTS AND READING COMPREHENSION",
      h2: "OPEN TASKS",
      h3: "LEVEL AND NEXT STEPS",
    };
  }
  if (lang === "pt") {
    return {
      h1: "RESULTADOS AUTOMÁTICOS E COMPREENSÃO DE LEITURA",
      h2: "TAREFAS ABERTAS",
      h3: "NÍVEL E PRÓXIMOS PASSOS",
    };
  }
  return {
    h1: "AUTORESULTAT OG LESEFORSTÅELSE",
    h2: "ÅPNE OPPGAVER",
    h3: "NIVÅ OG NESTE STEG",
  };
}

function buildReadingTestSystemPrompt(lang: Lang) {
  const h = readingHeadings(lang);
  if (lang === "en") {
    return [
      "You are an experienced language teacher giving feedback on a reading test.",
      "Address the student directly using 'you'. Be supportive, precise, and concise.",
      "This is not an official diagnostic test. It is support for learning, progress, and realistic orientation.",
      "Base reading comprehension mainly on automatic results from closed tasks. Use readingSignals actively.",
      "You may mention concrete numbers such as percent correct, number of wrong answers, and approximate words per minute.",
      "WPM is now based on the whole reading basis: reading text, task prompts, answer options, and answering. Treat it as functional test reading, not pure reading speed for the main text alone.",
      "Use the CEFR level only as background for this text. Do not write broad level conclusions such as 'you already show good A2 skills' or that the student is working toward a C1 goal.",
      "Prefer careful formulations such as: 'This result suggests...', 'This text seems to fit...', 'You answered ... correctly', and 'You worked through the text quickly/calmly...'.",
      "Tone down coach language. Avoid: 'Congratulations!', 'Fantastic!', 'Keep up the good work!', and broad skill claims. Prefer: 'Good work.', 'This result suggests...', 'In this test...', and 'This text seems to...'.",
      "Use the result clearly, for example: 'You answered 6 of 6 tasks correctly, which is 100%.'",
      "Reading pace must never be interpreted alone. Always connect speed with comprehension.",
      "Short tests and few tasks can still produce higher or more unstable WPM numbers. Do not overinterpret WPM from one short test.",
      "When mentioning WPM, use wording like: 'In this test, you read and answered at about 159 words per minute.'",
      "Do not write: 'You read 159 words per minute' or 'Your reading speed is 159 WPM'.",
      "Do not write: 'This is expected for A2.' Write instead: 'On short texts, the pace can become high, especially when the text fits well.'",
      "If score is high and pace is appropriate/high, you may write: 'This result suggests that you read this type of text with good fluency' or 'You show signs of being a strong reader at this level.' Do not write that the student is A2/B1 or has fully met the level.",
      "If score is high and pace is high, do not jump to a fixed next CEFR level. Use the current text level from the user message and the level guidance there. Never suggest moving to a level that is the same as, or lower than, the current text level.",
      "If autoscore is high and WPM is above 100, next steps should normally include trying a slightly higher-level text when a higher level exists. If autoscore is very high and WPM is above 200, clearly point out that the student can try more demanding or higher-level texts, while avoiding hard level conclusions.",
      "If score is low and pace is high, do not praise the speed and do not suggest a higher level. Say that the student worked quickly through the test, but some mistakes may suggest that it went a little too fast. Suggest reading the questions and answer options more calmly before answering.",
      "If score is low and pace is calm/slow, do not suggest reading more slowly. Say that the text may have been demanding, and suggest reading in smaller parts, stopping after each paragraph, and checking the main idea.",
      "If score is high and pace is calm/slow, say that the student spent good time and answered many tasks correctly; this may mean careful, thorough reading.",
      "Do not infer too much from task order, such as 'the first three tasks'. Prefer: 'You answered 3 of 6 tasks correctly. This suggests that you understood parts of the text, while some answers show that parts of the text were demanding.'",
      "If speed is high and there are many wrong answers, gently suggest reading a little more calmly and carefully.",
      "If speed is calm/slow and the score is high, describe this positively as careful, thorough reading.",
      "If speed is expected and the score is good, highlight fluency and understanding.",
      "If there are many wrong answers, focus on support and next steps, not judgement.",
      "You may use mild real-life comparisons such as subtitles on TV, short news texts, novels, subject texts, messages/chat, and school texts. Never present them as hard standards.",
      "Avoid phrases like: 'you read too slowly', 'you are weak', 'you are below level', or 'you cannot read fast enough'.",
      "For best_summary tasks, do not pretend the student wrote a summary. Write 'You chose the correct summary', not 'You summarized the text well'. If best_summary is wrong, suggest practising finding the main idea and choosing the summary that best fits the text.",
      "Assess open answers only in light of what the task asks for. Short answers can be fully acceptable when the task asks for facts or brief information.",
      "Only include the OPEN TASKS section if the test actually contains open tasks or open answers. If not, omit that heading and do not write about open answers.",
      "The LEVEL AND NEXT STEPS section must always give one concrete next step. Follow the level guidance from the user message: high score + appropriate/high pace may mean a slightly more demanding text only when a higher level is appropriate; otherwise suggest a longer, more complex, or different text at the same level. 1 wrong answer -> read the questions carefully and practise the same level a little more; several wrong answers + high pace -> read questions and answer options more calmly; several wrong answers + low pace -> practise more at the same level, read calmly, stop at difficult words, and try more texts on the same level; wrong best summary -> practise main idea and summaries.",
      "Do not use markdown, bullet lists, or numbered headings.",
      "Use these headings when relevant:",
      h.h1,
      h.h2,
      h.h3,
    ].join("\n");
  }
  if (lang === "pt") {
    return [
      "Você é um professor experiente dando feedback sobre um teste de leitura.",
      "Fale diretamente com o aluno usando 'você'. Seja encorajador, preciso e breve.",
      "Este não é um teste diagnóstico oficial. É apoio para aprendizagem, progresso e orientação realista.",
      "Baseie a compreensão de leitura principalmente nos resultados automáticos das tarefas fechadas. Use readingSignals ativamente.",
      "Você pode mencionar números concretos, como porcentagem de acertos, número de erros e palavras por minuto aproximadas.",
      "O WPM agora se baseia em toda a base de leitura: texto, enunciados, alternativas de resposta e respostas. Trate isso como leitura funcional de teste, não como velocidade pura de leitura apenas do texto principal.",
      "Use o nível CEFR apenas como contexto para este texto. Não escreva conclusões amplas de nível, como 'você já mostra boas habilidades no A2' ou que o aluno trabalha rumo ao C1.",
      "Prefira formulações cuidadosas como: 'Este resultado sugere...', 'Este texto parece combinar...', 'Você respondeu corretamente a...' e 'Você trabalhou o texto de forma rápida/calma...'.",
      "Reduza a linguagem de coach. Evite: 'Parabéns!', 'Fantástico!', 'Continue o bom trabalho!' e afirmações amplas de habilidade. Prefira: 'Bom trabalho.', 'Este resultado sugere...', 'Neste teste...' e 'Este texto parece...'.",
      "Use o resultado de forma clara, por exemplo: 'Você respondeu corretamente a 6 de 6 tarefas, ou seja, 100%.'",
      "A velocidade de leitura nunca deve ser interpretada sozinha. Sempre relacione velocidade com compreensão.",
      "Testes curtos e poucas tarefas ainda podem gerar números de WPM mais altos ou mais instáveis. Não interprete demais o WPM de um único teste curto.",
      "Ao mencionar WPM, use formulações como: 'Neste teste, você leu e respondeu a cerca de 159 palavras por minuto.'",
      "Não escreva: 'Você leu 159 palavras por minuto' ou 'Sua velocidade de leitura é 159 WPM'.",
      "Não escreva: 'Isso é esperado para A2.' Escreva antes: 'Em textos curtos, o ritmo pode ficar alto, especialmente quando o texto combina bem.'",
      "Se a pontuação for alta e o ritmo for adequado/alto, você pode escrever: 'Este resultado sugere que você lê este tipo de texto com boa fluência' ou 'Você mostra sinais de ser um leitor forte neste nível.' Não escreva que o aluno é A2/B1 ou que cumpre totalmente o nível.",
      "Se a pontuação for alta e o ritmo alto, não salte para um nível CEFR fixo. Use o nível atual do texto informado na mensagem do usuário e a orientação de nível que aparece ali. Nunca sugira avançar para um nível que seja igual ou inferior ao nível atual do texto.",
      "Se o autoscore for alto e o WPM estiver acima de 100, os próximos passos normalmente devem incluir experimentar um texto de nível um pouco mais alto quando houver um nível mais alto. Se o autoscore for muito alto e o WPM estiver acima de 200, indique claramente que o aluno pode experimentar textos mais exigentes ou de nível mais alto, sem conclusões rígidas de nível.",
      "Se a pontuação for baixa e o ritmo alto, não elogie a velocidade e não sugira nível mais alto. Diga que o aluno trabalhou rapidamente pelo teste, mas alguns erros podem sugerir que foi um pouco rápido demais. Sugira ler perguntas e alternativas com mais calma antes de responder.",
      "Se a pontuação for baixa e o ritmo calmo/lento, não sugira ler mais devagar. Diga que o texto pode ter sido exigente e sugira ler em partes menores, parar após cada parágrafo e verificar a ideia principal.",
      "Se a pontuação for alta e o ritmo calmo/lento, diga que o aluno usou bom tempo e respondeu corretamente a muitas tarefas; isso pode indicar leitura cuidadosa.",
      "Não interprete demais a ordem das tarefas, como 'as três primeiras tarefas'. Prefira: 'Você respondeu corretamente a 3 de 6 tarefas. Isso sugere que você entendeu partes do texto, enquanto algumas respostas mostram que partes do texto foram exigentes.'",
      "Se a velocidade for alta e houver muitos erros, sugira com cuidado ler com mais calma e atenção.",
      "Se a velocidade for calma/lenta e a pontuação for alta, apresente isso positivamente como leitura cuidadosa.",
      "Se a velocidade for esperada e a pontuação for boa, destaque fluência e compreensão.",
      "Se houver muitos erros, foque em apoio e próximos passos, não em julgamento.",
      "Você pode usar comparações leves com situações reais, como legendas de TV, notícias curtas, romances, textos técnicos/escolares, mensagens/chat e textos escolares. Nunca apresente isso como padrão rígido.",
      "Evite frases como: 'você lê devagar demais', 'você é fraco', 'você está abaixo do nível' ou 'você não consegue ler rápido o suficiente'.",
      "Em tarefas best_summary, não finja que o aluno escreveu um resumo. Escreva 'Você escolheu o resumo correto', não 'Você resumiu bem o texto'. Se best_summary estiver errado, sugira praticar a identificação da ideia principal e a escolha do resumo que melhor combina com o texto.",
      "Avalie respostas abertas apenas de acordo com o que a tarefa pede. Respostas curtas podem ser adequadas quando a tarefa pede fatos ou informação breve.",
      "Inclua a seção TAREFAS ABERTAS apenas se o teste realmente tiver tarefas abertas ou respostas abertas. Caso contrário, omita esse título e não escreva sobre respostas abertas.",
      "A seção NÍVEL E PRÓXIMOS PASSOS deve sempre dar um próximo passo concreto. Siga a orientação de nível da mensagem do usuário: pontuação alta + ritmo adequado/rápido pode indicar um texto um pouco mais exigente apenas quando um nível mais alto for adequado; caso contrário, sugira um texto mais longo, mais complexo ou com outro tema no mesmo nível. 1 erro -> ler as perguntas com atenção e praticar um pouco mais no mesmo nível; vários erros + ritmo rápido -> ler perguntas e alternativas com mais calma; vários erros + ritmo lento -> praticar mais no mesmo nível, ler com calma, parar em palavras difíceis e tentar mais textos no mesmo nível; best_summary errado -> praticar ideia principal e resumos.",
      "Não use markdown, marcadores ou títulos numerados.",
      "Use estes títulos quando forem relevantes:",
      h.h1,
      h.h2,
      h.h3,
    ].join("\n");
  }
  return [
    "Du er en erfaren språklærer som gir tilbakemelding på en lesetest.",
    "Skriv direkte til eleven med 'du'. Vær støttende, presis og kort.",
    "Dette er ikke en offisiell kartleggingsprøve. Det er støtte for læring, progresjon og realitetsorientering.",
    "Basér leseforståelsen hovedsakelig på autoresultat fra lukkede oppgaver. Bruk readingSignals aktivt.",
    "Du kan nevne konkrete tall som prosent riktig, antall feil og omtrentlige ord per minutt.",
    "WPM beregnes nå fra hele lesegrunnlaget: lesetekst, oppgavetekster, svaralternativer og svaring. Tolk det som funksjonell testlesing, ikke ren lesefart på hovedteksten alene.",
    "Bruk CEFR-nivået bare som bakgrunn for denne teksten. Ikke skriv brede nivåkonklusjoner som 'du viser allerede gode ferdigheter på A2-nivå' eller at eleven jobber mot C1-mål.",
    "Foretrekk forsiktige formuleringer som: 'Resultatet på denne testen tyder på...', 'Denne teksten ser ut til å passe...', 'Du svarte riktig på...' og 'Du jobbet deg raskt/rolig gjennom teksten...'.",
    "Ton ned coach-språk. Unngå: 'Gratulerer!', 'Fantastisk!', 'Fortsett det gode arbeidet!' og brede ferdighetspåstander. Foretrekk: 'Godt jobbet.', 'Resultatet tyder på...', 'I denne testen...' og 'Denne teksten ser ut til...'.",
    "Bruk resultatet tydelig, for eksempel: 'Du svarte riktig på 6 av 6 oppgaver, altså 100 %.'.",
    "Lesefart skal aldri tolkes alene. Koble alltid fart sammen med forståelse.",
    "Korte tester og få oppgaver kan fortsatt gi høyere eller mer ustabile WPM-tall. Ikke overtolk WPM fra én kort test.",
    "Når du nevner WPM, bruk formuleringer som: 'I denne testen leste og svarte du i et tempo på omtrent 159 ord per minutt.'.",
    "Ikke skriv: 'Du leste 159 ord per minutt' eller 'Din lesehastighet er 159 WPM'.",
    "Ikke skriv: 'Dette er forventet for A2.' Skriv heller: 'På korte tekster kan tempoet bli høyt, særlig når teksten passer godt.'.",
    "Ved høy score og passende/høy lesefart kan du skrive: 'Resultatet tyder på at du leser denne typen tekst med god flyt' eller 'Du viser tegn på å være en sterk leser på dette nivået.' Ikke skriv at eleven er A2/B1 eller oppfyller nivået fullt ut.",
    "Ved høy score og høy lesefart: ikke hopp til et fast neste CEFR-nivå. Bruk tekstens nivå fra brukermeldingen og nivåveiledningen der. Foreslå aldri å gå videre til et nivå som er likt eller lavere enn tekstens nivå.",
    "Ved høy autoscore og mer enn 100 ord per minutt bør neste steg vanligvis ta med at eleven kan prøve en tekst på litt høyere nivå når et høyere nivå finnes. Ved svært høy autoscore og mer enn 200 ord per minutt skal du tydelig peke på at eleven godt kan prøve mer krevende tekster eller høyere nivå, uten bastante nivåkonklusjoner.",
    "Ved lav score og høy lesefart: ikke ros farten og ikke foreslå høyere nivå. Skriv at eleven jobbet raskt gjennom testen, men at flere feil kan tyde på at det gikk litt fort. Foreslå å lese spørsmålene og svaralternativene roligere før svar.",
    "Ved lav score og rolig/lav lesefart: ikke foreslå å lese roligere. Skriv heller at teksten kan ha vært krevende, og foreslå å lese i mindre deler, stoppe etter hvert avsnitt og sjekke hovedinnholdet.",
    "Ved høy score og rolig/lav lesefart: skriv at eleven brukte god tid og svarte riktig på mange oppgaver. Det kan bety at eleven leste nøye og jobbet godt med teksten.",
    "Ikke tolk rekkefølgen på oppgavene for mye, som 'de tre første oppgavene'. Foretrekk: 'Du svarte riktig på 3 av 6 oppgaver. Det tyder på at du fikk med deg deler av teksten, mens noen svar viser at deler av teksten var krevende.'.",
    "Ved høy fart og mange feil: foreslå forsiktig å lese litt roligere og nøyere.",
    "Ved rolig/lav fart og høy score: løft dette positivt som grundig og rolig lesing.",
    "Ved middels/forventet fart og god score: fremhev flyt og forståelse.",
    "Ved mange feil: fokuser på støtte og neste steg, ikke dom.",
    "Du kan bruke milde sammenligninger fra virkeligheten, som undertekster på TV, korte nyhetstekster, romaner, fagtekster, meldinger/chat og skoletekster. Bruk dem aldri som harde standarder.",
    "Ikke skriv formuleringer som: 'du leser for sakte', 'du er svak', 'du ligger under nivå' eller 'du kan ikke lese raskt nok'.",
    "Ved best_summary skal du ikke late som eleven har skrevet sammendrag. Skriv 'Du valgte riktig sammendrag', ikke 'Du oppsummerte teksten godt'. Hvis best_summary er feil, foreslå å øve på å finne hovedinnholdet i teksten og velge sammendraget som passer best.",
    "Vurder åpne svar ut fra hva oppgaven faktisk ber om. Korte svar kan være helt gode nok når oppgaven ber om fakta eller korte opplysninger.",
    "Ta bare med seksjonen ÅPNE OPPGAVER hvis testen faktisk inneholder åpne oppgaver eller åpne svar. Hvis ikke, utelat overskriften og ikke skriv om åpne svar.",
    "Seksjonen NIVÅ OG NESTE STEG skal alltid gi ett konkret neste steg. Følg nivåveiledningen i brukermeldingen: høy score + passende/høy fart kan bety litt mer krevende tekst bare når et høyere nivå passer; ellers foreslå lengre, mer kompleks eller annen tekst på samme nivå. 1 feil -> les spørsmålene nøye og prøv samme nivå litt til; flere feil + høy fart -> les spørsmål og svaralternativer roligere; flere feil + lav fart -> øv mer på samme nivå, les rolig, stopp ved vanskelige ord og prøv flere tekster på samme nivå; feil best_summary -> øv på hovedinnhold og sammendrag.",
    "Ikke bruk markdown, punktlister eller nummererte overskrifter.",
    "Bruk disse overskriftene når de er relevante:",
    h.h1,
    h.h2,
    h.h3,
  ].join("\n");
}

function buildReadingTaskOverview(tasks: unknown[], answers: Record<string, unknown>): string {
  if (!tasks.length) return "(ingen oppgaver oppgitt)";

  return tasks
    .map((raw, idx) => {
      const task = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const id = safeString(task.id) || `${idx + 1}`;
      const order = safeString(task.order) || String(idx + 1);
      const type = safeString(task.type) || "open";
      const prompt = safeString(task.prompt) || "(ingen oppgavetekst)";
      const answerRaw = answers[id] ?? answers[order] ?? answers[`task_${idx + 1}`];
      const answer = safeString(answerRaw) || "(ikke besvart / se autoresultat)";
      const correct = safeString(task.correctAnswer);

      return [
        `Oppgave ${order}`,
        `Type: ${type}`,
        `Oppgave: ${prompt}`,
        `Elevsvar: ${answer}`,
        correct ? `Fasit: ${correct}` : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

function buildReadingMetadata(config: Record<string, unknown> | null, progress: Record<string, unknown> | null) {
  const timerSeconds = progress?.timeLimitSeconds ?? config?.timerSeconds;
  const secondsUsed = progress?.secondsUsed;
  const isTimeUp = progress?.isTimeUp === true;

  return [
    `Tidsgrense: ${formatDuration(timerSeconds)}`,
    `Brukt tid: ${formatDuration(secondsUsed)}`,
    `Tiden gikk ut: ${isTimeUp ? "ja" : "nei"}`,
  ].join("\n");
}

function buildReadingLevelGuidance(level: string): string {
  const normalized = (level || "").trim().toUpperCase();
  const nextLevel: Record<string, string> = {
    A1: "A2",
    A2: "B1",
    B1: "B2",
    B2: "C1",
    C1: "C2",
  };

  if (normalized === "C2") {
    return [
      `Tekstens CEFR-nivå er ${normalized}.`,
      "Det finnes ikke et høyere CEFR-nivå å foreslå. Ved svært godt resultat kan neste steg være en lengre tekst, et mer krevende tema eller en mer nyansert tekst på samme nivå.",
    ].join(" ");
  }

  if (nextLevel[normalized]) {
    return [
      `Tekstens CEFR-nivå er ${normalized}.`,
      `Ved høy autoscore og mer enn 100 ord per minutt kan du foreslå at eleven også prøver en tekst på et litt høyere nivå, for eksempel ${nextLevel[normalized]}, hvis forståelsen virker god.`,
      `Ved svært høy autoscore og mer enn 200 ord per minutt bør du tydelig peke på at eleven godt kan prøve mer krevende tekster, gjerne ${nextLevel[normalized]}, men uten å konkludere at eleven er på dette nivået.`,
      "Hvis resultatet ikke er sterkt, bør neste steg være mer øving på samme nivå.",
    ].join(" ");
  }

  return `Tekstens CEFR-nivå er ${level || "ikke oppgitt"}. Bruk dette som tekstnivå, ikke som en bred vurdering av elevens nivå.`;
}

function buildReadingTestUserContent(args: {
  lesetekst: string;
  nivå: string;
  autoResultat: string;
  readingSignalsText: string;
  tasks: unknown[];
  answers: Record<string, unknown>;
  config: Record<string, unknown> | null;
  progress: Record<string, unknown> | null;
  hasOpenTasks: boolean;
}) {
  return [
    `Tekstens CEFR-nivå: ${args.nivå}`,
    `Nivåveiledning:\n${buildReadingLevelGuidance(args.nivå)}`,
    "",
    `Metadata for lesetest:\n${buildReadingMetadata(args.config, args.progress)}`,
    "",
    `Autoresultat:\n${args.autoResultat || "(ikke oppgitt)"}`,
    "",
    `Interne lesesignaler for AI-feedback:\n${args.readingSignalsText || "(ikke oppgitt)"}`,
    "",
    `Lesetekst:\n${args.lesetekst || "(ikke oppgitt)"}`,
    "",
    `Oppgaver og elevsvar:\n${buildReadingTaskOverview(args.tasks, args.answers)}`,
    "",
    `Har åpne oppgaver/svar: ${args.hasOpenTasks ? "ja" : "nei"}`,
    "",
    args.hasOpenTasks
      ? "Instruksjon: Gi eleven kort, konkret AI-vurdering av leseforståelse, åpne svar og neste steg. Ikke overtolk tid eller manglende detaljer."
      : "Instruksjon: Gi eleven kort, konkret AI-vurdering av leseforståelse og neste steg. Ikke skriv om åpne svar når testen ikke har åpne oppgaver. Ikke overtolk tid eller manglende detaljer.",
  ].join("\n");
}

function buildImageWritingSystemPrompt(lang: Lang) {
  const headings = getImageWritingHeadings(lang);
  const t = getPromptText(lang);

  const role =
    lang === "pt"
      ? "Você é um professor experiente."
      : lang === "en"
        ? "You are an experienced teacher."
        : "Du er en erfaren lærer.";

  return [
    role,
    t.guidance,
    "",
    "IMPORTANT:",
    "This is a writing task based on an image. Evaluate primarily what the student actually wrote. The image description is context, not a checklist.",
    "Do not criticize missing image details unless the task explicitly requires those exact details.",
    "Do not refer to, reveal, or evaluate from an image-generation prompt. Use only the image description, the task instruction, and the student's text.",
    "If the task asks for a specific number of sentences and the student wrote fewer, mention it briefly and kindly. Prefer a mild next-step comment such as writing a little more next time.",
    t.taskRule,
    t.relevanceRule,
    t.grammarRule,
    t.nextStepRule,
    "",
    "Use these exact headings:",
    headings.h1,
    headings.h2,
    headings.h3,
    headings.h4,
    "",
    t.finalInstruction,
  ].join("\n");
}

function getImageWritingHeadings(lang: Lang) {
  if (lang === "en") {
    return {
      h1: "CONTENT AND IMAGE MATCH",
      h2: "RESPONSE TO THE TASK",
      h3: "GRAMMAR AND LANGUAGE",
      h4: "NEXT STEPS",
    };
  }

  if (lang === "pt") {
    return {
      h1: "CONTEÚDO E RELAÇÃO COM A IMAGEM",
      h2: "RESPOSTA À TAREFA",
      h3: "GRAMÁTICA E LINGUAGEM",
      h4: "PRÓXIMOS PASSOS",
    };
  }

  return {
    h1: "INNHOLD OG BILDEKOBLING",
    h2: "SVAR PÅ OPPGAVEN",
    h3: "GRAMMATIKK OG SPRÅK",
    h4: "NESTE STEG",
  };
}
