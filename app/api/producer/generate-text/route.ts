// app/api/producer/generate-text/route.ts
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getFeatureStatusAdmin,
} from "@/lib/featureGuardAdmin";
import { getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";
import { emailVerificationRequiredResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";
import {
  getPortugueseInsideSoundWords,
  getPortugueseSoundBank,
  getPortugueseSoundWords,
  getNorwegianInsideSoundWords,
  getNorwegianSoundBank,
  getNorwegianSoundWords,
  isApprovedPortugueseSoundWord,
  isApprovedNorwegianSoundWord,
  norwegianSoundWordContainsSound,
  norwegianSoundWordStartsWithSound,
  portugueseSoundWordContainsSound,
  portugueseSoundWordStartsWithSound,
} from "@/lib/a1start/soundWords";

export const runtime = "nodejs";

type GenerateTextBody = {
  level?: string;
  language?: string;
  topic?: string;
  textType?: string;
  textLength?: number;
  extraFactCheck?: boolean;
  sourceText?: string;
  reportLanguage?: string;
  a1Start?: A1StartConfig;
};

type A1StartConfig = {
  type?: string;
  verb?: string;
  tense?: string;
  sentenceCount?: number;
  topic?: string;
  wordClass?: string;
  word?: string;
  highFrequencyLength?: number;
  highFrequencyTheme?: string;
  focusSound?: string;
  soundSentenceCount?: number;
  soundWordCount?: number;
};

type GenerateTextResult = {
  title: string;
  text: unknown;
  highFrequencyReadingSentences?: unknown;
  highFrequencyExplanation?: unknown;
  factCheckReport?: unknown;
};

type A1StartVerbPattern = {
  first: string;
  other: string;
  complements: string[];
};

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
  studentAccessMode?: string | null;
};

function stringifyGeneratedText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map(stringifyGeneratedText).filter(Boolean).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(stringifyGeneratedText)
      .filter(Boolean)
      .join("\n\n");
  }
  if (value == null) return "";
  return String(value).trim();
}

async function getRequestUserContext(req: Request): Promise<RequestUserContext | null> {
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization");

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
    role: data?.role ?? "anonymous",
    plan,
    studentAccessMode:
      typeof data?.studentAccessMode === "string" ? data.studentAccessMode : null,
  };
}

function resolveLanguageName(code: string): string {
  const c = code.toLowerCase();
  if (c === "nb" || c === "no" || c === "nn") return "Norwegian";
  if (c === "en") return "English";
  if (c === "pt") return "Portuguese";
  if (c === "pt-br") return "Brazilian Portuguese";
  if (c === "pt-pt") return "European Portuguese";
  return code;
}

function shouldRunExtraFactCheck(textType: string, topic: string): boolean {
  const combined = `${textType} ${topic}`.toLocaleLowerCase();
  return [
    "factual",
    "saktekst",
    "texto informativo",
    "biografi",
    "biography",
    "historisk",
    "historical",
    "historie",
    "history",
  ].some((term) => combined.includes(term));
}

function buildCefrLevelGuidance(level: string): string {
  const normalized = level.trim().toUpperCase();

  if (normalized === "A1") {
    return [
      "A1 control:",
      "- Use very short sentences with simple word order.",
      "- Use concrete, high-frequency words and familiar situations.",
      "- Avoid subordinate clauses, idioms, abstract nouns and long noun phrases.",
      "- Keep the text clearly below A2 if you are unsure.",
      "- Avoid long compound words and difficult verbs when a simpler word or phrase exists.",
      "- For Norwegian A1, avoid words like 'teaterforestillinger' and 'avhenger'. Use simpler phrasing such as 'teater' or 'kommer an på'.",
    ].join("\n");
  }

  if (normalized === "A2") {
    return [
      "A2 control:",
      "- Aim a little easier rather than a little harder. Do not drift toward B1.",
      "- Use short, clear sentences, usually 6-12 words.",
      "- Prefer main clauses and simple connectors such as and, but, because, then and when.",
      "- Use active everyday language and concrete words.",
      "- Avoid abstract nominalizations, dense noun phrases, idioms and specialist vocabulary.",
      "- For Norwegian, avoid old-fashioned words such as 'meget'; use natural modern words such as 'veldig'.",
      "- For Norwegian, avoid difficult abstract compounds such as 'musikkglede'. Split the idea into simpler wording.",
    ].join("\n");
  }

  if (normalized === "B1") {
    return [
      "B1 control:",
      "- Use clear everyday language with some variation in sentence length.",
      "- You may use common subordinate clauses, but avoid academic style.",
      "- Explain harder words through context or choose simpler alternatives.",
      "- Keep the text accessible for an independent learner, not a native-school textbook.",
    ].join("\n");
  }

  if (normalized === "B2") {
    return [
      "B2 control:",
      "- Use varied but still clear language.",
      "- You may include more nuance, causes and consequences.",
      "- Avoid unnecessarily academic or literary wording unless the text type requires it.",
    ].join("\n");
  }

  return [
    "Level control:",
    "- Match the requested CEFR level closely.",
    "- If unsure, choose simpler wording and clearer sentence structure.",
    "- Do not write above the requested level just to sound polished.",
  ].join("\n");
}

function buildCefrTextPrompt(args: {
  languageName: string;
  level: string;
  topic: string;
  textType: string;
  textLength: number;
  extraFactCheck?: boolean;
}): string {
  const { languageName, level, topic, textType, textLength, extraFactCheck } = args;
  const minWords = Math.max(1, Math.round(textLength * 0.9));
  const maxWords = Math.max(minWords, Math.round(textLength * 1.1));

  return `
Write a ${textType} text.

Language: ${languageName}
Level: ${level}
Topic: ${topic}
Target length: ${textLength} words
Allowed length: ${minWords}-${maxWords} words

${buildCefrLevelGuidance(level)}

Teacher choices:
- Follow the requested language, CEFR level, topic, text type and word count closely.
- The text type matters. If the teacher asks for nonfiction, write a coherent nonfiction text, not a story.
- The final text must be ${minWords}-${maxWords} words. Silently count the words before returning.
- Do not end much earlier just because the text has a reflection or because the language level is simple.
- Level control should shape vocabulary and sentence structure, but it must not make the text too short, thin or unfinished.
- A coherent, useful reading text is more important than adding stylistic extras.

Factual accuracy:
- Use only facts you know with high confidence.
- Do not invent exact dates, birthplaces, family details, hobbies, teams, prizes, quotes or career events.
- If the topic is a real person, place or historical event and you are not sure about a fact, omit it or write more generally.
- Never add a personal detail only to make the text more interesting unless it is a verified or teacher-supplied fact.
- Do not create vague fake anecdotes such as "one time at a big concert" unless the event is verified or supplied by the teacher.
- For real people, be extra careful with birthplaces, schools, universities, workplaces and named organizations.
- If an exact institution or place is not teacher-supplied or certain, write generally instead, for example "Han lærte mer i utlandet" rather than naming a school or city.
- Do not turn a general fact into a specific one. "Han studerte musikk" is safer than an uncertain named institution.
- If the topic is a named person, assume biography facts are high risk unless they are very well known.
- For named people, avoid birthplace, exact education, exact workplaces and current roles unless you are certain.
- Prefer durable facts over current facts. Be especially careful with roles that may have changed recently.
- If writing about a living person, avoid saying "today he/she works as..." unless that current role is teacher-supplied or certain.
- For living people, prefer past roles with clear time spans over current-role sentences. Write "var ... fra 2014 til 2024" rather than "jobber som ..." when a role may have changed.

${extraFactCheck ? `Extra fact-check mode:
- This generation will be compared with another draft before the final answer.
- Be conservative with concrete facts so the final text can keep only stable, high-confidence information.
- Prefer a slightly more general sentence over a risky exact fact.
` : ""}

Narrative quality:
- Do not write a flat CV list or encyclopedia summary.
- Give the text a small narrative shape: a concrete moment, a challenge, a change over time, or one verified personal detail when relevant.
- Use narrative detail as spice, not as a long detour, and only when it supports the requested text type.
- For a nonfiction biography, build a clear progression such as childhood/background, work, one important contribution, and why the person matters.
- Vary the opening when it fits the topic: a simple question, a clear claim, or a concrete scene can work.
- A reflection question or final thought is optional and should be used rarely. Most texts should end with a simple, natural closing sentence.
- Use a reflection ending only if it fits the text type, the topic and the requested level very naturally.
- Do not force a reflection ending. Never let it replace missing content or reduce the requested length.

Language quality:
- Write modern, natural, active everyday language.
- Prefer common collocations and phrasing that a native speaker would actually use.
- Avoid formal filler, old-fashioned wording and inflated praise.
- Keep the text connected from beginning to end, with clear progression between paragraphs.
- For abstract topics such as politics, economy, tax, society, health or the environment, simplify extra carefully at A1-A2.
- At A1-A2, introduce only a few necessary technical words, and explain each one in simple everyday language.
- Avoid dense lists of technical terms at A1-A2. Choose the most important examples instead.

Return valid JSON only:
{
  "title": "...",
  "text": "..."
}
          `.trim();
}

function buildFactCheckReviewPrompt(args: {
  languageName: string;
  reportLanguageName: string;
  level: string;
  topic: string;
  textType: string;
  sourceText: string;
}): string {
  const { languageName, reportLanguageName, level, topic, textType, sourceText } = args;

  return `
Fact-check and lightly correct the teacher's current learner text.

Language of the learner text: ${languageName}
Language for the change report: ${reportLanguageName}
CEFR level of the learner text: ${level}
Topic: ${topic}
Text type: ${textType}

Current text to check:
${sourceText}

Hard rules:
- Keep the learner text in ${languageName}.
- Start by identifying risk facts: years, dates, ages, places, birthplaces, names, titles, jobs, work history, positions, current roles, quotes, statistics, historical claims, named organizations and current administrative geography.
- Treat risk facts as claims that must be verified or marked as uncertain.
- Treat current administrative geography as high risk: country, region, state, county, municipality, district and city/town relationships may change over time.
- Do not assume an old region/county/state name is still the current administrative location. It may be historically meaningful, but current wording must be checked or made cautious.
- For Norwegian places, be especially careful with county and municipality claims after municipal/county reforms. For example, old county names can be historically relevant but should not be presented as current county names without checking.
- Apply the same principle globally rather than memorizing a country-specific list: administrative borders and names can change in any country.
- If web search/source checking is available, use it for risk facts. Prefer official, encyclopedic or otherwise reliable sources.
- Approximate wording such as "about", "around", "ca." or "approximately" can make a number safer, but the number is still a risk fact and must be mentioned in the report.
- If there are no clear factual errors and no clear language errors, return the original learner text unchanged.
- Do not improve, expand or enrich a text just because it could be better.
- Do not add new examples, new explanations or new paragraphs unless a tiny wording change is necessary to remove a factual risk.
- Preserve paragraph structure, level, length, voice and main wording.
- You may correct only clear spelling, punctuation, verb tense, preposition, agreement, word choice or sentence errors.
- Do not correct acceptable wording just because a different phrasing is more polished.
- Do not change informal but valid learner-level phrasing.
- For example, do not change Norwegian "trodde på at" to "trodde at" unless the sentence is actually unclear or ungrammatical.
- When in doubt about a language change, leave the wording unchanged and mention no language error.
- You may correct concrete factual errors only when you have strong evidence.
- If a factual claim cannot be verified, do not invent a correction. Keep the text unchanged or make it slightly more cautious only if the original wording is clearly risky.
- Do not make the language more advanced than ${level}.

Report rules:
- The report must be very short and concrete.
- Do not assess content quality, pedagogy, structure or whether the text could be richer.
- Always include a factual status and a language status.
- For every obvious risk fact in the text, especially numbers, dates, years, places, administrative geography, named people, jobs, work history and roles, give one short status: verified, changed, or should be checked before publishing.
- When the text contains risk facts and no factual errors are found, briefly name what was checked. Example: "Ingen tydelige faktafeil funnet. Sjekket fødselsår, dødsår, ekte navn, arbeid i Burma og kjente verk."
- Keep this risk-fact trace short: one sentence or parenthesis is enough.
- If no factual errors are found, write the ${reportLanguageName} equivalent of: "Ingen tydelige faktafeil funnet."
- If no clear spelling, sentence or word errors are found, write that too.
- Do not report style improvements as language errors.
- List only actual changes, for example: "Endret fødested fra Os til Bergen" or "Endret 'Spise' til 'spiste'."
- If you used sources for a correction, include a short source reference or URL when available.
- If you made no changes, the report should normally be only 1-2 short sentences.
- If you did make changes, the report should normally be 2-4 short sentences.
- Preferred report shape:
  "Fakta: ...
  Språk: ...
  Endringer: ...
  Kilder/sjekkpunkter: ..."

Return valid JSON only:
{
  "title": "same title or a short suitable title",
  "text": "the minimally corrected learner text",
  "factCheckReport": "short concrete change report in ${reportLanguageName}"
}
          `.trim();
}

function buildA1StartPatternPrompt(languageName: string, config: A1StartConfig): string {
  const verb = String(config.verb || "").trim();
  const tense = ["present", "past", "future"].includes(String(config.tense))
    ? String(config.tense)
    : "present";
  const sentenceCount = [8, 11, 14, 17, 20].includes(Number(config.sentenceCount))
    ? Number(config.sentenceCount)
    : 11;
  const additionalSubjectCount = (sentenceCount - 5) / 3;
  const firstOtherSentence = 5;
  const lastOtherSentence = sentenceCount - 1;
  const topic = String(config.topic || "").trim();

  if (!verb) throw new Error("Verb is required for A1 Start.");

  return `
Create an A1 Start reading-practice lesson using pattern sentences.

Target language: ${languageName}
Verb supplied by the teacher: ${verb}
Tense: ${tense}
Number of sentences: ${sentenceCount}
Optional theme: ${topic || "No specific theme"}

Strict reading-practice rules:
- Write exactly ${sentenceCount} sentences using the structure below. Blank separator lines do not count as sentences.
- Do not write fewer or more than ${sentenceCount} sentences. Stop immediately after sentence ${sentenceCount}.
- Exact layout:
  Sentence 1: first-person introduction.
  Blank line.
  Sentences 2-4: same first-person subject as sentence 1, with three different complements.
  Blank line.
  Sentences ${firstOtherSentence}-${lastOtherSentence}: exactly ${additionalSubjectCount} new subject groups. Each group has 3 sentences with the same subject.
  Blank line.
  Sentence ${sentenceCount}: exact copy of sentence 1.
- The teacher may supply the verb in an infinitive or present form. Do not copy it blindly.
- Use the same verb meaning in every sentence, conjugated naturally for the requested tense.
- If the requested tense is past, every sentence must use a natural past-tense form. For Norwegian, examples: "lager" -> "lagde", "spiller" -> "spilte", "går" -> "gikk".
- If the requested tense is future, every sentence must use a natural future construction. For Norwegian, examples: "skal lage", "skal spille", "skal gå".
- Keep the same verb meaning clearly recognizable in every sentence, even when its form changes with the subject.
- For Brazilian Portuguese, be careful that "ser" and "ir" share preterite forms. If the teacher supplies "ser", use identity or description complements, not movement or destination complements.
- The first line must be a complete sentence beginning with the first-person singular subject, equivalent to "Jeg" in Norwegian.
- The first line must include a natural object or complement after the verb. Do not write bare openings like "I read", "I will read", "Eu vou gostar" or "Jeg leser".
- Every line must be a complete, meaningful sentence using subject + verb + a natural simple object/complement.
- For verbs that take an object, prefer a concrete noun phrase. Example: "Jeg ser en katt" and "Katten ser en mus".
- For verbs that normally do not take an object, do not add random nouns. Use a natural short complement instead. Example in Norwegian: "Jeg hostet litt", "Jeg hostet i dag", not "Jeg hostet en katt".
- For movement verbs, use natural place, route or direction complements. Vary prepositions and adverbs when natural. Norwegian examples: "Jeg går hjem", "Jeg går på skolen", "Jeg går i parken", "Jeg går til butikken", not repeated "går til" with random animals or objects.
- The theme is weak guidance only. Use it when it fits naturally with the verb. Ignore the theme when it would create strange language.
- Never force the theme in as an object or complement. Bad examples: "Jeg spiller helse", "Jeg drikker familie", "Jeg spiller middag", "Jeg hoster en katt".
- Choose natural objects/complements for the verb first. Language quality is more important than theme coverage.
- Do not reuse the same generic object list for every theme. If the theme fits the verb, choose natural theme-related complements. If it does not fit, choose natural verb-related complements instead.
- For a friends theme, prefer words about friends and friendship only when the verb fits. For breakfast/dinner, prefer food and drink words only when the verb fits. For school, prefer school objects and activities only when the verb fits.
- The title must be exactly the first complete sentence without final punctuation. Example: "Jeg er snill".
- Line 1 is an introduction sentence with the first-person subject.
- Lines 2, 3 and 4 must use the same first-person subject and verb as line 1, but each line must have a different simple object/complement.
- Then choose exactly ${additionalSubjectCount} varied, simple, single-word subjects. Use a mix of pronouns, names and simple nouns when natural. Do not use only the equivalents of he/she.
- If ${sentenceCount} is 14 or more, at least one of the new subject groups must use a name or a simple noun, not only a pronoun.
- Use each new subject exactly three times in a row with the same verb, but vary the simple object/complement in all three sentences.
- Every subject must make logical sense with the verb. For example, do not write "Det liker kaffe" or "Det drikker melk"; use a person, name or suitable living subject.
- The final line must stand alone and be an exact copy of the complete first line.
- Repetition of subject + verb and variation of the final object/complement are both essential.
- Use only concrete, high-frequency words suitable for a beginning reader.
- Keep the content suitable for school and children. Do not use alcohol, drugs, smoking/vaping, sexual content, dating/romance, violence, weapons, insults or adult themes.
- Avoid dialogue, paragraphs, subordinate clauses, explanations, and advanced vocabulary.
- Put one sentence on each line, and end every sentence with a period.
- Put a blank line after line 1, after the first-person group, and between subject groups.
- Write everything in ${languageName}.

Return valid JSON only:
{
  "title": "short simple title",
  "text": "sentence 1\\nsentence 2"
}
`.trim();
}

function getA1StartPatternSentenceCount(config: A1StartConfig): number {
  return [8, 10, 11, 13, 14, 16, 17, 19, 20].includes(Number(config.sentenceCount))
    ? Number(config.sentenceCount)
    : 11;
}

function getNorwegianA1StartVerbKey(verb: string): string {
  const normalized = cleanA1StartLine(verb).toLocaleLowerCase();
  const aliases: Record<string, string> = {
    lage: "lager",
    spille: "spiller",
    spise: "spiser",
    drikke: "drikker",
    gå: "går",
    komme: "kommer",
    klatre: "klatrer",
    løpe: "løper",
    reise: "reiser",
    lese: "leser",
    skrive: "skriver",
    like: "liker",
    se: "ser",
    ha: "har",
    være: "er",
  };
  return aliases[normalized] || normalized;
}

function expectedNorwegianA1StartVerbForm(verb: string, tense: string): string | null {
  const verbKey = getNorwegianA1StartVerbKey(verb);
  const normalizedTense = tense === "past" || tense === "future" ? tense : "present";
  const forms: Record<string, Record<string, string>> = {
    er: { present: "er", past: "var", future: "skal være" },
    har: { present: "har", past: "hadde", future: "skal ha" },
    ser: { present: "ser", past: "så", future: "skal se" },
    liker: { present: "liker", past: "likte", future: "skal like" },
    spiser: { present: "spiser", past: "spiste", future: "skal spise" },
    drikker: { present: "drikker", past: "drakk", future: "skal drikke" },
    går: { present: "går", past: "gikk", future: "skal gå" },
    kommer: { present: "kommer", past: "kom", future: "skal komme" },
    lager: { present: "lager", past: "lagde", future: "skal lage" },
    leser: { present: "leser", past: "leste", future: "skal lese" },
    skriver: { present: "skriver", past: "skrev", future: "skal skrive" },
    spiller: { present: "spiller", past: "spilte", future: "skal spille" },
    klatrer: { present: "klatrer", past: "klatret", future: "skal klatre" },
    løper: { present: "løper", past: "løp", future: "skal løpe" },
    reiser: { present: "reiser", past: "reiste", future: "skal reise" },
  };
  return forms[verbKey]?.[normalizedTense] || null;
}

function norwegianLineHasDirectObjectAfterVerb(line: string, verbForms: string[]): boolean {
  const lower = cleanA1StartLine(line).toLocaleLowerCase();
  return verbForms.some((verbForm) => {
    const escapedVerb = verbForm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escapedVerb}\\s+(?:en|ei|et)\\s+\\p{L}+`, "iu").test(lower);
  });
}

function getNorwegianMovementVerbForms(verb: string): string[] | null {
  const verbKey = getNorwegianA1StartVerbKey(verb);
  const forms: Record<string, string[]> = {
    går: ["går", "gikk", "skal gå"],
    kommer: ["kommer", "kom", "skal komme"],
    klatrer: ["klatrer", "klatret", "skal klatre"],
    løper: ["løper", "løp", "skal løpe"],
    reiser: ["reiser", "reiste", "skal reise"],
  };
  return forms[verbKey] || null;
}

function getNorwegianPrepositionAfterVerb(line: string, verbForms: string[]): string | null {
  const lower = cleanA1StartLine(line).toLocaleLowerCase();
  for (const verbForm of verbForms) {
    const escapedVerb = verbForm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = lower.match(
      new RegExp(`\\b${escapedVerb}\\s+(i|på|til|fra|over|under|ved|mellom|gjennom|rundt|opp|ned|ut|inn)\\b`, "iu")
    );
    if (match?.[1]) return match[1];
  }
  return null;
}

function norwegianMovementLineHasRandomDestination(line: string, verbForms: string[]): boolean {
  const lower = cleanA1StartLine(line).toLocaleLowerCase();
  const randomDestinations = [
    "katten",
    "hunden",
    "boka",
    "boken",
    "leken",
    "ballen",
    "koppen",
    "stolen",
    "lampen",
    "puta",
    "puten",
    "senga",
    "sengen",
    "blomsten",
  ];
  return verbForms.some((verbForm) => {
    const escapedVerb = verbForm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escapedVerb}\\s+til\\s+(?:${randomDestinations.join("|")})\\b`, "iu").test(lower);
  });
}

function getA1StartLineSubject(line: string): string {
  return cleanA1StartLine(line).split(/\s+/)[0] || "";
}

function getA1StartOpeningVerbTokenCount(
  line: string,
  selectedVerb: string,
  tense: string,
  languageName: string
): number {
  const words = cleanA1StartLine(line).toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const normalizedTense = tense === "past" || tense === "future" ? tense : "present";

  if (languageName === "Norwegian") {
    const expectedForm = expectedNorwegianA1StartVerbForm(selectedVerb, normalizedTense);
    return expectedForm ? expectedForm.split(/\s+/).length : Math.max(1, cleanA1StartLine(selectedVerb).split(/\s+/).length);
  }

  if (languageName === "Brazilian Portuguese") {
    const pattern = getA1StartBrazilianPortugueseVerbPattern(selectedVerb, normalizedTense, "");
    if (pattern) return pattern.first.split(/\s+/).length;
    if (normalizedTense === "future" && words[1] === "vou") return 2;
  }

  if (languageName === "Portuguese" && normalizedTense === "future" && words[1] === "vou") {
    return 2;
  }

  if (languageName === "English" && normalizedTense === "future" && words[1] === "will") {
    return 2;
  }

  return Math.max(1, cleanA1StartLine(selectedVerb).split(/\s+/).length);
}

function firstA1StartSentenceHasComplement(
  line: string,
  selectedVerb: string,
  tense: string,
  languageName: string
): boolean {
  const words = cleanA1StartLine(line).split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const verbTokenCount = getA1StartOpeningVerbTokenCount(line, selectedVerb, tense, languageName);
  return words.length > 1 + verbTokenCount;
}

function findA1StartBlockedContentLine(lines: string[]): string | null {
  const blockedPatterns = [
    /\bøl\b/iu,
    /\bvin\b/iu,
    /\bsprit\b/iu,
    /\bvodka\b/iu,
    /\bwhisky\b/iu,
    /\bcider\b/iu,
    /\bbeer\b/iu,
    /\bwine\b/iu,
    /\bliquor\b/iu,
    /\balcohol\b/iu,
    /\bcerveja\b/iu,
    /\bvinho\b/iu,
    /\bsexo\b/iu,
    /\bsex\b/iu,
    /\bnarkotika\b/iu,
    /\bdop\b/iu,
    /\bdrugs?\b/iu,
    /\bdrogas?\b/iu,
    /\brøyk\b/iu,
    /\bsigarett/iu,
    /\bsmok(?:e|ing)\b/iu,
    /\bvape\b/iu,
  ];
  return lines.find((line) => blockedPatterns.some((pattern) => pattern.test(line))) || null;
}

function getA1StartOtherSubjectGroups(lines: string[]): string[][] {
  const groups: string[][] = [];
  for (let index = 4; index < lines.length - 1; index += 3) {
    const group = lines.slice(index, index + 3);
    if (group.length === 3) groups.push(group);
  }
  return groups;
}

function isLikelyPronounSubject(languageName: string, subject: string): boolean {
  const normalized = subject.toLocaleLowerCase();
  if (languageName === "Norwegian") {
    return ["jeg", "du", "han", "hun", "det", "den", "vi", "dere", "de"].includes(normalized);
  }
  if (languageName === "English") {
    return ["i", "you", "he", "she", "it", "we", "they"].includes(normalized);
  }
  if (languageName === "Portuguese" || languageName === "Brazilian Portuguese") {
    return ["eu", "você", "ele", "ela", "nós", "eles", "elas", "isso", "isto"].includes(normalized);
  }
  return false;
}

