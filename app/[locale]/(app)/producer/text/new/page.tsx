"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import AuthGate from "@/components/AuthGate";
import { authedPost } from "@/lib/authedPost";
import { useUserProfile } from "@/lib/useUserProfile";

type WritingProgression = "free" | "guided" | "locked";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const LANGUAGES = ["nb", "en", "pt"] as const;
const GENRES = ["story", "factual"] as const;
const PROGRESSION_OPTIONS: WritingProgression[] = ["guided", "free", "locked"];
const DEFAULT_WORD_COUNT_BY_LEVEL: Record<(typeof LEVELS)[number], number> = {
  A1: 100,
  A2: 200,
  B1: 350,
  B2: 500,
  C1: 800,
  C2: 800,
};
const STORY_SECTIONS = [
  { id: "idea", labelKey: "sections.idea" },
  { id: "main_character", labelKey: "sections.mainCharacter" },
  { id: "other_characters", labelKey: "sections.otherCharacters" },
  { id: "setting", labelKey: "sections.setting" },
  { id: "conflict", labelKey: "sections.conflict" },
  { id: "solution", labelKey: "sections.solution" },
  { id: "opening_type", labelKey: "sections.openingType" },
  { id: "title", labelKey: "sections.title" },
  { id: "introduction", labelKey: "sections.introduction" },
  { id: "main_part", labelKey: "sections.mainPart" },
  { id: "ending", labelKey: "sections.ending" },
  { id: "content_check", labelKey: "sections.contentCheck" },
  { id: "language_check", labelKey: "sections.languageCheck" },
  { id: "self_assessment", labelKey: "sections.selfAssessment" },
];

const FACTUAL_SECTIONS = [
  { id: "topic", labelKey: "sections.topic" },
  { id: "purpose_audience", labelKey: "sections.purposeAudience" },
  { id: "key_terms", labelKey: "sections.keyTerms" },
  { id: "facts_examples", labelKey: "sections.factsExamples" },
  { id: "discussion", labelKey: "sections.discussion" },
  { id: "structure", labelKey: "sections.structure" },
  { id: "sources", labelKey: "sections.sources" },
  { id: "title", labelKey: "sections.title" },
  { id: "introduction", labelKey: "sections.introduction" },
  { id: "main_part", labelKey: "sections.mainPart" },
  { id: "ending", labelKey: "sections.ending" },
  { id: "content_check", labelKey: "sections.contentCheck" },
  { id: "structure_check", labelKey: "sections.structureCheck" },
  { id: "fact_check", labelKey: "sections.factCheck" },
  { id: "language_check", labelKey: "sections.languageCheck" },
  { id: "self_assessment", labelKey: "sections.selfAssessment" },
];

type WritingLanguage = (typeof LANGUAGES)[number];
type WritingGenre = (typeof GENRES)[number];
type SectionConfig = { id: string; labelKey: string };
type GeneratedWritingDraft = {
  title?: string;
  assignmentText?: string;
  criteria?: string[];
  targetWordCount?: number;
  supportWordsBySection?: Record<string, string[]>;
};

const WRITING_DEFAULTS: Record<
  WritingLanguage,
  Record<
    WritingGenre,
    {
    assignment: string;
    criteria: string[];
    support: Record<string, string>;
    themes: string[];
    theme: string;
    customTheme: string;
  }
  >
