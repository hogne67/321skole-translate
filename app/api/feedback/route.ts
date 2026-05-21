// app/api/feedback/route.ts
import OpenAI from "openai";

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
      "Hvis autoresultat finnes, bruk det aktivt. Oppsummer hva eleven ser ut til å forstå ut fra flervalg, true/false, hulloppgaver og andre automatisk rettede oppgaver. Knytt dette forsiktig til leseforståelse, men uten å overtolke. Automatiske resultater skal regnes som et sterkt signal om leseforståelse, men ikke hele bildet.",

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
      "You are an experienced language teacher.",
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
      "Você é um professor experiente de língua.",
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
    "Du er en erfaren norsklærer/språklærer.",
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

    if (!lesetekst && !isImageWriting) return Response.json({ error: "Mangler lesetekst." }, { status: 400 });
    if (isImageWriting && !imageDescription && !lesetekst) {
      return Response.json({ error: "Mangler bildebeskrivelse." }, { status: 400 });
    }
    if (!oppgave) return Response.json({ error: "Mangler oppgave." }, { status: 400 });
    if (!svar && !autoResultat) {
      return Response.json({ error: "Mangler svar." }, { status: 400 });
    }

    const t = getPromptText(locale);
    const systemPrompt = isImageWriting ? buildImageWritingSystemPrompt(locale) : buildSystemPrompt(locale);

    const userContent = isImageWriting
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

function buildImageWritingSystemPrompt(lang: Lang) {
  const headings = getImageWritingHeadings(lang);
  const t = getPromptText(lang);

  const role =
    lang === "pt"
      ? "Você é um professor experiente de língua."
      : lang === "en"
        ? "You are an experienced language teacher."
        : "Du er en erfaren norsklærer/språklærer.";

  return [
    role,
    t.guidance,
    "",
    "IMPORTANT:",
    "This is a writing task based on an image. Evaluate whether the student's text fits the image description and the task instruction.",
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