function findA1StartPatternProblems(
  result: GenerateTextResult,
  expectedSentenceCount: number,
  config: A1StartConfig,
  languageName: string
): string[] {
  const allLines = String(result.text || "")
    .split(/\r?\n/)
    .map(cleanA1StartLine)
    .filter(Boolean);
  const lines = allLines.slice(0, expectedSentenceCount);
  const problems: string[] = [];
  const selectedVerb = cleanA1StartLine(String(config.verb || "")).toLocaleLowerCase();
  const topic = cleanA1StartLine(String(config.topic || "")).toLocaleLowerCase();

  if (allLines.length < expectedSentenceCount) {
    problems.push(`The text has ${allLines.length} sentences, but it must have at least ${expectedSentenceCount}.`);
  }
  if (lines.length >= expectedSentenceCount && lines[0] !== lines[expectedSentenceCount - 1]) {
    problems.push("The final sentence must be an exact copy of the first sentence.");
  }
  const blockedContentLine = findA1StartBlockedContentLine(lines);
  if (blockedContentLine) {
    problems.push(
      `The sentence "${blockedContentLine}" contains content that is not suitable for A1 Start school material. Use child-safe everyday words instead.`
    );
  }
  if (
    lines.length > 0 &&
    !firstA1StartSentenceHasComplement(
      lines[0],
      selectedVerb,
      String(config.tense || "present"),
      languageName
    )
  ) {
    problems.push(
      `The first sentence "${lines[0]}" is too bare. Sentence 1 must have a natural object or complement after the verb, because it is also repeated as the final sentence.`
    );
  }
  if (isNewA1StartPatternSentenceCount(expectedSentenceCount)) {
    const expectedOtherGroupCount = (expectedSentenceCount - 5) / 3;
    const otherSubjectGroups = getA1StartOtherSubjectGroups(lines);
    if (otherSubjectGroups.length < expectedOtherGroupCount) {
      problems.push(
        `The text has ${otherSubjectGroups.length} new subject groups, but it must have exactly ${expectedOtherGroupCount}. Add the missing 3-sentence subject group(s).`
      );
    }

    const malformedSubjectGroup = otherSubjectGroups.find((group) => {
      const subjects = group.map(getA1StartLineSubject);
      return new Set(subjects.map((subject) => subject.toLocaleLowerCase())).size !== 1;
    });
    if (malformedSubjectGroup) {
      problems.push(
        `Each new subject group must repeat the same subject exactly three times. Fix this group: "${malformedSubjectGroup.join(" / ")}".`
      );
    }

    if (expectedSentenceCount >= 14 && otherSubjectGroups.length >= expectedOtherGroupCount) {
      const otherSubjects = otherSubjectGroups
        .slice(0, expectedOtherGroupCount)
        .map((group) => getA1StartLineSubject(group[0]))
        .filter(Boolean);
      const hasNameOrNoun = otherSubjects.some(
        (subject) => !isLikelyPronounSubject(languageName, subject)
      );
      if (!hasNameOrNoun) {
        problems.push(
          "For 14 or more sentences, at least one new subject group must use a name or a simple noun, not only pronouns like he/she."
        );
      }
    }
  }

  if (languageName === "Norwegian") {
    const verbKey = getNorwegianA1StartVerbKey(selectedVerb);
    const badSubjectLine = lines.find((line) => {
      const subject = getA1StartLineSubject(line);
      return subject && !isA1StartSubjectAllowed(languageName, selectedVerb, subject);
    });
    if (badSubjectLine) {
      problems.push(
        `The subject does not fit the Norwegian verb in "${badSubjectLine}". Use a person, name or suitable living subject instead of "det" or "den".`
      );
    }

    const expectedVerbForm = expectedNorwegianA1StartVerbForm(
      selectedVerb,
      String(config.tense || "present")
    );
    if (expectedVerbForm && lines.length > 0) {
      const linesWithExpectedVerb = lines.filter((line) =>
        lineContainsA1StartVerb(line, [expectedVerbForm])
      );
      if (linesWithExpectedVerb.length < Math.max(1, Math.floor(lines.length * 0.8))) {
        problems.push(
          `Wrong tense for Norwegian verb "${selectedVerb}". The requested tense is "${String(config.tense || "present")}", so use "${expectedVerbForm}" in the sentences.`
        );
      }
    }

    if (selectedVerb.endsWith("e")) {
      const finiteVerbPattern = new RegExp(`^(jeg|du|han|hun|vi|dere|de|[\\p{L}]+)\\s+${selectedVerb.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "iu");
      const badInfinitiveLine = lines.find((line) => {
        const lower = line.toLocaleLowerCase();
        return finiteVerbPattern.test(lower) && !lower.includes(`skal ${selectedVerb}`);
      });
      if (badInfinitiveLine) {
        problems.push(`Norwegian verb form is wrong in "${badInfinitiveLine}". Use a finite form, for example "spiller", not bare infinitive "spille".`);
      }
    }

    const themeCanBeNaturalObject = new Set(["liker", "elsker", "hater"]);
    if (selectedVerb && topic && !themeCanBeNaturalObject.has(verbKey)) {
      const forcedThemeUses = lines.filter((line) => {
        const lower = line.toLocaleLowerCase();
        return lower.includes(` ${selectedVerb} ${topic}`) || lower.endsWith(` ${topic}`);
      });
      if (forcedThemeUses.length >= 2) {
        problems.push(`The theme "${topic}" is being forced into sentence complements. Ignore the theme when it does not fit the verb naturally.`);
      }
    }

    const intransitiveVerbForms: Record<string, string[]> = {
      hoste: ["hoster", "hostet", "skal hoste"],
      hoster: ["hoster", "hostet", "skal hoste"],
      sovne: ["sovner", "sovnet", "skal sovne"],
      sovner: ["sovner", "sovnet", "skal sovne"],
      gråte: ["gråter", "gråt", "skal gråte"],
      gråter: ["gråter", "gråt", "skal gråte"],
      le: ["ler", "lo", "skal le"],
      ler: ["ler", "lo", "skal le"],
    };
    const intransitiveForms = intransitiveVerbForms[selectedVerb];
    const badObjectLine = intransitiveForms
      ? lines.find((line) => norwegianLineHasDirectObjectAfterVerb(line, intransitiveForms))
      : null;
    if (badObjectLine) {
      problems.push(
        `The Norwegian verb "${selectedVerb}" is used with an unnatural direct object in "${badObjectLine}". Use natural short complements instead, for example time/place/manner words, not random nouns.`
      );
    }

    const movementVerbForms = getNorwegianMovementVerbForms(selectedVerb);
    if (movementVerbForms) {
      const randomDestinationLine = lines.find((line) =>
        norwegianMovementLineHasRandomDestination(line, movementVerbForms)
      );
      if (randomDestinationLine) {
        problems.push(
          `The Norwegian movement verb "${selectedVerb}" has an unnatural destination in "${randomDestinationLine}". Use natural places, routes or directions, not random animals or objects.`
        );
      }

      const prepositions = lines
        .map((line) => getNorwegianPrepositionAfterVerb(line, movementVerbForms))
        .filter((value): value is string => Boolean(value));
      const prepositionCounts = prepositions.reduce<Record<string, number>>((acc, preposition) => {
        acc[preposition] = (acc[preposition] || 0) + 1;
        return acc;
      }, {});
      const repeatedPreposition = Object.entries(prepositionCounts).find(
        ([, count]) => count >= Math.max(4, Math.ceil(lines.length * 0.7))
      );
      if (verbKey === "går" && repeatedPreposition) {
        problems.push(
          `The Norwegian movement verb "${selectedVerb}" repeats the preposition "${repeatedPreposition[0]}" too mechanically. Vary natural complements such as "hjem", "på skolen", "i parken", "til butikken" and "ut".`
        );
      }
    }
  }

  return problems;
}

function buildA1StartPatternRepairPrompt(args: {
  languageName: string;
  config: A1StartConfig;
  previous: GenerateTextResult;
  problems: string[];
}): string {
  const sentenceCount = getA1StartPatternSentenceCount(args.config);
  const otherSubjectGroupCount = isNewA1StartPatternSentenceCount(sentenceCount)
    ? (sentenceCount - 5) / 3
    : (sentenceCount - 4) / 3;
  return `
Repair this A1 Start pattern-sentence text.

Target language: ${args.languageName}
Verb supplied by the teacher: ${String(args.config.verb || "").trim()}
Tense: ${String(args.config.tense || "present")}
Number of sentences: ${sentenceCount}
Optional theme: ${String(args.config.topic || "").trim() || "No specific theme"}

Problems to fix:
${args.problems.map((problem) => `- ${problem}`).join("\n")}

Previous JSON:
${JSON.stringify(args.previous, null, 2)}

Rules:
- Return valid JSON only.
- Keep exactly ${sentenceCount} sentences.
- Do not write fewer or more than ${sentenceCount} sentences. Stop immediately after sentence ${sentenceCount}.
- Use this exact layout:
  Sentence 1: first-person introduction.
  Blank line.
  Sentences 2-4: same first-person subject as sentence 1, with three different complements.
  Blank line.
  Then exactly ${otherSubjectGroupCount} new subject groups, 3 sentences per subject group.
  Blank line.
  Sentence ${sentenceCount}: exact copy of sentence 1.
- Use a mix of pronouns, names and simple nouns when natural. For 14 or more sentences, at least one new subject group must use a name or a simple noun.
- Sentence 1 must include a natural object or complement after the verb. Do not write bare openings like "I read", "I will read", "Eu vou gostar" or "Jeg leser".
- The teacher may supply the verb in an infinitive or present form. Do not copy it blindly.
- Use the teacher's verb meaning in the requested tense, conjugated naturally in ${args.languageName}.
- If the previous text used the wrong tense, rewrite every sentence in the requested tense.
- If the verb is intransitive or cannot naturally take an object, use short natural complements such as time, place, manner or degree. Do not attach random nouns.
- If the verb is a movement verb, use natural places, routes or directions. Vary prepositions and adverbs when natural; do not repeat one preposition mechanically with random nouns.
- Use the theme only when it fits naturally. Ignore it if it makes the language strange.
- Never force the theme in as an object or complement.
- Keep the content suitable for school and children. Do not use alcohol, drugs, smoking/vaping, sexual content, dating/romance, violence, weapons, insults or adult themes.
- Put one sentence on each line.
- End every sentence with a period.
- Put a blank line after line 1, after the first-person group, and between subject groups.
- The final sentence must be an exact copy of the first sentence.

Return:
{
  "title": "the first sentence without final punctuation",
  "text": "sentence 1\\n\\nsentence 2"
}
`.trim();
}

function buildA1StartHighFrequencyPrompt(languageName: string, config: A1StartConfig): string {
  const wordClass = String(config.wordClass || "").trim();
  const word = String(config.word || "").trim();
  const textLength = [50, 100, 150].includes(Number(config.highFrequencyLength))
    ? Number(config.highFrequencyLength)
    : 50;
  const lengthRange =
    textLength === 150
      ? { min: 135, ideal: 150, max: 180 }
      : textLength === 100
        ? { min: 90, ideal: 105, max: 125 }
        : { min: 45, ideal: 55, max: 70 };
  const theme = String(config.highFrequencyTheme || config.topic || "").trim() || "familie";

  if (!wordClass || !word) throw new Error("Word class and word are required for A1 Start.");

  const languageLabels = getHighFrequencyLanguageLabels(languageName);
  const wordClassLabel = getHighFrequencyWordClassLabel(wordClass, languageName);
  const wordClassExplanation = getHighFrequencyWordClassExplanation(wordClass, languageName);
  const wordExplanation = getHighFrequencyWordExplanation(word, languageName);
  const prepositionGuidance = wordClass === "preposition"
    ? `
PREPOSITIONS - EXTRA ATTENTION:
- Prepositions are especially language-dependent and need extra checking.
- When the focus word is a preposition, use it in several natural places in the coherent text.
- For a short text, use the focus preposition at least 3 times when possible. For medium or long texts, use it at least 4-6 times when possible.
- Do not use the preposition in every sentence, but do not hide it either. This is reading practice for the selected word.
- Use the preposition only when it fits naturally.
- Use common expressions that native speakers actually use.
- Respect fixed expressions, contractions and natural patterns in the target language.
- When the target language has natural contractions or fixed forms, always use the natural form.
- Do not translate preposition patterns directly from Norwegian or English.
- For Brazilian Portuguese, use natural contractions when needed, for example "em + a = na" and "em + o = no".
- Natural language is still more important than grammatical demonstration, but the selected preposition should be visible enough to practise.
`.trim()
    : "";

  return `
Create an A1 Start reading lesson about one high-frequency function word.

Target language: ${languageName}
Level: A1
Word class: ${wordClassLabel}
Focus word: ${word}
Theme: ${theme}
Target length for the coherent text before the explanation: ${lengthRange.ideal} words

Strict rules:
- Write everything in ${languageName}.
- Do not make pattern lines or sequences.
- Do not use chapter headings inside the text.
- Write one coherent, natural A1 text about the selected theme.
- The coherent text must be at least ${lengthRange.min} words and should be close to ${lengthRange.ideal} words.
- It is better to write a little too much than too little, but keep the coherent text under ${lengthRange.max} words.
- Use enough simple sentences to make the text feel complete, not like a short summary.
- LANGUAGE QUALITY IS MOST IMPORTANT.
- The main goal is to write a natural and correct text in ${languageName}.
- Good, natural language is more important than many occurrences of the focus word.
- Use the focus word "${word}" several times when it fits naturally. It should be clearly visible as the word being practised.
- If there is a conflict between natural language and more occurrences of the focus word, always prioritize natural language.
- Do not force the focus word into a sentence.
- Prefer short sentences and concrete everyday words.
- Vary the sentences freely. The text should feel like a small simple text, not a drill.
- When the theme is family, friends, school, home, food or travel, add several simple everyday details so the text has enough substance.
- Keep the grammar natural. If a sentence sounds strange, rewrite it.
- If you are unsure, choose a simpler sentence, a simpler word, or a more common expression.
- Do not write sentences that sound unnatural to native speakers.
- Avoid awkward phrases, wrong noun forms, direct translations and verb mistakes.
- Avoid weak or unnatural formulations like "To vennene mine", "Vi spise mat", "å være i sammen", "Mor lager ikke på TV" and "Barn spiller over gresset".
- The text should be readable by a native speaker without sentences feeling strange or artificial.
- Write the text as a native speaker would write for a child or a new language learner.
- Do not explain the word inside the main text.
${prepositionGuidance ? `\n${prepositionGuidance}\n` : ""}
- Put only the coherent reading-practice text in the "text" field.
- Put the 5 extra reading sentences in the separate "highFrequencyReadingSentences" field.
- Put only the word-class explanation in the separate "highFrequencyExplanation" field.
- In "highFrequencyExplanation", start with the heading "${languageLabels.explanationHeading}".
- Under "${languageLabels.explanationHeading}", write short plain lines without numbering or bullet points:
  ${languageLabels.belongsToWordClass(word, wordClassLabel)}
  ${wordClassExplanation}
  A simple explanation of the focus word "${word}": ${wordExplanation}
  One very simple example sentence with "${word}".
- In "highFrequencyReadingSentences", write exactly 5 simple, correct sentences where "${word}" is used in different natural situations.
- Do not include a heading in "highFrequencyReadingSentences".
- Do not number the explanation lines or reading sentences.
- The 5 example sentences should vary placement, time, subject or situation when possible.
- Every example sentence must be grammatically correct and idiomatic ${languageName}.
- The title must use the exact focus word "${word}", not a translation of it.

Return valid JSON only:
{
  "title": "${languageLabels.titlePrefix} – ${word}",
  "text": "coherent reading-practice text only",
  "highFrequencyReadingSentences": "sentence 1\\nsentence 2\\nsentence 3\\nsentence 4\\nsentence 5",
  "highFrequencyExplanation": "${languageLabels.explanationHeading}\\n..."
}
`.trim();
}

function getSoundLadderLabels(languageName: string): {
  titlePrefix: string;
  explanation: string;
  wordTraining: string;
  soundSentences: string;
  story: string;
  explanationLine: (sound: string) => string;
  examplesLine: (sound: string) => string;
} {
  if (languageName === "English") {
    return {
      titlePrefix: "Sound training",
      explanation: "Explanation",
      wordTraining: "Words and sound training",
      soundSentences: "Sentences with the sound",
      story: "Text",
      explanationLine: (sound) => `In this text, we practise the ${sound} sound.`,
      examplesLine: (sound) => `Listen for the ${sound} sound in words and sentences.`,
    };
  }
  if (languageName === "Brazilian Portuguese") {
    return {
      titlePrefix: "Treino de som",
      explanation: "Explicação",
      wordTraining: "Palavras e treino de som",
      soundSentences: "Frases com o som",
      story: "Texto",
      explanationLine: (sound) => `Neste texto, praticamos o som ${sound}.`,
      examplesLine: (sound) => `Escute o som ${sound} nas palavras e frases.`,
    };
  }
  return {
    titlePrefix: "Lydtrening",
    explanation: "Forklaring",
    wordTraining: "Ord og lydtrening",
    soundSentences: "Setninger med lyden",
    story: "Tekst",
    explanationLine: (sound) => `I denne teksten øver vi på ${sound}-lyden.`,
    examplesLine: (sound) => `Lytt etter ${sound}-lyden i ord og setninger.`,
  };
}

function getSoundLadderExplanationLines(languageName: string, focusSound: string): string[] {
  const labels = getSoundLadderLabels(languageName);
  const normalizedSound = focusSound.trim().toLocaleLowerCase();
  if (languageName === "Norwegian" && normalizedSound === "æ") {
    return [
      labels.explanationLine(focusSound),
      "Noen vanlige ord har æ-lyd selv om de skrives med e, for eksempel her, der og er.",
      labels.examplesLine(focusSound),
    ];
  }
  return [
    labels.explanationLine(focusSound),
    labels.examplesLine(focusSound),
  ];
}

function getSoundLadderExplanationText(languageName: string, focusSound: string, words: string[]): string {
  const labels = getSoundLadderLabels(languageName);
  const examples = words.slice(0, 3).join(", ");
  const exampleLine =
    examples && languageName === "Brazilian Portuguese"
      ? `Use palavras como ${examples}.`
      : examples && languageName === "English"
        ? `Use words such as ${examples}.`
        : examples
          ? `Bruk ord som ${examples}.`
          : "";
  return [
    labels.explanation,
    ...getSoundLadderExplanationLines(languageName, focusSound),
    exampleLine,
  ].filter(Boolean).join("\n");
}

function buildA1StartSoundLadderPrompt(languageName: string, config: A1StartConfig): string {
  const focusSound = String(config.focusSound || "").trim();
  const theme = String(config.topic || "").trim() || "everyday life";
  const soundWordCount = [10, 14, 20].includes(Number(config.soundWordCount))
    ? Number(config.soundWordCount)
    : 10;
  const firstGroupCount = Math.floor(soundWordCount / 2);
  const secondGroupCount = soundWordCount - firstGroupCount;
  const labels = getSoundLadderLabels(languageName);
  const norwegianSoundBank =
    languageName === "Norwegian" ? getNorwegianSoundBank(focusSound) : null;
  const portugueseSoundBank =
    languageName === "Brazilian Portuguese" ? getPortugueseSoundBank(focusSound) : null;
  const norwegianSoundBankWords = norwegianSoundBank
    ? norwegianSoundBank.words.map((item) => item.word).join(", ")
    : "";
  const portugueseSoundBankWords = portugueseSoundBank
    ? portugueseSoundBank.words.map((item) => item.word).join(", ")
    : "";
  const norwegianSoundBankGuidance = norwegianSoundBank
    ? `
Norwegian sound bank:
- Use these approved A1-friendly words for "${focusSound}" when possible: ${norwegianSoundBankWords}
- The word bank is the source of truth for vulnerable Norwegian sounds. Some approved words may not contain the letters "${focusSound}" even though they practise the sound.
- Do not add random theme words to the word and sentence sections unless they practise the focus sound.
`.trim()
    : "";
  const portugueseSoundBankGuidance = portugueseSoundBank
    ? `
Brazilian Portuguese sound bank:
- Use these approved A1-friendly words for "${focusSound}" when possible: ${portugueseSoundBankWords}
- The word bank is the source of truth for vulnerable Brazilian Portuguese sounds and spellings.
- Keep spellings stable. For "ch", use ch words and avoid x words for now. For "ão", use common words with the nasal ão ending.
- For "qu", use que/qui words. For "gu", use hard gu words and avoid ge/gi. For "r", use soft/simple r in clusters or between vowels, not initial r. For "rr", use words written with rr and common words that start with strong r. For "ç", use words written with ç. For "x", use only approved x words from the bank.
- Do not add random theme words to the word and sentence sections unless they practise the focus sound.
- In the story, use only 4-6 sound words if that makes the text more natural. A coherent A1 text is better than forcing every sound word into the story.
- Avoid odd combinations such as a baby eating candy, a teacher's baby at school, a student wanting to sleep in class, a refrigerator key, calling a bus, or a stove making food.
`.trim()
    : "";
  const soundBankGuidance = [norwegianSoundBankGuidance, portugueseSoundBankGuidance]
    .filter(Boolean)
    .join("\n\n");

  if (!focusSound) throw new Error("Focus sound is required for A1 Start sound ladder.");

  return `
Create A1 Start sound training from sound words to sentences to a short text.

Target language: ${languageName}
Focus sound: ${focusSound}
Theme: ${theme}
Number of sound words: ${soundWordCount}
Number of sound sentences: ${soundWordCount}
Short text length: about 80-110 words

The goal is to build a coherent sound ladder:
sound words -> one sentence per word -> one short A1 text using several of the same words.

Use this structure:
1. A natural title that fits the theme and text.
2. Heading "${labels.wordTraining}" with exactly ${soundWordCount} simple theme-relevant words.
3. Heading "${labels.soundSentences}" with exactly ${soundWordCount} short sentences, one sentence for each word in the same order.
4. Heading "${labels.story}" with one coherent A1 text about the theme.
5. Heading "${labels.explanation}" with a very simple A1 explanation.

Language quality rules:
- Write everything in ${languageName}.
- Natural language is more important than many uses of the focus sound.
- Prefer everyday words with the focus sound when they fit the theme naturally.
- Do not make strange sentences to include the sound.
- If you are unsure, choose an easier word or sentence.
- Use high-frequency, concrete, easy-to-read words.
- Do not use difficult or rare words only to include the sound.
- Use short sentences suitable for beginners.
- Keep the text clearly A1: short sentences, concrete situations and common words.
- Do not use phonetic symbols.
- Do not ask the voice to pronounce the sound alone.
- Audio playback should read words and sentences, not isolated sounds.
- Do not explain the Norwegian sound system unless the target language is Norwegian.
- The text should sound natural to a native speaker writing for a child or a new language learner.
- Keep the content school-safe for young learners. Avoid alcohol, smoking, drugs, violence, romance/sexual content and idioms.
- If the target language is Norwegian, use Norwegian words and natural Norwegian grammar. Do not use English words such as "oven", "shop", "sun", "mom", "dad", "bus", "school", "house" or "book".
- For Norwegian, be careful with prepositions and definite/indefinite noun forms. Prefer natural phrases such as "i maten", "på bordet", "i boka", "til skolen", "døra", "sjøen" and "dagboka".
${soundBankGuidance ? `\n${soundBankGuidance}\n` : ""}

Word training guidance:
- Make the words fit the theme "${theme}" as much as possible.
- Aim for about 40% nouns/names/things, 40% verbs/actions, and 20% adjectives/simple describing words.
- HARD RULE: Every word in "${labels.wordTraining}" must practise the focus sound "${focusSound}". ${norwegianSoundBank || portugueseSoundBank ? "Use the approved word bank above as the main check." : `A word without "${focusSound}" is invalid.`}
- HARD RULE: The first ${firstGroupCount} words must have the focus sound first or very early in the word.
- The last ${secondGroupCount} words must contain the focus sound inside or later in the word when possible.
- For vowels, the first group should contain words where the vowel comes first or early, and the second group should contain words where the vowel comes inside the word.
- Do not repeat a word.
- Write the words as comma-separated lines, preferably 5 words per line.
- Before returning, check every word silently. Remove and replace any word that does not contain "${focusSound}".
- For Norwegian s, examples such as "pappa", "far" and "leke" are invalid because they do not contain s. "hus" is not valid for the first group because s is not first.
- For Norwegian k, do not use words with kj or skj, such as "kjøkken" or "skjorte". They belong to a different focus sound.
- For Norwegian kj, use words with kj, such as "kjøkken", "kjole", "kjeks", "kjøpe" and "kjøre". Do not mix with plain k words such as "katt", "kopp" or "kake".
- For Norwegian æ, explain briefly that some common words have the æ sound even when they are written with e, such as "her", "der" and "er".

Sound sentence guidance:
- Use simple, natural A1 sentences.
- Use exactly one sentence for each word in "${labels.wordTraining}", in the same order.
- The sentence should practise the same focus sound and connect to the word, but it does not have to repeat the exact word form if that makes the sentence unnatural.
- You may use a natural inflected form or a very close form, for example Norwegian "sjø" -> "sjøen", "dør" -> "døra", "dagbok" -> "dagboka".
- Context and natural meaning are more important than repeating the exact sound word.
- Do not use repetitive template sentences such as "Her er ..." or "Jeg ser en/et ..." unless that is truly the most natural A1 sentence.
- Keep each sentence short.
- The sentences should fit the theme.
- Do not write meta sentences like "X is a sound word", "We say X aloud", or "I listen for the sound in X".

Text guidance:
- Write one small A1 story or factual everyday text about "${theme}".
- Use several words from the word list, but do not force all words into the text.
- The text must be coherent and natural, not a list.
- Use fewer focus words if many focus words make the text strange. Prefer 4-6 natural uses over 10 forced uses.
- Keep the story grounded in one simple situation. Do not jump between unrelated details just to include more sound words.
- For Norwegian, double-check prepositions and noun forms. Avoid unnatural phrases such as "spiser olje på maten" if "bruker olje i maten" is more natural.
- Avoid abstract or awkward sound words if they force unnatural A1 sentences. For Norwegian sj, avoid "sjel" and "sjuke"; choose concrete, common words instead.
- For Norwegian A1, avoid words such as "øl", "røyk", "sjel" and idiomatic phrases such as "øre for musikk".
- For Brazilian Portuguese, avoid awkward or unsafe A1 story details such as "o bebê come bala", "eu quero dormir na aula", "a chave da geladeira", "chamar o ônibus", "o motorista é o chefe do ônibus", "o fogão faz comida", and "a lata de leite".

Explanation guidance:
${getSoundLadderExplanationLines(languageName, focusSound).map((line) => `- ${line}`).join("\n")}
- Mention 2-4 concrete words from the word training list.

Return valid JSON only:
{
  "title": "${labels.titlePrefix} – ${focusSound}",
  "text": "${labels.wordTraining}\\n...\\n\\n${labels.soundSentences}\\n...\\n\\n${labels.story}\\n...\\n\\n${labels.explanation}\\n..."
}
`.trim();
}

function getSoundTrainingWords(languageName: string, focusSound: string, count: number): string[] {
  if (count <= 0) return [];
  const key = focusSound.toLocaleLowerCase();
  if (languageName === "Norwegian") {
    const source = getNorwegianSoundWords(key, count);
    const fallback = source.length ? source : [focusSound];
    return Array.from({ length: count }, (_, index) => fallback[index % fallback.length]);
  }
  if (languageName === "Brazilian Portuguese") {
    const source = getPortugueseSoundWords(key, count);
    if (source.length) {
      return Array.from({ length: count }, (_, index) => source[index % source.length]);
    }
  }

  const nb: Record<string, string[]> = {
    s: ["sol", "saft", "seng", "sekk", "sko", "suppe", "sitte", "se", "si", "sang", "sulten", "søt", "sommer", "skole", "stol"],
    m: ["mat", "mor", "mus", "melk", "mål", "mye", "min", "mitt", "måne", "mann", "mamma", "morgen", "munn", "med", "møter"],
    a: ["and", "ape", "arm", "ark", "alle", "Anna", "Ali", "av", "at", "appelsin", "arbeid", "ansikt", "ask", "aldri", "alltid"],
    b: ["bil", "bok", "ball", "bord", "buss", "barn", "brød", "båt", "ben", "blå", "butikk", "bamse", "bade", "bilde", "bak"],
    d: ["dag", "du", "din", "dyr", "dør", "dans", "dukke", "drue", "drikke", "dele", "der", "dame", "datter", "data", "dusj"],
    f: ["far", "fisk", "fot", "fin", "fugl", "fem", "frokost", "frukt", "farge", "får", "familie", "finner", "fart", "fryser", "følge"],
    g: ["gå", "god", "gul", "gris", "gutt", "gate", "gave", "genser", "glass", "glede", "grøt", "grønn", "gammel", "gitar", "gulrot"],
    k: ["katt", "kake", "kopp", "kul", "kan", "kommer", "kald", "kort", "klasse", "klokke", "kropp", "klem", "kveld", "ku"],
    n: ["natt", "nese", "navn", "ni", "ny", "norsk", "nøkkel", "nabo", "natur", "nå", "nær", "ned", "noen", "Nina", "notat"],
    e: ["egg", "en", "et", "eple", "elefant", "elleve", "etter", "elev", "egen", "enkel", "elsker", "eske", "elv", "ende", "er"],
    o: ["ost", "ord", "orm", "Ole", "Oda", "opp", "ovn", "over", "ofte", "onkel", "onsdag", "område", "orange", "ostekake", "okse"],
    u: ["ut", "ull", "uke", "under", "ute", "uten", "ulv", "Ulla", "ugle", "usikker", "univers", "unik", "utstyr"],
    æ: ["ærlig", "ærend", "her", "der", "er", "bær", "vær", "nær", "kjær", "lærer", "stjerne", "klær"],
    ø: ["øl", "øye", "øre", "øy", "øve", "ønske", "søt", "brød", "grøt", "følge", "møte", "rød", "grønn", "løpe", "høre"],
    å: ["å", "år", "åtte", "ål", "båt", "blå", "får", "går", "står", "må", "nå", "så", "på", "låne", "måne"],
    sj: ["sjø", "sjokolade", "sju", "sjef", "sjakk", "sjal", "sjåfør", "sjampo", "sjelden", "sjarm"],
    kj: ["kjole", "kjøkken", "kjøtt", "kjeks", "kjekk", "kjenne", "kjøpe", "kjøre", "kjede", "kjeller", "kjølig"],
  };
  const en: Record<string, string[]> = {
    s: ["sun", "sit", "see", "sand", "sock", "soup", "sad", "sing", "school", "small", "sister", "six", "soon", "story", "sleep"],
    m: ["mom", "milk", "man", "map", "moon", "meet", "me", "my", "make", "mat", "more", "morning", "mouse", "music", "meal"],
    a: ["apple", "ant", "and", "at", "am", "ask", "Anna", "animal", "arm", "bag", "cat", "hat", "map", "sad", "jam"],
    th: ["the", "this", "that", "then", "they", "them", "there", "three", "thin", "thank", "thing", "mother", "father", "brother", "with"],
    b: ["big", "bag", "ball", "bed", "bus", "book", "boy", "baby", "blue", "bird", "box", "bread", "bike", "bath", "Ben"],
    d: ["dad", "dog", "day", "door", "duck", "desk", "doll", "drink", "dance", "down", "dinner", "dark", "dish", "dream", "Dan"],
    f: ["fish", "fun", "fan", "food", "foot", "five", "family", "friend", "face", "farm", "fast", "fine", "frog", "fruit", "floor"],
    g: ["go", "good", "girl", "game", "green", "gate", "gift", "glass", "goat", "garden", "gold", "gray", "grape", "gum", "Grace"],
    k: ["key", "kid", "kite", "kind", "kiss", "kitchen", "keep", "king", "kick", "Kim", "kit", "Kara", "koala", "kettle", "keyboard"],
    n: ["no", "now", "new", "nine", "name", "nose", "night", "near", "nice", "not", "nest", "nut", "need", "Nina", "north"],
    e: ["egg", "end", "Emma", "every", "bed", "red", "pen", "ten", "leg", "yes", "let", "get", "pet", "net", "wet"],
    o: ["on", "off", "old", "open", "orange", "Olivia", "over", "hot", "dog", "box", "mom", "not", "stop", "shop", "frog"],
    u: ["up", "us", "under", "uncle", "umbrella", "bus", "sun", "cup", "run", "fun", "cut", "mud", "nut", "duck", "jump"],
    sh: ["she", "ship", "shop", "shoe", "shy", "shell", "fish", "dish", "wash", "wish", "shirt", "short", "shut", "shape", "share"],
  };
  const pt: Record<string, string[]> = {
    s: ["sol", "sapo", "sala", "saco", "suco", "sopa", "sono", "sair", "sabe", "sorri", "sábado", "sapato", "sanduíche", "sentar", "sempre"],
    m: ["mãe", "mala", "mesa", "mão", "meu", "minha", "muito", "menino", "menina", "morar", "maçã", "manhã", "música", "mercado", "mamãe"],
    a: ["água", "amigo", "amiga", "ano", "aula", "azul", "ave", "avó", "andar", "ajuda", "agora", "aqui", "alto", "aluno", "aluna"],
    nh: ["ninho", "minha", "manhã", "banho", "sonho", "vinho", "cozinha", "galinha", "caminho", "sozinho", "desenho", "carinho"],
    b: ["bola", "boca", "bolo", "bebê", "bala", "bonito", "barco", "banana", "branco", "baixo", "banco", "bicho", "beber", "brincar", "bairro"],
    d: ["dia", "dado", "dedo", "dente", "doce", "dormir", "dançar", "dizer", "dentro", "duro", "duas", "dona", "depois", "devagar", "domingo"],
    f: ["faca", "foca", "festa", "foto", "fogo", "falar", "filho", "filha", "fruta", "frio", "feliz", "fazer", "fino", "forte", "família"],
    g: ["gato", "galo", "gosto", "gola", "gelo", "garfo", "grande", "gente", "gostar", "galinha", "garoto", "garota", "goiaba", "guarda", "guitarra"],
    l: ["lua", "lata", "leite", "livro", "lápis", "loja", "lobo", "lindo", "ler", "luz", "lugar", "laranja", "limão", "lago", "lento"],
    n: ["nada", "nove", "novo", "nome", "noite", "nariz", "nuvem", "nadar", "menino", "menina", "ninho", "nossa", "nunca", "norte", "nota"],
    e: ["ele", "ela", "eu", "esse", "essa", "este", "esta", "escola", "estrela", "escova", "entrada", "enorme", "mesa", "leite", "verde"],
    o: ["ovo", "olho", "onde", "onze", "ontem", "ônibus", "ouvir", "ouro", "osso", "bolo", "gosto", "novo", "porco", "lobo", "roda"],
    u: ["uva", "um", "uma", "urso", "uso", "unha", "último", "azul", "suco", "rua", "lua", "nuvem", "tudo", "mundo", "junto"],
    lh: ["olho", "filho", "filha", "milho", "folha", "molho", "velho", "toalha", "abelha", "ilha", "trabalho", "barulho", "agulha", "colher", "melhor"],
    ch: ["chá", "chave", "chuva", "chão", "chapéu", "chefe", "cheio", "chegar", "chamar", "chorar", "chutar", "chocolate", "mochila", "lanche", "cachorro"],
    "ão": ["pão", "mão", "chão", "cão", "irmão", "mamão", "limão", "fogão", "balão", "coração", "avião", "lição", "canção", "atenção", "refeição"],
  };
  const source =
    languageName === "English"
      ? en[key]
      : languageName === "Brazilian Portuguese"
        ? pt[key]
        : nb[key];
  const fallback = source || [focusSound];
  return Array.from({ length: count }, (_, index) => fallback[index % fallback.length]);
}

function getSoundTrainingSentences(languageName: string, focusSound: string, count: number): string[] {
  if (count <= 0) return [];
  const key = focusSound.toLocaleLowerCase();
  const nb: Record<string, string[]> = {
    s: [
      "Jeg ser sola.",
      "Sara sitter i senga.",
      "Vi spiser suppe.",
      "Skoene står ved sekken.",
      "Sommeren er søt.",
      "Han synger en sang.",
      "Siv ser en stor stol.",
      "Jeg sier hei til Sara.",
      "Sola skinner på skolen.",
      "Vi drikker saft i sola.",
    ],
    m: [
      "Jeg ser en mann.",
      "Mannen min er morsom.",
      "Jeg må spise mer.",
      "Mor lager mat.",
      "Mina drikker melk.",
      "Mamma møter meg.",
      "Musen er liten.",
      "Min mat er varm.",
      "Vi går med mor.",
      "Månen er mørk.",
    ],
    a: [
      "Anna har en appelsin.",
      "Ali går av bussen.",
      "Alle barna har mat.",
      "Jeg ser en and.",
      "Arket er på bordet.",
      "Apekatten spiser banan.",
      "Vi går av og på.",
      "Anna har armene oppe.",
      "Alle er glade.",
      "Ali kommer snart.",
    ],
    b: [
      "Barnet har en blå ball.",
      "Boka ligger på bordet.",
      "Bussen går til byen.",
      "Vi spiser brød.",
      "Bamsen sitter bak bilen.",
      "Bilal bader i badekaret.",
      "Bildet er blått.",
      "Barn går til butikken.",
      "Båten ligger ved brygga.",
      "Bordet er brunt.",
    ],
    d: [
      "Du åpner døra.",
      "Dina danser i dag.",
      "Dyret drikker vann.",
      "Dukken ligger der.",
      "Datteren deler druer.",
      "Damen går ned.",
      "Vi dusjer i dag.",
      "Din dør er blå.",
      "Det er en god dag.",
      "Dina drikker juice.",
    ],
    f: [
      "Far finner fisk.",
      "Fem fugler flyr.",
      "Foten min er kald.",
      "Familien spiser frukt.",
      "Frokosten er fin.",
      "Fuglen får mat.",
      "Frida følger far.",
      "Fisken svømmer fort.",
      "Jeg fryser på føttene.",
      "Fargen er fin.",
    ],
    g: [
      "Gutten går i gata.",
      "Gaven er gul.",
      "Grisen er glad.",
      "Genseren er grønn.",
      "Guro spiser grøt.",
      "Glassene står på bordet.",
      "Gitaren er gammel.",
      "Gulroten er god.",
      "Vi går til gården.",
      "Gleden er stor.",
    ],
    k: [
      "Katten kommer hjem.",
      "Kaka står på kjøkkenet.",
      "Koppen er kald.",
      "Kari går i klasse.",
      "Klokka er to.",
      "Kroppen er kald.",
      "Kvelden kommer snart.",
      "Knut gir en klem.",
      "Kua er rolig.",
      "Katten ser en kopp.",
    ],
    n: [
      "Nina har en nese.",
      "Naboen går ned.",
      "Natta er nær.",
      "Navnet mitt er Nora.",
      "Ni barn går nå.",
      "Nøkkelen ligger nær døra.",
      "Norsk er nytt.",
      "Noen går ned trappa.",
      "Nina ser natur.",
      "Nesa er kald.",
    ],
    e: [
      "Eleven spiser et eple.",
      "Egget ligger i eska.",
      "En elev er her.",
      "Elva er liten.",
      "Elleve barn leker.",
      "Eplet er enkelt å spise.",
      "Erik elsker egg.",
      "Et esel går etter meg.",
      "Egen bok ligger her.",
      "Enda en elev kommer.",
    ],
    o: [
      "Ole spiser ost.",
      "Oda skriver ord.",
      "Ormen ligger under steinen.",
      "Ovnen er varm.",
      "Onkel går opp.",
      "Vi øver ofte ord.",
      "Osten står over brødet.",
      "Ole ser en okse.",
      "Oda kommer på onsdag.",
      "Området er stort.",
    ],
    u: [
      "Ulla går ut.",
      "Ugle sitter ute.",
      "Ulla har ull.",
      "Ulla bruker ull.",
      "Vi går under brua.",
      "Uka er lang.",
      "Uten sko blir jeg kald.",
      "Ugla sitter ute.",
      "Utstyret ligger ute.",
      "Ulla er usikker.",
    ],
    æ: [
      "Læreren står nær døra.",
      "Vi plukker bær.",
      "Været er fint.",
      "Jeg har tær.",
      "Nær meg står en lærer.",
      "Hun er ærlig.",
      "Bærene er søte.",
      "Han går et ærend.",
      "Du er kjær for meg.",
      "Været blir bedre.",
    ],
    ø: [
      "Øyet mitt er rødt.",
      "Øret hører musikk.",
      "Vi øver på skolen.",
      "Hun spiser brød og grøt.",
      "Gutten løper fort.",
      "Jeg ønsker en rød kopp.",
      "Møtet er kort.",
      "Den grønne bilen kjører.",
      "Vi hører en fugl.",
      "Søt mat er godt.",
    ],
    å: [
      "Åtte barn går på tur.",
      "Båten er blå.",
      "Jeg må gå nå.",
      "Han står på tå.",
      "Månen er på himmelen.",
      "Vi får saft.",
      "Nå går vi hjem.",
      "Hun låner en båt.",
      "Året er langt.",
      "Så går vi på skolen.",
    ],
    sj: [
      "Jeg ser sjøen.",
      "Sara spiser sjokolade.",
      "Sju barn går ut.",
      "Sjåføren kjører bussen.",
      "Hun har et sjal.",
      "Vi spiller sjakk.",
      "Sjøen er stor.",
      "Sjefen smiler.",
      "Jeg bruker sjampo.",
      "Han går til sjøen.",
    ],
    kj: [
      "Kjolen er fin.",
      "Kjell er på kjøkkenet.",
      "Vi spiser kjøtt.",
      "Kari kjøper kjeks.",
      "Hun kjenner Kjell.",
      "Kjære mor kommer.",
      "Kjøkkenet er kjølig.",
      "Kjell kjører bil.",
      "Kjeksene ligger i kjelleren.",
      "Kjolen er kjøpt i dag.",
    ],
  };
  const en: Record<string, string[]> = {
    s: [
      "I see the sun.",
      "Sam sits at school.",
      "My sister sings a song.",
      "The soup is hot.",
      "Six socks are small.",
      "Sara sees sand.",
      "We sleep soon.",
      "The story is simple.",
      "Sam has a small sock.",
      "I sit in the sun.",
    ],
    m: [
      "Mom makes milk.",
      "My mom is merry.",
      "I meet a man.",
      "The mouse is small.",
      "Mia makes more music.",
      "My map is on the mat.",
      "Mom makes a meal.",
      "I see the moon.",
      "The man meets me.",
      "My morning is calm.",
    ],
    a: [
      "Anna has an apple.",
      "An ant is on the bag.",
      "I am at a park.",
      "The cat has a hat.",
      "Anna asks Dad.",
      "An animal is sad.",
      "I have a map.",
      "The apple is in a bag.",
      "Sam and Anna run.",
      "The jam is on the mat.",
    ],
    th: [
      "This is the thing.",
      "They see three cats.",
      "The mother is there.",
      "That thin dog runs.",
      "I go with my brother.",
      "Thank you for this.",
      "The father sits there.",
      "This book is thin.",
      "They walk with them.",
      "Three children see the moon.",
    ],
    b: [
      "Ben has a blue bag.",
      "The baby has a ball.",
      "A big bird sits by the bed.",
      "I read a book on the bus.",
      "The box is by the bike.",
      "Beth eats bread.",
      "The boy has a bath.",
      "My bag is blue.",
      "The bus is big.",
      "Ben sees a bird.",
    ],
    d: [
      "Dad sees a dog.",
      "The duck is by the door.",
      "Dan drinks water.",
      "The doll is on the desk.",
      "We dance in the day.",
      "The dog is dark.",
      "Dad makes dinner.",
      "The dish is red.",
      "The door is down the hall.",
      "Dan has a dream.",
    ],
    f: [
      "Five fish swim fast.",
      "My family has fun.",
      "The frog is on the farm.",
      "I eat fruit with a friend.",
      "The fan is on the floor.",
      "Her face is fine.",
      "The food is good.",
      "My foot is cold.",
      "The fish is small.",
      "We find a fast frog.",
    ],
    g: [
      "The girl plays a game.",
      "Grace has a green gift.",
      "The goat is in the garden.",
      "I go to the gate.",
      "The glass is on the table.",
      "Gold is in the box.",
      "The grape is good.",
      "The gray bag is big.",
      "We go home.",
      "The girl is glad.",
    ],
    k: [
      "Kim has a key.",
      "The kid has a kite.",
      "The king is kind.",
      "Kim is in the kitchen.",
      "I keep the key.",
      "The kid can kick.",
      "Kara sees a koala.",
      "The kettle is hot.",
      "The kit is on the desk.",
      "Kim kisses Mom.",
    ],
    n: [
      "Nina has a new name.",
      "The night is nice.",
      "Nine nuts are in the nest.",
      "I need a new pen.",
      "The nose is red.",
      "Now we go north.",
      "Nina is near me.",
      "No one is at home.",
      "The new dog is nice.",
      "I am not nine.",
    ],
    e: [
      "Emma eats an egg.",
      "The red pen is on the bed.",
      "Ten pets get wet.",
      "The net is red.",
      "Yes, let me see.",
      "The egg is in the box.",
      "Emma has ten pens.",
      "The leg is wet.",
      "I get a red pet.",
      "The end is near.",
    ],
    o: [
      "The dog is on the box.",
      "Mom opens the orange.",
      "The frog stops at the shop.",
      "Olivia is not hot.",
      "The old dog is on the floor.",
      "We go over the road.",
      "The box is open.",
      "Mom sees a frog.",
      "The shop is not old.",
      "The orange is on the box.",
    ],
    u: [
      "The duck jumps up.",
      "My uncle has a cup.",
      "The bus is under the sun.",
      "We run and have fun.",
      "The umbrella is up.",
      "The nut is in the mud.",
      "I cut the fruit.",
      "The duck is under the bus.",
      "Jump up with us.",
      "The sun is up.",
    ],
    sh: [
      "She sees a ship.",
      "The fish is in the dish.",
      "I wash my shirt.",
      "The shoe is in the shop.",
      "She has a short shell.",
      "I wish for a fish.",
      "The shop is shut.",
      "She shares a dish.",
      "The ship is by the shore.",
      "Her shirt has a shape.",
    ],
  };
  const pt: Record<string, string[]> = {
    s: [
      "O sol está na sala.",
      "Sara toma suco.",
      "O sapo sai do saco.",
      "A sopa está quente.",
      "Sofia sorri sempre.",
      "O sapato é seu.",
      "Sábado tem sol.",
      "O sanduíche está na mesa.",
      "Sara senta no sofá.",
      "O sono chega cedo.",
    ],
    m: [
      "Minha mãe faz comida.",
      "O menino mora comigo.",
      "Maria come maçã.",
      "Minha mala está na mesa.",
      "Mamãe pega minha mão.",
      "O mercado é muito bom.",
      "A manhã é calma.",
      "Meu amigo mora aqui.",
      "A música é bonita.",
      "O menino bebe leite.",
    ],
    a: [
      "A água está aqui.",
      "A amiga anda na sala.",
      "O aluno abre a aula.",
      "Ana ajuda a avó.",
      "A ave é azul.",
      "Agora eu ando.",
      "A aluna fala alto.",
      "O amigo come a maçã.",
      "A aula acaba agora.",
      "A avó está na sala.",
    ],
    nh: [
      "Minha galinha está no ninho.",
      "Eu tomo banho de manhã.",
      "O caminho é pequeno.",
      "Minha mãe faz carinho.",
      "O desenho está bonito.",
      "A cozinha é minha.",
      "Tenho um sonho bonito.",
      "O menino caminha sozinho.",
      "A galinha vai para o ninho.",
      "Minha mão está limpa.",
    ],
    b: [
      "Bia tem uma bola.",
      "O bebê come bolo.",
      "A banana está no banco.",
      "O barco é bonito.",
      "Bruno bebe água.",
      "A bola é branca.",
      "O bicho está baixo.",
      "Bia brinca no bairro.",
      "A boca do bebê está limpa.",
      "O bolo está bom.",
    ],
    d: [
      "Davi tem um dado.",
      "O dedo está limpo.",
      "O dente dói.",
      "Dona Dora dança.",
      "Hoje é domingo.",
      "Davi dorme cedo.",
      "O doce está dentro da caixa.",
      "Ela anda devagar.",
      "Duas crianças brincam.",
      "O dia está bonito.",
    ],
    f: [
      "Fábio vê uma foca.",
      "A família faz festa.",
      "A foto fica na mesa.",
      "O fogo está longe.",
      "A filha come fruta.",
      "O filho fala baixo.",
      "Hoje está frio.",
      "A faca está na pia.",
      "O menino fica feliz.",
      "A fruta fica na mesa.",
    ],
    g: [
      "O gato gosta de leite.",
      "A garota guarda o garfo.",
      "O galo canta cedo.",
      "A galinha está no jardim.",
      "O gelo está no copo.",
      "O garoto ganha uma goiaba.",
      "A gente gosta da guitarra.",
      "O gato é grande.",
      "A gola é verde.",
      "Eu gosto de gato.",
    ],
    l: [
      "Lia vê a lua.",
      "O lápis está na lata.",
      "Eu leio um livro.",
      "O leite está na mesa.",
      "A loja fica perto.",
      "O lobo olha a lua.",
      "A luz está acesa.",
      "Lia come laranja.",
      "O lago é lindo.",
      "Eu gosto de ler.",
    ],
    n: [
      "Nina tem nove anos.",
      "O nome dela é Nina.",
      "A noite está calma.",
      "O nariz do menino está frio.",
      "A nuvem é nova.",
      "Nina nada na piscina.",
      "A menina vê o ninho.",
      "Nossa casa fica no norte.",
      "Eu nunca durmo tarde.",
      "A nota está na mesa.",
    ],
    e: [
      "Ele está na escola.",
      "Ela vê uma estrela.",
      "Esta mesa é verde.",
      "Esse leite está frio.",
      "Eu escovo os dentes.",
      "A entrada é enorme.",
      "Ela pega a escova.",
      "Este livro é meu.",
      "A escola fica perto.",
      "Ele bebe leite.",
    ],
    o: [
      "O ovo está no prato.",
      "O olho do lobo é grande.",
      "Onde está o ônibus?",
      "Ontem eu comi bolo.",
      "O porco corre no quintal.",
      "O osso é do cachorro.",
      "O menino gosta de ouro.",
      "A roda é nova.",
      "O lobo olha o ovo.",
      "O ônibus chega cedo.",
    ],
    u: [
      "A uva está na mesa.",
      "O urso é azul.",
      "Uma nuvem passa na rua.",
      "Eu tomo suco.",
      "A lua está no céu.",
      "Tudo fica junto.",
      "O mundo é grande.",
      "A unha está limpa.",
      "Um menino vê a uva.",
      "O suco é de uva.",
    ],
    lh: [
      "O filho olha a folha.",
      "A filha come milho.",
      "O olho do menino está limpo.",
      "A abelha está na ilha.",
      "A toalha está molhada.",
      "O molho fica na colher.",
      "O velho trabalha cedo.",
      "A agulha está na caixa.",
      "O barulho vem da rua.",
      "O milho está melhor.",
    ],
    ch: [
      "Eu tomo chá.",
      "A chave está na mesa.",
      "A chuva cai lá fora.",
      "O chão está limpo.",
      "O chapéu é azul.",
      "A chefe chega cedo.",
      "O copo está cheio.",
      "Eu vou chegar cedo.",
      "Ana chama a mãe.",
      "O bebê vai chorar.",
    ],
    "ão": [
      "Eu como pão.",
      "Minha mão está limpa.",
      "O chão está limpo.",
      "O cão está feliz.",
      "Meu irmão está aqui.",
      "Eu como mamão.",
      "O limão está na mesa.",
      "O fogão está desligado.",
      "O balão é azul.",
      "Meu coração está feliz.",
    ],
  };
  const source =
    languageName === "English"
      ? en[key]
      : languageName === "Brazilian Portuguese"
        ? pt[key]
        : nb[key];
  if (!source) {
    return getSoundTrainingWords(languageName, focusSound, count).map((word) =>
      languageName === "English"
        ? `I see ${word}.`
        : languageName === "Brazilian Portuguese"
          ? `Eu vejo ${word}.`
          : `Jeg ser ${word}.`
    );
  }
  return source.slice(0, count);
}

function formatSoundWords(words: string[]): string {
  const lines: string[] = [];
  for (let index = 0; index < words.length; index += 5) {
    lines.push(words.slice(index, index + 5).join(", "));
  }
  return lines.join("\n");
}

function parseSoundWordsFromSection(text: string, heading: string): string[] {
  const lines = text.split(/\r?\n/);
  const headingIndex = lines.findIndex(
    (line) => line.trim().toLocaleLowerCase() === heading.toLocaleLowerCase()
  );
  if (headingIndex < 0) return [];

  const words: string[] = [];
  for (const line of lines.slice(headingIndex + 1)) {
    const trimmed = line.trim();
    if (!trimmed) break;
    if (/^[\p{Lu}A-ZÆØÅ][\p{L}\s]+$/u.test(trimmed) && !trimmed.includes(",")) break;
    words.push(
      ...trimmed
        .split(/[,;|]/)
        .map((word) => cleanA1StartLine(word).replace(/^["']|["']$/g, "").trim())
        .filter(Boolean)
    );
  }
  return words;
}

function isNorwegianWordCompatibleWithFocusSound(word: string, focusSound: string, languageName: string): boolean {
  if (languageName !== "Norwegian") return true;

  const normalizedWord = word.toLocaleLowerCase();
  const normalizedSound = focusSound.toLocaleLowerCase();
  const blockedWords = new Set([
    "øl",
    "vin",
    "røyk",
    "røyke",
    "sigarett",
    "snus",
    "vold",
    "blod",
    "kyss",
    "sexy",
    "oven",
    "shop",
    "sun",
    "mom",
    "dad",
    "bus",
    "school",
    "house",
    "book",
    "car",
    "cat",
    "dog",
    "food",
  ]);
  if (blockedWords.has(normalizedWord)) return false;

  const blockedBySound: Record<string, string[]> = {
    sj: ["sjel", "sjuke"],
    ø: ["øl", "røyk"],
  };
  if ((blockedBySound[normalizedSound] || []).includes(normalizedWord)) {
    return false;
  }

  const soundBank = getNorwegianSoundBank(normalizedSound);
  if (soundBank?.risk === "sensitive") {
    return isApprovedNorwegianSoundWord(normalizedSound, normalizedWord);
  }

  if (normalizedSound === "k") {
    return !normalizedWord.includes("kj") && !normalizedWord.includes("skj");
  }
  if (normalizedSound === "s") {
    return !normalizedWord.includes("sj") && !normalizedWord.includes("skj");
  }
  if (normalizedSound === "sj") {
    return normalizedWord.includes("sj") || normalizedWord.includes("skj");
  }
  if (normalizedSound === "kj") {
    return normalizedWord.includes("kj");
  }

  return true;
}

function isPortugueseWordCompatibleWithFocusSound(word: string, focusSound: string, languageName: string): boolean {
  if (languageName !== "Brazilian Portuguese") return true;

  const normalizedWord = word.toLocaleLowerCase();
  const normalizedSound = focusSound.toLocaleLowerCase();
  const soundBank = getPortugueseSoundBank(normalizedSound);
  if (soundBank?.risk === "sensitive") {
    return isApprovedPortugueseSoundWord(normalizedSound, normalizedWord);
  }

  return true;
}

function startsWithFocusSound(word: string, focusSound: string, languageName: string): boolean {
  if (languageName === "Norwegian" && getNorwegianSoundBank(focusSound)) {
    return (
      isNorwegianWordCompatibleWithFocusSound(word, focusSound, languageName) &&
      norwegianSoundWordStartsWithSound(focusSound, word)
    );
  }
  if (languageName === "Brazilian Portuguese" && getPortugueseSoundBank(focusSound)) {
    return (
      isPortugueseWordCompatibleWithFocusSound(word, focusSound, languageName) &&
      portugueseSoundWordStartsWithSound(focusSound, word)
    );
  }

  return (
    isNorwegianWordCompatibleWithFocusSound(word, focusSound, languageName) &&
    isPortugueseWordCompatibleWithFocusSound(word, focusSound, languageName) &&
    word.toLocaleLowerCase().startsWith(focusSound.toLocaleLowerCase())
  );
}

function containsFocusSound(word: string, focusSound: string, languageName: string): boolean {
  if (languageName === "Norwegian" && getNorwegianSoundBank(focusSound)) {
    return (
      isNorwegianWordCompatibleWithFocusSound(word, focusSound, languageName) &&
      norwegianSoundWordContainsSound(focusSound, word)
    );
  }
  if (languageName === "Brazilian Portuguese" && getPortugueseSoundBank(focusSound)) {
    return (
      isPortugueseWordCompatibleWithFocusSound(word, focusSound, languageName) &&
      portugueseSoundWordContainsSound(focusSound, word)
    );
  }

  return (
    isNorwegianWordCompatibleWithFocusSound(word, focusSound, languageName) &&
    isPortugueseWordCompatibleWithFocusSound(word, focusSound, languageName) &&
    word.toLocaleLowerCase().includes(focusSound.toLocaleLowerCase())
  );
}

function uniqueSoundWords(words: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const word = cleanA1StartLine(raw);
    const key = word.toLocaleLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

function normalizeSoundWords(words: string[], languageName: string, focusSound: string, count: number): string[] {
  const fallback = [
    ...getSoundTrainingWords(languageName, focusSound, Math.max(count * 2, 20)),
    ...getInsideSoundFallbackWords(languageName, focusSound),
  ];
  const candidates = uniqueSoundWords([...words, ...fallback]);
  const firstGroupCount = Math.floor(count / 2);
  const firstGroup = candidates
    .filter((word) => startsWithFocusSound(word, focusSound, languageName))
    .slice(0, firstGroupCount);
  const firstKeys = new Set(firstGroup.map((word) => word.toLocaleLowerCase()));
  const secondGroupTarget = count - firstGroup.length;
  const secondGroupInside = candidates
    .filter(
      (word) =>
        containsFocusSound(word, focusSound, languageName) &&
        !startsWithFocusSound(word, focusSound, languageName) &&
        !firstKeys.has(word.toLocaleLowerCase())
    )
    .slice(0, secondGroupTarget);
  const secondKeys = new Set(secondGroupInside.map((word) => word.toLocaleLowerCase()));
  const secondGroupFallback = candidates
    .filter(
      (word) =>
        containsFocusSound(word, focusSound, languageName) &&
        !firstKeys.has(word.toLocaleLowerCase()) &&
        !secondKeys.has(word.toLocaleLowerCase())
    )
    .slice(0, secondGroupTarget - secondGroupInside.length);
  const secondGroup = [...secondGroupInside, ...secondGroupFallback];
  const normalized = [...firstGroup, ...secondGroup];
  return normalized.slice(0, count);
}

function getInsideSoundFallbackWords(languageName: string, focusSound: string): string[] {
  const key = focusSound.toLocaleLowerCase();
  if (languageName === "Norwegian") return getNorwegianInsideSoundWords(key);
  if (languageName === "Brazilian Portuguese") {
    const source = getPortugueseInsideSoundWords(key);
    if (source.length) return source;
  }

  const nb: Record<string, string[]> = {
    s: ["hus", "pose", "lese", "reise", "is", "ost", "lys", "fisk", "kasse", "buss"],
    m: ["rom", "hjem", "lampe", "sammen", "svømme", "klemme", "komme", "tomat", "sommer", "familie"],
    b: ["jobb", "jobbe", "nabo", "baby", "robot", "sebra", "krabbe", "kebab", "kube", "labb"],
    d: ["skade", "bilde", "side", "hode", "middag", "bade", "nede", "redde", "rydde", "lyd"],
    f: ["sofa", "kaffe", "vaffel", "telefon", "saft", "løfte", "hjelpe", "skuff", "tøff", "graf"],
    g: ["dag", "sag", "tog", "hage", "mage", "farge", "morgen", "legge", "ligge", "fugl"],
    k: ["bok", "tak", "pakke", "sokker", "drikke", "skole", "voksen", "lek", "kake", "frokost"],
    n: ["banan", "vann", "venn", "mann", "hund", "kanin", "måne", "panne", "fin", "grønn"],
    a: ["mat", "Sara", "banan", "kake", "glad", "dag", "pappa", "mamma", "familie", "salat"],
    e: ["se", "leke", "lese", "seng", "bestemor", "eple", "venn", "melk", "hest", "lek"],
    o: ["sol", "sko", "bok", "bord", "mor", "bror", "pose", "jobb", "robot", "ost"],
    u: ["hus", "buss", "suppe", "gul", "ut", "tur", "hund", "lunsj", "frukt", "brun"],
    æ: ["her", "der", "er", "lærer", "vær", "bær", "nær", "kjær", "klær", "tær", "ærlig", "stjerne"],
    ø: ["søt", "brød", "grøt", "rød", "grønn", "møte", "høre", "løpe", "søster", "følge", "bøker", "dør"],
    å: ["båt", "blå", "får", "går", "står", "må", "nå", "på", "måne", "låne"],
    sj: ["kanskje", "skjorte", "skje", "sjø", "sjokolade", "sju", "sjef", "sjampo"],
    kj: ["kjøkken", "kjole", "kjeks", "kjøpe", "kjøre", "kjenne", "kjøtt"],
  };
  const en: Record<string, string[]> = {
    s: ["bus", "house", "pencil", "listen", "dress", "yes", "horse", "mouse", "class", "music"],
    b: ["baby", "robot", "table", "rabbit", "cabin", "neighbor", "job", "tub", "cable", "zebra"],
    m: ["home", "family", "summer", "swim", "room", "game", "name", "come", "lemon", "woman"],
  };
  const pt: Record<string, string[]> = {
    s: ["casa", "mesa", "massa", "ônibus", "pessoa", "vestido", "doce", "passa", "osso", "salsicha"],
    b: ["bebê", "saber", "cabeça", "trabalho", "robô", "sábado", "abacate", "bobo", "barba", "subir"],
    m: ["comer", "cama", "amigo", "família", "tomate", "mamãe", "limão", "nome", "soma", "mundo"],
    n: ["menino", "menina", "banana", "janela", "caneta", "panela", "boneca", "telefone", "pequeno", "bonito"],
    nh: ["cozinha", "galinha", "caminho", "sozinho", "desenho", "carinho", "dinheiro", "vizinho"],
    lh: ["abelha", "ilha", "trabalho", "barulho", "agulha", "colher", "melhor", "espelho"],
    ch: ["mochila", "lanche", "cachorro", "bolacha", "fechado", "machucado"],
    "ão": ["balão", "coração", "avião", "lição", "canção", "atenção", "refeição"],
  };
  if (languageName === "English") return en[key] || [];
  if (languageName === "Brazilian Portuguese") return pt[key] || [];
  return nb[key] || [];
}

function simpleSoundSentence(languageName: string, word: string): string {
  const normalized = word.toLocaleLowerCase();
  if (languageName === "English") return `I see ${word}.`;
  if (languageName === "Brazilian Portuguese") {
    const portugueseSpecificPhrases: Record<string, string> = {
      mãe: "Minha mãe está em casa.",
      mala: "A mala está no quarto.",
      mesa: "A mesa está limpa.",
      meu: "Meu livro está aqui.",
      muito: "Eu gosto muito da escola.",
      morar: "Eu vou morar aqui.",
      maçã: "A maçã está na mesa.",
      música: "Eu ouço música.",
      mercado: "O mercado fica perto.",
      mamãe: "Mamãe faz comida.",
      comer: "Eu gosto de comer.",
      cama: "A cama está arrumada.",
      amigo: "Meu amigo está aqui.",
      família: "Minha família é grande.",
      tomate: "O tomate está no prato.",
      soma: "A soma está certa.",
      mundo: "O mundo é grande.",
      domingo: "Domingo é dia de descanso.",
      sol: "O sol está forte.",
      sapo: "O sapo pula.",
      sala: "A sala está limpa.",
      saco: "O saco está no chão.",
      suco: "Eu tomo suco.",
      sopa: "Eu como sopa.",
      sono: "Eu tenho sono.",
      sete: "Eu tenho sete lápis.",
      seis: "Eu tenho seis livros.",
      sábado: "Sábado eu fico em casa.",
      sapato: "O sapato está no quarto.",
      sentar: "Eu vou sentar.",
      semana: "A semana começa hoje.",
      sempre: "Eu sempre estudo.",
      pessoa: "A pessoa está na sala.",
      massa: "Eu como massa.",
      assim: "Eu faço assim.",
      passar: "Eu vou passar aqui.",
      pássaro: "O pássaro canta.",
      classe: "A classe está quieta.",
      professor: "O professor lê um texto.",
      salsicha: "Eu como salsicha.",
      descer: "Eu vou descer.",
      nascer: "O sol vai nascer.",
      lua: "A lua está no céu.",
      lata: "A lata está vazia.",
      leite: "Eu tomo leite.",
      livro: "O livro está na mesa.",
      lápis: "O lápis é azul.",
      loja: "A loja fica perto.",
      lobo: "O lobo está longe.",
      lindo: "O dia está lindo.",
      ler: "Eu gosto de ler.",
      luz: "A luz está acesa.",
      lugar: "O lugar é calmo.",
      laranja: "A laranja está na mesa.",
      lago: "O lago é bonito.",
      aluno: "O aluno lê bem.",
      aluna: "A aluna escreve.",
      bola: "A bola está no chão.",
      bolo: "O bolo está pronto.",
      escola: "A escola fica perto.",
      feliz: "Eu estou feliz.",
      azul: "O lápis é azul.",
      calmo: "O menino está calmo.",
      boca: "Minha boca está limpa.",
      bebê: "O bebê dorme.",
      bala: "A bala está no saco.",
      barco: "O barco está no lago.",
      branco: "O papel é branco.",
      baixo: "O som está baixo.",
      banco: "O banco está na praça.",
      beber: "Eu vou beber água.",
      bairro: "Meu bairro é calmo.",
      cabeça: "Minha cabeça está bem.",
      abacate: "O abacate está verde.",
      subir: "Eu vou subir.",
      saber: "Eu quero saber.",
      robô: "O robô está na mesa.",
      dado: "O dado está na caixa.",
      dedo: "Meu dedo está limpo.",
      dente: "Meu dente está limpo.",
      doce: "O doce está no prato.",
      dormir: "Eu vou dormir.",
      dizer: "Eu vou dizer oi.",
      dentro: "A bola está dentro da caixa.",
      duro: "O pão está duro.",
      duas: "Eu tenho duas canetas.",
      dona: "Dona Ana está aqui.",
      devagar: "Eu ando devagar.",
      idade: "Minha idade é nove anos.",
      cidade: "A cidade é bonita.",
      comida: "A comida está pronta.",
      cadeira: "A cadeira está na sala.",
      ajuda: "Eu peço ajuda.",
      estudar: "Eu gosto de estudar.",
      andar: "Eu vou andar.",
      verdade: "Isso é verdade.",
      faca: "A faca está na mesa.",
      foca: "A foca nada.",
      festa: "A festa é hoje.",
      foto: "A foto está bonita.",
      fogo: "O fogo está longe.",
      falar: "Eu gosto de falar.",
      fruta: "A fruta está no prato.",
      frio: "Hoje está frio.",
      fazer: "Eu vou fazer a lição.",
      fino: "O lápis é fino.",
      forte: "O menino é forte.",
      café: "O café está na mesa.",
      sofá: "O sofá está na sala.",
      professora: "A professora ensina.",
      difícil: "A lição é difícil.",
      gato: "O gato dorme.",
      galo: "O galo canta.",
      gosto: "Eu gosto de pão.",
      gola: "A gola é azul.",
      garfo: "O garfo está na mesa.",
      grande: "A casa é grande.",
      garota: "A garota canta.",
      garoto: "O garoto corre.",
      goiaba: "A goiaba está madura.",
      guarda: "O guarda está na rua.",
      guitarra: "A guitarra está no quarto.",
      grupo: "O grupo lê junto.",
      gostar: "Eu vou gostar do livro.",
      queijo: "Eu como queijo.",
      quente: "O café está quente.",
      quarto: "Meu quarto está limpo.",
      quatro: "Eu tenho quatro lápis.",
      quintal: "O quintal é grande.",
      quilo: "Eu compro um quilo de arroz.",
      quieto: "O menino está quieto.",
      querer: "Eu vou querer água.",
      quebrar: "O copo pode quebrar.",
      quase: "Eu quase cheguei.",
      aqui: "Eu estou aqui.",
      esquilo: "O esquilo está na árvore.",
      máquina: "A máquina está ligada.",
      parque: "O parque fica perto.",
      brinquedo: "O brinquedo está no chão.",
      piquenique: "O piquenique é no parque.",
      guia: "O guia está aqui.",
      guerra: "A palavra guerra está no livro.",
      foguete: "O foguete sobe.",
      joguete: "O joguete está na caixa.",
      língua: "A língua ajuda a falar.",
      ninguém: "Ninguém está na sala.",
      salgueiro: "O salgueiro é uma árvore.",
      rato: "O rato é pequeno.",
      rua: "A rua é calma.",
      roupa: "A roupa está limpa.",
      roda: "A roda gira.",
      rei: "O rei está no livro.",
      rosa: "A rosa é bonita.",
      rio: "O rio é azul.",
      rádio: "O rádio toca música.",
      prato: "O prato está na mesa.",
      preto: "O lápis é preto.",
      primeiro: "Eu sou o primeiro.",
      porta: "A porta está aberta.",
      verde: "A folha é verde.",
      caro: "O livro é caro.",
      barato: "O pão é barato.",
      parede: "A parede é branca.",
      amarelo: "O lápis é amarelo.",
      arroz: "Eu como arroz.",
      carro: "O carro está na rua.",
      garrafa: "A garrafa tem água.",
      barriga: "Minha barriga está cheia.",
      terra: "A terra está molhada.",
      corre: "O menino corre.",
      morro: "O morro é alto.",
      ferro: "O ferro está frio.",
      macarrão: "Eu como macarrão.",
      sorriso: "Ela tem um sorriso bonito.",
      corrida: "A corrida começa cedo.",
      praça: "A praça fica perto.",
      açúcar: "O açúcar está na mesa.",
      peça: "A peça está na caixa.",
      pedaço: "Eu como um pedaço de bolo.",
      taça: "A taça está limpa.",
      laço: "O laço é azul.",
      moço: "O moço está aqui.",
      moça: "A moça lê um livro.",
      calça: "A calça é azul.",
      dança: "A dança é bonita.",
      janela: "A janela está aberta.",
      jogo: "O jogo é divertido.",
      jogar: "Eu vou jogar.",
      jantar: "O jantar está pronto.",
      jardim: "O jardim é bonito.",
      jaqueta: "A jaqueta é azul.",
      joelho: "Meu joelho está bem.",
      jovem: "O jovem lê um livro.",
      junto: "Nós ficamos juntos.",
      junho: "Junho é um mês.",
      feijão: "Eu como feijão.",
      beijo: "A mãe dá um beijo.",
      sujo: "O chão está sujo.",
      viajar: "Eu vou viajar.",
      xícara: "A xícara está na mesa.",
      xarope: "O xarope está no armário.",
      xadrez: "Eu jogo xadrez.",
      xampu: "O xampu está no banheiro.",
      xale: "O xale é bonito.",
      peixe: "O peixe está no prato.",
      caixa: "A caixa está no chão.",
      deixar: "Eu vou deixar o livro aqui.",
      lixo: "O lixo está na lixeira.",
      mexer: "Eu vou mexer a sopa.",
      roxo: "O lápis é roxo.",
      ameixa: "A ameixa está no prato.",
      faixa: "A faixa é azul.",
      ninho: "O ninho está na árvore.",
      minha: "Minha casa é pequena.",
      manhã: "Eu estudo de manhã.",
      banho: "Eu tomo banho.",
      sonho: "Eu tenho um sonho.",
      tenho: "Eu tenho uma mochila.",
      venha: "Venha brincar comigo.",
      unha: "A unha está limpa.",
      cozinha: "A cozinha está limpa.",
      galinha: "A galinha está no quintal.",
      caminho: "O caminho é curto.",
      sozinho: "Pedro está sozinho.",
      desenho: "O desenho é bonito.",
      carinho: "A mãe faz carinho.",
      dinheiro: "O dinheiro está na bolsa.",
      vizinho: "Meu vizinho é bom.",
      sobrinha: "Minha sobrinha está aqui.",
      sobrinho: "Meu sobrinho está aqui.",
      olho: "Meu olho está aberto.",
      filho: "Meu filho lê um livro.",
      filha: "Minha filha come milho.",
      milho: "Eu como milho.",
      folha: "A folha está no chão.",
      molho: "O molho está no prato.",
      velho: "O livro é velho.",
      toalha: "A toalha está limpa.",
      abelha: "A abelha está na flor.",
      ilha: "A ilha é pequena.",
      trabalho: "O trabalho começa cedo.",
      barulho: "O barulho vem da rua.",
      agulha: "A agulha está na caixa.",
      colher: "A colher está na mesa.",
      melhor: "Hoje eu estou melhor.",
      molhado: "O chão está molhado.",
      vermelho: "O lápis é vermelho.",
      espelho: "Eu olho no espelho.",
      chá: "Eu tomo chá.",
      chave: "A chave está na mesa.",
      chuva: "A chuva cai lá fora.",
      chão: "O chão está limpo.",
      chapéu: "O chapéu é azul.",
      chefe: "A chefe chega cedo.",
      cheio: "O copo está cheio.",
      chegar: "Eu vou chegar cedo.",
      chamar: "Ana vai chamar a mãe.",
      fechar: "Eu vou fechar a porta.",
      chorar: "O bebê vai chorar.",
      chutar: "Eu vou chutar a bola.",
      chocolate: "Eu gosto de chocolate.",
      mochila: "A mochila está na cadeira.",
      lanche: "Eu como um lanche.",
      cachorro: "O cachorro está feliz.",
      bolacha: "Eu como bolacha.",
      fechado: "O portão está fechado.",
      machucado: "Meu dedo está machucado.",
      pão: "Eu como pão.",
      mão: "Minha mão está limpa.",
      cão: "O cão está feliz.",
      irmão: "Meu irmão está aqui.",
      mamão: "Eu como mamão.",
      limão: "O limão está na mesa.",
      fogão: "O fogão está na cozinha.",
      balão: "O balão é azul.",
      coração: "Meu coração está feliz.",
      avião: "O avião está no céu.",
      lição: "Eu faço a lição.",
      canção: "Eu canto uma canção.",
      atenção: "Eu presto atenção.",
      refeição: "A refeição está pronta.",
      neto: "Meu neto lê bem.",
      nada: "Nina não quer nada.",
      nove: "Nina tem nove anos.",
      novo: "O livro é novo.",
      nome: "Meu nome é Ana.",
      noite: "A noite está calma.",
      nariz: "Meu nariz está frio.",
      nuvem: "A nuvem é branca.",
      nadar: "Eu gosto de nadar.",
      nina: "Nina lê um livro.",
      nossa: "Nossa casa é pequena.",
      nunca: "Eu nunca durmo tarde.",
      nota: "A nota está na mesa.",
      norte: "O norte fica no mapa.",
      menino: "O menino brinca.",
      menina: "A menina canta.",
      banana: "A banana está na mesa.",
      caneta: "A caneta é azul.",
      panela: "A panela está no fogão.",
      boneca: "A boneca está na cama.",
      telefone: "O telefone toca.",
      pequeno: "O gato é pequeno.",
      bonito: "O dia está bonito.",
      cantar: "Eu gosto de cantar.",
      dançar: "Nós vamos dançar.",
      ensinar: "A professora vai ensinar.",
      brincar: "As crianças vão brincar.",
    };
    return portugueseSpecificPhrases[normalized] || `Eu vejo ${word}.`;
  }

  const norwegianSpecificPhrases: Record<string, string> = {
    sjø: "Vi går til sjøen.",
    sjokolade: "Jeg liker sjokolade.",
    sjokoladepudding: "Vi lager sjokoladepudding.",
    sju: "Jeg ser sju biler.",
    sjef: "Hun er sjef.",
    sjekk: "Vi tar en sjekk.",
    sjakk: "Vi spiller sjakk.",
    sjal: "Hun har et sjal.",
    sjåfør: "Han er sjåfør.",
    sjømann: "Han er sjømann.",
    sjampo: "Jeg bruker sjampo.",
    sjelden: "Det skjer sjelden.",
    sjarm: "Hun har sjarm.",
    sjiraff: "Jeg ser en sjiraff.",
    sjekke: "Vi kan sjekke det.",
    sjekkliste: "Hun har en sjekkliste.",
    sjansen: "Vi får sjansen.",
    skjegg: "Far har skjegg.",
    skje: "Jeg har en skje.",
    skjell: "Vi finner skjell.",
    skjerm: "Jeg ser på skjermen.",
    skjorte: "Han har en skjorte.",
    skjørt: "Hun har et skjørt.",
    skjære: "Vi skal skjære brød.",
    ski: "Vi går på ski.",
    skilt: "Jeg ser et skilt.",
    skinke: "Jeg spiser skinke.",
    skinn: "Skinnet er mykt.",
    sky: "Jeg ser en sky.",
    skygge: "Vi sitter i skyggen.",
    kanskje: "Kanskje vi går ut.",
    maskin: "Jeg bruker en maskin.",
    dusje: "Jeg skal dusje.",
    garasje: "Bilen står i garasjen.",
    brosjyre: "Læreren har en brosjyre.",
    massasje: "Massasje kan hjelpe.",
    spørsmål: "Jeg har et spørsmål.",
    her: "Jeg er her.",
    der: "Boka ligger der.",
    er: "Dette er bra.",
    stjerne: "Jeg ser en stjerne.",
    dør: "Døra er åpen.",
    skade: "Jeg har en liten skade.",
    datamaskin: "Jeg bruker datamaskin.",
    drikk: "Vi har drikk i sekken.",
    dagbok: "Jeg skriver i dagboka.",
    deilig: "Maten er deilig.",
    bilde: "Jeg ser et bilde.",
    side: "Jeg leser en side.",
    hode: "Hodet mitt er varmt.",
    middag: "Vi spiser middag.",
    bade: "Vi kan bade.",
    nede: "Boka ligger nede.",
    redde: "Vi må redde katten.",
    rydde: "Jeg skal rydde rommet.",
    lyd: "Jeg hører en lyd.",
    skolegård: "Vi leker i skolegården.",
    med: "Jeg er med Sara.",
    bad: "Vi går på badet.",
    øye: "Jeg ser med øyet.",
    øre: "Jeg hører med øret.",
    ønske: "Jeg ønsker meg en bok.",
    øse: "Jeg øser suppe.",
    kjøtt: "Vi spiser kjøtt.",
    kjole: "Hun har en kjole.",
    kjøkken: "Vi er på kjøkkenet.",
    kjeks: "Jeg spiser kjeks.",
    kjekk: "Han er kjekk.",
    kjenne: "Jeg kan kjenne på den.",
    kjøpe: "Jeg skal kjøpe mat.",
    kjøre: "Hun kan kjøre bil.",
    kjede: "Jeg har et kjede.",
    kjeller: "Boka er i kjelleren.",
    kjølig: "Det er kjølig ute.",
    kjapp: "Han er kjapp.",
    kjell: "Kjell er hjemme.",
    kjele: "Kjelen står på bordet.",
    kjæledyr: "Jeg har et kjæledyr.",
    kjøleskap: "Melka står i kjøleskapet.",
    kjempe: "Vi kan kjempe i spillet.",
    kjempefin: "Dagen er kjempefin.",
    kjent: "Hun er kjent.",
    kjenner: "Jeg kjenner Sara.",
    bikkje: "Jeg ser en bikkje.",
    grønnsaker: "Vi spiser grønnsaker.",
    søt: "Kaken er søt.",
    høne: "Høna går i hagen.",
    bøker: "Jeg leser bøker.",
    olje: "Vi bruker olje i maten.",
    ost: "Jeg spiser ost.",
    om: "Vi snakker om mat.",
    opp: "Jeg går opp trappa.",
    ord: "Jeg skriver et ord.",
    sko: "Jeg tar på sko.",
    bok: "Jeg leser en bok.",
    ku: "Jeg ser en ku.",
    to: "Jeg har to bøker.",
    ro: "Vi har ro i klassen.",
    bo: "Jeg vil bo her.",
    bor: "Ole bor her.",
    stor: "Bilen er stor.",
    god: "Maten er god.",
    lomme: "Jeg har en lomme.",
    sol: "Sola skinner.",
  };
  if (norwegianSpecificPhrases[normalized]) return norwegianSpecificPhrases[normalized];

  const norwegianVerbPhrases: Record<string, string> = {
    bake: "Vi kan bake.",
    bygge: "Vi kan bygge.",
    bli: "Jeg vil bli stor.",
    bo: "Vi kan bo her.",
    jobbe: "Jeg kan jobbe.",
    lese: "Vi kan lese.",
    reise: "Vi kan reise.",
    leke: "Vi kan leke.",
    drikke: "Vi kan drikke.",
    komme: "Du kan komme.",
    svømme: "Vi kan svømme.",
    klemme: "Jeg kan klemme mamma.",
    ligge: "Boka kan ligge her.",
    legge: "Jeg kan legge boka her.",
    høre: "Jeg kan høre deg.",
    løpe: "Vi kan løpe.",
    følge: "Jeg kan følge deg.",
  };
  if (norwegianVerbPhrases[normalized]) return norwegianVerbPhrases[normalized];

  const norwegianAdjectives = new Set([
    "snill",
    "søt",
    "blå",
    "glad",
    "rød",
    "grønn",
    "gul",
    "brun",
    "bitter",
    "deilig",
    "fin",
    "god",
    "tøff",
    "ærlig",
  ]);
  if (norwegianAdjectives.has(normalized)) return `Den er ${word}.`;

  const norwegianFunctionWords: Record<string, string> = {
    med: "Jeg er med Sara.",
    ved: "Jeg står ved døra.",
    under: "Boka er under bordet.",
    over: "Lampa er over bordet.",
    mellom: "Jeg sitter mellom to venner.",
    til: "Jeg går til skolen.",
    fra: "Jeg går fra skolen.",
    på: "Boka ligger på bordet.",
    i: "Jeg er i huset.",
    om: "Vi snakker om skolen.",
    opp: "Jeg går opp trappa.",
    av: "Jeg går av bussen.",
    alt: "Alt er bra.",
  };
  if (norwegianFunctionWords[normalized]) return norwegianFunctionWords[normalized];

  const norwegianNumberWords = new Set(["en", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni", "ti"]);
  if (norwegianNumberWords.has(normalized)) return `Jeg har ${word} bøker.`;

  return `Ordet er ${word}.`;
}

function replaceA1StartSection(
  text: string,
  heading: string,
  nextHeadings: string[],
  replacementBody: string
): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(
    (line) => line.trim().toLocaleLowerCase() === heading.toLocaleLowerCase()
  );
  if (start < 0) return text;

  const nextHeadingSet = new Set(nextHeadings.map((item) => item.toLocaleLowerCase()));
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (nextHeadingSet.has(lines[index].trim().toLocaleLowerCase())) {
      end = index;
      break;
    }
  }

  return [
    ...lines.slice(0, start + 1),
    ...replacementBody.split(/\r?\n/),
    ...lines.slice(end),
  ].join("\n").trim();
}

function cleanA1StartLine(value: string): string {
  return value
    .trim()
    .replace(/^(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/[.!?]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeA1StartSectionNumbering(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.)]\s+/, "").trimEnd())
    .join("\n")
    .trim();
}

function getHighFrequencyLanguageLabels(languageName: string): {
  titlePrefix: string;
  explanationHeading: string;
  exampleHeading: string;
  sentencesWithWordHeading: (word: string) => string;
  belongsToWordClass: (word: string, wordClassLabel: string) => string;
} {
  if (languageName === "English") {
    return {
      titlePrefix: "High-frequency words",
      explanationHeading: "Explanation",
      exampleHeading: "Example sentences",
      sentencesWithWordHeading: (word) => `Sentences with "${word}"`,
      belongsToWordClass: (word, wordClassLabel) => `"${word}" belongs to the word class ${wordClassLabel}.`,
    };
  }
  if (languageName === "Brazilian Portuguese") {
    return {
      titlePrefix: "Palavras de alta frequência",
      explanationHeading: "Explicação",
      exampleHeading: "Frases de exemplo",
      sentencesWithWordHeading: (word) => `Frases com "${word}"`,
      belongsToWordClass: (word, wordClassLabel) => `"${word}" pertence à classe gramatical ${wordClassLabel}.`,
    };
  }
  return {
    titlePrefix: "Høyfrekvente ord",
    explanationHeading: "Forklaring",
    exampleHeading: "Eksempelsetninger",
    sentencesWithWordHeading: (word) => `Setninger med "${word}"`,
    belongsToWordClass: (word, wordClassLabel) => `"${word}" tilhører ordklassen ${wordClassLabel}.`,
  };
}

function getHighFrequencyWordClassLabel(wordClass: string, languageName: string): string {
  if (languageName === "English") {
    if (wordClass === "conjunction") return "conjunctions/linking words";
    if (wordClass === "adverb") return "adverbs";
    if (wordClass === "determiner") return "determiners";
    if (wordClass === "preposition") return "prepositions";
    return "word class";
  }
  if (languageName === "Brazilian Portuguese") {
    if (wordClass === "conjunction") return "conjunções/palavras de ligação";
    if (wordClass === "adverb") return "advérbios";
    if (wordClass === "determiner") return "determinantes";
    if (wordClass === "preposition") return "preposições";
    return "classe gramatical";
  }
  if (wordClass === "conjunction") return "konjunksjoner/bindeord";
  if (wordClass === "adverb") return "adverb";
  if (wordClass === "determiner") return "determinativer";
  if (wordClass === "preposition") return "preposisjoner";
  return "ordklassen";
}

function getHighFrequencyWordClassExplanation(wordClass: string, languageName: string): string {
  if (languageName === "English") {
    if (wordClass === "conjunction") return "Conjunctions are linking words. They connect words or sentences.";
    if (wordClass === "adverb") return "Adverbs tell more about a verb or a sentence, for example when, where or how something happens.";
    if (wordClass === "determiner") return "Determiners often stand before nouns and show which thing we mean, or who something belongs to.";
    if (wordClass === "preposition") return "Prepositions are small words that often show place, direction or how words belong together.";
    return "Word classes help us understand what words do in a sentence.";
  }
  if (languageName === "Brazilian Portuguese") {
    if (wordClass === "conjunction") return "Conjunções são palavras de ligação. Elas ligam palavras ou frases.";
    if (wordClass === "adverb") return "Advérbios dizem mais sobre um verbo ou uma frase, por exemplo quando, onde ou como algo acontece.";
    if (wordClass === "determiner") return "Determinantes aparecem muitas vezes antes de substantivos e mostram de que coisa falamos, ou a quem algo pertence.";
    if (wordClass === "preposition") return "Preposições são palavras pequenas que mostram lugar, direção ou relação entre palavras.";
    return "Classes gramaticais ajudam a entender o que as palavras fazem em uma frase.";
  }
  if (wordClass === "conjunction") {
    return "Konjunksjoner er bindeord som binder sammen ord og setninger.";
  }
  if (wordClass === "adverb") {
    return "Adverb forteller mer om verbet eller setningen, for eksempel når, hvor eller hvordan noe skjer.";
  }
  if (wordClass === "determiner") {
    return "Determinativer står ofte foran substantiv og viser hvem noe hører til, eller hvilken ting vi snakker om.";
  }
  if (wordClass === "preposition") {
    return "Preposisjoner er små ord som viser hvor noe er, eller hvordan ord hører sammen.";
  }
  return "Ordklasser hjelper oss å forstå hva ord gjør i en setning.";
}

function getHighFrequencyWordExplanation(word: string, languageName: string): string {
  const nbExplanations: Record<string, string> = {
    og: "\"og\" betyr at vi legger til noe. Eksempel: Jeg liker brød og melk.",
    men: "\"men\" viser en forskjell eller noe som ikke passer helt sammen. Eksempel: Jeg liker kaffe, men jeg liker ikke te.",
    eller: "\"eller\" viser et valg. Eksempel: Vil du ha brød eller melk?",
    fordi: "\"fordi\" forteller hvorfor noe skjer. Eksempel: Jeg går inn fordi det regner.",
    så: "\"så\" kan vise hva som skjer etter noe annet. Eksempel: Det regner, så jeg tar jakke.",
    når: "\"når\" forteller om tid. Eksempel: Jeg leser når jeg er hjemme.",
    hvis: "\"hvis\" viser en betingelse. Eksempel: Hvis det regner, blir jeg inne.",
    at: "\"at\" kan innlede en del av setningen. Eksempel: Jeg sier at jeg kommer.",
    ikke: "\"ikke\" gjør setningen negativ. Eksempel: Jeg liker ikke kaffe.",
    også: "\"også\" betyr at noe kommer i tillegg. Eksempel: Jeg liker også te.",
    nå: "\"nå\" betyr akkurat denne tiden. Eksempel: Jeg leser nå.",
    alltid: "\"alltid\" betyr hver gang. Eksempel: Jeg går alltid til skolen.",
    ofte: "\"ofte\" betyr mange ganger. Eksempel: Vi spiller ofte fotball.",
    kanskje: "\"kanskje\" betyr at noe kan skje, men vi er ikke sikre. Eksempel: Kanskje jeg kommer i morgen.",
    snart: "\"snart\" betyr om kort tid. Eksempel: Bussen kommer snart.",
    her: "\"her\" betyr på dette stedet. Eksempel: Jeg er her.",
    min: "\"min\" viser at noe hører til meg. Eksempel: Dette er min bok.",
    mitt: "\"mitt\" viser at noe hører til meg. Eksempel: Dette er mitt hus.",
    mine: "\"mine\" viser at flere ting hører til meg. Eksempel: Dette er mine sko.",
    denne: "\"denne\" peker på én bestemt ting nær oss. Eksempel: Denne boka er rød.",
    dette: "\"dette\" peker på én bestemt ting nær oss. Eksempel: Dette huset er stort.",
    disse: "\"disse\" peker på flere bestemte ting nær oss. Eksempel: Disse eplene er gode.",
    alle: "\"alle\" betyr hele gruppa. Eksempel: Alle barna leker.",
    mange: "\"mange\" betyr flere eller mye av noe vi kan telle. Eksempel: Jeg har mange bøker.",
    i: "\"i\" viser ofte at noe er inne i noe. Eksempel: Boka er i sekken.",
    på: "\"på\" viser ofte at noe er på en flate eller et sted. Eksempel: Koppen står på bordet.",
    med: "\"med\" viser at noen eller noe er sammen med noen eller noe. Eksempel: Jeg går med Sara.",
    til: "\"til\" viser ofte retning eller hvem noe er for. Eksempel: Jeg går til skolen.",
    fra: "\"fra\" viser hvor noe starter. Eksempel: Jeg kommer fra Norge.",
    under: "\"under\" viser at noe er lavere enn noe annet. Eksempel: Katten ligger under bordet.",
    ved: "\"ved\" betyr nær eller ved siden av noe. Eksempel: Jeg står ved døra.",
    mellom: "\"mellom\" betyr at noe er i midten av to ting. Eksempel: Stolen står mellom bordet og veggen.",
  };
  const enExplanations: Record<string, string> = {
    and: "\"and\" adds something. Example: I like bread and milk.",
    but: "\"but\" shows a difference. Example: I like coffee, but I do not like tea.",
    or: "\"or\" shows a choice. Example: Do you want bread or milk?",
    because: "\"because\" tells why something happens. Example: I go in because it rains.",
    so: "\"so\" can show what happens after something else. Example: It rains, so I take a jacket.",
    when: "\"when\" tells about time. Example: I read when I am home.",
    if: "\"if\" shows a condition. Example: If it rains, I stay inside.",
    that: "\"that\" can introduce part of a sentence. Example: I say that I am coming.",
    not: "\"not\" makes the sentence negative. Example: I do not like coffee.",
    also: "\"also\" means something comes in addition. Example: I also like tea.",
    now: "\"now\" means this time. Example: I read now.",
    always: "\"always\" means every time. Example: I always go to school.",
    often: "\"often\" means many times. Example: We often play football.",
    maybe: "\"maybe\" means something can happen, but we are not sure. Example: Maybe I come tomorrow.",
    soon: "\"soon\" means in a short time. Example: The bus comes soon.",
    here: "\"here\" means this place. Example: I am here.",
    my: "\"my\" shows that something belongs to me. Example: This is my book.",
    this: "\"this\" points to one thing near us. Example: This book is red.",
    these: "\"these\" points to several things near us. Example: These apples are good.",
    all: "\"all\" means the whole group. Example: All the children play.",
    many: "\"many\" means several things we can count. Example: I have many books.",
    in: "\"in\" often shows that something is inside something. Example: The book is in the bag.",
    on: "\"on\" often shows that something is on a surface or at a place. Example: The cup is on the table.",
    with: "\"with\" shows that someone or something is together with someone or something. Example: I go with Sara.",
    to: "\"to\" often shows direction. Example: I go to school.",
    from: "\"from\" shows where something starts. Example: I come from Brazil.",
    under: "\"under\" shows that something is lower than something else. Example: The cat is under the table.",
    by: "\"by\" can mean near or beside something. Example: I stand by the door.",
    between: "\"between\" means in the middle of two things. Example: The chair is between the table and the wall.",
  };
  const ptExplanations: Record<string, string> = {
    e: "\"e\" acrescenta algo. Exemplo: Eu gosto de pão e leite.",
    mas: "\"mas\" mostra uma diferença. Exemplo: Eu gosto de café, mas não gosto de chá.",
    ou: "\"ou\" mostra uma escolha. Exemplo: Você quer pão ou leite?",
    porque: "\"porque\" explica o motivo. Exemplo: Eu entro porque chove.",
    então: "\"então\" pode mostrar o que acontece depois. Exemplo: Chove, então eu pego a jaqueta.",
    quando: "\"quando\" fala sobre tempo. Exemplo: Eu leio quando estou em casa.",
    se: "\"se\" mostra uma condição. Exemplo: Se chove, eu fico em casa.",
    que: "\"que\" pode ligar partes de uma frase. Exemplo: Eu digo que vou.",
    não: "\"não\" deixa a frase negativa. Exemplo: Eu não gosto de café.",
    também: "\"também\" significa algo a mais. Exemplo: Eu também gosto de chá.",
    agora: "\"agora\" significa este momento. Exemplo: Eu leio agora.",
    sempre: "\"sempre\" significa todas as vezes. Exemplo: Eu sempre vou à escola.",
    "muitas vezes": "\"muitas vezes\" significa várias vezes. Exemplo: Nós jogamos bola muitas vezes.",
    talvez: "\"talvez\" mostra que algo pode acontecer, mas não temos certeza. Exemplo: Talvez eu vá amanhã.",
    "em breve": "\"em breve\" significa daqui a pouco tempo. Exemplo: O ônibus chega em breve.",
    aqui: "\"aqui\" significa este lugar. Exemplo: Eu estou aqui.",
    meu: "\"meu\" mostra que algo pertence a mim. Exemplo: Este é meu livro.",
    minha: "\"minha\" mostra que algo pertence a mim. Exemplo: Esta é minha bolsa.",
    meus: "\"meus\" mostra que várias coisas pertencem a mim. Exemplo: Estes são meus sapatos.",
    minhas: "\"minhas\" mostra que várias coisas pertencem a mim. Exemplo: Estas são minhas chaves.",
    este: "\"este\" aponta para uma coisa perto de nós. Exemplo: Este livro é bom.",
    esta: "\"esta\" aponta para uma coisa perto de nós. Exemplo: Esta casa é grande.",
    isto: "\"isto\" aponta para algo perto de nós. Exemplo: Isto é meu.",
    estes: "\"estes\" aponta para várias coisas perto de nós. Exemplo: Estes livros são bons.",
    estas: "\"estas\" aponta para várias coisas perto de nós. Exemplo: Estas maçãs são boas.",
    todos: "\"todos\" significa o grupo inteiro. Exemplo: Todos os alunos leem.",
    muitos: "\"muitos\" significa várias coisas que podemos contar. Exemplo: Eu tenho muitos livros.",
    em: "\"em\" mostra lugar. Exemplo: O livro está em casa.",
    sobre: "\"sobre\" pode mostrar que algo está em cima de algo. Exemplo: O copo está sobre a mesa.",
    com: "\"com\" mostra companhia. Exemplo: Eu vou com Sara.",
    para: "\"para\" mostra direção ou destino. Exemplo: Eu vou para a escola.",
    de: "\"de\" pode mostrar origem. Exemplo: Eu venho de casa.",
    "embaixo de": "\"embaixo de\" mostra que algo está mais baixo que outra coisa. Exemplo: O gato está embaixo da mesa.",
    "perto de": "\"perto de\" significa próximo. Exemplo: Eu fico perto da porta.",
    entre: "\"entre\" significa no meio de duas coisas. Exemplo: A cadeira está entre a mesa e a parede.",
  };
  const key = word.toLocaleLowerCase();
  if (languageName === "English") return enExplanations[key] || `"${word}" is a common word. Use it in a short, simple sentence.`;
  if (languageName === "Brazilian Portuguese") return ptExplanations[key] || `"${word}" é uma palavra comum. Use em uma frase curta e simples.`;
  return nbExplanations[key] || `"${word}" er et vanlig ord i norsk. Bruk det i en kort og enkel setning.`;
}

function getHighFrequencyExampleSentences(word: string, languageName: string): string[] {
  const key = word.toLocaleLowerCase();
  if (languageName === "English") {
    const enExamples: Record<string, string[]> = {
      and: ["I eat bread and cheese.", "Sara has a book and a pencil.", "We go home and make food.", "He likes football and music.", "My mother smiles and says hello."],
      but: ["I like milk, but I do not like coffee.", "It rains, but we go out.", "Sara is tired, but she reads a little.", "He wants to play, but he must go home.", "The book is small, but it is good."],
      or: ["Do you want water or milk?", "Do we go home or stay here?", "You can read or write.", "I take an apple or a banana.", "Are you coming today or tomorrow?"],
      because: ["I go inside because it rains.", "Sara is happy because she sees a friend.", "We eat because we are hungry.", "He runs because the bus is coming.", "I smile because the day is good."],
      so: ["It rains, so I take a jacket.", "I am hungry, so I eat bread.", "The bus comes, so we go now.", "Sara is tired, so she rests.", "It is late, so we go home."],
      when: ["I read when I am home.", "Sara smiles when she sees the dog.", "We eat when the food is ready.", "He runs when the bus comes.", "I sleep when it is night."],
      if: ["If it rains, I stay inside.", "If you come, I make tea.", "If Sara is home, we play.", "If I am hungry, I eat.", "If the bus comes, we go."],
      that: ["I say that I am coming.", "Sara knows that the book is here.", "He sees that the door is open.", "We think that it is good.", "I hear that you are home."],
      not: ["I do not like coffee.", "He does not come today.", "We do not see the car.", "Sara does not eat fish.", "The book is not on the table."],
      also: ["I also like tea.", "Sara also comes to school.", "We also have a cat.", "He also reads the book.", "This is also my jacket."],
      now: ["I read now.", "We go home now.", "Sara eats now.", "He is at school now.", "Now the bus comes."],
      always: ["I always go to school.", "Sara always says hello.", "We always eat breakfast.", "He always reads at home.", "The dog always sleeps here."],
      often: ["We often play football.", "I often read at home.", "Sara often walks to school.", "He often drinks water.", "They often meet in the park."],
      maybe: ["Maybe I come tomorrow.", "Maybe Sara is at home.", "Maybe we eat soon.", "Maybe the bus comes now.", "Maybe he likes the book."],
      soon: ["The bus comes soon.", "We eat soon.", "Sara goes home soon.", "I read soon.", "It is soon time for school."],
      here: ["I am here.", "The book is here.", "Sara sits here.", "We eat here.", "Here is my bag."],
      my: ["This is my book.", "My brother is here.", "I find my jacket.", "My teacher is kind.", "Here is my cup."],
      this: ["This book is good.", "I like this jacket.", "This day is nice.", "Sara takes this chair.", "This cup is mine."],
      these: ["These apples are good.", "I like these books.", "These shoes are mine.", "Sara takes these cups.", "These children play."],
      all: ["All the children play.", "All the books are here.", "We all go home.", "All my friends come.", "Sara sees all the cars."],
      many: ["I have many books.", "Many children play outside.", "Sara sees many cars.", "We eat many apples.", "There are many houses here."],
      in: ["The book is in the bag.", "I am in the park now.", "We eat in the living room.", "Sara lives in Norway.", "He puts food in the bag."],
      on: ["The cup is on the table.", "I am on the bus.", "The book is on the chair.", "We go on a trip.", "Sara writes on the paper."],
      with: ["I go with Sara.", "He eats with his family.", "We play with the ball.", "She reads with a friend.", "The child walks with Dad."],
      to: ["I go to school.", "Sara walks to the shop.", "We come to the park.", "He gives the book to Ali.", "The bus goes to town."],
      from: ["I come from Brazil.", "Sara walks from school.", "We get milk from the shop.", "He takes the book from the table.", "The bus comes from town."],
      under: ["The cat is under the table.", "The shoes are under the chair.", "The ball is under the sofa.", "He looks under the bed.", "The bag is under the jacket."],
      by: ["I stand by the door.", "The car is by the school.", "Sara sits by the table.", "We meet by the shop.", "The bag is by the chair."],
      between: ["The chair is between the table and the wall.", "Sara sits between Ali and Nora.", "The book is between two papers.", "The shop is between the school and the park.", "I walk between the houses."],
    };
    return enExamples[key] || [`I use "${word}" in a sentence.`, `Sara reads "${word}" in a book.`, `We write "${word}" on paper.`, `The teacher says "${word}".`, `The student finds "${word}" in the text.`];
  }
  if (languageName === "Brazilian Portuguese") {
    const ptExamples: Record<string, string[]> = {
      e: ["Eu como pão e queijo.", "Sara tem um livro e um lápis.", "Nós vamos para casa e fazemos comida.", "Ele gosta de futebol e música.", "Minha mãe sorri e diz oi."],
      mas: ["Eu gosto de leite, mas não gosto de café.", "Chove, mas nós saímos.", "Sara está cansada, mas lê um pouco.", "Ele quer brincar, mas precisa ir para casa.", "O livro é pequeno, mas é bom."],
      ou: ["Você quer água ou leite?", "Nós vamos para casa ou ficamos aqui?", "Você pode ler ou escrever.", "Eu pego uma maçã ou uma banana.", "Você vem hoje ou amanhã?"],
      porque: ["Eu entro porque chove.", "Sara sorri porque vê uma amiga.", "Nós comemos porque estamos com fome.", "Ele corre porque o ônibus vem.", "Eu sorrio porque o dia é bom."],
      então: ["Chove, então eu pego a jaqueta.", "Estou com fome, então como pão.", "O ônibus vem, então vamos agora.", "Sara está cansada, então descansa.", "É tarde, então vamos para casa."],
      quando: ["Eu leio quando estou em casa.", "Sara sorri quando vê o cachorro.", "Nós comemos quando a comida está pronta.", "Ele corre quando o ônibus vem.", "Eu durmo quando é noite."],
      se: ["Se chove, eu fico em casa.", "Se você vem, eu faço chá.", "Se Sara está em casa, nós brincamos.", "Se estou com fome, eu como.", "Se o ônibus vem, nós vamos."],
      que: ["Eu digo que vou.", "Sara sabe que o livro está aqui.", "Ele vê que a porta está aberta.", "Nós achamos que está bom.", "Eu ouço que você está em casa."],
      não: ["Eu não gosto de café.", "Ele não vem hoje.", "Nós não vemos o carro.", "Sara não come peixe.", "O livro não está na mesa."],
      também: ["Eu também gosto de chá.", "Sara também vem à escola.", "Nós também temos um gato.", "Ele também lê o livro.", "Esta também é minha jaqueta."],
      agora: ["Eu leio agora.", "Nós vamos para casa agora.", "Sara come agora.", "Ele está na escola agora.", "Agora o ônibus vem."],
      sempre: ["Eu sempre vou à escola.", "Sara sempre diz oi.", "Nós sempre tomamos café da manhã.", "Ele sempre lê em casa.", "O cachorro sempre dorme aqui."],
      "muitas vezes": ["Nós jogamos bola muitas vezes.", "Eu leio em casa muitas vezes.", "Sara vai à escola a pé muitas vezes.", "Ele bebe água muitas vezes.", "Eles se encontram no parque muitas vezes."],
      talvez: ["Talvez eu vá amanhã.", "Talvez Sara esteja em casa.", "Talvez nós comamos em breve.", "Talvez o ônibus venha agora.", "Talvez ele goste do livro."],
      "em breve": ["O ônibus chega em breve.", "Nós comemos em breve.", "Sara vai para casa em breve.", "Eu leio em breve.", "Em breve é hora da escola."],
      aqui: ["Eu estou aqui.", "O livro está aqui.", "Sara senta aqui.", "Nós comemos aqui.", "Aqui está minha bolsa."],
      meu: ["Este é meu livro.", "Meu irmão está aqui.", "Eu encontro meu casaco.", "Meu professor é gentil.", "Aqui está meu copo."],
      minha: ["Esta é minha bolsa.", "Minha irmã está aqui.", "Eu encontro minha jaqueta.", "Minha professora é gentil.", "Aqui está minha chave."],
      meus: ["Estes são meus sapatos.", "Meus amigos estão aqui.", "Eu encontro meus livros.", "Meus irmãos brincam.", "Aqui estão meus lápis."],
      minhas: ["Estas são minhas chaves.", "Minhas amigas estão aqui.", "Eu encontro minhas meias.", "Minhas mãos estão frias.", "Aqui estão minhas canetas."],
      este: ["Este livro é bom.", "Eu gosto deste casaco.", "Este dia é bom.", "Sara pega este copo.", "Este lápis é meu."],
      esta: ["Esta casa é grande.", "Eu gosto desta bolsa.", "Esta maçã é boa.", "Sara pega esta cadeira.", "Esta caneta é minha."],
      isto: ["Isto é meu.", "Eu gosto disto.", "Isto é uma mochila.", "Sara vê isto.", "O que é isto?"],
      estes: ["Estes livros são bons.", "Eu gosto destes sapatos.", "Estes copos são meus.", "Sara pega estes lápis.", "Estes alunos leem."],
      estas: ["Estas maçãs são boas.", "Eu gosto destas flores.", "Estas chaves são minhas.", "Sara pega estas xícaras.", "Estas crianças brincam."],
      todos: ["Todos os alunos leem.", "Todos os livros estão aqui.", "Todos nós vamos para casa.", "Todos os meus amigos vêm.", "Sara vê todos os carros."],
      muitos: ["Eu tenho muitos livros.", "Muitos alunos brincam fora.", "Sara vê muitos carros.", "Nós comemos muitos pães.", "Há muitos prédios aqui."],
      em: ["O livro está em casa.", "Eu estou em um parque agora.", "Nós comemos em casa.", "Sara mora em Oslo.", "Ele coloca comida em uma bolsa."],
      sobre: ["O copo está sobre a mesa.", "O livro está sobre a cadeira.", "A bolsa está sobre o banco.", "Sara escreve sobre o papel.", "O prato está sobre a mesa."],
      com: ["Eu vou com Sara.", "Ele come com a família.", "Nós brincamos com a bola.", "Ela lê com uma amiga.", "A criança anda com o pai."],
      para: ["Eu vou para a escola.", "Sara vai para a loja.", "Nós vamos para o parque.", "Ele dá o livro para Ali.", "O ônibus vai para a cidade."],
      de: ["Eu venho de casa.", "Sara sai da escola.", "Nós pegamos leite da loja.", "Ele tira o livro da mesa.", "O ônibus vem da cidade."],
      "embaixo de": ["O gato está embaixo da mesa.", "Os sapatos estão embaixo da cadeira.", "A bola está embaixo do sofá.", "Ele olha embaixo da cama.", "A bolsa está embaixo do casaco."],
      "perto de": ["Eu fico perto da porta.", "O carro está perto da escola.", "Sara senta perto da mesa.", "Nós nos encontramos perto da loja.", "A bolsa está perto da cadeira."],
      entre: ["A cadeira está entre a mesa e a parede.", "Sara senta entre Ali e Nora.", "O livro está entre dois papéis.", "A loja fica entre a escola e o parque.", "Eu ando entre as casas."],
    };
    return ptExamples[key] || [`Eu uso "${word}" em uma frase.`, `Sara lê "${word}" em um livro.`, `Nós escrevemos "${word}" no papel.`, `A professora diz "${word}".`, `O aluno encontra "${word}" no texto.`];
  }
  const examples: Record<string, string[]> = {
    og: [
      "Jeg spiser brød og ost.",
      "Sara har en bok og en blyant.",
      "Vi går hjem og lager mat.",
      "Han liker fotball og musikk.",
      "Mor smiler og sier hei.",
    ],
    men: [
      "Jeg liker melk, men jeg liker ikke kaffe.",
      "Det regner, men vi går ut.",
      "Sara er trøtt, men hun leser litt.",
      "Han vil leke, men han må hjem.",
      "Boka er liten, men den er fin.",
    ],
    eller: [
      "Vil du ha vann eller melk?",
      "Skal vi gå hjem eller bli her?",
      "Du kan lese eller skrive.",
      "Jeg tar eple eller banan.",
      "Kommer du i dag eller i morgen?",
    ],
    fordi: [
      "Jeg går inn fordi det regner.",
      "Sara smiler fordi hun ser en venn.",
      "Vi spiser fordi vi er sultne.",
      "Han løper fordi bussen kommer.",
      "Jeg ler fordi boka er morsom.",
    ],
    så: [
      "Det regner, så jeg tar jakke.",
      "Jeg er sulten, så jeg spiser brød.",
      "Bussen kommer, så vi går nå.",
      "Sara er trøtt, så hun hviler.",
      "Det er sent, så vi går hjem.",
    ],
    når: [
      "Jeg leser når jeg er hjemme.",
      "Sara smiler når hun ser hunden.",
      "Vi spiser når maten er klar.",
      "Han løper når bussen kommer.",
      "Jeg sover når det er natt.",
    ],
    hvis: [
      "Hvis det regner, blir jeg inne.",
      "Hvis du kommer, lager jeg te.",
      "Hvis Sara er hjemme, leker vi.",
      "Hvis jeg er sulten, spiser jeg.",
      "Hvis bussen kommer, går vi.",
    ],
    at: [
      "Jeg sier at jeg kommer.",
      "Sara vet at boka er her.",
      "Han ser at døra er åpen.",
      "Vi tror at det er bra.",
      "Jeg hører at du er hjemme.",
    ],
    ikke: [
      "Jeg liker ikke kaffe.",
      "Han kommer ikke i dag.",
      "Vi ser ikke bilen.",
      "Sara spiser ikke fisk.",
      "Boka ligger ikke på bordet.",
    ],
    også: [
      "Jeg liker også te.",
      "Sara kommer også på skolen.",
      "Vi har også en katt.",
      "Han leser også boka.",
      "Dette er også min jakke.",
    ],
    nå: [
      "Jeg leser nå.",
      "Vi går hjem nå.",
      "Sara spiser nå.",
      "Han er på skolen nå.",
      "Nå kommer bussen.",
    ],
    alltid: [
      "Jeg går alltid til skolen.",
      "Sara sier alltid hei.",
      "Vi spiser alltid frokost.",
      "Han leser alltid hjemme.",
      "Hunden sover alltid her.",
    ],
    ofte: [
      "Vi spiller ofte fotball.",
      "Jeg leser ofte hjemme.",
      "Sara går ofte til skolen.",
      "Han drikker ofte vann.",
      "De møtes ofte i parken.",
    ],
    kanskje: [
      "Kanskje jeg kommer i morgen.",
      "Kanskje Sara er hjemme.",
      "Kanskje vi spiser snart.",
      "Kanskje bussen kommer nå.",
      "Kanskje han liker boka.",
    ],
    snart: [
      "Bussen kommer snart.",
      "Vi spiser snart.",
      "Sara går hjem snart.",
      "Jeg leser snart.",
      "Snart er det skole.",
    ],
    her: [
      "Jeg er her.",
      "Boka er her.",
      "Sara sitter her.",
      "Vi spiser her.",
      "Her er sekken min.",
    ],
    min: [
      "Dette er min bok.",
      "Min bror heter Ali.",
      "Jeg finner min jakke.",
      "Min lærer er snill.",
      "Her er min kopp.",
    ],
    mitt: [
      "Dette er mitt hus.",
      "Mitt rom er lite.",
      "Jeg vasker mitt bord.",
      "Mitt navn er Sara.",
      "Her er mitt eple.",
    ],
    mine: [
      "Dette er mine sko.",
      "Mine venner er her.",
      "Jeg finner mine bøker.",
      "Mine hender er kalde.",
      "Her er mine nøkler.",
    ],
    denne: [
      "Denne boka er fin.",
      "Jeg liker denne jakka.",
      "Denne dagen er god.",
      "Sara tar denne stolen.",
      "Denne koppen er min.",
    ],
    dette: [
      "Dette huset er stort.",
      "Jeg liker dette bildet.",
      "Dette er min sekk.",
      "Dette brødet er godt.",
      "Hva er dette?",
    ],
    disse: [
      "Disse eplene er gode.",
      "Jeg liker disse bøkene.",
      "Disse skoene er mine.",
      "Sara tar disse koppene.",
      "Disse barna leker.",
    ],
    alle: [
      "Alle barna leker.",
      "Alle bøkene er her.",
      "Vi går alle hjem.",
      "Alle vennene mine kommer.",
      "Sara ser alle bilene.",
    ],
    mange: [
      "Jeg har mange bøker.",
      "Mange barn leker ute.",
      "Sara ser mange biler.",
      "Vi spiser mange epler.",
      "Det er mange hus her.",
    ],
    i: [
      "Boka ligger i sekken.",
      "Jeg er i parken nå.",
      "Vi spiser i stua.",
      "Sara bor i Norge.",
      "Han legger maten i posen.",
    ],
    på: [
      "Koppen står på bordet.",
      "Jeg er på skolen.",
      "Boka ligger på stolen.",
      "Vi går på tur.",
      "Sara skriver på arket.",
    ],
    med: [
      "Jeg går med Sara.",
      "Han spiser med familien.",
      "Vi leker med ballen.",
      "Hun leser med en venn.",
      "Barnet går med pappa.",
    ],
    til: [
      "Jeg går til skolen.",
      "Sara går til butikken.",
      "Vi kommer til parken.",
      "Han gir boka til Ali.",
      "Bussen går til byen.",
    ],
    fra: [
      "Jeg kommer fra Norge.",
      "Sara går fra skolen.",
      "Vi henter melk fra butikken.",
      "Han tar boka fra bordet.",
      "Bussen kommer fra byen.",
    ],
    under: [
      "Katten ligger under bordet.",
      "Skoene står under stolen.",
      "Ballen er under sofaen.",
      "Han ser under senga.",
      "Veska ligger under jakka.",
    ],
    ved: [
      "Jeg står ved døra.",
      "Bilen er ved skolen.",
      "Sara sitter ved bordet.",
      "Vi møtes ved butikken.",
      "Sekken ligger ved stolen.",
    ],
    mellom: [
      "Stolen står mellom bordet og veggen.",
      "Sara sitter mellom Ali og Nora.",
      "Boka ligger mellom to ark.",
      "Butikken er mellom skolen og parken.",
      "Jeg går mellom husene.",
    ],
  };
  return examples[word.toLocaleLowerCase()] || [
    `Jeg bruker ordet "${word}" i en enkel setning.`,
    `Sara leser ordet "${word}" i boka.`,
    `Vi skriver ordet "${word}" på arket.`,
    `Læreren sier ordet "${word}" høyt.`,
    `Eleven finner ordet "${word}" i teksten.`,
  ];
}

function escapeA1StartRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitHighFrequencyTextAndExplanation(
  text: string,
  labels: ReturnType<typeof getHighFrequencyLanguageLabels>
): { readingText: string; explanation: string } {
  const normalizedText = text.trim();
  const headings = [labels.explanationHeading, labels.exampleHeading].filter(Boolean);
  let splitIndex = -1;

  for (const heading of headings) {
    const match = normalizedText.match(
      new RegExp(`(?:^|\\n)\\s*${escapeA1StartRegExp(heading)}\\s*(?:\\n|$)`, "i")
    );
    if (match?.index !== undefined && (splitIndex === -1 || match.index < splitIndex)) {
      splitIndex = match.index;
    }
  }

  if (splitIndex === -1) {
    return { readingText: normalizedText, explanation: "" };
  }

  return {
    readingText: normalizedText.slice(0, splitIndex).trim(),
    explanation: normalizedText.slice(splitIndex).trim(),
  };
}

function splitHighFrequencyExplanationAndReadingSentences(
  text: string,
  labels: ReturnType<typeof getHighFrequencyLanguageLabels>,
  word: string
): { explanation: string; readingSentences: string } {
  const normalizedText = text.trim();
  if (!normalizedText) return { explanation: "", readingSentences: "" };

  const sentenceHeadings = [
    labels.sentencesWithWordHeading(word),
    labels.exampleHeading,
    "Example sentences",
    "Eksempelsetninger",
    "Frases de exemplo",
  ];
  let splitIndex = -1;

  for (const heading of sentenceHeadings) {
    const match = normalizedText.match(
      new RegExp(`(?:^|\\n)\\s*${escapeA1StartRegExp(heading)}\\s*(?:\\n|$)`, "i")
    );
    if (match?.index !== undefined && (splitIndex === -1 || match.index < splitIndex)) {
      splitIndex = match.index;
    }
  }

  if (splitIndex === -1) {
    return { explanation: normalizedText, readingSentences: "" };
  }

  return {
    explanation: normalizedText.slice(0, splitIndex).trim(),
    readingSentences: normalizedText.slice(splitIndex).trim(),
  };
}

function removeHighFrequencyReadingHeading(
  text: string,
  labels: ReturnType<typeof getHighFrequencyLanguageLabels>,
  word: string
): string {
  const headings = [
    labels.sentencesWithWordHeading(word),
    labels.exampleHeading,
    "Example sentences",
    "Eksempelsetninger",
    "Frases de exemplo",
  ];
  let cleaned = text.trim();
  for (const heading of headings) {
    cleaned = cleaned.replace(
      new RegExp(`^\\s*${escapeA1StartRegExp(heading)}\\s*(?:\\n|$)`, "i"),
      ""
    ).trim();
  }
  return cleaned;
}

function normalizeA1StartHighFrequencyResult(
  result: GenerateTextResult,
  config: A1StartConfig,
  languageName: string
): GenerateTextResult {
  const word = cleanA1StartLine(String(config.word || ""));
  const wordClass = String(config.wordClass || "").trim();
  const text = removeA1StartSectionNumbering(String(result.text || ""));

  if (!word || !text) {
    throw new Error("A1 Start response did not contain usable high-frequency word text.");
  }

  const languageLabels = getHighFrequencyLanguageLabels(languageName);
  const explanation = [
    languageLabels.explanationHeading,
    languageLabels.belongsToWordClass(word, getHighFrequencyWordClassLabel(wordClass, languageName)),
    getHighFrequencyWordClassExplanation(wordClass, languageName),
    getHighFrequencyWordExplanation(word, languageName),
  ].join("\n");
  const exampleSentences = getHighFrequencyExampleSentences(word, languageName).join("\n");
  const splitText = splitHighFrequencyTextAndExplanation(text, languageLabels);
  const suppliedExplanation = removeA1StartSectionNumbering(
    stringifyGeneratedText(result.highFrequencyExplanation)
  );
  const suppliedReadingSentences = removeA1StartSectionNumbering(
    stringifyGeneratedText(result.highFrequencyReadingSentences)
  );
  const separatedExplanation = splitHighFrequencyExplanationAndReadingSentences(
    suppliedExplanation || splitText.explanation,
    languageLabels,
    word
  );
  const explanationBase = separatedExplanation.explanation;
  const readingSentencesBase = suppliedReadingSentences || separatedExplanation.readingSentences;
  const hasExplanation = explanationBase.toLocaleLowerCase().includes(languageLabels.explanationHeading.toLocaleLowerCase());
  const hasReadingSentences = readingSentencesBase.trim().length > 0;
  const highFrequencyExplanation = [
    hasExplanation ? explanationBase : "",
    hasExplanation ? "" : explanation,
  ].filter(Boolean).join("\n\n");
  const normalizedReadingSentences = hasReadingSentences
    ? removeHighFrequencyReadingHeading(readingSentencesBase, languageLabels, word)
    : "";
  const highFrequencyReadingSentences = normalizedReadingSentences || exampleSentences;

  return {
    title: `${languageLabels.titlePrefix} – ${word}`,
    text: splitText.readingText,
    highFrequencyReadingSentences,
    highFrequencyExplanation,
  };
}

function normalizeA1StartSoundLadderResult(
  result: GenerateTextResult,
  config: A1StartConfig,
  languageName: string
): GenerateTextResult {
  const focusSound = cleanA1StartLine(String(config.focusSound || ""));
  const labels = getSoundLadderLabels(languageName);
  const text = stringifyGeneratedText(result.text);
  const soundWordCount = [10, 14, 20].includes(Number(config.soundWordCount))
    ? Number(config.soundWordCount)
    : 10;

  if (!focusSound || !text) {
    throw new Error("A1 Start response did not contain usable sound ladder text.");
  }

  let normalizedText = text;
  const generatedWords = parseSoundWordsFromSection(normalizedText, labels.wordTraining);
  const normalizedWords = normalizeSoundWords(generatedWords, languageName, focusSound, soundWordCount);

  if (normalizedText.toLocaleLowerCase().includes(labels.wordTraining.toLocaleLowerCase())) {
    normalizedText = replaceA1StartSection(
      normalizedText,
      labels.wordTraining,
      [labels.soundSentences, labels.story, labels.explanation],
      formatSoundWords(normalizedWords)
    );
  }

  const explanation = getSoundLadderExplanationText(languageName, focusSound, normalizedWords);
  const soundWords = [
    labels.wordTraining,
    formatSoundWords(normalizedWords),
  ].join("\n");
  const fallbackSentences = getSoundTrainingSentences(languageName, focusSound, soundWordCount);
  const normalizedSentences = normalizedWords.length
    ? normalizedWords.map((word) => simpleSoundSentence(languageName, word))
    : fallbackSentences;
  const soundSentences = [
    labels.soundSentences,
    ...normalizedSentences,
  ].join("\n");

  if (normalizedText.toLocaleLowerCase().includes(labels.soundSentences.toLocaleLowerCase())) {
    normalizedText = replaceA1StartSection(
      normalizedText,
      labels.soundSentences,
      [labels.story, labels.explanation],
      normalizedSentences.join("\n")
    );
  }

  if (normalizedText.toLocaleLowerCase().includes(labels.explanation.toLocaleLowerCase())) {
    normalizedText = replaceA1StartSection(
      normalizedText,
      labels.explanation,
      [],
      explanation.split(/\r?\n/).slice(1).join("\n")
    );
  }

  const lowerText = normalizedText.toLocaleLowerCase();
  const extraSections = [
    !lowerText.includes(labels.wordTraining.toLocaleLowerCase()) ? soundWords : "",
    !lowerText.includes(labels.soundSentences.toLocaleLowerCase()) ? soundSentences : "",
    !lowerText.includes(labels.explanation.toLocaleLowerCase()) ? explanation : "",
  ].filter(Boolean).join("\n\n");

  return {
    title: `${labels.titlePrefix} – ${focusSound}`,
    text: extraSections ? `${normalizedText}\n\n${extraSections}` : normalizedText,
  };
}

function buildFallbackGroupsFromPattern(
  subjects: string[],
  verbForms: string[],
  complements: string[]
): string[][] {
  return subjects.map((subject, subjectIndex) =>
    Array.from({ length: 3 }, (_, itemIndex) => {
      const complement = complements[(subjectIndex * 3 + itemIndex) % complements.length];
      return `${subject} ${verbForms[subjectIndex]} ${complement}`.trim();
    })
  );
}

function getA1StartBrazilianPortugueseVerbPattern(
  selectedVerb: string,
  tense: string,
  topic: string
): A1StartVerbPattern | null {
  const normalizedVerb = selectedVerb.toLocaleLowerCase();
  const normalizedTense = tense === "past" || tense === "future" ? tense : "present";
  const cleanedTopic = cleanA1StartLine(topic).toLocaleLowerCase();
  const isFamilyTopic = cleanedTopic === "familie" || cleanedTopic === "família" || cleanedTopic === "familia";
  const isSchoolTopic = cleanedTopic === "skole" || cleanedTopic === "escola";
  const isShoppingTopic = cleanedTopic === "shopping" || cleanedTopic === "compras";
  const isTravelTopic = cleanedTopic === "reise" || cleanedTopic === "viagem";
  const isFriendsTopic = cleanedTopic === "venner" || cleanedTopic === "amigos";
  const isHomeTopic = cleanedTopic === "hjem" || cleanedTopic === "casa";
  const isTransportTopic = cleanedTopic === "transport" || cleanedTopic === "transporte";
  const isHealthTopic = cleanedTopic === "helse" || cleanedTopic === "saúde" || cleanedTopic === "saude";
  const isBreakfastTopic =
    cleanedTopic === "frokost" ||
    cleanedTopic === "café da manhã" ||
    cleanedTopic === "cafe da manha" ||
    cleanedTopic === "café de manhã" ||
    cleanedTopic === "cafe de manha";
  const isDinnerTopic = cleanedTopic === "middag" || cleanedTopic === "jantar";
  const topicPhrase = cleanA1StartLine(topic);
  const verbForms: Record<string, Record<string, { first: string; third: string }>> = {
    ser: {
      present: { first: "sou", third: "é" },
      past: { first: "fui", third: "foi" },
      future: { first: "vou ser", third: "vai ser" },
    },
    ter: {
      present: { first: "tenho", third: "tem" },
      past: { first: "tive", third: "teve" },
      future: { first: "vou ter", third: "vai ter" },
    },
    ver: {
      present: { first: "vejo", third: "vê" },
      past: { first: "vi", third: "viu" },
      future: { first: "vou ver", third: "vai ver" },
    },
    gostar: {
      present: { first: "gosto", third: "gosta" },
      past: { first: "gostei", third: "gostou" },
      future: { first: "vou gostar", third: "vai gostar" },
    },
    comer: {
      present: { first: "como", third: "come" },
      past: { first: "comi", third: "comeu" },
      future: { first: "vou comer", third: "vai comer" },
    },
    beber: {
      present: { first: "bebo", third: "bebe" },
      past: { first: "bebi", third: "bebeu" },
      future: { first: "vou beber", third: "vai beber" },
    },
    ir: {
      present: { first: "vou", third: "vai" },
      past: { first: "fui", third: "foi" },
      future: { first: "vou", third: "vai" },
    },
    vir: {
      present: { first: "venho", third: "vem" },
      past: { first: "vim", third: "veio" },
      future: { first: "vou vir", third: "vai vir" },
    },
    fazer: {
      present: { first: "faço", third: "faz" },
      past: { first: "fiz", third: "fez" },
      future: { first: "vou fazer", third: "vai fazer" },
    },
    ler: {
      present: { first: "leio", third: "lê" },
      past: { first: "li", third: "leu" },
      future: { first: "vou ler", third: "vai ler" },
    },
    escrever: {
      present: { first: "escrevo", third: "escreve" },
      past: { first: "escrevi", third: "escreveu" },
      future: { first: "vou escrever", third: "vai escrever" },
    },
  };
  const defaultComplements: Record<string, string[]> = {
    ser: ["feliz", "gentil", "forte", "calmo", "rápido", "amigo"],
    ter: ["um livro", "uma bolsa", "uma bola", "uma bicicleta", "um cão", "um gato"],
    ver: ["um carro", "um ônibus", "um trem", "uma casa", "uma escola", "uma loja"],
    gostar: ["de livros", "de filmes", "de música", "de café", "de chá", "de suco"],
    comer: ["uma maçã", "pão", "arroz", "peixe", "sopa", "frutas"],
    beber: ["água", "leite", "suco", "chá", "café", "vitamina"],
    ir: ["para casa", "à escola", "ao parque", "à loja", "ao trabalho", "para fora"],
    vir: ["para casa", "à escola", "ao parque", "à loja", "para dentro", "de fora"],
    fazer: ["comida", "um bolo", "um desenho", "uma cadeira", "um barco", "um cartão"],
    ler: ["um livro", "uma história", "uma carta", "uma revista", "uma placa", "um poema"],
    escrever: ["uma palavra", "uma frase", "uma carta", "um nome", "uma história", "uma lista"],
  };
  const familyComplements: Partial<Record<string, string[]>> = {
    ver: ["minha mãe", "meu pai", "minha irmã", "meu irmão", "minha avó", "meu avô"],
    gostar: ["da minha mãe", "do meu pai", "da minha irmã", "do meu irmão", "da minha avó", "do meu avô"],
    comer: ["com minha mãe", "com meu pai", "com minha irmã", "com meu irmão", "com minha avó", "com meu avô"],
    beber: ["com minha mãe", "com meu pai", "com minha irmã", "com meu irmão", "com minha avó", "com meu avô"],
    ir: ["para a casa da mãe", "para a casa do pai", "para a casa da irmã", "para a casa do irmão", "para a casa da avó", "para a casa do avô"],
    vir: ["da casa da mãe", "da casa do pai", "da casa da irmã", "da casa do irmão", "da casa da avó", "da casa do avô"],
    fazer: ["comida para minha mãe", "um bolo para meu pai", "um desenho para minha irmã", "um cartão para meu irmão", "chá para minha avó", "um presente para meu avô"],
    ler: ["uma carta para minha mãe", "uma carta para meu pai", "uma história para minha irmã", "uma história para meu irmão", "um livro para minha avó", "um livro para meu avô"],
    escrever: ["uma carta para minha mãe", "uma carta para meu pai", "uma frase para minha irmã", "uma frase para meu irmão", "um cartão para minha avó", "um cartão para meu avô"],
  };
  const schoolComplements: Partial<Record<string, string[]>> = {
    ser: ["aluno", "professor", "amigo", "gentil", "calmo", "rápido"],
    ter: ["um livro", "um lápis", "um caderno", "uma mochila", "uma borracha", "uma régua"],
    ver: ["um livro", "um lápis", "um caderno", "uma mochila", "uma mesa", "uma sala"],
    gostar: ["do livro", "do lápis", "do caderno", "da mochila", "da sala", "da escola"],
    comer: ["um lanche", "uma fruta", "um pão", "uma banana", "uma maçã", "uma salada"],
    beber: ["água", "suco", "leite", "vitamina", "água na escola", "suco no recreio"],
    ir: ["à escola", "à sala", "ao recreio", "à biblioteca", "ao quadro", "ao pátio"],
    vir: ["da escola", "da sala", "do recreio", "da biblioteca", "do quadro", "do pátio"],
    fazer: ["uma tarefa", "um desenho", "uma conta", "uma prova", "um cartaz", "uma atividade"],
    ler: ["um livro", "uma frase", "uma palavra", "uma história", "uma página", "um texto"],
    escrever: ["uma palavra", "uma frase", "uma conta", "um texto", "uma resposta", "um nome"],
  };
  const breakfastComplements: Partial<Record<string, string[]>> = {
    ser: ["cedo", "bom", "simples", "gostoso", "calmo", "rápido"],
    ter: ["pão", "queijo", "fruta", "bolo", "cereal", "torrada"],
    ver: ["pão", "queijo", "fruta", "bolo", "cereal", "torrada"],
    gostar: ["de pão", "de queijo", "de fruta", "de bolo", "de cereal", "de torrada"],
    comer: ["pão", "queijo", "fruta", "bolo", "cereal", "torrada"],
    beber: ["água", "leite", "suco", "café", "chá", "vitamina"],
    ir: ["para a cozinha", "para a mesa", "tomar café", "comer pão", "beber leite", "pegar fruta"],
    vir: ["para a cozinha", "para a mesa", "tomar café", "comer pão", "beber leite", "pegar fruta"],
    fazer: ["pão", "suco", "café", "chá", "uma vitamina", "uma torrada"],
    ler: ["uma palavra", "uma frase", "um bilhete", "uma receita", "um livro", "uma história"],
    escrever: ["uma palavra", "uma frase", "um bilhete", "uma receita", "um nome", "uma lista"],
  };
  const dinnerComplements: Partial<Record<string, string[]>> = {
    ser: ["bom", "gostoso", "simples", "quente", "calmo", "rápido"],
    ter: ["arroz", "feijão", "peixe", "sopa", "salada", "frango"],
    ver: ["arroz", "feijão", "peixe", "sopa", "salada", "frango"],
    gostar: ["de arroz", "de feijão", "de peixe", "de sopa", "de salada", "de frango"],
    comer: ["arroz", "feijão", "peixe", "sopa", "salada", "frango"],
    beber: ["água", "suco", "leite", "chá", "vitamina", "água com limão"],
    ir: ["para a cozinha", "para a mesa", "jantar", "pegar arroz", "comer sopa", "beber água"],
    vir: ["para a cozinha", "para a mesa", "jantar", "pegar arroz", "comer sopa", "beber água"],
    fazer: ["arroz", "feijão", "sopa", "salada", "frango", "peixe"],
    ler: ["uma receita", "uma lista", "um bilhete", "uma frase", "um texto", "uma palavra"],
    escrever: ["uma receita", "uma lista", "um bilhete", "uma frase", "um texto", "uma palavra"],
  };
  const shoppingComplements: Partial<Record<string, string[]>> = {
    ser: ["barato", "caro", "novo", "bonito", "pequeno", "grande"],
    ter: ["uma bolsa", "uma camiseta", "um sapato", "um livro", "um brinquedo", "um presente"],
    ver: ["uma bolsa", "uma camiseta", "um sapato", "um livro", "um brinquedo", "um presente"],
    gostar: ["da bolsa", "da camiseta", "do sapato", "do livro", "do brinquedo", "do presente"],
    comer: ["um lanche", "uma fruta", "um pão", "uma banana", "uma maçã", "uma salada"],
    beber: ["água", "suco", "leite", "café", "chá", "vitamina"],
    ir: ["à loja", "ao mercado", "ao caixa", "ao shopping", "comprar uma bolsa", "comprar um livro"],
    vir: ["da loja", "do mercado", "do caixa", "do shopping", "comprar uma bolsa", "comprar um livro"],
    fazer: ["uma lista", "uma compra", "um pagamento", "um pacote", "uma escolha", "um pedido"],
    ler: ["uma lista", "um preço", "uma placa", "um bilhete", "um anúncio", "um nome"],
    escrever: ["uma lista", "um preço", "um nome", "um bilhete", "uma frase", "um pedido"],
  };
  const travelComplements: Partial<Record<string, string[]>> = {
    ser: ["longe", "perto", "bom", "rápido", "calmo", "novo"],
    ter: ["uma mala", "uma passagem", "um mapa", "um bilhete", "um ônibus", "um trem"],
    ver: ["uma mala", "uma passagem", "um mapa", "um ônibus", "um trem", "um hotel"],
    gostar: ["da mala", "da viagem", "do mapa", "do ônibus", "do trem", "do hotel"],
    comer: ["um lanche", "uma fruta", "um pão", "uma banana", "uma maçã", "uma salada"],
    beber: ["água", "suco", "leite", "café", "chá", "vitamina"],
    ir: ["ao ônibus", "ao trem", "ao hotel", "à estação", "ao aeroporto", "à cidade"],
    vir: ["do ônibus", "do trem", "do hotel", "da estação", "do aeroporto", "da cidade"],
    fazer: ["uma mala", "uma viagem", "um mapa", "uma lista", "uma parada", "um plano"],
    ler: ["um mapa", "uma passagem", "um bilhete", "uma placa", "uma lista", "um nome"],
    escrever: ["uma lista", "um nome", "um bilhete", "uma frase", "um plano", "um endereço"],
  };
  const friendsComplements: Partial<Record<string, string[]>> = {
    ser: ["amigo", "gentil", "bom amigo", "calmo", "feliz", "leal"],
    ter: ["um amigo", "uma amiga", "um grupo", "uma bola", "um jogo", "uma foto"],
    ver: ["um amigo", "uma amiga", "um grupo", "uma bola", "um jogo", "uma foto"],
    gostar: ["do amigo", "da amiga", "do grupo", "do jogo", "da bola", "da foto"],
    comer: ["com um amigo", "com uma amiga", "com o grupo", "com Sara", "com Ana", "com Paulo"],
    beber: ["água com um amigo", "suco com uma amiga", "leite com o grupo", "chá com Sara", "café com Ana", "vitamina com Paulo"],
    ir: ["com um amigo", "com uma amiga", "ao parque", "ao jogo", "à casa de Sara", "à casa de Ana"],
    vir: ["com um amigo", "com uma amiga", "do parque", "do jogo", "da casa de Sara", "da casa de Ana"],
    fazer: ["um jogo com o amigo", "um desenho para a amiga", "uma carta para o grupo", "uma foto com Sara", "um plano com Ana", "uma atividade com Paulo"],
    ler: ["uma carta do amigo", "uma carta da amiga", "uma mensagem do grupo", "uma história para Sara", "um bilhete de Ana", "um texto sobre amigos"],
    escrever: ["uma carta para o amigo", "uma carta para a amiga", "uma mensagem para o grupo", "um bilhete para Sara", "uma frase sobre Ana", "um texto sobre amigos"],
  };
  const homeComplements: Partial<Record<string, string[]>> = {
    ser: ["em casa", "calmo", "limpo", "pequeno", "grande", "bom"],
    ter: ["uma cama", "uma mesa", "uma cadeira", "uma porta", "uma janela", "um quarto"],
    ver: ["uma cama", "uma mesa", "uma cadeira", "uma porta", "uma janela", "um quarto"],
    gostar: ["da casa", "do quarto", "da cama", "da mesa", "da janela", "da cadeira"],
    comer: ["em casa", "na cozinha", "na mesa", "pão em casa", "fruta em casa", "sopa em casa"],
    beber: ["água em casa", "suco em casa", "leite em casa", "chá na cozinha", "café na mesa", "vitamina em casa"],
    ir: ["para casa", "para o quarto", "para a cozinha", "para a sala", "para a mesa", "para a porta"],
    vir: ["para casa", "do quarto", "da cozinha", "da sala", "da mesa", "da porta"],
    fazer: ["a cama", "comida", "um desenho", "uma lista", "uma tarefa", "um lanche"],
    ler: ["um livro em casa", "uma frase no quarto", "uma carta na sala", "uma receita na cozinha", "um bilhete na mesa", "um texto em casa"],
    escrever: ["uma frase em casa", "uma carta no quarto", "um bilhete na sala", "uma lista na cozinha", "um nome na mesa", "um texto em casa"],
  };
  const transportComplements: Partial<Record<string, string[]>> = {
    ser: ["rápido", "lento", "perto", "longe", "cheio", "novo"],
    ter: ["um ônibus", "um trem", "um carro", "uma bicicleta", "um bilhete", "uma parada"],
    ver: ["um ônibus", "um trem", "um carro", "uma bicicleta", "um bilhete", "uma parada"],
    gostar: ["do ônibus", "do trem", "do carro", "da bicicleta", "do bilhete", "da parada"],
    comer: ["um lanche no ônibus", "uma fruta no trem", "um pão no carro", "uma banana na parada", "uma maçã na viagem", "uma salada na estação"],
    beber: ["água no ônibus", "suco no trem", "leite no carro", "café na parada", "chá na viagem", "vitamina na estação"],
    ir: ["de ônibus", "de trem", "de carro", "de bicicleta", "à parada", "à estação"],
    vir: ["de ônibus", "de trem", "de carro", "de bicicleta", "da parada", "da estação"],
    fazer: ["uma viagem", "uma parada", "uma lista", "um mapa", "um plano", "um bilhete"],
    ler: ["um bilhete", "um mapa", "uma placa", "uma lista", "um nome", "um horário"],
    escrever: ["um bilhete", "um nome", "uma lista", "um horário", "uma frase", "um plano"],
  };
  const healthComplements: Partial<Record<string, string[]>> = {
    ser: ["saudável", "forte", "calmo", "bom", "leve", "ativo"],
    ter: ["água", "sono", "força", "energia", "um remédio", "uma consulta"],
    ver: ["um médico", "uma médica", "um remédio", "uma consulta", "uma fruta", "água"],
    gostar: ["de água", "de fruta", "de sono", "de descanso", "de caminhar", "de correr"],
    comer: ["fruta", "salada", "sopa", "arroz", "peixe", "banana"],
    beber: ["água", "suco", "leite", "chá", "vitamina", "água com limão"],
    ir: ["ao médico", "à médica", "à consulta", "caminhar", "correr", "descansar"],
    vir: ["do médico", "da médica", "da consulta", "caminhar", "correr", "descansar"],
    fazer: ["uma caminhada", "um exercício", "uma consulta", "uma pausa", "uma lista", "um lanche saudável"],
    ler: ["uma receita", "uma lista", "um bilhete", "um texto sobre saúde", "uma frase", "uma palavra"],
    escrever: ["uma lista", "um bilhete", "uma frase sobre saúde", "um texto sobre saúde", "um nome", "uma palavra"],
  };
  const topicComplements: Partial<Record<string, string[]>> | null = topicPhrase && !isFamilyTopic && !isSchoolTopic && !isShoppingTopic && !isTravelTopic && !isFriendsTopic && !isHomeTopic && !isTransportTopic && !isHealthTopic && !isBreakfastTopic && !isDinnerTopic
    ? {
        ser: [`amigo de ${topicPhrase}`, `fã de ${topicPhrase}`, `bom em ${topicPhrase}`, `feliz com ${topicPhrase}`, `calmo com ${topicPhrase}`, `rápido em ${topicPhrase}`],
        ter: [`um livro sobre ${topicPhrase}`, `uma foto de ${topicPhrase}`, `um desenho de ${topicPhrase}`, `uma história de ${topicPhrase}`, `uma mochila de ${topicPhrase}`, `uma camiseta de ${topicPhrase}`],
        ver: [`${topicPhrase}`, `uma foto de ${topicPhrase}`, `um desenho de ${topicPhrase}`, `um livro sobre ${topicPhrase}`, `uma história de ${topicPhrase}`, `um vídeo de ${topicPhrase}`],
        gostar: [`de ${topicPhrase}`, `muito de ${topicPhrase}`, `da história de ${topicPhrase}`, `do desenho de ${topicPhrase}`, `do livro de ${topicPhrase}`, `da foto de ${topicPhrase}`],
        comer: [`um lanche depois de ${topicPhrase}`, `uma fruta depois de ${topicPhrase}`, `um pão depois de ${topicPhrase}`, `uma banana depois de ${topicPhrase}`, `uma maçã depois de ${topicPhrase}`, `uma salada depois de ${topicPhrase}`],
        beber: [`água depois de ${topicPhrase}`, `suco depois de ${topicPhrase}`, `leite depois de ${topicPhrase}`, `água com ${topicPhrase}`, `suco com ${topicPhrase}`, `vitamina depois de ${topicPhrase}`],
        ir: [`para ${topicPhrase}`, `ver ${topicPhrase}`, `brincar de ${topicPhrase}`, `ler sobre ${topicPhrase}`, `falar de ${topicPhrase}`, `desenhar ${topicPhrase}`],
        vir: [`de ${topicPhrase}`, `para ver ${topicPhrase}`, `para brincar de ${topicPhrase}`, `para ler sobre ${topicPhrase}`, `para falar de ${topicPhrase}`, `para desenhar ${topicPhrase}`],
        fazer: [`um desenho de ${topicPhrase}`, `uma história de ${topicPhrase}`, `um cartaz de ${topicPhrase}`, `uma atividade sobre ${topicPhrase}`, `uma frase sobre ${topicPhrase}`, `um jogo de ${topicPhrase}`],
        ler: [`um livro sobre ${topicPhrase}`, `uma história de ${topicPhrase}`, `uma frase sobre ${topicPhrase}`, `uma página sobre ${topicPhrase}`, `um texto sobre ${topicPhrase}`, `uma palavra de ${topicPhrase}`],
        escrever: [`uma palavra sobre ${topicPhrase}`, `uma frase sobre ${topicPhrase}`, `uma história de ${topicPhrase}`, `um texto sobre ${topicPhrase}`, `uma resposta sobre ${topicPhrase}`, `um nome de ${topicPhrase}`],
      }
    : null;
  const forms = verbForms[normalizedVerb]?.[normalizedTense];
  const complements =
    isFamilyTopic && familyComplements[normalizedVerb]
      ? familyComplements[normalizedVerb]
        : isSchoolTopic && schoolComplements[normalizedVerb]
          ? schoolComplements[normalizedVerb]
        : isShoppingTopic && shoppingComplements[normalizedVerb]
          ? shoppingComplements[normalizedVerb]
        : isTravelTopic && travelComplements[normalizedVerb]
          ? travelComplements[normalizedVerb]
        : isFriendsTopic && friendsComplements[normalizedVerb]
          ? friendsComplements[normalizedVerb]
        : isHomeTopic && homeComplements[normalizedVerb]
          ? homeComplements[normalizedVerb]
        : isTransportTopic && transportComplements[normalizedVerb]
          ? transportComplements[normalizedVerb]
        : isHealthTopic && healthComplements[normalizedVerb]
          ? healthComplements[normalizedVerb]
        : isBreakfastTopic && breakfastComplements[normalizedVerb]
          ? breakfastComplements[normalizedVerb]
        : isDinnerTopic && dinnerComplements[normalizedVerb]
          ? dinnerComplements[normalizedVerb]
        : topicComplements?.[normalizedVerb]
          ? topicComplements[normalizedVerb]
        : defaultComplements[normalizedVerb];
  if (!forms || !complements) return null;
  return { first: forms.first, other: forms.third, complements };
}

function getA1StartNorwegianVerbPattern(
  selectedVerb: string,
  tense: string,
  topic: string
): A1StartVerbPattern | null {
  const normalizedVerb = selectedVerb.toLocaleLowerCase();
  const verbKey = normalizedVerb === "spille" ? "spiller" : normalizedVerb;
  const normalizedTense = tense === "past" || tense === "future" ? tense : "present";
  const cleanedTopic = cleanA1StartLine(topic).toLocaleLowerCase();
  const isFamilyTopic = cleanedTopic === "familie";
  const isSchoolTopic = cleanedTopic === "skole";
  const isBreakfastTopic = cleanedTopic === "frokost";
  const isDinnerTopic = cleanedTopic === "middag" || cleanedTopic === "mat";
  const isFriendsTopic = cleanedTopic === "venner";
  const isHomeTopic = cleanedTopic === "hjem";
  const isTransportTopic = cleanedTopic === "transport";
  const isHealthTopic = cleanedTopic === "helse";

  const verbForms: Record<string, Record<string, string>> = {
    er: { present: "er", past: "var", future: "skal være" },
    har: { present: "har", past: "hadde", future: "skal ha" },
    ser: { present: "ser", past: "så", future: "skal se" },
    liker: { present: "liker", past: "likte", future: "skal like" },
    spiser: { present: "spiser", past: "spiste", future: "skal spise" },
    drikker: { present: "drikker", past: "drakk", future: "skal drikke" },
    går: { present: "går", past: "gikk", future: "skal gå" },
    kommer: { present: "kommer", past: "kom", future: "skal komme" },
    lager: { present: "lager", past: "lagde", future: "skal lage" },
    leser: { present: "leser", past: "leste", future: "skal lese" },
    skriver: { present: "skriver", past: "skrev", future: "skal skrive" },
    spiller: { present: "spiller", past: "spilte", future: "skal spille" },
  };

  const defaultComplements: Record<string, string[]> = {
    er: ["glad", "snill", "rolig", "klar", "sterk", "her", "trøtt", "våken"],
    har: ["en bok", "en sekk", "en ball", "en jakke", "en blyant", "en kopp", "et bilde", "et eple"],
    ser: ["en bil", "en buss", "et tog", "en katt", "en hund", "en skole", "en bok", "et hus"],
    liker: ["bøker", "musikk", "epler", "brød", "juice", "skolen", "parken", "venner"],
    spiser: ["brød", "epler", "suppe", "ris", "fisk", "grøt", "mat", "frukt"],
    drikker: ["vann", "juice", "melk", "te", "kakao", "saft", "vann til maten", "melk til brød"],
    går: ["til skolen", "til parken", "til butikken", "hjem", "til bussen", "til døra", "ut", "inn"],
    kommer: ["til skolen", "til parken", "til butikken", "hjem", "til bussen", "til døra", "inn", "ut"],
    lager: ["mat", "suppe", "et bilde", "en liste", "en kake", "et kort", "en tegning", "en plan"],
    leser: ["en bok", "en tekst", "et ord", "en setning", "et brev", "en lapp", "en side", "en liste"],
    skriver: ["et ord", "en setning", "et navn", "et brev", "en lapp", "en liste", "en tekst", "et kort"],
    spiller: ["fotball", "håndball", "kort", "et spill", "piano", "gitar", "musikk", "teater"],
  };

  const familyComplements: Partial<Record<string, string[]>> = {
    er: ["glad", "snill", "hjemme", "sammen med familien", "rolig", "klar", "trøtt", "våken"],
    har: ["en mamma", "en pappa", "en søster", "en bror", "en bestemor", "en bestefar", "en familie", "et hjem"],
    ser: ["mamma", "pappa", "søster", "bror", "bestemor", "bestefar", "familien", "et bilde"],
    liker: ["mamma", "pappa", "søster", "bror", "bestemor", "bestefar", "familien", "hjemmet"],
    spiser: ["brød med mamma", "suppe med pappa", "mat med søster", "ris med bror", "kake med bestemor", "fisk med bestefar", "middag med familien", "frukt hjemme"],
    drikker: ["vann med mamma", "juice med pappa", "melk med søster", "te med bror", "kakao med bestemor", "saft med bestefar", "vann hjemme", "melk til maten"],
    går: ["til mamma", "til pappa", "til søster", "til bror", "til bestemor", "til bestefar", "hjem", "til familien"],
    kommer: ["til mamma", "til pappa", "til søster", "til bror", "til bestemor", "til bestefar", "hjem", "til familien"],
    lager: ["mat til mamma", "suppe til pappa", "et kort til søster", "en tegning til bror", "kake til bestemor", "kaffe til bestefar", "middag til familien", "en liste hjemme"],
    leser: ["en bok med mamma", "en tekst med pappa", "et brev fra søster", "en lapp fra bror", "en bok for bestemor", "et kort fra bestefar", "en setning hjemme", "en historie med familien"],
    skriver: ["et kort til mamma", "et brev til pappa", "en lapp til søster", "et navn til bror", "en hilsen til bestemor", "et kort til bestefar", "en liste hjemme", "en setning om familien"],
    spiller: ["kort med mamma", "fotball med pappa", "spill med søster", "musikk med bror", "piano for bestemor", "gitar for bestefar", "et spill med familien", "teater hjemme"],
  };

  const schoolComplements: Partial<Record<string, string[]>> = {
    er: ["på skolen", "klar", "rolig", "glad", "snill", "i klassen", "ved pulten", "i timen"],
    har: ["en bok", "en blyant", "en sekk", "et ark", "en pult", "en lærer", "en time", "en lekse"],
    ser: ["en bok", "en blyant", "en sekk", "et ark", "en pult", "en lærer", "en tavle", "en skole"],
    liker: ["skolen", "boka", "blyanten", "klassen", "læreren", "friminuttet", "timen", "lekser"],
    spiser: ["matpakke", "brød", "frukt", "eple", "banan", "suppe", "lunsj", "grøt"],
    drikker: ["vann", "melk", "juice", "vann på skolen", "melk til lunsj", "saft i friminuttet", "vann i timen", "kakao"],
    går: ["til skolen", "til klassen", "til pulten", "til tavla", "til biblioteket", "til friminuttet", "til døra", "hjem fra skolen"],
    kommer: ["til skolen", "til klassen", "til pulten", "til tavla", "til biblioteket", "til friminuttet", "til døra", "hjem fra skolen"],
    lager: ["en tegning", "en liste", "en oppgave", "et kort", "et bilde", "en plan", "matpakke", "en bokstav"],
    leser: ["en bok", "en tekst", "et ord", "en setning", "en side", "en lapp", "en lekse", "en liste"],
    skriver: ["et ord", "en setning", "et navn", "en lekse", "en lapp", "en liste", "en tekst", "en bokstav"],
    spiller: ["fotball", "håndball", "et spill", "kort", "musikk", "teater", "piano", "gitar"],
  };

  const mealComplements: Partial<Record<string, string[]>> = {
    er: ["sulten", "mett", "glad", "klar", "ved bordet", "på kjøkkenet", "rolig", "hjemme"],
    har: ["brød", "ost", "frukt", "suppe", "ris", "fisk", "melk", "vann"],
    ser: ["brød", "ost", "frukt", "suppe", "ris", "fisk", "melk", "vann"],
    liker: ["brød", "ost", "frukt", "suppe", "ris", "fisk", "melk", "vann"],
    spiser: ["brød", "ost", "frukt", "suppe", "ris", "fisk", "grøt", "middag"],
    drikker: ["vann", "melk", "juice", "te", "kakao", "saft", "vann til maten", "melk til brød"],
    går: ["til bordet", "til kjøkkenet", "for å spise", "for å drikke", "til maten", "til stolen", "hjem til middag", "inn på kjøkkenet"],
    kommer: ["til bordet", "til kjøkkenet", "for å spise", "for å drikke", "til maten", "til stolen", "hjem til middag", "inn på kjøkkenet"],
    lager: ["brød", "suppe", "ris", "fisk", "grøt", "kakao", "mat", "middag"],
    leser: ["en oppskrift", "en liste", "et ord", "en setning", "en lapp", "en tekst", "et navn", "en side"],
    skriver: ["en oppskrift", "en liste", "et ord", "en setning", "en lapp", "en tekst", "et navn", "en side"],
    spiller: ["kort etter maten", "et spill etter maten", "musikk på kjøkkenet", "piano før maten", "gitar etter middag", "teater hjemme", "fotball etter frokost", "håndball etter middag"],
  };

  const topicComplements =
    isFamilyTopic ? familyComplements
    : isSchoolTopic ? schoolComplements
    : isBreakfastTopic || isDinnerTopic ? mealComplements
    : isFriendsTopic ? {
      er: ["med en venn", "snill", "glad", "rolig", "klar", "ute", "inne", "sammen"],
      har: ["en venn", "en ball", "et spill", "en bok", "en sekk", "en sykkel", "et kort", "en plan"],
      ser: ["en venn", "en ball", "et spill", "en bok", "en sykkel", "et bilde", "parken", "skolen"],
      liker: ["venner", "spill", "parken", "musikk", "bøker", "fotball", "tegning", "frukt"],
      spiser: ["brød med en venn", "frukt med en venn", "suppe med Sara", "ris med Ali", "mat i parken", "kake med venner", "eple med Nora", "middag med Omar"],
      drikker: ["vann med en venn", "juice med Sara", "melk med Ali", "te med Nora", "saft med venner", "kakao med Omar", "vann i parken", "juice hjemme"],
      går: ["til en venn", "til parken", "til skolen", "til Sara", "til Ali", "ut med venner", "hjem med Nora", "til spillet"],
      kommer: ["til en venn", "til parken", "til skolen", "til Sara", "til Ali", "inn med venner", "hjem med Nora", "til spillet"],
      lager: ["et kort til en venn", "en tegning til Sara", "mat med Ali", "en liste med Nora", "et spill med venner", "en plan med Omar", "en kake med Sara", "et bilde til Ali"],
      leser: ["en bok med en venn", "en tekst med Sara", "et kort fra Ali", "en lapp fra Nora", "en liste med venner", "en setning med Omar", "en side med Sara", "et ord med Ali"],
      skriver: ["et kort til en venn", "en lapp til Sara", "et navn til Ali", "en setning til Nora", "en liste med venner", "en tekst om Omar", "et ord til Sara", "en hilsen til Ali"],
      spiller: ["fotball med en venn", "kort med Sara", "et spill med Ali", "musikk med Nora", "piano for venner", "gitar med Omar", "teater med Sara", "håndball med Ali"],
    }
    : isHomeTopic ? {
      er: ["hjemme", "på rommet", "på kjøkkenet", "rolig", "glad", "klar", "i stua", "ved døra"],
      har: ["en seng", "en stol", "et bord", "en kopp", "en bok", "en jakke", "en dør", "et rom"],
      ser: ["en seng", "en stol", "et bord", "en kopp", "en bok", "en jakke", "en dør", "et rom"],
      liker: ["hjemmet", "rommet", "stua", "kjøkkenet", "senga", "stolen", "boka", "bordet"],
      spiser: ["brød hjemme", "suppe hjemme", "frukt på kjøkkenet", "mat ved bordet", "grøt i stua", "eple på rommet", "middag hjemme", "ris ved bordet"],
      drikker: ["vann hjemme", "melk hjemme", "juice på kjøkkenet", "te ved bordet", "kakao i stua", "saft på rommet", "vann ved døra", "melk til maten"],
      går: ["hjem", "til rommet", "til kjøkkenet", "til stua", "til døra", "til bordet", "ut", "inn"],
      kommer: ["hjem", "til rommet", "til kjøkkenet", "til stua", "til døra", "til bordet", "ut", "inn"],
      lager: ["mat hjemme", "suppe på kjøkkenet", "en tegning på rommet", "en liste i stua", "en kake hjemme", "et kort ved bordet", "en plan hjemme", "en kopp kakao"],
      leser: ["en bok hjemme", "en tekst på rommet", "en lapp på kjøkkenet", "en liste i stua", "et ord ved bordet", "en setning hjemme", "et brev på rommet", "en side i boka"],
      skriver: ["et ord hjemme", "en setning på rommet", "en lapp på kjøkkenet", "en liste i stua", "et navn ved bordet", "en tekst hjemme", "et kort på rommet", "en side i boka"],
      spiller: ["kort hjemme", "et spill på rommet", "piano i stua", "gitar hjemme", "musikk på rommet", "teater hjemme", "fotball ute", "håndball ute"],
    }
    : isTransportTopic ? {
      er: ["på bussen", "på toget", "i bilen", "ved veien", "klar", "rolig", "ute", "framme"],
      har: ["en buss", "et tog", "en bil", "en sykkel", "en billett", "en sekk", "et kart", "en hjelm"],
      ser: ["en buss", "et tog", "en bil", "en sykkel", "en billett", "en vei", "et kart", "en stasjon"],
      liker: ["bussen", "toget", "bilen", "sykkelen", "veien", "turen", "kartet", "stasjonen"],
      spiser: ["frukt på bussen", "brød på toget", "mat i bilen", "eple på tur", "banan ved stasjonen", "suppe hjemme", "lunsj på reisen", "grøt før turen"],
      drikker: ["vann på bussen", "juice på toget", "melk i bilen", "vann på tur", "saft ved stasjonen", "te hjemme", "kakao før turen", "vann ved veien"],
      går: ["til bussen", "til toget", "til bilen", "til sykkelen", "til stasjonen", "til veien", "hjem", "ut"],
      kommer: ["til bussen", "til toget", "til bilen", "til sykkelen", "til stasjonen", "til veien", "hjem", "inn"],
      lager: ["en billett", "et kart", "en plan", "en liste", "en tegning av bussen", "en tegning av toget", "mat til turen", "en rute"],
      leser: ["en billett", "et kart", "et skilt", "en liste", "en lapp", "et ord", "en setning", "en tekst"],
      skriver: ["en billett", "et navn", "en liste", "en rute", "en lapp", "et ord", "en setning", "en tekst"],
      spiller: ["et spill på bussen", "kort på toget", "musikk i bilen", "et spill på tur", "gitar hjemme", "piano hjemme", "fotball etter turen", "håndball etter turen"],
    }
    : isHealthTopic ? {
      er: ["frisk", "rolig", "sterk", "glad", "trøtt", "våken", "hos legen", "hjemme"],
      har: ["vann", "frukt", "søvn", "energi", "en time", "en lege", "en pause", "en jakke"],
      ser: ["en lege", "vann", "frukt", "en seng", "en stol", "en jakke", "en kopp", "et eple"],
      liker: ["vann", "frukt", "søvn", "pauser", "turer", "suppe", "ro", "lek"],
      spiser: ["frukt", "suppe", "brød", "ris", "fisk", "eple", "banan", "mat"],
      drikker: ["vann", "melk", "juice", "te", "vann etter tur", "melk til maten", "saft", "kakao"],
      går: ["til legen", "til skolen", "hjem", "ut på tur", "til senga", "til stolen", "til kjøkkenet", "til døra"],
      kommer: ["til legen", "til skolen", "hjem", "inn fra tur", "til senga", "til stolen", "til kjøkkenet", "til døra"],
      lager: ["suppe", "mat", "en pause", "en liste", "en plan", "te", "en matpakke", "en tegning"],
      leser: ["en lapp", "en liste", "en tekst", "et ord", "en setning", "en bok", "et skilt", "en side"],
      skriver: ["en lapp", "en liste", "en tekst", "et ord", "en setning", "et navn", "en beskjed", "en side"],
      spiller: ["fotball", "håndball", "et rolig spill", "kort", "musikk", "piano", "gitar", "teater"],
    }
    : null;

  const form = verbForms[verbKey]?.[normalizedTense];
  const complements = topicComplements?.[verbKey] || defaultComplements[verbKey];
  if (!form || !complements) return null;
  return { first: form, other: form, complements };
}

function getA1StartExpectedVerbForms(
  languageName: string,
  selectedVerb: string,
  tense: string
): string[] {
  if (languageName === "Norwegian") {
    const pattern = getA1StartNorwegianVerbPattern(selectedVerb, tense, "");
    if (pattern) return Array.from(new Set([pattern.first, pattern.other]));
  }
  if (languageName === "Brazilian Portuguese") {
    const pattern = getA1StartBrazilianPortugueseVerbPattern(selectedVerb, tense, "");
    if (pattern) return Array.from(new Set([pattern.first, pattern.other]));
  }
  return [selectedVerb];
}

function lineContainsA1StartVerb(line: string, verbForms: string[]): boolean {
  const paddedLine = ` ${line.toLocaleLowerCase()} `;
  return verbForms.some((form) => paddedLine.includes(` ${form.toLocaleLowerCase()} `));
}

function isA1StartLineCompatibleWithVerb(
  line: string,
  selectedVerb: string,
  languageName: string
): boolean {
  if (languageName !== "Brazilian Portuguese") return true;
  if (selectedVerb.toLocaleLowerCase() !== "ser") return true;

  const lower = ` ${line.toLocaleLowerCase()} `;
  return ![
    " fui ao ",
    " fui à ",
    " fui aos ",
    " fui às ",
    " fui para ",
    " fui de ",
    " foi ao ",
    " foi à ",
    " foi aos ",
    " foi às ",
    " foi para ",
    " foi de ",
  ].some((pattern) => lower.includes(pattern));
}

function getA1StartFallbackGroups(
  languageName: string,
  selectedVerb: string,
  firstPersonSubject: string,
  topic: string,
  tense = "present"
): string[][] {
  const normalizedVerb = selectedVerb.toLocaleLowerCase();
  const cleanedTopic = cleanA1StartLine(topic);

  if (languageName === "Norwegian") {
    const pattern = getA1StartNorwegianVerbPattern(selectedVerb, tense, topic);
    if (pattern) {
      const subjects = [firstPersonSubject, "Hun", "Han", "Sara", "Ali", "Barnet", "Læreren"];
      return buildFallbackGroupsFromPattern(
        subjects,
        [pattern.first, ...subjects.slice(1).map(() => pattern.other)],
        pattern.complements
      );
    }
  }

  if (languageName === "Norwegian" && normalizedVerb === "ser") {
    return [
      [
        `${firstPersonSubject} ${selectedVerb} en bil`,
        `${firstPersonSubject} ${selectedVerb} en buss`,
        `${firstPersonSubject} ${selectedVerb} et tog`,
      ],
      [`Katten ${selectedVerb} en mus`, `Katten ${selectedVerb} en hund`, `Katten ${selectedVerb} en undulat`],
      [`Sara ${selectedVerb} en katt`, `Sara ${selectedVerb} en fugl`, `Sara ${selectedVerb} en hest`],
      [`Han ${selectedVerb} et hus`, `Han ${selectedVerb} en skole`, `Han ${selectedVerb} en butikk`],
      [`Barnet ${selectedVerb} en bok`, `Barnet ${selectedVerb} et bilde`, `Barnet ${selectedVerb} en ball`],
      [`Læreren ${selectedVerb} en elev`, `Læreren ${selectedVerb} en stol`, `Læreren ${selectedVerb} en tavle`],
    ];
  }

  if (languageName === "Norwegian" && normalizedVerb === "liker") {
    return [
      [
        `${firstPersonSubject} ${selectedVerb} bøker`,
        `${firstPersonSubject} ${selectedVerb} filmer`,
        `${firstPersonSubject} ${selectedVerb} musikk`,
      ],
      [`Han ${selectedVerb} hunder`, `Han ${selectedVerb} biler`, `Han ${selectedVerb} blomster`],
      [`Hun ${selectedVerb} klær`, `Hun ${selectedVerb} frukt`, `Hun ${selectedVerb} mat`],
      [`Sara ${selectedVerb} kaffe`, `Sara ${selectedVerb} te`, `Sara ${selectedVerb} juice`],
      [`Barnet ${selectedVerb} epler`, `Barnet ${selectedVerb} melk`, `Barnet ${selectedVerb} brød`],
      [`Læreren ${selectedVerb} bøker`, `Læreren ${selectedVerb} kunst`, `Læreren ${selectedVerb} musikk`],
    ];
  }

  if (languageName === "English" && normalizedVerb === "like") {
    return [
      ["I like books", "I like films", "I like music"],
      ["They like dogs", "They like cars", "They like flowers"],
      ["Cats like milk", "Cats like fish", "Cats like toys"],
      ["Children like apples", "Children like games", "Children like stories"],
      ["Teachers like books", "Teachers like art", "Teachers like music"],
      ["Friends like coffee", "Friends like tea", "Friends like juice"],
    ];
  }

  if (languageName === "English" && normalizedVerb === "see") {
    return [
      ["I see a car", "I see a bus", "I see a train"],
      ["They see a dog", "They see a cat", "They see a bird"],
      ["Cats see a mouse", "Cats see a ball", "Cats see a window"],
      ["Children see a school", "Children see a park", "Children see a shop"],
      ["Teachers see a book", "Teachers see a chair", "Teachers see a board"],
      ["Friends see a house", "Friends see a road", "Friends see a tree"],
    ];
  }

  if (languageName === "English") {
    const englishPatterns: Record<string, { first: string; plural: string; complements: string[] }> = {
      be: { first: "am", plural: "are", complements: ["happy", "ready", "kind", "calm", "strong", "here"] },
      have: { first: "have", plural: "have", complements: ["a book", "a bag", "a ball", "a bike", "a dog", "a cat"] },
      eat: { first: "eat", plural: "eat", complements: ["an apple", "bread", "rice", "fish", "soup", "fruit"] },
      drink: { first: "drink", plural: "drink", complements: ["water", "milk", "juice", "tea", "coffee", "cocoa"] },
      go: { first: "go", plural: "go", complements: ["home", "to school", "to the park", "to the shop", "to work", "outside"] },
      come: { first: "come", plural: "come", complements: ["home", "to school", "to the park", "to the shop", "inside", "outside"] },
      make: { first: "make", plural: "make", complements: ["food", "a cake", "a drawing", "a chair", "a boat", "a card"] },
      read: { first: "read", plural: "read", complements: ["a book", "a story", "a letter", "a comic", "a sign", "a poem"] },
      write: { first: "write", plural: "write", complements: ["a word", "a sentence", "a letter", "a name", "a story", "a list"] },
    };
    const pattern = englishPatterns[normalizedVerb];
    if (pattern) {
      const subjects = [firstPersonSubject, "They", "Children", "Teachers", "Friends", "Students"];
      return buildFallbackGroupsFromPattern(
        subjects,
        [pattern.first, ...subjects.slice(1).map(() => pattern.plural)],
        pattern.complements
      );
    }
  }

  if (languageName === "Brazilian Portuguese" && tense === "present" && normalizedVerb === "gostar") {
    return [
      ["Eu gosto de livros", "Eu gosto de filmes", "Eu gosto de música"],
      ["Ele gosta de cães", "Ele gosta de carros", "Ele gosta de flores"],
      ["Ela gosta de roupas", "Ela gosta de frutas", "Ela gosta de comida"],
      ["Sara gosta de café", "Sara gosta de chá", "Sara gosta de suco"],
      ["Ana gosta de maçãs", "Ana gosta de leite", "Ana gosta de pão"],
      ["Paulo gosta de livros", "Paulo gosta de arte", "Paulo gosta de música"],
    ];
  }

  if (languageName === "Brazilian Portuguese" && tense === "present" && normalizedVerb === "ver") {
    return [
      ["Eu vejo um carro", "Eu vejo um ônibus", "Eu vejo um trem"],
      ["Ele vê um cão", "Ele vê um gato", "Ele vê um pássaro"],
      ["Ela vê uma casa", "Ela vê uma escola", "Ela vê uma loja"],
      ["Sara vê um livro", "Sara vê uma cadeira", "Sara vê um quadro"],
      ["Ana vê uma rua", "Ana vê uma árvore", "Ana vê um parque"],
      ["Paulo vê uma bola", "Paulo vê uma bicicleta", "Paulo vê um barco"],
    ];
  }

  if (languageName === "Brazilian Portuguese") {
    const pattern = getA1StartBrazilianPortugueseVerbPattern(selectedVerb, tense, topic);
    if (pattern) {
      const subjects = [firstPersonSubject, "Ela", "Sara", "Ana", "Paulo", "Bia"];
      return buildFallbackGroupsFromPattern(
        subjects,
        [pattern.first, ...subjects.slice(1).map(() => pattern.other)],
        pattern.complements
      );
    }
  }

  const complement =
    cleanedTopic ||
    (languageName === "Norwegian"
      ? "noe"
      : languageName === "Portuguese" || languageName === "Brazilian Portuguese"
        ? "algo"
        : "something");
  const subjects =
    languageName === "Norwegian"
      ? [firstPersonSubject, "Sara", "Ali", "Barnet", "Læreren", "Katten"]
      : languageName === "Portuguese" || languageName === "Brazilian Portuguese"
        ? [firstPersonSubject, "Sara", "Ali", "Ana", "Paulo", "Bia"]
        : [firstPersonSubject, "Sara", "Ali", "The child", "The teacher", "The cat"];

  return subjects.map((subject) => [
    `${subject} ${selectedVerb} ${complement}`,
    `${subject} ${selectedVerb} ${complement}`,
    `${subject} ${selectedVerb} ${complement}`,
  ]);
}

function isA1StartSubjectAllowed(
  languageName: string,
  selectedVerb: string,
  subject: string
): boolean {
  const normalizedSubject = subject.toLocaleLowerCase();
  const verbsRequiringAnimateSubject = new Set([
    "liker",
    "ser",
    "kommer",
    "spiser",
    "drikker",
    "leser",
    "skriver",
  ]);

  if (languageName === "Norwegian") {
    if (!verbsRequiringAnimateSubject.has(selectedVerb.toLocaleLowerCase())) return true;
    return normalizedSubject !== "det" && normalizedSubject !== "den";
  }

  if (languageName === "English") return normalizedSubject !== "it";
  if (languageName === "Brazilian Portuguese") {
    return normalizedSubject !== "isso" && normalizedSubject !== "isto";
  }
  return true;
}

function isNewA1StartPatternSentenceCount(count: number): boolean {
  return [8, 11, 14, 17, 20].includes(count);
}

function punctuateA1StartSentence(line: string): string {
  const cleaned = cleanA1StartLine(line);
  return cleaned ? `${cleaned}.` : "";
}

function formatA1StartPatternText(lines: string[], expectedSentenceCount: number): string {
  const punctuatedLines = lines.map(punctuateA1StartSentence).filter(Boolean);
  if (!isNewA1StartPatternSentenceCount(expectedSentenceCount)) return punctuatedLines.join("\n");

  const groups: string[] = [];
  groups.push(punctuatedLines[0]);
  groups.push("");
  groups.push(punctuatedLines.slice(1, 4).join("\n"));

  for (let index = 4; index < punctuatedLines.length - 1; index += 3) {
    groups.push("");
    groups.push(punctuatedLines.slice(index, index + 3).join("\n"));
  }

  groups.push("");
  groups.push(punctuatedLines[punctuatedLines.length - 1]);
  return groups.join("\n");
}

function normalizeA1StartResult(
  result: GenerateTextResult,
  expectedSentenceCount: number,
  config: A1StartConfig,
  languageName: string
): GenerateTextResult {
  const selectedVerb = cleanA1StartLine(String(config.verb || ""));
  if (!selectedVerb) throw new Error("Verb is required for A1 Start.");

  const rawLines = String(result.text || "")
    .split(/\r?\n/)
    .map(cleanA1StartLine)
    .filter(Boolean);
  const titleLine = cleanA1StartLine(String(result.title || ""));
  const firstPersonSubject =
    languageName === "Norwegian"
      ? "Jeg"
      : languageName === "Portuguese" || languageName === "Brazilian Portuguese"
        ? "Eu"
        : languageName === "English"
          ? "I"
          : rawLines.map((line) => line.split(" ")[0]).find(Boolean) || titleLine.split(" ")[0];
  const usesNewPattern = isNewA1StartPatternSentenceCount(expectedSentenceCount);

  if (usesNewPattern) {
    if (rawLines.length < expectedSentenceCount) {
      throw new Error(
        `A1 Start response had ${rawLines.length} sentences, expected ${expectedSentenceCount}.`
      );
    }

    const normalizedLines = rawLines.slice(0, expectedSentenceCount);
    normalizedLines[expectedSentenceCount - 1] = normalizedLines[0];
    return {
      title: normalizedLines[0],
      text: formatA1StartPatternText(normalizedLines, expectedSentenceCount),
    };
  }

  const expectedVerbForms = getA1StartExpectedVerbForms(
    languageName,
    selectedVerb,
    String(config.tense || "present")
  );
  const completeLines = rawLines
    .map(cleanA1StartLine)
    .filter(
      (line) =>
        line.split(" ").length >= 3 &&
        lineContainsA1StartVerb(line, expectedVerbForms) &&
        isA1StartLineCompatibleWithVerb(line, selectedVerb, languageName)
    );
  const groupCount = (expectedSentenceCount - 4) / 3;
  const fallbackGroups = getA1StartFallbackGroups(
    languageName,
    selectedVerb,
    firstPersonSubject,
    String(config.topic || ""),
    String(config.tense || "present")
  );
  const groupsBySubject = new Map<string, string[]>();
  for (const line of completeLines) {
    const subject = line.split(" ")[0].toLocaleLowerCase();
    const group = groupsBySubject.get(subject) || [];
    if (!group.includes(line)) group.push(line);
    groupsBySubject.set(subject, group);
  }

  const firstSubjectKey = firstPersonSubject.toLocaleLowerCase();
  const generatedFirstGroup = groupsBySubject.get(firstSubjectKey) || [];
  const firstGroupNeedsFallback = generatedFirstGroup.length < 3;
  const firstGroup = firstGroupNeedsFallback
    ? fallbackGroups[0]
    : generatedFirstGroup.slice(0, 3);

  const otherGroups = Array.from(groupsBySubject.entries())
    .filter(
      ([subject]) =>
        subject !== firstSubjectKey &&
        isA1StartSubjectAllowed(languageName, selectedVerb, subject)
    )
    .map(([, lines]) => lines.slice(0, 3))
    .filter((lines) => lines.length === 3);
  while (otherGroups.length < groupCount) {
    otherGroups.push(fallbackGroups[otherGroups.length + 1]);
  }

  const firstSentence = firstGroup[0];
  const normalizedLines = [
    ...firstGroup.slice(0, 3),
    ...otherGroups.slice(0, groupCount).flat(),
    firstSentence,
  ];

  return {
    title: firstSentence,
    text: formatA1StartPatternText(normalizedLines, expectedSentenceCount),
  };
}

export async function POST(req: Request) {
  try {
    const user = await getRequestUserContext(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      studentAccessMode: user.studentAccessMode,
      feature: "producer_create_lesson",
    });

    if (!status.allowed) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const body = (await req.json()) as GenerateTextBody;

    const level = body.level || "A2";
    const languageName = resolveLanguageName(body.language || "en");
    const reportLanguageName = resolveLanguageName(body.reportLanguage || "nb");
    const topic = body.topic || "Untitled";
    const textType = body.textType || "Story";
    const textLength = body.textLength || 200;
    const isA1Start = level === "A1_START";
    const sourceText = String(body.sourceText || "").trim();
    const extraFactCheck =
      !isA1Start && body.extraFactCheck === true && shouldRunExtraFactCheck(textType, topic);
    const isA1StartHighFrequency = isA1Start && body.a1Start?.type === "high_frequency_words";
    const isA1StartSoundLadder = isA1Start && body.a1Start?.type === "sound_reading_ladder";
    const highFrequencyLanguageAllowed =
      languageName === "Norwegian" ||
      languageName === "English" ||
      languageName === "Brazilian Portuguese";
    const highFrequencyClassAllowed =
      body.a1Start?.wordClass === "conjunction" ||
      body.a1Start?.wordClass === "adverb" ||
      body.a1Start?.wordClass === "determiner" ||
      body.a1Start?.wordClass === "preposition";
    if (isA1StartHighFrequency && (!highFrequencyLanguageAllowed || !highFrequencyClassAllowed)) {
      return NextResponse.json(
        { error: "High-frequency words currently support Norwegian, English and Brazilian Portuguese." },
        { status: 400 }
      );
    }
    if (isA1StartSoundLadder && !highFrequencyLanguageAllowed) {
      return NextResponse.json(
        { error: "Sound training currently supports Norwegian, English and Brazilian Portuguese." },
        { status: 400 }
      );
    }
    const userPrompt = isA1Start
      ? isA1StartSoundLadder
        ? buildA1StartSoundLadderPrompt(languageName, body.a1Start || {})
        : isA1StartHighFrequency
          ? buildA1StartHighFrequencyPrompt(languageName, body.a1Start || {})
          : buildA1StartPatternPrompt(languageName, body.a1Start || {})
      : buildCefrTextPrompt({
          languageName,
          level,
          topic,
          textType,
          textLength,
          extraFactCheck,
        });

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const createResponse = async (prompt: string, temperature: number) => {
      const resp = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        text: { format: { type: "json_object" } },
        temperature,
        input: [
          {
            role: "system",
            content: isA1Start
              ? `You create highly controlled beginning-reading practice. Return JSON only. Output must be in ${languageName}.`
              : `You create accurate, natural CEFR reading texts for language learners. Level match and factual caution are more important than sounding impressive. Return JSON only. Output must be in ${languageName}.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const out = resp.output_text?.trim() || "";
      try {
        return JSON.parse(out) as GenerateTextResult;
      } catch (error) {
        const repairResp = await client.responses.create({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          text: { format: { type: "json_object" } },
          temperature: 0,
          input: [
            {
              role: "system",
              content: "Repair invalid JSON. Return valid JSON only. Do not add, translate, or rewrite content unless required to make the JSON parse.",
            },
            {
              role: "user",
              content: [
                "The previous response was intended to be a JSON object, but JSON.parse failed.",
                `Parse error: ${error instanceof Error ? error.message : "Unknown parse error"}`,
                "Return the same data as a valid JSON object with these fields when present: title, text, highFrequencyReadingSentences, highFrequencyExplanation, factCheckReport.",
                "Invalid JSON:",
                out,
              ].join("\n\n"),
            },
          ],
        });
        const repaired = repairResp.output_text?.trim() || "";
        return JSON.parse(repaired) as GenerateTextResult;
      }
    };
    if (extraFactCheck) {
      if (!sourceText) {
        return NextResponse.json({ error: "Source text is empty." }, { status: 400 });
      }

      const parsed = await createResponse(
        buildFactCheckReviewPrompt({
          languageName,
          reportLanguageName,
          level,
          topic,
          textType,
          sourceText,
        }),
        0.1
      );

      return NextResponse.json(parsed);
    }

    let parsed = await createResponse(userPrompt, isA1Start ? 0.15 : 0.45);

    if (isA1Start) {
      if (isA1StartSoundLadder) {
        return NextResponse.json(
          normalizeA1StartSoundLadderResult(parsed, body.a1Start || {}, languageName)
        );
      }
      if (isA1StartHighFrequency) {
        return NextResponse.json(
          normalizeA1StartHighFrequencyResult(parsed, body.a1Start || {}, languageName)
        );
      }
      const expectedSentenceCount = getA1StartPatternSentenceCount(body.a1Start || {});
      const patternProblems = findA1StartPatternProblems(
        parsed,
        expectedSentenceCount,
        body.a1Start || {},
        languageName
      );
      if (patternProblems.length) {
        parsed = await createResponse(
          buildA1StartPatternRepairPrompt({
            languageName,
            config: body.a1Start || {},
            previous: parsed,
            problems: patternProblems,
          }),
          0.05
        );
        const remainingProblems = findA1StartPatternProblems(
          parsed,
          expectedSentenceCount,
          body.a1Start || {},
          languageName
        );
        if (remainingProblems.length) {
          return NextResponse.json(
            {
              error:
                "A1 Start-teksten ble ikke god nok etter kontroll. Prøv et annet verb, fjern temaet, eller generer på nytt.",
              details: remainingProblems,
            },
            { status: 422 }
          );
        }
      }
      return NextResponse.json(
        normalizeA1StartResult(parsed, expectedSentenceCount, body.a1Start || {}, languageName)
      );
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
  if (err instanceof Error && err.message === "EMAIL_VERIFICATION_REQUIRED") {
    return emailVerificationRequiredResponse();
  }
  const message =
    err instanceof Error ? err.message : "Unknown error";

  return NextResponse.json({ error: message }, { status: 500 });
}
}