> = {
  nb: {
    story: {
    assignment:
      "Skriv en skjønnlitterær tekst om en person som opplever noe uventet.\n\nVelg selv sted, tid og handling. Teksten skal ha en tydelig hovedperson og inneholde en konflikt eller utfordring. La noe forandre seg underveis, og gi teksten en tydelig avslutning.\n\nLegg vekt på person- og miljøskildringer. Bruk sanser, tanker og følelser for å skape stemning.\n\nOmfang: ____ ord.",
    criteria: [
      "Tydelig hovedperson",
      "En konflikt eller uventet hendelse",
      "Utvikling og vendepunkt",
      "Personskildring",
      "Miljøskildring",
      "Bruk av sanser, tanker og følelser",
      "Stemningsskapende språk",
      "Tydelig innledning",
      "Sammenheng og rød tråd",
      "Tydelig avslutning",
      "Variert språk og setningsbygning",
      "Rettskriving og tegnsetting",
    ],
    support: {
      idea: "fortellingen handler om\nnoe uventet skjer\nleseren skal lure på\nproblemet starter når",
      main_character: "modig\nredd\nnysgjerrig\nsnill\nhemmelighet\nønsker\nliker ikke",
      other_characters: "venn\nhjelper\nmotstander\nfamilie\nukjent\nviser\nskjuler",
      setting: "på skolen\nhjemme\nute\nom morgenen\nmørkt\nkaldt\nstille\nlukter\nhører",
      conflict: "problemet er\nhindringen er\nvil, men kan ikke\nnoe går galt\nmå velge\nblir redd",
      solution: "til slutt\nløser det ved\nforandrer seg\nforstår\nfår hjelp\nmå gjøre noe selv",
      opening_type: "midt i handlingen\ndialog\nbeskrivelse\ndet var en gang\nførst ser vi\nplutselig",
      title: "Den uventede dagen\nDa alt forandret seg\nEt merkelig møte\nNoe jeg ikke forstod",
      introduction: "Det startet da...\nJeg la merke til...\nFørst virket alt vanlig...\nPlutselig skjedde det noe...",
      main_part: "Han/hun så...\nDet luktet...\nLyden kom fra...\nHjertet slo...\nTankene raste...",
      ending: "Til slutt...\nDa forstod...\nEtterpå var...\nDet viktigste var...",
      content_check: "Jeg ser at...\nJeg vil gjøre ... tydeligere.\nLeseren forstår...\nDette henger sammen fordi...",
      language_check: "Jeg leser setningen høyt.\nJeg sjekker stor bokstav.\nJeg setter punktum.\nJeg bytter ut gjentatte ord.",
      self_assessment: "jeg lærte\njeg forbedret\njeg er fornøyd med\njeg trenger hjelp med\nneste gang vil jeg",
    },
    themes: ["Fortelling", "Novelle", "Skildring", "Eventyr", "Drama", "Sci-fi", "Krim", "Grøsser", "Fantasy", "Annen skjønnlitterær tekst"],
    theme: "Fortelling",
    customTheme: "Annen skjønnlitterær tekst",
    },
    factual: {
      assignment:
        "Skriv en faktatekst som informerer eller forklarer et tema.\n\nVelg et tydelig tema, og skriv for en bestemt mottaker. Teksten skal ha en klar innledning, flere avsnitt med fakta, forklaringer og eksempler, og en avslutning som samler hovedpoengene.\n\nBruk nøkkelord og forklar viktige begreper. Dersom du bruker fakta fra kilder, skal de kunne sjekkes.\n\nOmfang: ____ ord.",
      criteria: [
        "Tydelig tema og formål",
        "Tilpasset mottaker",
        "Fakta og forklaringer som passer til temaet",
        "Eksempler som gjør innholdet tydeligere",
        "Nøkkelord og begreper er forklart",
        "Tydelig innledning",
        "Avsnitt med god rekkefølge",
        "Sammenheng og rød tråd",
        "Tydelig avslutning",
        "Fakta er kontrollert mot kilder ved behov",
        "Saklig og presist språk",
        "Rettskriving og tegnsetting",
      ],
      support: {
        topic: "temaet er\njeg skal forklare\njeg skal informere om\nviktig fordi\nleseren skal forstå",
        purpose_audience: "formålet er\nmottakeren er\nleseren trenger\njeg vil forklare\njeg vil vise",
        key_terms: "begrep\nbetyr\nforklares slik\nfor eksempel\nviktig ord",
        facts_examples: "et viktig faktum er\nfor eksempel\ndette viser at\nårsaken er\nen konsekvens er",
        discussion: "på den ene siden\npå den andre siden\nnoen mener\nandre mener\nlikevel\nderfor",
        structure: "først\nderetter\nvidere\ntil slutt\navsnittet handler om\nkonklusjonen er",
        sources: "kilde\nnettsted\nbok\njeg fant\njeg må sjekke\npålitelige kilder",
        title: "Hva er...\nSlik fungerer...\nDerfor er...\nEn forklaring på...",
        introduction: "Denne teksten handler om...\nMålet er å forklare...\nMange lurer på...\nFørst skal vi se på...",
        main_part: "For det første...\nFor eksempel...\nDette betyr...\nEn årsak er...\nEn konsekvens er...",
        ending: "Til slutt...\nKort sagt...\nDet viktigste er...\nVi kan derfor si...\nKonklusjonen er...",
        content_check: "Teksten forklarer...\nLeseren forstår...\nJeg har med...\nJeg mangler...\nDette bør bli tydeligere...",
        structure_check: "Innledningen...\nHoveddelen...\nAvsnittene...\nRekkefølgen...\nOvergangen...",
        fact_check: "Jeg har sjekket...\nKilden sier...\nDette må kontrolleres...\nJeg er usikker på...\nFakta stemmer fordi...",
        language_check: "Jeg forklarer begrepet.\nSetningen er tydelig.\nJeg bruker punktum.\nJeg varierer språket.\nJeg leser høyt.",
        self_assessment: "jeg lærte\njeg forklarte\njeg sjekket\njeg er fornøyd med\nneste gang vil jeg",
      },
      themes: ["Informerende tekst", "Forklarende tekst", "Argumenterende tekst", "Artikkel", "Rapport", "Biografi", "Instruksjon", "Sammenligning", "Drøftende tekst", "Annen faktatekst"],
      theme: "Informerende tekst",
      customTheme: "Annen faktatekst",
    },
  },
  en: {
    story: {
    assignment:
      "Write a creative text about a character who experiences something unexpected.\n\nChoose the place, time, and plot yourself. The text should have a clear main character and include a conflict or challenge. Let something change along the way, and give the text a clear ending.\n\nFocus on character and setting descriptions. Use senses, thoughts, and feelings to create atmosphere.\n\nLength: ____ words.",
    criteria: [
      "Clear main character",
      "A conflict or unexpected event",
      "Development and turning point",
      "Character description",
      "Setting description",
      "Use of senses, thoughts, and feelings",
      "Atmosphere-building language",
      "Clear introduction",
      "Coherence and clear thread",
      "Clear ending",
      "Varied language and sentence structure",
      "Spelling and punctuation",
    ],
    support: {
      idea: "the story is about\nsomething unexpected happens\nthe reader should wonder\nthe problem starts when",
      main_character: "brave\nafraid\ncurious\nkind\nsecret\nwants\ndoes not like",
      other_characters: "friend\nhelper\nopponent\nfamily\nunknown\nshows\nhides",
      setting: "at school\nat home\noutside\nin the morning\ndark\ncold\nquiet\nsmells\nhears",
      conflict: "the problem is\nthe obstacle is\nwants to, but cannot\nsomething goes wrong\nmust choose\ngets scared",
      solution: "in the end\nsolves it by\nchanges\nunderstands\ngets help\nmust do something alone",
      opening_type: "in the middle of the action\ndialogue\ndescription\nonce upon a time\nfirst we see\nsuddenly",
      title: "The unexpected day\nWhen everything changed\nA strange meeting\nSomething I did not understand",
      introduction: "It started when...\nI noticed...\nAt first, everything seemed normal...\nSuddenly something happened...",
      main_part: "He/she saw...\nIt smelled...\nThe sound came from...\nThe heart was beating...\nThoughts rushed...",
      ending: "In the end...\nThen I understood...\nAfterwards...\nThe most important thing was...",
      content_check: "I can see that...\nI want to make ... clearer.\nThe reader understands...\nThis fits together because...",
      language_check: "I read the sentence aloud.\nI check capital letters.\nI add full stops.\nI replace repeated words.",
      self_assessment: "I learned\nI improved\nI am happy with\nI need help with\nnext time I will",
    },
    themes: ["Story", "Short story", "Description", "Fairy tale", "Drama", "Sci-fi", "Crime", "Horror", "Fantasy", "Other creative text"],
    theme: "Story",
    customTheme: "Other creative text",
    },
    factual: {
      assignment:
        "Write a factual text that informs or explains a topic.\n\nChoose a clear topic and write for a specific reader. The text should have a clear introduction, several paragraphs with facts, explanations and examples, and an ending that gathers the main points.\n\nUse key terms and explain important concepts. If you use facts from sources, they should be possible to check.\n\nLength: ____ words.",
      criteria: [
        "Clear topic and purpose",
        "Adapted to the reader",
        "Facts and explanations fit the topic",
        "Examples make the content clearer",
        "Key terms and concepts are explained",
        "Clear introduction",
        "Paragraphs in a logical order",
        "Coherence and clear thread",
        "Clear ending",
        "Facts are checked against sources when needed",
        "Precise factual language",
        "Spelling and punctuation",
      ],
      support: {
        topic: "the topic is\nI will explain\nI will inform about\nimportant because\nthe reader should understand",
        purpose_audience: "the purpose is\nthe reader is\nthe reader needs\nI want to explain\nI want to show",
        key_terms: "term\nmeans\ncan be explained as\nfor example\nimportant word",
        facts_examples: "an important fact is\nfor example\nthis shows that\na cause is\na consequence is",
        discussion: "on the one hand\non the other hand\nsome people think\nothers think\nhowever\ntherefore",
        structure: "first\nthen\nnext\nfinally\nthe paragraph is about\nthe conclusion is",
        sources: "source\nwebsite\nbook\nI found\nI need to check\nreliable sources",
        title: "What is...\nHow ... works\nWhy ... matters\nAn explanation of...",
        introduction: "This text is about...\nThe aim is to explain...\nMany people wonder...\nFirst, we will look at...",
        main_part: "First of all...\nFor example...\nThis means...\nOne cause is...\nOne consequence is...",
        ending: "Finally...\nIn short...\nThe most important point is...\nWe can therefore say...\nThe conclusion is...",
        content_check: "The text explains...\nThe reader understands...\nI have included...\nI am missing...\nThis should be clearer...",
        structure_check: "The introduction...\nThe main part...\nThe paragraphs...\nThe order...\nThe transition...",
        fact_check: "I have checked...\nThe source says...\nThis must be checked...\nI am unsure about...\nThe facts are correct because...",
        language_check: "I explain the term.\nThe sentence is clear.\nI use full stops.\nI vary the language.\nI read aloud.",
        self_assessment: "I learned\nI explained\nI checked\nI am happy with\nnext time I will",
      },
      themes: ["Informative text", "Explanatory text", "Argumentative text", "Article", "Report", "Biography", "Instruction", "Comparison", "Discussion text", "Other factual text"],
      theme: "Informative text",
      customTheme: "Other factual text",
    },
  },
  pt: {
    story: {
    assignment:
      "Escreva um texto literário sobre uma personagem que vive algo inesperado.\n\nEscolha o lugar, o tempo e a ação. O texto deve ter uma personagem principal clara e incluir um conflito ou desafio. Deixe algo mudar durante a história e dê ao texto uma conclusão clara.\n\nDê atenção às descrições de personagem e ambiente. Use sentidos, pensamentos e sentimentos para criar atmosfera.\n\nExtensão: ____ palavras.",
    criteria: [
      "Personagem principal clara",
      "Um conflito ou acontecimento inesperado",
      "Desenvolvimento e ponto de viragem",
      "Descrição da personagem",
      "Descrição do ambiente",
      "Uso de sentidos, pensamentos e sentimentos",
      "Linguagem que cria atmosfera",
      "Introdução clara",
      "Coerência e fio condutor",
      "Conclusão clara",
      "Linguagem e frases variadas",
      "Ortografia e pontuação",
    ],
    support: {
      idea: "a história é sobre\nacontece algo inesperado\no leitor deve perguntar-se\no problema começa quando",
      main_character: "corajoso\ncom medo\ncurioso\ngentil\nsegredo\nquer\nnão gosta",
      other_characters: "amigo\najudante\noponente\nfamília\ndesconhecido\nmostra\nesconde",
      setting: "na escola\nem casa\nlá fora\nde manhã\nescuro\nfrio\nsilencioso\ncheira\nouve",
      conflict: "o problema é\no obstáculo é\nquer, mas não consegue\nalgo dá errado\nprecisa escolher\nfica com medo",
      solution: "no fim\nresolve ao\nmuda\nentende\nrecebe ajuda\nprecisa fazer sozinho",
      opening_type: "no meio da ação\ndiálogo\ndescrição\nera uma vez\nprimeiro vemos\nde repente",
      title: "O dia inesperado\nQuando tudo mudou\nUm encontro estranho\nAlgo que eu não entendi",
      introduction: "Tudo começou quando...\nEu percebi...\nNo início, tudo parecia normal...\nDe repente, algo aconteceu...",
      main_part: "Ele/ela viu...\nCheirava a...\nO som vinha de...\nO coração batia...\nOs pensamentos corriam...",
      ending: "No fim...\nEntão entendi...\nDepois disso...\nO mais importante foi...",
      content_check: "Eu vejo que...\nQuero deixar ... mais claro.\nO leitor entende...\nIsto faz sentido porque...",
      language_check: "Leio a frase em voz alta.\nVerifico letras maiúsculas.\nColoco ponto final.\nSubstituo palavras repetidas.",
      self_assessment: "aprendi\nmelhorei\nestou satisfeito com\npreciso de ajuda com\nna próxima vez vou",
    },
    themes: ["Narrativa", "Conto", "Descrição", "Conto de fadas", "Drama", "Ficção científica", "Policial", "Terror", "Fantasia", "Outro texto literário"],
    theme: "Narrativa",
    customTheme: "Outro texto literário",
    },
    factual: {
      assignment:
        "Escreva um texto factual que informe ou explique um tema.\n\nEscolha um tema claro e escreva para um leitor específico. O texto deve ter uma introdução clara, vários parágrafos com fatos, explicações e exemplos, e uma conclusão que reúna os pontos principais.\n\nUse palavras-chave e explique conceitos importantes. Se usar fatos de fontes, eles devem poder ser verificados.\n\nExtensão: ____ palavras.",
      criteria: [
        "Tema e objetivo claros",
        "Adaptado ao leitor",
        "Fatos e explicações ligados ao tema",
        "Exemplos tornam o conteúdo mais claro",
        "Palavras-chave e conceitos são explicados",
        "Introdução clara",
        "Parágrafos em ordem lógica",
        "Coerência e fio condutor",
        "Conclusão clara",
        "Fatos verificados em fontes quando necessário",
        "Linguagem factual precisa",
        "Ortografia e pontuação",
      ],
      support: {
        topic: "o tema é\nvou explicar\nvou informar sobre\nimportante porque\no leitor deve entender",
        purpose_audience: "o objetivo é\no leitor é\no leitor precisa\nquero explicar\nquero mostrar",
        key_terms: "termo\nsignifica\npode ser explicado como\npor exemplo\npalavra importante",
        facts_examples: "um fato importante é\npor exemplo\nisto mostra que\numa causa é\numa consequência é",
        discussion: "por um lado\npor outro lado\nalguns pensam\noutros pensam\nmesmo assim\nportanto",
        structure: "primeiro\ndepois\nem seguida\npor fim\no parágrafo trata de\na conclusão é",
        sources: "fonte\nsite\nlivro\nencontrei\npreciso verificar\nfontes confiáveis",
        title: "O que é...\nComo ... funciona\nPor que ... é importante\nUma explicação de...",
        introduction: "Este texto trata de...\nO objetivo é explicar...\nMuitas pessoas perguntam...\nPrimeiro, vamos ver...",
        main_part: "Em primeiro lugar...\nPor exemplo...\nIsto significa...\nUma causa é...\nUma consequência é...",
        ending: "Por fim...\nEm resumo...\nO mais importante é...\nPodemos portanto dizer...\nA conclusão é...",
        content_check: "O texto explica...\nO leitor entende...\nIncluí...\nFalta...\nIsto deve ficar mais claro...",
        structure_check: "A introdução...\nO desenvolvimento...\nOs parágrafos...\nA ordem...\nA transição...",
        fact_check: "Verifiquei...\nA fonte diz...\nIsto precisa ser verificado...\nTenho dúvida sobre...\nOs fatos estão corretos porque...",
        language_check: "Explico o termo.\nA frase é clara.\nUso ponto final.\nVario a linguagem.\nLeio em voz alta.",
        self_assessment: "aprendi\nexpliquei\nverifiquei\nestou satisfeito com\nna próxima vez vou",
      },
      themes: ["Texto informativo", "Texto explicativo", "Texto argumentativo", "Artigo", "Relatório", "Biografia", "Instrução", "Comparação", "Texto de discussão", "Outro texto factual"],
      theme: "Texto informativo",
      customTheme: "Outro texto factual",
    },
  },
};

