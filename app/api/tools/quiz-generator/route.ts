import OpenAI, { toFile } from "openai";
import { getAdmin } from "@/lib/firebaseAdmin";
import { consumeFeatureAdmin, getFeatureStatusAdmin } from "@/lib/featureGuardAdmin";
import { getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";
import { emailVerificationRequiredWebResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type QuizQuestion = {
  type: "multiple_choice" | "true_false";
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  seconds: number;
};

type QuestionMode = "mixed" | "multiple_choice" | "true_false";
type Difficulty = "easy" | "medium" | "hard";

type QuizRequest = {
  language: string;
  level: string;
  difficulty: Difficulty;
  sourceMode: string;
  topic: string;
  sourceText: string;
  focus: string;
  questionMode: QuestionMode;
  count: number;
  seconds: number;
  pdfFile?: File | null;
};

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
  studentAccessMode?: string | null;
};

class BadRequestError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickString(obj: unknown, key: string, fallback = ""): string {
  if (!isRecord(obj)) return fallback;
  const value = obj[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function pickNumber(obj: unknown, key: string, fallback: number): number {
  if (!isRecord(obj)) return fallback;
  const value = obj[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeLanguage(language: string): string {
  return language.trim() || "nb";
}

function pickQuestionMode(value: string): QuestionMode {
  if (value === "multiple_choice" || value === "true_false") return value;
  return "mixed";
}

function pickDifficulty(value: string): Difficulty {
  if (value === "easy" || value === "hard") return value;
  return "medium";
}

function getLanguageInstruction(language: string): string {
  const lower = language.toLowerCase();
  if (lower === "no" || lower === "nb" || lower === "nn") return "Write everything in Norwegian Bokmal.";
  if (lower === "pt" || lower === "pt-br" || lower === "pt-pt") return "Write everything in Portuguese.";
  if (lower === "en") return "Write everything in English.";
  return `Write everything in the language with code "${language}".`;
}

function getFocusInstruction(focus: string): string {
  const normalized = focus.trim().toLowerCase();
  const labels: Record<string, string> = {
    easy_mix: "a light mixed category with varied questions from the supplied topic",
    language: "language and text",
    math: "mathematics",
    science: "science",
    social_studies: "social studies",
    history: "history",
    english: "English as a school subject",
    work_life: "work life and careers",
    citizenship: "democracy and citizenship",
    culture: "culture and society",
    health: "health and life skills",
    sports: "sports and physical education",
    food: "food and drink",
    wildlife: "animals and wildlife",
    other: "other/general topic",
  };
  return labels[normalized] || focus || "other/general topic";
}

function getLevelInstruction(level: string): string {
  const normalized = level.trim().toUpperCase();
  const labels: Record<string, string> = {
    A1:
      "A1: Use very short, concrete questions with simple everyday words. Ask about one fact or idea at a time. Keep answer options short and clearly different.",
    A2:
      "A2: Use simple questions with familiar wording. One short context sentence is okay, but avoid dense phrasing and abstract traps.",
    B1:
      "B1: Use moderate context in many questions. Ask students to connect a fact to a cause, consequence, person, place, or period. Options may be more similar, but the correct answer must still be clear.",
    B2:
      "B2: Use richer question stems with context, contrast, or cause-and-effect. Prefer questions that require interpretation, comparison, or recognizing significance. Distractors should be plausible within the same topic, not random.",
    C1:
      "C1: Use nuanced, information-rich questions. Ask for significance, relationships between events, precise concepts, or implications. The language may be advanced, but the factual claim must remain easy for a teacher to verify.",
  };
  return labels[normalized] || labels.B1;
}

function getDifficultyInstruction(difficulty: Difficulty): string {
  if (difficulty === "easy") {
    return "Difficulty: Easy. Ask mostly direct recognition or recall questions. Keep distractors clearly different from the correct answer.";
  }
  if (difficulty === "hard") {
    return "Difficulty: Hard. Ask for cause, consequence, comparison, significance, chronology, or careful interpretation. Distractors should be plausible, but only one answer can be correct.";
  }
  return "Difficulty: Medium. Mix direct factual checks with some questions that require context, simple reasoning, or comparison.";
}

function requiresContextRichQuestions(level: string): boolean {
  return ["B1", "B2", "C1"].includes(level.trim().toUpperCase());
}

function hasRecentOrCurrentFactRisk(topic: string): boolean {
  const normalized = topic
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const currentYear = new Date().getFullYear();
  const years = Array.from(normalized.matchAll(/\b(20\d{2})\b/g))
    .map((match) => Number(match[1]))
    .filter((year) => Number.isFinite(year));
  if (years.some((year) => year >= currentYear - 1)) return true;

  return /\b(i dag|idag|na|nå|nylig|siste|arets|årets|aktuell|current|latest|recent|today|this year|last year)\b/.test(normalized);
}

function hasGeneralFactRisk(topic: string, focus: string): boolean {
  const normalized = topic
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const riskyFocus = new Set(["history", "social_studies", "sports", "culture", "citizenship", "wildlife", "other"]);
  return (
    riskyFocus.has(focus.trim().toLowerCase()) ||
    /\b(1[5-9]\d{2}|20\d{2})\b/.test(normalized) ||
    /\b(oslo|bergen|trondheim|stavanger|kristiansand|tromso|tromsø|alesund|ålesund|norge|norway|person|personer|biografi|fodt|født|dod|død|sted|by|kommune|historie|sport|idrett|politikk|kultur|konge|president|artist|forfatter|athlete|born|died|city|place|history|sports|politics|culture)\b/.test(normalized)
  );
}

function hasBlockedQuizTopic(topic: string): boolean {
  const normalized = topic
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /\b(porno|pornografi|pornography|sex|seksualitet|sexual|naken|nude|nudes|rus|narkotika|dop|drugs|cocaine|kokain|heroin|cannabis|hasj|alkohol|alcohol|ekstremisme|ekstremist|extremism|terror|terrorisme|terrorism|nazisme|nazism|selvskading|self-harm|selfharm|suicide|selvmord|voldtekt|rape|tortur|torture)\b/.test(normalized);
}

function blockedQuizTopicError(language: string) {
  const lower = language.toLowerCase();
  if (lower === "pt" || lower === "pt-br" || lower === "pt-pt") {
    return "Este tema pode ser sensível ou inadequado para geração automática de quiz. Escolha um tema mais seguro ou crie as perguntas manualmente.";
  }
  if (lower === "en") {
    return "This topic may be sensitive or unsuitable for automatic quiz generation. Choose a safer topic or create the questions manually.";
  }
  return "Dette temaet kan være sensitivt eller uegnet for automatisk quizgenerering. Velg et tryggere tema eller lag spørsmålene manuelt.";
}

function hasHistoricalYear(topic: string): boolean {
  return /\b(1[5-9]\d{2}|20[0-1]\d|202[0-4])\b/.test(topic);
}

function isUnsafeHistoricalTopicQuestion(question: QuizQuestion): boolean {
  const text = `${question.question} ${question.explanation}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    /\b(dode|dodde|died|faleceu|morreu|born|fodt|nasceu)\b/.test(text) ||
    /\b(exact date|dato|day and month|dag og maned|dia e mes)\b/.test(text) ||
    /\b(sales figure|sales figures|salgstall|ranking|rankings|rangering)\b/.test(text)
  );
}

async function getRequestUserContext(req: Request): Promise<RequestUserContext | null> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(idToken);
  if (needsEmailVerification(decoded)) {
    throw new Error("EMAIL_VERIFICATION_REQUIRED");
  }
  const uid = decoded.uid;
  const userSnap = await db.collection("users").doc(uid).get();
  const data = userSnap.exists ? userSnap.data() : undefined;

  const role =
    typeof data?.role === "string"
      ? data.role
      : typeof data?.mode === "string"
        ? data.mode
        : "anonymous";

  const plan = getEffectivePlan({
    plan: typeof data?.plan === "string" ? data.plan : "free",
    billing:
      data?.billing && typeof data.billing === "object"
        ? (data.billing as { plan?: string | null; status?: string | null })
        : null,
    schoolId: typeof data?.schoolId === "string" ? data.schoolId : null,
    schoolRole: typeof data?.schoolRole === "string" ? data.schoolRole : null,
    schoolStatus: typeof data?.schoolStatus === "string" ? data.schoolStatus : null,
  });

  return {
    uid,
    role,
    plan,
    studentAccessMode:
      typeof data?.studentAccessMode === "string" ? data.studentAccessMode : null,
  };
}

function quotaErrorResponse(status: Awaited<ReturnType<typeof getFeatureStatusAdmin>>) {
  if (status.reason === "limit_reached") {
    return Response.json({ error: "Du har brukt opp månedens AI-kvote.", quota: status }, { status: 403 });
  }
  if (status.reason === "teacher_only") {
    return Response.json({ error: "Denne funksjonen er bare tilgjengelig for lærere.", quota: status }, { status: 403 });
  }
  return Response.json({ error: "Denne funksjonen krever et abonnement.", quota: status }, { status: 403 });
}

function pickFormString(form: FormData, key: string, fallback = ""): string {
  const value = form.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function pickFormNumber(form: FormData, key: string, fallback: number): number {
  const value = form.get(key);
  if (typeof value !== "string") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function readQuizRequest(req: Request): Promise<QuizRequest> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new BadRequestError("Velg en PDF-fil først.");
    if (file.size > 12 * 1024 * 1024) throw new BadRequestError("PDF-filen er for stor. Maks 12 MB.");
    const fileName = file.name.toLowerCase();
    if (file.type !== "application/pdf" && !fileName.endsWith(".pdf")) {
      throw new BadRequestError("Velg en PDF-fil.");
    }
    return {
      language: normalizeLanguage(pickFormString(form, "language", "nb")),
      level: pickFormString(form, "level", "A2"),
      difficulty: pickDifficulty(pickFormString(form, "difficulty", "medium")),
      sourceMode: "pdf",
      topic: pickFormString(form, "topic", file.name.replace(/\.pdf$/i, "")),
      sourceText: "",
      focus: pickFormString(form, "focus", "easy_mix"),
      questionMode: pickQuestionMode(pickFormString(form, "questionMode", "mixed")),
      count: Math.max(3, Math.min(12, Math.trunc(pickFormNumber(form, "count", 6)))),
      seconds: Math.max(10, Math.min(120, Math.trunc(pickFormNumber(form, "seconds", 30)))),
      pdfFile: file,
    };
  }

  const body = (await req.json().catch(() => ({}))) as unknown;
  return {
    language: normalizeLanguage(pickString(body, "language", "nb")),
    level: pickString(body, "level", "A2"),
    difficulty: pickDifficulty(pickString(body, "difficulty", "medium")),
    sourceMode: pickString(body, "sourceMode", "topic"),
    topic: pickString(body, "topic"),
    sourceText: pickString(body, "sourceText"),
    focus: pickString(body, "focus", "easy_mix"),
    questionMode: pickQuestionMode(pickString(body, "questionMode", "mixed")),
    count: Math.max(3, Math.min(12, Math.trunc(pickNumber(body, "count", 6)))),
    seconds: Math.max(10, Math.min(120, Math.trunc(pickNumber(body, "seconds", 30)))),
    pdfFile: null,
  };
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function distributeCorrectOption(options: string[], correctIndex: number, questionIndex: number) {
  if (!options.length) return { options, correctIndex: 0 };

  const boundedCorrectIndex = Math.max(0, Math.min(options.length - 1, correctIndex));
  const targetIndex = questionIndex % options.length;
  if (targetIndex === boundedCorrectIndex) {
    return { options, correctIndex: boundedCorrectIndex };
  }

  const correctOption = options[boundedCorrectIndex];
  const nextOptions = options.filter((_, index) => index !== boundedCorrectIndex);
  nextOptions.splice(targetIndex, 0, correctOption);
  return { options: nextOptions, correctIndex: targetIndex };
}

function uniqueOptionsWithCorrectIndex(options: string[], correctIndex: number) {
  const seen = new Set<string>();
  const next: string[] = [];
  const rawCorrect = options[correctIndex]?.trim() || "";
  let nextCorrectIndex = 0;

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    const value = option.trim();
    const key = value.toLowerCase().replace(/\s+/g, " ");
    if (!value || seen.has(key)) continue;
    seen.add(key);
    if (rawCorrect && value.toLowerCase().replace(/\s+/g, " ") === rawCorrect.toLowerCase().replace(/\s+/g, " ")) {
      nextCorrectIndex = next.length;
    }
    next.push(value);
  }

  return { options: next, correctIndex: nextCorrectIndex };
}

function cleanExplanation(value: string): string {
  return value
    .replace(/\s*,?\s*(noe som|og det|dette)\s+gjør\s+[^.]{0,80}?\s+til\s+det\s+riktige\s+svaret\.?$/i, ".")
    .replace(/\s*,?\s*(which|and this|this)\s+makes\s+[^.]{0,80}?\s+the\s+correct\s+answer\.?$/i, ".")
    .replace(/\s*,?\s*(o que|isso)\s+(faz|torna)\s+[^.]{0,80}?\s+(a\s+)?resposta\s+correta\.?$/i, ".")
    .replace(/\s+\./g, ".")
    .replace(/\.{2,}$/g, ".")
    .trim();
}

function cleanQuestion(raw: unknown, index: number, fallbackSeconds: number): QuizQuestion | null {
  if (!isRecord(raw)) return null;
  const question = pickString(raw, "question");
  const explanation = cleanExplanation(pickString(raw, "explanation"));
  const rawType = pickString(raw, "type", "multiple_choice");
  const type = rawType === "true_false" ? "true_false" : "multiple_choice";
  const rawOptions = Array.isArray(raw.options)
    ? raw.options.filter((item): item is string => typeof item === "string")
    : [];
  const rawCorrectIndex = Math.trunc(pickNumber(raw, "correctIndex", 0));
  const { options, correctIndex } = uniqueOptionsWithCorrectIndex(rawOptions, rawCorrectIndex);
  const seconds = Math.max(10, Math.min(120, Math.trunc(pickNumber(raw, "seconds", fallbackSeconds))));

  if (!question || !explanation) return null;
  if (type === "true_false") {
    const tfOptions = options.length >= 2 ? options.slice(0, 2) : ["Sant", "Usant"];
    const distributed = distributeCorrectOption(tfOptions, correctIndex === 1 ? 1 : 0, index);
    return {
      type,
      question,
      options: distributed.options,
      correctIndex: distributed.correctIndex,
      explanation,
      seconds,
    };
  }

  const nextOptions = options.slice(0, 4);
  if (nextOptions.length < 2) return null;
  const distributed = distributeCorrectOption(nextOptions, correctIndex, index);

  return {
    type,
    question,
    options: distributed.options,
    correctIndex: distributed.correctIndex,
    explanation,
    seconds,
  };
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
    }

    const user = await getRequestUserContext(req);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const quotaBefore = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      studentAccessMode: user.studentAccessMode,
      feature: "producer_create_quiz",
    });

    if (!quotaBefore.allowed) {
      return quotaErrorResponse(quotaBefore);
    }

    const request = await readQuizRequest(req);
    const {
      language,
      level,
      difficulty,
      sourceMode,
      topic,
      sourceText,
      focus,
      questionMode,
      count,
      seconds,
      pdfFile,
    } = request;
    const sourceHasDocument = sourceMode === "text" || sourceMode === "pdf";
    const topicHasHistoricalYear = !sourceHasDocument && hasHistoricalYear(topic);
    const contextRichLevel = requiresContextRichQuestions(level);

    if (sourceMode === "text" && sourceText.length < 40) {
      return Response.json({ error: "Add a little more lesson text first." }, { status: 400 });
    }
    if (sourceMode === "pdf" && !pdfFile) {
      return Response.json({ error: "Missing PDF file." }, { status: 400 });
    }
    if (!sourceHasDocument && !topic) {
      return Response.json({ error: "Missing topic." }, { status: 400 });
    }
    if (!sourceHasDocument && hasBlockedQuizTopic(topic)) {
      return Response.json({ error: blockedQuizTopicError(language), blockedTopic: true }, { status: 400 });
    }
    const factRiskWarning = !sourceHasDocument && (hasRecentOrCurrentFactRisk(topic) || hasGeneralFactRisk(topic, focus));

    const prompt =
      `You are creating a classroom quiz for 321school.\n` +
      `${getLanguageInstruction(language)}\n` +
      `Learner level: ${level}\n` +
      `Level guidance: ${getLevelInstruction(level)}\n` +
      `${getDifficultyInstruction(difficulty)}\n` +
      `Number of questions: ${count}\n` +
      `Default seconds per question: ${seconds}\n` +
      `Category: ${getFocusInstruction(focus)}\n\n` +
      `Question format: ${
        questionMode === "multiple_choice"
          ? "Only multiple choice questions."
          : questionMode === "true_false"
            ? "Only true/false questions."
            : "Use a good mix of multiple choice and true/false questions."
      }\n\n` +
      `Source:\n` +
      (sourceMode === "text" ? sourceText : sourceMode === "pdf" ? `PDF file: ${pdfFile?.name || topic || "quiz-source.pdf"}` : topic) +
      `\n\nRules:\n` +
      `- Create a useful classroom quiz, not a worksheet.\n` +
      (sourceHasDocument
        ? `- Use ONLY the supplied source ${sourceMode === "pdf" ? "PDF" : "text"} for factual claims, answers, and explanations. If a fact is not in the source, do not ask about it.\n`
        : `- The source is only a topic. Use only stable, widely documented general knowledge that a teacher can reasonably verify. Do not ask about recent events, current results, future events, exact statistics, or facts that may have changed.\n`) +
      (factRiskWarning
        ? `- This topic may include facts a teacher must verify. Prefer broad, school-safe questions and avoid fragile claims unless they are common knowledge.\n`
        : "") +
      (!sourceHasDocument
        ? `- For place topics without a source, avoid exact founding years, disputed origin claims, named local-biography claims, and causal questions about why a city became a capital unless the fact is completely uncontroversial.\n`
        : "") +
      (topicHasHistoricalYear
        ? `- This is a historical-year topic without source text. Prefer major public events, politics, culture, sports, technology, and everyday-life markers from that year. Avoid narrow trivia such as "who died in this year", birth years, exact dates, minor awards, obscure rankings, sales figures, or claims that require a source table.\n`
        : "") +
      `- If the user gives a concrete example or angle in the source, include it or make one question clearly inspired by it when it is safe and factual.\n` +
      (contextRichLevel
        ? `- For ${level.toUpperCase()} and higher-level learners, many question stems should be longer and include enough context for students to reason before choosing. Do not make every question a one-line recall question.\n`
        : "") +
      `- Hard questions should be hard because they require context or comparison, not because they rely on obscure or fragile facts.\n` +
      `- Write natural, idiomatic question wording in the target language. Avoid awkward stems such as "which of the following areas" when a simpler phrase like "which area" is correct.\n` +
      `- Do not invent facts, dates, numbers, scores, winners, rankings, or statistics.\n` +
      `- Before returning, silently check every correct answer against the explanation and replace any question you are not highly confident is true.\n` +
      (questionMode === "mixed" ? `- Use a mix of multiple_choice and true_false when it fits.\n` : `- Every question must use type "${questionMode}".\n`) +
      `- Multiple choice must have 3 or 4 options.\n` +
      `- True/false must have exactly 2 options, written in the target language.\n` +
      `- Include one short explanation per question.\n` +
      `- The explanation must explain the underlying fact or idea in a natural sentence.\n` +
      `- Do not end explanations with formula phrases like "noe som gjør dette til det riktige svaret", "which makes this the correct answer", or similar wording.\n` +
      `- Do not reveal the answer by saying "this is the correct answer"; just explain the fact.\n` +
      `- Make distractors plausible but clearly wrong.\n` +
      `- Do not make questions where several options can be correct.\n` +
      `- Vary the correct answer position. Do not put the correct answer first every time.\n` +
      `- Return JSON only. No markdown.\n\n` +
      `Return this exact shape:\n` +
      `{\n` +
      `  "title": "string",\n` +
      `  "description": "string",\n` +
      `  "level": "string",\n` +
      `  "language": "string",\n` +
      `  "questions": [\n` +
      `    {\n` +
      `      "type": "multiple_choice",\n` +
      `      "question": "string",\n` +
      `      "options": ["string", "string", "string", "string"],\n` +
      `      "correctIndex": 0,\n` +
      `      "explanation": "string",\n` +
      `      "seconds": ${seconds}\n` +
      `    }\n` +
      `  ]\n` +
      `}`;

    const uploadedFile = pdfFile
      ? await client.files.create({
          file: await toFile(Buffer.from(await pdfFile.arrayBuffer()), pdfFile.name || "quiz-source.pdf", {
            type: pdfFile.type || "application/pdf",
          }),
          purpose: "user_data",
          expires_after: { anchor: "created_at", seconds: 3600 },
        })
      : null;

    let response: Awaited<ReturnType<typeof client.responses.create>>;
    try {
      response = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        text: { format: { type: "json_object" } },
        temperature: sourceHasDocument ? 0.1 : 0.2,
        input: [
          {
            role: "system",
            content:
              "Create editable classroom quizzes. Accuracy is more important than variety or difficulty. Return valid JSON only.",
          },
          {
            role: "user",
            content: uploadedFile
              ? [
                  { type: "input_text", text: prompt },
                  { type: "input_file", file_id: uploadedFile.id },
                ]
              : prompt,
          },
        ],
      });
    } finally {
      if (uploadedFile) {
        await client.files.delete(uploadedFile.id).catch(() => undefined);
      }
    }

    const raw = response.output_text?.trim();
    if (!raw) return Response.json({ error: "Empty response from model." }, { status: 500 });

    const jsonText = extractJsonObject(raw);
    if (!jsonText) return Response.json({ error: "Could not find JSON in model response.", raw }, { status: 500 });

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return Response.json({ error: "Invalid JSON from model.", raw }, { status: 500 });
    }

    if (!isRecord(parsed)) return Response.json({ error: "Model returned non-object JSON.", raw }, { status: 500 });

    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .map((item, index) => cleanQuestion(item, index, seconds))
      .filter((item): item is QuizQuestion => item !== null)
      .filter((item) => !topicHasHistoricalYear || !isUnsafeHistoricalTopicQuestion(item))
      .slice(0, count);

    if (questions.length < 3) {
      return Response.json({ error: "Model response missing usable questions. Try adding source text for more precise factual quizzes.", raw }, { status: 500 });
    }

    await consumeFeatureAdmin({
      uid: user.uid,
      feature: "producer_create_quiz",
    });

    const quotaAfter = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      studentAccessMode: user.studentAccessMode,
      feature: "producer_create_quiz",
    });

    return Response.json({
      title: pickString(parsed, "title", topic || "321 quiz"),
      description: pickString(parsed, "description", ""),
      level: pickString(parsed, "level", level),
      language: pickString(parsed, "language", language),
      sourceMode,
      topic,
      sourceText: sourceMode === "text" ? sourceText : "",
      focus,
      questionMode,
      difficulty,
      questions,
      quota: {
        feature: "producer_create_quiz",
        bucket: quotaAfter.bucket,
        limit: quotaAfter.limit,
        used: quotaAfter.used,
        remaining: quotaAfter.remaining,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "EMAIL_VERIFICATION_REQUIRED") {
      return emailVerificationRequiredWebResponse();
    }
    if (error instanceof BadRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unknown server error";
    console.error("quiz-generator route error:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
