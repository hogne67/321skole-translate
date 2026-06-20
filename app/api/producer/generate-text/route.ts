// app/api/producer/generate-text/route.ts
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getFeatureStatusAdmin,
} from "@/lib/featureGuardAdmin";
import { getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";

export const runtime = "nodejs";

type GenerateTextBody = {
  level?: string;
  language?: string;
  topic?: string;
  textType?: string;
  textLength?: number;
  extraFactCheck?: boolean;
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
};

type SourceGroundingResult = {
  facts?: unknown;
  cautions?: unknown;
};

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
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

function isCefrAtLeastB1(level: string): boolean {
  const normalized = level.trim().toUpperCase();
  return normalized === "B1" || normalized === "B2" || normalized === "C1" || normalized === "C2";
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

function stringifySourceGrounding(value: SourceGroundingResult | null): string {
  if (!value) return "";
  const facts = normalizeStringList(value.facts);
  const cautions = normalizeStringList(value.cautions);
  const lines: string[] = [];

  if (facts.length) {
    lines.push("Source-grounded facts:");
    facts.forEach((fact) => lines.push(`- ${fact}`));
  }

  if (cautions.length) {
    if (lines.length) lines.push("");
    lines.push("Source cautions:");
    cautions.forEach((caution) => lines.push(`- ${caution}`));
  }

  return lines.join("\n");
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

function buildCefrSelectionPrompt(args: {
  languageName: string;
  level: string;
  topic: string;
  textType: string;
  textLength: number;
  draftA: GenerateTextResult;
  draftB: GenerateTextResult;
  sourceGrounding?: string;
}): string {
  const { languageName, level, topic, textType, textLength, draftA, draftB, sourceGrounding } = args;
  const minWords = Math.max(1, Math.round(textLength * 0.9));
  const maxWords = Math.max(minWords, Math.round(textLength * 1.1));

  return `
Create the final learner text from two drafts.

Language: ${languageName}
Level: ${level}
Topic: ${topic}
Text type: ${textType}
Target length: ${textLength} words
Allowed length: ${minWords}-${maxWords} words

Draft A:
Title: ${String(draftA.title || "").trim()}
Text:
${stringifyGeneratedText(draftA.text)}

Draft B:
Title: ${String(draftB.title || "").trim()}
Text:
${stringifyGeneratedText(draftB.text)}

${sourceGrounding ? `Verified source notes:
${sourceGrounding}
` : ""}

Selection and fact-check rules:
- Return one final text, not comments.
- Keep the best language, structure and level match from the drafts.
- If verified source notes are provided, use them as the highest-priority fact basis.
- Also perform a language quality check: correct grammar, word order, pronoun reference, singular/plural consistency and unnatural collocations.
- Keep grammar corrections simple and natural. Do not make the text more advanced when improving the language.
- After fact-checking, perform a final CEFR level check. Simplify words, sentence length and sentence structure until the text clearly matches ${level}.
- Do not let more precise facts make the text harder than the requested level.
- If a precise fact requires a difficult phrase, split it into two short sentences or explain it with simpler words.
- For long organization names, historical terms or specialist terms, either explain them simply nearby or use a simpler description if the exact name is not necessary.
- At A1-A2, do not stack several difficult terms in one sentence.
- Remove or generalize facts that are suspicious, too specific, unstable, or appear in only one draft unless they are clearly high-confidence.
- For named people, be very careful with birthplaces, schools, exact jobs, dates, current roles, family details and named organizations.
- For living people, avoid present-tense job or role claims unless the teacher supplied the role. Prefer past-tense role descriptions with years when known.
- Do not add new specific facts that are not in the drafts, unless they are in the verified source notes.
- If verified source notes correct or update a draft, follow the verified source notes.
- Preserve the requested CEFR level, text type and word count.
- If the drafts disagree or feel uncertain, choose a simpler, safer sentence.
- Silently count the words before returning.

Return valid JSON only:
{
  "title": "...",
  "text": "..."
}
          `.trim();
}

function buildSourceGroundingPrompt(args: {
  languageName: string;
  level: string;
  topic: string;
  textType: string;
}): string {
  const { languageName, level, topic, textType } = args;

  return `
Find a small source-grounded fact basis for a learner text.

Language of the final learner text: ${languageName}
CEFR level: ${level}
Topic: ${topic}
Text type: ${textType}

Task:
- Use web search to verify the most important facts for this topic.
- Focus especially on named people, historical events, public roles, dates, places, organizations and current roles.
- Prefer official or high-quality reference sources when available.
- Keep the result short. Do not write the learner text.
- If the topic is a living person, include current role only if it is clearly supported by sources.
- If facts are uncertain, controversial or recently changed, put that in cautions instead of facts.

Return valid JSON only:
{
  "facts": [
    "short verified fact",
    "short verified fact"
  ],
  "cautions": [
    "short caution about unstable or uncertain facts"
  ]
}
          `.trim();
}

function buildA1StartPatternPrompt(languageName: string, config: A1StartConfig): string {
  const verb = String(config.verb || "").trim();
  const tense = ["present", "past", "future"].includes(String(config.tense))
    ? String(config.tense)
    : "present";
  const sentenceCount = [10, 13, 16, 19].includes(Number(config.sentenceCount))
    ? Number(config.sentenceCount)
    : 10;
  const additionalSubjectCount = (sentenceCount - 4) / 3;
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
- Write exactly ${sentenceCount} lines using the structure below.
- Use the same verb "${verb}" in every sentence, conjugated naturally for the requested tense.
- Keep the same verb meaning clearly recognizable in every sentence, even when its form changes with the subject.
- For Brazilian Portuguese, be careful that "ser" and "ir" share preterite forms. If the teacher supplies "ser", use identity or description complements, not movement or destination complements.
- The first line must be a complete sentence beginning with the first-person singular subject, equivalent to "Jeg" in Norwegian.
- Every line must be a complete, meaningful sentence using subject + verb + a simple object/complement.
- For verbs that take an object, prefer a concrete noun phrase. Example: "Jeg ser en katt" and "Katten ser en mus".
- Treat the theme as a word bank, not decoration. Keep the object/complement in every line connected to the theme when that is natural.
- For a friends theme, prefer words about friends and friendship. For breakfast/dinner, prefer food and drink words. For school, prefer school objects and activities.
- The title must be exactly the first complete sentence without final punctuation. Example: "Jeg er snill".
- Lines 2 and 3 must use the same first-person subject and verb as line 1, but each line must have a different simple object/complement.
- Then choose exactly ${additionalSubjectCount} varied, simple, single-word subjects. Examples include the equivalents of he, cat, it, Sara, child, or teacher.
- Use each new subject exactly three times in a row with the same verb, but vary the simple object/complement in all three sentences.
- Every subject must make logical sense with the verb. For example, do not write "Det liker kaffe"; use a person or animal that can like something.
- The final line must stand alone and be an exact copy of the complete first line.
- Repetition of subject + verb and variation of the final object/complement are both essential.
- Use only concrete, high-frequency words suitable for a beginning reader.
- Avoid dialogue, paragraphs, subordinate clauses, explanations, and advanced vocabulary.
- Put one sentence on each line.
- Write everything in ${languageName}.

Return valid JSON only:
{
  "title": "short simple title",
  "text": "sentence 1\\nsentence 2"
}
`.trim();
}

function buildA1StartHighFrequencyPrompt(languageName: string, config: A1StartConfig): string {
  const wordClass = String(config.wordClass || "").trim();
  const word = String(config.word || "").trim();
  const textLength = [50, 100, 150].includes(Number(config.highFrequencyLength))
    ? Number(config.highFrequencyLength)
    : 50;
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
- When the focus word is a preposition, prioritize natural language over the number of occurrences.
- Do not use the preposition in every sentence.
- Use the preposition only when it fits naturally.
- Use common expressions that native speakers actually use.
- Respect fixed expressions, contractions and natural patterns in the target language.
- When the target language has natural contractions or fixed forms, always use the natural form.
- Do not translate preposition patterns directly from Norwegian or English.
- For Brazilian Portuguese, use natural contractions when needed, for example "em + a = na" and "em + o = no".
- Natural language is more important than grammatical demonstration.
`.trim()
    : "";

  return `
Create an A1 Start reading lesson about one high-frequency function word.

Target language: ${languageName}
Level: A1
Word class: ${wordClassLabel}
Focus word: ${word}
Theme: ${theme}
Target length for the coherent text before the explanation: about ${textLength} words

Strict rules:
- Write everything in ${languageName}.
- Do not make pattern lines or sequences.
- Do not use chapter headings inside the text.
- Write one coherent, natural A1 text about the selected theme.
- LANGUAGE QUALITY IS MOST IMPORTANT.
- The main goal is to write a natural and correct text in ${languageName}.
- Good, natural language is more important than many occurrences of the focus word.
- Use the focus word "${word}" several times if it fits naturally, but never force it into sentences.
- If there is a conflict between natural language and more occurrences of the focus word, always prioritize natural language.
- Do not force the focus word into a sentence.
- Prefer short sentences and concrete everyday words.
- Vary the sentences freely. The text should feel like a small simple text, not a drill.
- Keep the grammar natural. If a sentence sounds strange, rewrite it.
- If you are unsure, choose a simpler sentence, a simpler word, or a more common expression.
- Do not write sentences that sound unnatural to native speakers.
- Avoid awkward phrases, wrong noun forms, direct translations and verb mistakes.
- Avoid weak or unnatural formulations like "To vennene mine", "Vi spise mat", "å være i sammen", "Mor lager ikke på TV" and "Barn spiller over gresset".
- The text should be readable by a native speaker without sentences feeling strange or artificial.
- Write the text as a native speaker would write for a child or a new language learner.
- Do not explain the word inside the main text.
${prepositionGuidance ? `\n${prepositionGuidance}\n` : ""}
- After the coherent text, add a blank line, then the heading "${languageLabels.explanationHeading}".
- Under "${languageLabels.explanationHeading}", write short plain lines without numbering or bullet points:
  ${languageLabels.belongsToWordClass(word, wordClassLabel)}
  ${wordClassExplanation}
  A simple explanation of the focus word "${word}": ${wordExplanation}
  One very simple example sentence with "${word}".
- After the explanation, add a blank line, then the heading "${languageLabels.exampleHeading}".
- Under "${languageLabels.exampleHeading}", write exactly 5 simple, correct sentences where "${word}" is used in different natural situations.
- Do not number the explanation lines or example sentences.
- The 5 example sentences should vary placement, time, subject or situation when possible.
- Every example sentence must be grammatically correct and idiomatic ${languageName}.

Return valid JSON only:
{
  "title": "${languageLabels.titlePrefix} – ${word}",
  "text": "coherent text\\n\\n${languageLabels.explanationHeading}\\n...\\n\\n${languageLabels.exampleHeading}\\n..."
}
`.trim();
}

function getSoundLadderLabels(languageName: string): {
  titlePrefix: string;
  explanation: string;
  wordTraining: string;
  soundSentences: string;
  explanationLine: (sound: string) => string;
  examplesLine: (sound: string) => string;
} {
  if (languageName === "English") {
    return {
      titlePrefix: "Sound training",
      explanation: "Explanation",
      wordTraining: "Words and sound training",
      soundSentences: "Sentences with the sound",
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
      explanationLine: (sound) => `Neste texto, praticamos o som ${sound}.`,
      examplesLine: (sound) => `Escute o som ${sound} nas palavras e frases.`,
    };
  }
  return {
    titlePrefix: "Lydtrening",
    explanation: "Forklaring",
    wordTraining: "Ord og lydtrening",
    soundSentences: "Setninger med lyden",
    explanationLine: (sound) => `I denne teksten øver vi på ${sound}-lyden.`,
    examplesLine: (sound) => `Lytt etter ${sound}-lyden i ord og setninger.`,
  };
}

function buildA1StartSoundLadderPrompt(languageName: string, config: A1StartConfig): string {
  const focusSound = String(config.focusSound || "").trim();
  const theme = String(config.topic || "").trim() || "everyday life";
  const soundSentenceCount = Math.max(0, Math.min(10, Math.round(Number(config.soundSentenceCount) || 0)));
  const soundWordCount = [0, 3, 6, 9, 12, 15].includes(Number(config.soundWordCount))
    ? Number(config.soundWordCount)
    : 9;
  const labels = getSoundLadderLabels(languageName);

  if (!focusSound) throw new Error("Focus sound is required for A1 Start sound ladder.");

  return `
Create A1 Start sound training in natural reading context.

Target language: ${languageName}
Focus sound: ${focusSound}
Theme: ${theme}
Main text length: about 100 words
Number of sound words after the explanation: ${soundWordCount}
Number of sound sentences after the word training: ${soundSentenceCount}

This is not pure sound drilling and not a phonics-copy system. The goal is to read, listen and notice the focus sound in natural language.

Use this structure:
1. A natural title that fits the theme and text.
2. A coherent A1 text of about 100 words where the focus sound appears several times without hurting content or quality.
3. Heading "${labels.explanation}" with a very simple A1 explanation.
4. Heading "${labels.wordTraining}" with exactly ${soundWordCount} simple sound words if the selected number is greater than 0.
5. Heading "${labels.soundSentences}" with exactly ${soundSentenceCount} short sentences using words with the focus sound if the selected number is greater than 0.

Language quality rules:
- Write everything in ${languageName}.
- Natural language is more important than many uses of the focus sound.
- Still, try to include several natural words with the focus sound in the main text.
- Prefer everyday words with the focus sound when they fit the theme naturally.
- Do not make strange sentences to include the sound.
- If you are unsure, choose an easier word or sentence.
- Use high-frequency, concrete, easy-to-read words.
- Do not use difficult or rare words only to include the sound.
- Use short sentences suitable for beginners.
- Do not use phonetic symbols.
- Do not ask the voice to pronounce the sound alone.
- Audio playback should read words and sentences, not isolated sounds.
- Do not explain the Norwegian sound system unless the target language is Norwegian.
- The text should sound natural to a native speaker writing for a child or a new language learner.

Explanation guidance:
- ${labels.explanationLine(focusSound)}
- ${labels.examplesLine(focusSound)}
- Mention 2-4 concrete words from the text or word training list.

Word training guidance:
- Prefer small, simple words.
- Prefer words where the focus sound comes early in the word when that is natural.
- Write the sound words three and three on each line, separated by commas.
- Do not use rare or difficult words just to include the sound.
- If the selected number is 0, omit the "${labels.wordTraining}" section.

Sound sentence guidance:
- Use simple, natural A1 sentences.
- Use normal standalone sentences. They do not need to explain the sound.
- Do not write meta sentences like "X is a sound word", "We say X aloud", or "I listen for the sound in X".
- Use at least one word with the focus sound in each sentence.
- It is good if a sentence has several words with the same sound, as long as it sounds natural.
- The sentences may be connected to each other, but they can also be free-standing.
- If the selected number is 0, omit the "${labels.soundSentences}" section.

Return valid JSON only:
{
  "title": "${labels.titlePrefix} – ${focusSound}",
  "text": "coherent text\\n\\n${labels.explanation}\\n...\\n\\n${labels.wordTraining}\\n...\\n\\n${labels.soundSentences}\\n..."
}
`.trim();
}

function getSoundTrainingWords(languageName: string, focusSound: string, count: number): string[] {
  if (count <= 0) return [];
  const key = focusSound.toLocaleLowerCase();
  const nb: Record<string, string[]> = {
    s: ["sol", "saft", "seng", "sekk", "sko", "suppe", "sitte", "se", "si", "sang", "sulten", "søt", "sommer", "skole", "stol"],
    m: ["mat", "mor", "mus", "melk", "mål", "mye", "min", "mitt", "måne", "mann", "mamma", "morgen", "munn", "med", "møter"],
    a: ["and", "ape", "arm", "ark", "alle", "Anna", "Ali", "av", "at", "appelsin", "arbeid", "ansikt", "ask", "aldri", "alltid"],
    b: ["bil", "bok", "ball", "bord", "buss", "barn", "brød", "båt", "ben", "blå", "butikk", "bamse", "bade", "bilde", "bak"],
    d: ["dag", "du", "din", "dyr", "dør", "dans", "dukke", "drue", "drikke", "dele", "der", "dame", "datter", "data", "dusj"],
    f: ["far", "fisk", "fot", "fin", "fugl", "fem", "frokost", "frukt", "farge", "får", "familie", "finner", "fart", "fryser", "følge"],
    g: ["gå", "god", "gul", "gris", "gutt", "gate", "gave", "genser", "glass", "glede", "grøt", "grønn", "gammel", "gitar", "gulrot"],
    k: ["katt", "kake", "kopp", "kul", "kan", "kommer", "kald", "kort", "kino", "kjøkken", "klasse", "klokke", "kropp", "klem", "kveld"],
    n: ["natt", "nese", "navn", "ni", "ny", "norsk", "nøkkel", "nabo", "natur", "nå", "nær", "ned", "noen", "Nina", "notat"],
    e: ["egg", "en", "et", "eple", "elefant", "elleve", "etter", "elev", "egen", "enkel", "elsker", "eske", "elv", "ende", "er"],
    o: ["ost", "ord", "orm", "Ole", "Oda", "opp", "ovn", "over", "ofte", "onkel", "onsdag", "område", "orange", "ostekake", "okse"],
    u: ["ut", "ull", "ung", "uke", "under", "ute", "uten", "ulv", "unge", "Ulla", "ugle", "usikker", "univers", "unik", "utstyr"],
    æ: ["bær", "vær", "nær", "kjær", "lærer", "sær", "tær", "ærlig", "ærend", "været", "klær"],
    ø: ["øl", "øye", "øre", "øy", "øve", "ønske", "søt", "brød", "grøt", "følge", "møte", "rød", "grønn", "løpe", "høre"],
    å: ["å", "år", "åtte", "ål", "båt", "blå", "får", "går", "står", "må", "nå", "så", "på", "låne", "måne"],
    sj: ["sjø", "sjokolade", "sju", "sjef", "sjakk", "sjal", "sjåfør", "sjampo", "sjelden", "sjarm"],
    kj: ["kjole", "kjøkken", "kjøtt", "kjeks", "kjekk", "kjenne", "kjære", "kjøpe", "kjøre", "kjede", "kjeller", "kjølig"],
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
      "Kinoen er kul.",
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
      "Ulven er ung.",
      "Vi går under brua.",
      "Uka er lang.",
      "Uten sko blir jeg kald.",
      "Ungen går ut.",
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
  for (let index = 0; index < words.length; index += 3) {
    lines.push(words.slice(index, index + 3).join(", "));
  }
  return lines.join("\n");
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
  belongsToWordClass: (word: string, wordClassLabel: string) => string;
} {
  if (languageName === "English") {
    return {
      titlePrefix: "High-frequency words",
      explanationHeading: "Explanation",
      exampleHeading: "Example sentences",
      belongsToWordClass: (word, wordClassLabel) => `"${word}" belongs to the word class ${wordClassLabel}.`,
    };
  }
  if (languageName === "Brazilian Portuguese") {
    return {
      titlePrefix: "Palavras de alta frequência",
      explanationHeading: "Explicação",
      exampleHeading: "Frases de exemplo",
      belongsToWordClass: (word, wordClassLabel) => `"${word}" pertence à classe gramatical ${wordClassLabel}.`,
    };
  }
  return {
    titlePrefix: "Høyfrekvente ord",
    explanationHeading: "Forklaring",
    exampleHeading: "Eksempelsetninger",
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
  const exampleSentences = [
    languageLabels.exampleHeading,
    ...getHighFrequencyExampleSentences(word, languageName),
  ].join("\n");
  const hasExplanation = text.toLocaleLowerCase().includes(languageLabels.explanationHeading.toLocaleLowerCase());
  const hasExampleSentences = text.toLocaleLowerCase().includes(languageLabels.exampleHeading.toLocaleLowerCase());
  const extraSections = [
    hasExplanation ? "" : explanation,
    hasExampleSentences ? "" : exampleSentences,
  ].filter(Boolean).join("\n\n");

  return {
    title: `${languageLabels.titlePrefix} – ${word}`,
    text: extraSections ? `${text}\n\n${extraSections}` : text,
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
  const soundSentenceCount = Math.max(0, Math.min(10, Math.round(Number(config.soundSentenceCount) || 0)));
  const soundWordCount = [0, 3, 6, 9, 12, 15].includes(Number(config.soundWordCount))
    ? Number(config.soundWordCount)
    : 9;

  if (!focusSound || !text) {
    throw new Error("A1 Start response did not contain usable sound ladder text.");
  }

  const lowerText = text.toLocaleLowerCase();
  const explanation = [
    labels.explanation,
    labels.explanationLine(focusSound),
    labels.examplesLine(focusSound),
  ].join("\n");
  const soundWords = soundWordCount > 0
    ? [
      labels.wordTraining,
      formatSoundWords(getSoundTrainingWords(languageName, focusSound, soundWordCount)),
    ].join("\n")
    : "";
  const soundSentences = soundSentenceCount > 0
    ? [
      labels.soundSentences,
      ...getSoundTrainingSentences(languageName, focusSound, soundSentenceCount),
    ].join("\n")
    : "";
  const extraSections = [
    lowerText.includes(labels.explanation.toLocaleLowerCase()) ? "" : explanation,
    soundWordCount > 0 && !lowerText.includes(labels.wordTraining.toLocaleLowerCase()) ? soundWords : "",
    soundSentenceCount > 0 && !lowerText.includes(labels.soundSentences.toLocaleLowerCase()) ? soundSentences : "",
  ].filter(Boolean).join("\n\n");

  return {
    title: `${labels.titlePrefix} – ${focusSound}`,
    text: extraSections ? `${text}\n\n${extraSections}` : text,
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
): { first: string; third: string; complements: string[] } | null {
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
  return { ...forms, complements };
}

function getA1StartExpectedVerbForms(
  languageName: string,
  selectedVerb: string,
  tense: string
): string[] {
  if (languageName === "Brazilian Portuguese") {
    const pattern = getA1StartBrazilianPortugueseVerbPattern(selectedVerb, tense, "");
    if (pattern) return [pattern.first, pattern.third];
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
        [pattern.first, ...subjects.slice(1).map(() => pattern.third)],
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
    text: normalizedLines.join("\n"),
  };
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    const user = await getRequestUserContext(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      feature: "producer_create_lesson",
    });

    if (!status.allowed) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const body = (await req.json()) as GenerateTextBody;

    const level = body.level || "A2";
    const languageName = resolveLanguageName(body.language || "en");
    const topic = body.topic || "Untitled";
    const textType = body.textType || "Story";
    const textLength = body.textLength || 200;
    const isA1Start = level === "A1_START";
    const extraFactCheck = !isA1Start && body.extraFactCheck === true;
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
      return JSON.parse(out) as GenerateTextResult;
    };
    const createSourceGrounding = async (): Promise<string> => {
      if (!extraFactCheck || !isCefrAtLeastB1(level)) return "";

      try {
        const resp = await client.responses.create({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          text: { format: { type: "json_object" } },
          temperature: 0.1,
          tools: [{ type: "web_search_preview" }],
          input: [
            {
              role: "system",
              content:
                "You verify facts for learner texts. Use web search for current or specific facts. Return JSON only.",
            },
            {
              role: "user",
              content: buildSourceGroundingPrompt({
                languageName,
                level,
                topic,
                textType,
              }),
            },
          ],
        });

        const out = resp.output_text?.trim() || "";
        return stringifySourceGrounding(JSON.parse(out) as SourceGroundingResult);
      } catch (error) {
        console.warn(
          "Source grounding failed; continuing with draft comparison only:",
          error instanceof Error ? error.message : String(error)
        );
        return "";
      }
    };

    const parsed = extraFactCheck
      ? await (async () => {
          const [draftA, draftB, sourceGrounding] = await Promise.all([
            createResponse(userPrompt, 0.25),
            createResponse(userPrompt, 0.35),
            createSourceGrounding(),
          ]);
          return createResponse(
            buildCefrSelectionPrompt({
              languageName,
              level,
              topic,
              textType,
              textLength,
              draftA,
              draftB,
              sourceGrounding,
            }),
            0.15
          );
        })()
      : await createResponse(userPrompt, isA1Start ? 0.2 : 0.45);

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
      const expectedSentenceCount = [10, 13, 16, 19].includes(Number(body.a1Start?.sentenceCount))
        ? Number(body.a1Start?.sentenceCount)
        : 10;
      return NextResponse.json(
        normalizeA1StartResult(parsed, expectedSentenceCount, body.a1Start || {}, languageName)
      );
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
  const message =
    err instanceof Error ? err.message : "Unknown error";

  return NextResponse.json({ error: message }, { status: 500 });
}
}