function normalizeWritingLanguage(value: string): WritingLanguage {
  return LANGUAGES.includes(value as WritingLanguage) ? (value as WritingLanguage) : "nb";
}

function wordCountForLevel(level: string): number {
  return DEFAULT_WORD_COUNT_BY_LEVEL[level as (typeof LEVELS)[number]] ?? 200;
}

function defaultsFor(language: WritingLanguage, genre: WritingGenre) {
  return WRITING_DEFAULTS[language][genre];
}

function sectionsForGenre(genre: WritingGenre): SectionConfig[] {
  return genre === "factual" ? FACTUAL_SECTIONS : STORY_SECTIONS;
}

function lines(value: string, maxItems = 16): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

function ToggleControl({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-14 items-center justify-between gap-4 rounded-xl border px-3 py-2 text-left text-sm font-black transition ${
        checked
          ? "border-emerald-500 bg-emerald-700 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-900 hover:border-emerald-300"
      }`}
    >
      <span>{label}</span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
          checked ? "border-emerald-300 bg-white/25" : "border-slate-300 bg-slate-100"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full transition ${
            checked ? "left-6 bg-white" : "left-1 bg-slate-400"
          }`}
        />
      </span>
    </button>
  );
}

export default function ProducerTextNewPage() {
  return (
    <AuthGate>
      <ProducerTextNewInner />
    </AuthGate>
  );
}

