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
  sequenceCount?: number;
};

type GenerateTextResult = {
  title: string;
  text: string;
};

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
};

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
  if (c === "nb" || c === "no") return "Norwegian";
  if (c === "en") return "English";
  if (c === "pt") return "Portuguese";
  if (c === "pt-br") return "Brazilian Portuguese";
  if (c === "pt-pt") return "European Portuguese";
  return code;
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
- The first line must be a complete sentence beginning with the first-person singular subject, equivalent to "Jeg" in Norwegian.
- Every line must be a complete, meaningful sentence using subject + verb + a simple object/complement.
- For verbs that take an object, prefer a concrete noun phrase. Example: "Jeg ser en katt" and "Katten ser en mus".
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

function buildA1StartHighFrequencyPrompt(config: A1StartConfig): string {
  const wordClass = String(config.wordClass || "").trim();
  const word = String(config.word || "").trim();
  const sequenceCount = Math.max(1, Math.min(5, Math.round(Number(config.sequenceCount) || 1)));

  if (!wordClass || !word) throw new Error("Word class and word are required for A1 Start.");

  const wordSpecificGuidance =
    word === "for"
      ? `
Ekstra regler for ordet "for":
- Bruk naturlige mønstre som "Boken er for Anna.", "Kaken er for deg." og "Det er mat for hunden."
- Ikke skriv spørsmål som "Hva liker du for middag?", "Hvem er du glad for?" eller overskrifter som slutter med "for".
`.trim()
      : word === "etter"
        ? `
Ekstra regler for ordet "etter":
- Velg ett verb som danner et naturlig og fast mønster med "etter", og behold dette verbet i alle fire mønstersetningene.
- Gode mønstre er "leter etter", "løper etter", "spør etter" eller "venter på" dersom et annet ord er valgt.
- Eksempel på riktig sekvens: "Han leter etter ballen.", "Han leter etter vennen.", "Han leter etter katten.", "Han leter etter boka."
- Et naturlig avslutningsspørsmål kan være: "Hva vil du finne i parken?"
- Ikke skriv unaturlige kombinasjoner som "finner etter", "sitter etter å spise" eller "leker etter".
`.trim()
      : word === "over"
        ? `
Ekstra regler for ordet "over":
- Bruk "over" om tydelig plassering eller bevegelse, ikke etter et tilfeldig verb.
- Velg trygge mønstre som "Hyllen henger over ...", "Fuglen flyr over ..." eller "Broen går over ...".
- Eksempel: "Fuglen flyr over huset.", "Fuglen flyr over skolen.", "Fuglen flyr over parken.", "Fuglen flyr over veien."
- Ikke skriv unaturlige kombinasjoner som "Barn leker over sofaen" eller "Barn spiller over stien".
`.trim()
      : word === "før"
        ? `
Ekstra regler for ordet "før":
- Bruk "før" til å vise at én enkel handling skjer tidligere enn en annen.
- Velg ett trygt mønster som "Hun vasker hendene før ..." eller "Han tar på sko før ...".
- Eksempel: "Hun vasker hendene før middag.", "Hun vasker hendene før frokost.", "Hun vasker hendene før matlaging.", "Hun vasker hendene før hun spiser."
- Ikke skriv unaturlige kombinasjoner som "spør oppgavene", "spør ut bøker" eller andre setninger uten tydelig mening.
`.trim()
      : word === "her"
        ? `
Ekstra regler for ordet "her":
- Varier mellom naturlige mønstre som "Her er ballen." og "Dukken er her."
- Ikke skriv unaturlige spørsmål som "Hvor er du her?" eller "Hvor er leken her?".
`.trim()
        : "";

  return `
Lag leseopplæring for A1 Start med det høyfrekvente funksjonsordet "${word}".

Ordklasse: ${wordClass}
Valgt ord: ${word}
Antall sekvenser: ${sequenceCount}

Strenge regler:
- Skriv på norsk bokmål.
- Lag nøyaktig ${sequenceCount} separate sekvenser.
- Hver sekvens representerer én tydelig situasjon eller kontekst og skal ha nøyaktig 6 linjer.
- Linje 1 er en kort TITTEL som navngir situasjonen eller stedet, for eksempel "På skolen", "På kjøkkenet" eller "I parken". Tittelen skal IKKE inneholde ordet "${word}".
- Linje 2–5 er fire korte, naturlige og varierte mønstersetninger fra samme situasjon.
- Hver mønstersetning i linje 2–5 skal begynne tydelig med subjekt + verbal. Deretter kommer resten av setningen.
- De fire mønstersetningene i én sekvens skal bruke nøyaktig samme subjekt og samme verbal først i setningen.
- Varier bare resten av setningen etter det faste subjektet og verbalet.
- Eksempel med ordet "på": "Hun hører på musikk.", "Hun hører på radio.", "Hun hører på en podcast.", "Hun hører på læreren."
- Feil: "Barn leker mer ...", "Barn løper mer ...", "Barn sykler mer ...". Riktig: bruk samme start i alle fire, for eksempel "Barn leker mer ...".
- Subjekt + verbal + det valgte funksjonsordet må danne et naturlig mønster som fungerer i alle fire setningene.
- Velg først ett naturlig mønster, og varier deretter bare objektet eller komplementet.
- Ikke tving det valgte ordet inn etter verb som ikke passer sammen med ordet.
- Linje 6 er et enkelt AVSLUTNINGSSPØRSMÅL som bryter mønsteret. Spørsmålet må bruke ordet "du", være direkte knyttet til situasjonen og aktiviteten i blokken, og skal IKKE inneholde ordet "${word}".
- Avslutningsspørsmålet trenger ikke bruke samme hovedverb dersom verbet ikke fungerer naturlig uten det valgte funksjonsordet.
- Ordet "${word}" skal brukes naturlig og tydelig i hver av linjene 2–5.
- Hvis antall sekvenser er mer enn 1, skal hver sekvens ha en NY tittel/situasjon, et NYTT subjekt og et NYTT hovedverb.
- Ikke bruk samme situasjon, subjekt eller hovedverb i to ulike sekvenser.
- Bruk en tom linje mellom hver sekvens.
- Følg ordklassen ${wordClass}. Ordet må brukes med riktig funksjon i setningen.
- Plasser gjerne ordet tidlig i setningen når det gir enklere språk, men varier naturlig når det passer.
- For subjunksjoner: bruk svært korte og enkle leddsetninger.
- For determinativer: koble ordet til et passende substantiv.
- Bruk konkrete høyfrekvente ord, kjente navn og enkle hverdagssituasjoner.
- Alle setninger og spørsmål må være naturlige og gi tydelig mening.
- Bruk riktig norsk artikkel: "en hund", "en katt", "et dyr", "et barn", "et hus", "et måltid".
- Ikke skriv "Hva er et favorittmat?". Skriv heller et naturlig spørsmål som "Hva liker du å spise?".
- Unngå kunstige spørsmål som bare er laget for å presse inn det valgte ordet.
- Ikke nummerer linjene og ikke legg til forklaringer.

${wordSpecificGuidance}

Returner kun gyldig JSON:
{
  "title": "Høyfrekvente ord (beta) – ${word}",
  "text": "sekvens 1 med seks linjer\\n\\nsekvens 2 med seks linjer"
}
`.trim();
}

