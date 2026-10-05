import type {
  ArithmeticLanguage,
  ArithmeticLayout,
  ArithmeticOperation,
} from "@/lib/math/arithmetic/types";

export const UI_COPY = {
  nb: {
    sectionLabel: "321school matematikk",
    title: "Regnearter",
    description:
      "Lag mengdetrening, oppstilt regning eller enkle ark med visuell støtte.",
    language: "Språk",
    operation: "Regneart",
    layout: "Oppsett",
    type: "Oppgavetype",
    taskCount: "Antall oppgaver",
    operandA: "Første tall",
    operandB: "Andre tall",
    operandHint:
      "Første felt styrer tallet som skjules. Andre felt styrer tallet som vises.",
    operandLabels: {
      additionA: "Første tall",
      additionB: "Andre tall",
      subtractionA: "Første tall",
      subtractionB: "Andre tall",
      multiplicationA: "Første faktor",
      multiplicationB: "Andre faktor",
      divisionA: "Tall som deles",
      divisionB: "Divisor",
      mixedA: "Første verdi",
      mixedB: "Andre verdi",
      missingA: "Ukjent tall",
      missingB: "Kjent tall",
      missingMultiplicationA: "Ukjent faktor",
      missingMultiplicationB: "Kjent faktor",
    },
    allowCarry: "Tillat tierovergang",
    allowCarryMissing: "Bruk oppgaver med tierovergang",
    allowBorrow: "Tillat lån",
    allowBorrowMissing: "Bruk oppgaver med lån",
    allowNegative: "Tillat negative svar",
    mixedOperations: "Regnearter i blandingen",
    answerKey: "Vis fasit",
    generate: "Lag regneark",
    generating: "Lager...",
    save: "Lagre til mitt innhold",
    saving: "Lagrer...",
    print: "Skriv ut",
    openContent: "Åpne i Mitt innhold",
    readyTitle: "Klar for første regneark",
    readyText:
      "Velg regneart, oppgavetype og oppsett. Forhåndsvisningen kommer her.",
    loginError: "Du må være logget inn.",
    generateError: "Kunne ikke lage arket.",
    saveError: "Kunne ikke lagre regnearket.",
    notSaved: "Arket ble ikke lagret.",
    generated: "Regnearket er laget.",
    saved: "Regnearket er lagret i Mitt innhold.",
    operations: {
      addition: "Addisjon",
      subtraction: "Subtraksjon",
      multiplication: "Multiplikasjon",
      division: "Divisjon",
      mixed: "Blandet",
    },
    layouts: {
      grid: "Mengdetrening",
      vertical: "Oppstilt under hverandre",
      visual: "Med figurer på lavt nivå",
    },
    taskTypes: {
      standard: "Vanlig",
      noTransitionAddition: "Uten tierovergang",
      withTransitionAddition: "Med tierovergang",
      noTransitionSubtraction: "Uten lån",
      withTransitionSubtraction: "Med lån",
      timesTable: "Gangetabell",
      twoDigitByOneDigit: "Tosifret x ensifret",
      wholeDivision: "Deling uten rest",
      missingNumber: "Ukjent ledd",
    },
    worksheet: {
      worksheet: "Arbeidsark",
      answerKeyTitle: "Fasit",
      name: "Navn",
      date: "Dato",
      classLabel: "Klasse",
      answer: "Svar",
    },
    brand: {
      school: "skole",
    },
  },
  en: {
    sectionLabel: "321school mathematics",
    title: "Arithmetic",
    description:
      "Create fluency practice, vertical calculations, or simple sheets with visual support.",
    language: "Language",
    operation: "Operation",
    layout: "Layout",
    type: "Problem type",
    taskCount: "Number of problems",
    operandA: "First number",
    operandB: "Second number",
    operandHint:
      "The first field controls the hidden number. The second field controls the visible number.",
    operandLabels: {
      additionA: "First number",
      additionB: "Second number",
      subtractionA: "First number",
      subtractionB: "Second number",
      multiplicationA: "First factor",
      multiplicationB: "Second factor",
      divisionA: "Number to divide",
      divisionB: "Divisor",
      mixedA: "First value",
      mixedB: "Second value",
      missingA: "Missing number",
      missingB: "Known number",
      missingMultiplicationA: "Missing factor",
      missingMultiplicationB: "Known factor",
    },
    allowCarry: "Allow regrouping",
    allowCarryMissing: "Use problems with regrouping",
    allowBorrow: "Allow borrowing",
    allowBorrowMissing: "Use problems with borrowing",
    allowNegative: "Allow negative answers",
    mixedOperations: "Operations in the mix",
    answerKey: "Show answer key",
    generate: "Create worksheet",
    generating: "Creating...",
    save: "Save to My content",
    saving: "Saving...",
    print: "Print",
    openContent: "Open in My content",
    readyTitle: "Ready for the first worksheet",
    readyText:
      "Choose operation, problem type, and layout. The preview will appear here.",
    loginError: "You must be signed in.",
    generateError: "Could not create the worksheet.",
    saveError: "Could not save the worksheet.",
    notSaved: "The worksheet was not saved.",
    generated: "The worksheet has been created.",
    saved: "The worksheet was saved to My content.",
    operations: {
      addition: "Addition",
      subtraction: "Subtraction",
      multiplication: "Multiplication",
      division: "Division",
      mixed: "Mixed",
    },
    layouts: {
      grid: "Fluency practice",
      vertical: "Vertical calculation",
      visual: "With visual support",
    },
    taskTypes: {
      standard: "Standard",
      noTransitionAddition: "Without regrouping",
      withTransitionAddition: "With regrouping",
      noTransitionSubtraction: "Without borrowing",
      withTransitionSubtraction: "With borrowing",
      timesTable: "Times table",
      twoDigitByOneDigit: "Two-digit x one-digit",
      wholeDivision: "Division without remainder",
      missingNumber: "Missing number",
    },
    worksheet: {
      worksheet: "Worksheet",
      answerKeyTitle: "Answer key",
      name: "Name",
      date: "Date",
      classLabel: "Class",
      answer: "Answer",
    },
    brand: {
      school: "school",
    },
  },
  pt: {
    sectionLabel: "321school matemática",
    title: "Operações",
    description:
      "Crie treino, conta armada ou fichas simples com apoio visual.",
    language: "Idioma",
    operation: "Operação",
    layout: "Formato",
    type: "Tipo de tarefa",
    taskCount: "Número de tarefas",
    operandA: "Primeiro número",
    operandB: "Segundo número",
    operandHint:
      "O primeiro campo controla o número escondido. O segundo campo controla o número visível.",
    operandLabels: {
      additionA: "Primeiro número",
      additionB: "Segundo número",
      subtractionA: "Primeiro número",
      subtractionB: "Segundo número",
      multiplicationA: "Primeiro fator",
      multiplicationB: "Segundo fator",
      divisionA: "Número a dividir",
      divisionB: "Divisor",
      mixedA: "Primeiro valor",
      mixedB: "Segundo valor",
      missingA: "Número em falta",
      missingB: "Número conhecido",
      missingMultiplicationA: "Fator em falta",
      missingMultiplicationB: "Fator conhecido",
    },
    allowCarry: "Permitir transporte",
    allowCarryMissing: "Usar tarefas com transporte",
    allowBorrow: "Permitir empréstimo",
    allowBorrowMissing: "Usar tarefas com empréstimo",
    allowNegative: "Permitir respostas negativas",
    mixedOperations: "Operações na mistura",
    answerKey: "Mostrar respostas",
    generate: "Criar ficha",
    generating: "A criar...",
    save: "Guardar em Meu conteúdo",
    saving: "A guardar...",
    print: "Imprimir",
    openContent: "Abrir em Meu conteúdo",
    readyTitle: "Pronto para a primeira ficha",
    readyText:
      "Escolha operação, tipo de tarefa e formato. A pré-visualização aparece aqui.",
    loginError: "Tem de iniciar sessão.",
    generateError: "Não foi possível criar a ficha.",
    saveError: "Não foi possível guardar a ficha.",
    notSaved: "A ficha não foi guardada.",
    generated: "A ficha foi criada.",
    saved: "A ficha foi guardada em Meu conteúdo.",
    operations: {
      addition: "Adição",
      subtraction: "Subtração",
      multiplication: "Multiplicação",
      division: "Divisão",
      mixed: "Mistas",
    },
    layouts: {
      grid: "Treino",
      vertical: "Conta armada",
      visual: "Com apoio visual",
    },
    taskTypes: {
      standard: "Normal",
      noTransitionAddition: "Sem transporte",
      withTransitionAddition: "Com transporte",
      noTransitionSubtraction: "Sem empréstimo",
      withTransitionSubtraction: "Com empréstimo",
      timesTable: "Tabuada",
      twoDigitByOneDigit: "Dois dígitos x um dígito",
      wholeDivision: "Divisão sem resto",
      missingNumber: "Número em falta",
    },
    worksheet: {
      worksheet: "Ficha",
      answerKeyTitle: "Respostas",
      name: "Nome",
      date: "Data",
      classLabel: "Turma",
      answer: "Resposta",
    },
    brand: {
      school: "escola",
    },
  },
} satisfies Record<
  ArithmeticLanguage,
  {
    sectionLabel: string;
    title: string;
    description: string;
    language: string;
    operation: string;
    layout: string;
    type: string;
    taskCount: string;
    operandA: string;
    operandB: string;
    operandHint: string;
    operandLabels: Record<
      | "additionA"
      | "additionB"
      | "subtractionA"
      | "subtractionB"
      | "multiplicationA"
      | "multiplicationB"
      | "divisionA"
      | "divisionB"
      | "mixedA"
      | "mixedB"
      | "missingA"
      | "missingB"
      | "missingMultiplicationA"
      | "missingMultiplicationB",
      string
    >;
    allowCarry: string;
    allowCarryMissing: string;
    allowBorrow: string;
    allowBorrowMissing: string;
    allowNegative: string;
    mixedOperations: string;
    answerKey: string;
    generate: string;
    generating: string;
    save: string;
    saving: string;
    print: string;
    openContent: string;
    readyTitle: string;
    readyText: string;
    loginError: string;
    generateError: string;
    saveError: string;
    notSaved: string;
    generated: string;
    saved: string;
    operations: Record<ArithmeticOperation, string>;
    layouts: Record<ArithmeticLayout, string>;
    taskTypes: Record<
      | "standard"
      | "noTransitionAddition"
      | "withTransitionAddition"
      | "noTransitionSubtraction"
      | "withTransitionSubtraction"
      | "timesTable"
      | "twoDigitByOneDigit"
      | "wholeDivision"
      | "missingNumber",
      string
    >;
    worksheet: Record<string, string>;
    brand: Record<string, string>;
  }
>;

export type ArithmeticUiCopy = (typeof UI_COPY)[ArithmeticLanguage];

export function copyValue(values: Record<string, string>, key: string) {
  return values[key] ?? key;
}