function ProducerTextNewInner() {
  const t = useTranslations("producerTextNew");
  const locale = useLocale();
  const { profile, loading } = useUserProfile();
  const initialLanguage = normalizeWritingLanguage(locale);
  const initialGenre: WritingGenre = "story";
  const initialDefaults = defaultsFor(initialLanguage, initialGenre);

  const [title, setTitle] = useState("");
  const [assignmentText, setAssignmentText] = useState("");
  const [theme, setTheme] = useState(initialDefaults.theme);
  const [customTheme, setCustomTheme] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [genre, setGenre] = useState<WritingGenre>(initialGenre);
  const [level, setLevel] = useState("A2");
  const [language, setLanguage] = useState<WritingLanguage>(initialLanguage);
  const [targetWordCount, setTargetWordCount] = useState(wordCountForLevel("A2"));
  const [progression, setProgression] = useState<WritingProgression>("guided");
  const [criteriaText, setCriteriaText] = useState(initialDefaults.criteria.join("\n"));
  const [goalsText, setGoalsText] = useState("");
  const [supportBySection, setSupportBySection] = useState(initialDefaults.support);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiMaxUsesTotal, setAiMaxUsesTotal] = useState(20);
  const [aiMaxUsesPerSection, setAiMaxUsesPerSection] = useState(2);
  const [allowPrintImageUpload, setAllowPrintImageUpload] = useState(false);
  const [allowAiImage, setAllowAiImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [message, setMessage] = useState<{ text: string; showLibraryLink?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previousLanguageRef = useRef<WritingLanguage>(initialLanguage);
  const previousGenreRef = useRef<WritingGenre>(initialGenre);
  const previousLevelRef = useRef(level);
  const [supportOpen, setSupportOpen] = useState(false);
  const [aiControlOpen, setAiControlOpen] = useState(false);

  const canUse = profile?.role === "teacher" || profile?.role === "admin";
  const currentDefaults = defaultsFor(language, genre);
  const activeSections = sectionsForGenre(genre);
  const selectedTheme = theme === currentDefaults.customTheme ? customTheme.trim() : theme;
  const supportSectionsWithWords = activeSections.filter((section) => lines(supportBySection[section.id] ?? "").length > 0).length;
  const aiControlSummary = [
    aiEnabled ? t("settings.aiOn") : t("settings.aiOff"),
    t("aiControl.summaryTotal", { count: aiMaxUsesTotal }),
    t("aiControl.summarySection", { count: aiMaxUsesPerSection }),
    allowPrintImageUpload ? t("aiControl.summaryPrintOn") : t("aiControl.summaryPrintOff"),
    allowAiImage ? t("aiControl.summaryImageOn") : t("aiControl.summaryImageOff"),
  ].join(" · ");

  useEffect(() => {
    const previousLanguage = previousLanguageRef.current;
    if (previousLanguage === language) return;

    const previousDefaults = defaultsFor(previousLanguage, genre);
    const nextDefaults = defaultsFor(language, genre);
    const previousCriteria = previousDefaults.criteria.join("\n");
    const nextCriteria = nextDefaults.criteria.join("\n");

    setAssignmentText((current) => (current === previousDefaults.assignment ? nextDefaults.assignment : current));
    setCriteriaText((current) => (current === previousCriteria ? nextCriteria : current));
    setTheme((current) => {
      const previousThemeIndex = previousDefaults.themes.indexOf(current);
      return previousThemeIndex >= 0 ? nextDefaults.themes[previousThemeIndex] ?? nextDefaults.theme : current;
    });
    setSupportBySection((current) => {
      const nextSupport = { ...current };
      for (const section of activeSections) {
        const sectionId = section.id;
        if (current[sectionId] === previousDefaults.support[sectionId]) {
          nextSupport[sectionId] = nextDefaults.support[sectionId];
        }
      }
      return nextSupport;
    });

    previousLanguageRef.current = language;
  }, [activeSections, genre, language]);

  useEffect(() => {
    const previousGenre = previousGenreRef.current;
    if (previousGenre === genre) return;

    const nextDefaults = defaultsFor(language, genre);
    setTheme(nextDefaults.theme);
    setCustomTheme("");
    setAssignmentText("");
    setCriteriaText(nextDefaults.criteria.join("\n"));
    setSupportBySection(nextDefaults.support);
    setSupportOpen(false);
    previousGenreRef.current = genre;
  }, [genre, language]);

  useEffect(() => {
    const previousLevel = previousLevelRef.current;
    if (previousLevel === level) return;

    const previousDefault = wordCountForLevel(previousLevel);
    const nextDefault = wordCountForLevel(level);
    setTargetWordCount((current) => (current === previousDefault ? nextDefault : current));
    previousLevelRef.current = level;
  }, [level]);

  async function generateDraft() {
    setGeneratingDraft(true);
    setMessage(null);
    setError(null);

    try {
      const draft = await authedPost<GeneratedWritingDraft>("/api/teacher/writing-activities/generate-draft", {
        language,
        level,
        genre: selectedTheme || currentDefaults.theme,
        writingGenre: genre,
        supportSectionIds: activeSections.map((section) => section.id),
        targetWordCount,
        prompt: draftPrompt,
      });

      if (draft.title) setTitle(draft.title);
      if (draft.assignmentText) setAssignmentText(draft.assignmentText);
      if (Array.isArray(draft.criteria) && draft.criteria.length) {
        setCriteriaText(draft.criteria.join("\n"));
      }
      if (typeof draft.targetWordCount === "number" && Number.isFinite(draft.targetWordCount)) {
        setTargetWordCount(Math.max(20, Math.min(2000, Math.round(draft.targetWordCount))));
      }
      if (draft.supportWordsBySection) {
        setSupportBySection((current) => {
          const next = { ...current };
          for (const section of activeSections) {
            const words = draft.supportWordsBySection?.[section.id];
            if (Array.isArray(words) && words.length) {
              next[section.id] = words.map((word) => String(word).trim()).filter(Boolean).join("\n");
            }
          }
          return next;
        });
      }
      setMessage({ text: t("draftGenerator.applied") });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setGeneratingDraft(false);
    }
  }

  async function saveActivity() {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const payload = {
        title: title.trim() || t("fallbackTitle"),
        assignmentText,
        theme: selectedTheme,
        genre,
        level,
        language,
        targetWordCount,
        progression,
        criteria: lines(criteriaText),
        competenceGoals: lines(goalsText, 8),
        supportWordsBySection: Object.fromEntries(
          Object.entries(supportBySection).map(([sectionId, text]) => [sectionId, lines(text)])
        ),
        aiEnabled,
        aiMaxUsesTotal,
        aiMaxUsesPerSection,
        allowPrintImageUpload,
        allowAiImage,
      };

      await authedPost<{ activityId?: string }>("/api/teacher/writing-activities", payload);
      setMessage({ text: t("saved"), showLibraryLink: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mx-auto w-full max-w-5xl py-6 text-sm text-slate-600">{t("loading")}</div>;
  }

  if (!canUse) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
        {t("noAccess")}
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 pb-28">
      <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-black uppercase text-emerald-800">{t("eyebrow")}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-black text-slate-950">{t("title")}</h1>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-black uppercase text-amber-800">
                {t("beta")}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">{t("subtitle")}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <div className="flex min-w-64 items-center gap-3 rounded-2xl border border-sky-200 bg-white p-3 shadow-sm">
              <div className="grid h-14 w-20 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-100">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-700 text-sm font-black text-white">
                  {t("video.play")}
                </span>
              </div>
              <div>
                <div className="text-sm font-black text-slate-950">{t("video.title")}</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{t("video.text")}</p>
              </div>
            </div>
            <Link
              href={`/${locale}/teacher/writing`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              {t("backToWriting")}
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {["frame", "assignment", "support"].map((step, index) => (
            <div key={step} className="rounded-2xl border border-sky-100 bg-white/70 p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-sky-200 bg-sky-100 text-xs font-black text-slate-800">
                  {index + 1}
                </span>
                <h2 className="text-base font-black text-slate-950">{t(`steps.${step}.title`)}</h2>
              </div>
              <p className="mt-2 text-sm leading-5 text-slate-600">{t(`steps.${step}.text`)}</p>
            </div>
          ))}
        </div>
      </section>

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
          {message.text}
          {message.showLibraryLink ? (
            <>
              {" "}
              <Link href={`/${locale}/content?filter=writing`} className="underline">
                {t("openLibrary")}
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-black text-slate-950">{t("frame.title")}</h2>
          <p className="text-sm text-slate-600">{t("frame.subtitle")}</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.genre")}</span>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value as WritingGenre)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              {GENRES.map((value) => (
                <option key={value} value={value}>
                  {t(`genres.${value}`)}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{t(`genres.${genre}Description`)}</span>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.language")}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(normalizeWritingLanguage(e.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              {LANGUAGES.map((value) => (
                <option key={value} value={value}>{value.toUpperCase()}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{t("frame.languageHelp")}</span>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.level")}</span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              {LEVELS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.targetWordCount")}</span>
            <input
              type="number"
              min={20}
              max={2000}
              value={targetWordCount}
              onChange={(e) => setTargetWordCount(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </label>
        </div>

        <div className="mt-5">
          <h3 className="text-base font-black text-slate-950">{t("progression.title")}</h3>
          <p className="mt-1 text-sm text-slate-600">{t("progression.subtitle")}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {PROGRESSION_OPTIONS.map((value) => {
              const selected = progression === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setProgression(value)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-emerald-500 bg-emerald-50 shadow-sm"
                      : "border-slate-200 bg-slate-50 hover:border-emerald-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black text-slate-950">{t(`progression.${value}`)}</span>
                    <span
                      className={`h-4 w-4 rounded-full border ${
                        selected ? "border-emerald-700 bg-emerald-700" : "border-slate-300 bg-white"
                      }`}
                    />
                  </div>
                  <p className="mt-2 text-sm leading-5 text-slate-600">{t(`progression.${value}Text`)}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-black text-slate-950">{t(`writingType.${genre}.title`)}</h2>
          <p className="text-sm text-slate-600">{t(`writingType.${genre}.subtitle`)}</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.libraryTitle")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t(`fields.libraryTitlePlaceholder.${genre}`)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.theme")}</span>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              {currentDefaults.themes.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          {theme === currentDefaults.customTheme ? (
            <label className="block md:col-span-2">
              <span className="text-sm font-bold text-slate-900">{t("fields.customTheme")}</span>
              <input
                value={customTheme}
                onChange={(e) => setCustomTheme(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </label>
          ) : null}
          <label className="block md:col-span-2">
            <span className="text-sm font-bold text-slate-900">{t("fields.draftPrompt")}</span>
            <textarea
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              placeholder={t("fields.draftPromptPlaceholder")}
              rows={3}
              className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500"
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => void generateDraft()}
              disabled={generatingDraft}
              className="inline-flex items-center justify-center rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-violet-800 disabled:opacity-60"
            >
              {generatingDraft ? t("draftGenerator.generating") : t("draftGenerator.button")}
            </button>
            <span className="ml-3 align-middle text-xs font-semibold text-slate-500">{t("draftGenerator.help")}</span>
          </div>
        </div>
        <label className="mt-4 block">
          <span className="text-sm font-bold text-slate-900">{t("fields.assignmentText")}</span>
          <textarea
            value={assignmentText}
            onChange={(e) => setAssignmentText(e.target.value)}
            placeholder={currentDefaults.assignment}
            rows={8}
            className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">{t("criteria.title")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("criteria.subtitle")}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.criteria")}</span>
            <textarea
              value={criteriaText}
              onChange={(e) => setCriteriaText(e.target.value)}
              rows={9}
              className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.goals")}</span>
            <textarea
              value={goalsText}
              onChange={(e) => setGoalsText(e.target.value)}
              placeholder={t("fields.goalsPlaceholder")}
              rows={9}
              className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">{t("support.title")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("support.subtitle")}</p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              {t("support.summary", { active: supportSectionsWithWords, total: activeSections.length })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSupportOpen((open) => !open)}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-800 hover:bg-slate-50"
            aria-expanded={supportOpen}
          >
            {supportOpen ? t("support.close") : t("support.open")}
          </button>
        </div>
        {supportOpen ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {activeSections.map((section) => (
              <label key={section.id} className="block">
                <span className="text-sm font-bold text-slate-900">{t(section.labelKey)}</span>
                <textarea
                  value={supportBySection[section.id] ?? ""}
                  onChange={(e) =>
                    setSupportBySection((current) => ({
                      ...current,
                      [section.id]: e.target.value,
                    }))
                  }
                  rows={5}
                  className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500"
                />
              </label>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-emerald-950">{t("aiControl.title")}</h2>
            <p className="mt-1 text-sm text-emerald-900">{t("aiControl.subtitle")}</p>
            <p className="mt-2 text-xs font-semibold text-emerald-900">{aiControlSummary}</p>
          </div>
          <button
            type="button"
            onClick={() => setAiControlOpen((open) => !open)}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-black text-emerald-950 hover:bg-emerald-50"
            aria-expanded={aiControlOpen}
          >
            {aiControlOpen ? t("aiControl.close") : t("aiControl.open")}
          </button>
        </div>
        {aiControlOpen ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <ToggleControl
              label={aiEnabled ? t("settings.aiOn") : t("settings.aiOff")}
              checked={aiEnabled}
              onChange={setAiEnabled}
            />
            <label className="block">
              <span className="text-sm font-bold text-slate-900">{t("fields.aiTotal")}</span>
              <input
                type="number"
                min={0}
                max={80}
                value={aiMaxUsesTotal}
                onChange={(e) => setAiMaxUsesTotal(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs leading-5 text-emerald-900">{t("aiControl.totalHelp")}</span>
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-900">{t("fields.aiSection")}</span>
              <input
                type="number"
                min={0}
                max={5}
                value={aiMaxUsesPerSection}
                onChange={(e) => setAiMaxUsesPerSection(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs leading-5 text-emerald-900">{t("aiControl.sectionHelp")}</span>
            </label>
            <div className="grid gap-2">
              <ToggleControl label={t("settings.printImage")} checked={allowPrintImageUpload} onChange={setAllowPrintImageUpload} />
              <ToggleControl label={t("settings.aiImage")} checked={allowAiImage} onChange={setAllowAiImage} />
            </div>
          </div>
        ) : null}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_28px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-black text-slate-950">{t("bottom.title")}</div>
            <p className="text-xs leading-5 text-slate-600">{t("bottom.summary")}</p>
          </div>
          <button
            type="button"
            onClick={() => void saveActivity()}
            disabled={saving}
            className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    </main>
  );
}