function getHighFrequencySafeSequences(word: string): string[][] {
  if (word === "over") {
    return [
      [
        "I lufta",
        "Fuglen flyr over huset.",
        "Fuglen flyr over skolen.",
        "Fuglen flyr over parken.",
        "Fuglen flyr over veien.",
        "Hva ser du i lufta?",
      ],
      [
        "På veggen",
        "Hyllen henger over sofaen.",
        "Hyllen henger over bordet.",
        "Hyllen henger over stolen.",
        "Hyllen henger over sengen.",
        "Hva henger på veggen hjemme hos deg?",
      ],
      [
        "Ved elva",
        "Broen går over elva.",
        "Broen går over veien.",
        "Broen går over stien.",
        "Broen går over dalen.",
        "Hva ser du ved elva?",
      ],
      [
        "På tur",
        "Flyet går over byen.",
        "Flyet går over fjellet.",
        "Flyet går over sjøen.",
        "Flyet går over skyene.",
        "Hva ser du på tur?",
      ],
      [
        "På kjøkkenet",
        "Lampen henger over bordet.",
        "Lampen henger over benken.",
        "Lampen henger over vasken.",
        "Lampen henger over stolen.",
        "Hva ser du på kjøkkenet?",
      ],
    ];
  }

  if (word === "før") {
    return [
      [
        "Ved bordet",
        "Hun vasker hendene før middag.",
        "Hun vasker hendene før frokost.",
        "Hun vasker hendene før matlaging.",
        "Hun vasker hendene før hun spiser.",
        "Hva gjør du ved bordet?",
      ],
      [
        "Om morgenen",
        "Han pakker sekken før skolen.",
        "Han pakker sekken før frokost.",
        "Han pakker sekken før bussen kommer.",
        "Han pakker sekken før han går.",
        "Hva gjør du om morgenen?",
      ],
      [
        "Om kvelden",
        "Sara leser før leggetid.",
        "Sara leser før hun sovner.",
        "Sara leser før lyset slukkes.",
        "Sara leser før kvelden er slutt.",
        "Hva gjør du om kvelden?",
      ],
      [
        "På kjøkkenet",
        "Ali finner maten før middag.",
        "Ali finner maten før gjestene kommer.",
        "Ali finner maten før bordet dekkes.",
        "Ali finner maten før de spiser.",
        "Hva finner du på kjøkkenet?",
      ],
      [
        "På trening",
        "Nora varmer opp før kampen.",
        "Nora varmer opp før løpet.",
        "Nora varmer opp før øvelsen.",
        "Nora varmer opp før laget starter.",
        "Hva gjør du på trening?",
      ],
    ];
  }

  return [];
}

function cleanA1StartLine(value: string): string {
  return value
    .trim()
    .replace(/^(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/[.!?]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHighFrequencyLine(value: string): string {
  return value
    .trim()
    .replace(/^(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/\bet hund\b/gi, "en hund")
    .replace(/\bet katt\b/gi, "en katt")
    .replace(/\bet bil\b/gi, "en bil")
    .replace(/\bet bok\b/gi, "en bok")
    .replace(/\ben hus\b/gi, "et hus")
    .replace(/\ben barn\b/gi, "et barn")
    .replace(/\ben dyr\b/gi, "et dyr")
    .replace(/\ben eple\b/gi, "et eple")
    .replace(/\ben måltid\b/gi, "et måltid")
    .replace(/\ben brød\b/gi, "et brød")
    .replace(/\ben glass\b/gi, "et glass")
    .replace(/\ben tog\b/gi, "et tog")
    .trim();
}

function containsHighFrequencyWord(line: string, word: string): boolean {
  const normalizedLine = ` ${line.toLocaleLowerCase().replace(/[.,!?;:]/g, " ")} `;
  const normalizedWord = ` ${word.toLocaleLowerCase()} `;
  return normalizedLine.includes(normalizedWord);
}

function pickLineWithoutWord(candidates: string[], word: string, index: number): string {
  const available = candidates.filter((line) => !containsHighFrequencyWord(line, word));
  return available[index % available.length] || candidates[index % candidates.length];
}

function lockSequenceSubjectAndVerb(sequence: string[]): string[] {
  const patternWords = sequence[1].split(/\s+/);
  if (patternWords.length < 2) return sequence;

  const subjectAndVerb = patternWords.slice(0, 2).join(" ");
  for (let index = 1; index <= 4; index += 1) {
    const words = sequence[index].split(/\s+/);
    if (words.length < 2) continue;
    const remainder = words.slice(2).join(" ");
    sequence[index] = `${subjectAndVerb}${remainder ? ` ${remainder}` : ""}`.trim();
  }
  return sequence;
}

function normalizeA1StartHighFrequencyResult(
  result: GenerateTextResult,
  config: A1StartConfig
): GenerateTextResult {
  const word = cleanA1StartLine(String(config.word || ""));
  const sequenceCount = Math.max(1, Math.min(5, Math.round(Number(config.sequenceCount) || 1)));
  const linesPerSequence = 6;
  const expectedLineCount = sequenceCount * linesPerSequence;
  const lines = String(result.text || "")
    .split(/\r?\n/)
    .map(cleanHighFrequencyLine)
    .filter(Boolean);

  if (!word || lines.length < linesPerSequence) {
    throw new Error("A1 Start response did not contain usable high-frequency word sequences.");
  }

  while (lines.length < expectedLineCount) {
    lines.push(...lines.slice(Math.max(0, lines.length - linesPerSequence)));
  }

  const headingFallbacks = ["På skolen", "På kjøkkenet", "I parken", "Hjemme", "På butikken"];
  const questionFallbacks = [
    "Hva gjør du på skolen?",
    "Hva lager du på kjøkkenet?",
    "Hva ser du i parken?",
    "Hva gjør du hjemme?",
    "Hva kjøper du på butikken?",
  ];
  const usedHeadings = new Set<string>();
  const sequences = Array.from({ length: sequenceCount }, (_, index) => {
    const sequence = lines.slice(
      index * linesPerSequence,
      index * linesPerSequence + linesPerSequence
    );
    const normalizedHeading = sequence[0].toLocaleLowerCase();
    if (containsHighFrequencyWord(sequence[0], word) || usedHeadings.has(normalizedHeading)) {
      sequence[0] = pickLineWithoutWord(headingFallbacks, word, index);
    }
    usedHeadings.add(sequence[0].toLocaleLowerCase());
    if (
      containsHighFrequencyWord(sequence[5], word) ||
      !sequence[5].toLocaleLowerCase().split(/\s+/).includes("du")
    ) {
      sequence[5] = pickLineWithoutWord(questionFallbacks, word, index);
    }
    sequence[5] = `${sequence[5].replace(/[.!?]+$/, "")}?`;
    return lockSequenceSubjectAndVerb(sequence).join("\n");
  });
  const safeSequences = getHighFrequencySafeSequences(word);
  const normalizedSequences = safeSequences.length > 0
    ? Array.from(
      { length: sequenceCount },
      (_, index) => safeSequences[index % safeSequences.length].join("\n")
    )
    : sequences;

  return {
    title: `Høyfrekvente ord (beta) – ${word}`,
    text: normalizedSequences.join("\n\n"),
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

function getA1StartFallbackGroups(
  languageName: string,
  selectedVerb: string,
  firstPersonSubject: string,
  topic: string
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

  if (languageName === "Brazilian Portuguese" && normalizedVerb === "gostar") {
    return [
      ["Eu gosto de livros", "Eu gosto de filmes", "Eu gosto de música"],
      ["Ele gosta de cães", "Ele gosta de carros", "Ele gosta de flores"],
      ["Ela gosta de roupas", "Ela gosta de frutas", "Ela gosta de comida"],
      ["Sara gosta de café", "Sara gosta de chá", "Sara gosta de suco"],
      ["Ana gosta de maçãs", "Ana gosta de leite", "Ana gosta de pão"],
      ["Paulo gosta de livros", "Paulo gosta de arte", "Paulo gosta de música"],
    ];
  }

  if (languageName === "Brazilian Portuguese" && normalizedVerb === "ver") {
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
    const portuguesePatterns: Record<string, { first: string; third: string; complements: string[] }> = {
      ser: { first: "sou", third: "é", complements: ["feliz", "gentil", "forte", "calmo", "rápido", "amigo"] },
      ter: { first: "tenho", third: "tem", complements: ["um livro", "uma bolsa", "uma bola", "uma bicicleta", "um cão", "um gato"] },
      comer: { first: "como", third: "come", complements: ["uma maçã", "pão", "arroz", "peixe", "sopa", "frutas"] },
      beber: { first: "bebo", third: "bebe", complements: ["água", "leite", "suco", "chá", "café", "vitamina"] },
      ir: { first: "vou", third: "vai", complements: ["para casa", "à escola", "ao parque", "à loja", "ao trabalho", "para fora"] },
      vir: { first: "venho", third: "vem", complements: ["para casa", "à escola", "ao parque", "à loja", "para dentro", "de fora"] },
      fazer: { first: "faço", third: "faz", complements: ["comida", "um bolo", "um desenho", "uma cadeira", "um barco", "um cartão"] },
      ler: { first: "leio", third: "lê", complements: ["um livro", "uma história", "uma carta", "uma revista", "uma placa", "um poema"] },
      escrever: { first: "escrevo", third: "escreve", complements: ["uma palavra", "uma frase", "uma carta", "um nome", "uma história", "uma lista"] },
    };
    const pattern = portuguesePatterns[normalizedVerb];
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
  const hasSelectedVerb = (line: string) =>
    line.toLocaleLowerCase().split(" ").includes(selectedVerb.toLocaleLowerCase());
  const completeLines = rawLines
    .map(cleanA1StartLine)
    .filter((line) => line.split(" ").length >= 3 && hasSelectedVerb(line));
  const groupCount = (expectedSentenceCount - 4) / 3;
  const fallbackGroups = getA1StartFallbackGroups(
    languageName,
    selectedVerb,
    firstPersonSubject,
    String(config.topic || "")
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
  const firstGroup = generatedFirstGroup.length >= 3
    ? generatedFirstGroup.slice(0, 3)
    : fallbackGroups[0];

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
    const isA1StartHighFrequency = isA1Start && body.a1Start?.type === "high_frequency_words";
    if (isA1StartHighFrequency && languageName !== "Norwegian") {
      return NextResponse.json(
        { error: "High-frequency words are currently available for Norwegian Bokmål only." },
        { status: 400 }
      );
    }
    const userPrompt = isA1Start
      ? isA1StartHighFrequency
        ? buildA1StartHighFrequencyPrompt(body.a1Start || {})
        : buildA1StartPatternPrompt(languageName, body.a1Start || {})
      : `
Write a ${textType} text.

Language: ${languageName}
Level: ${level}
Topic: ${topic}
Length: ${textLength} words

Return:
{
  "title": "...",
  "text": "..."
}
          `;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const resp = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      text: { format: { type: "json_object" } },
      input: [
        {
          role: "system",
          content: isA1Start
            ? `You create highly controlled beginning-reading practice. Return JSON only. Output must be in ${languageName}.`
            : `You create CEFR texts. Return JSON only. Output must be in ${languageName}.`,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const out = resp.output_text?.trim() || "";
    const parsed = JSON.parse(out) as GenerateTextResult;

    if (isA1Start) {
      if (isA1StartHighFrequency) {
        return NextResponse.json(normalizeA1StartHighFrequencyResult(parsed, body.a1Start || {}));
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
