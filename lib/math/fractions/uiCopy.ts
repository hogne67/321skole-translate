import { normalizeMathWorksheetLanguage } from "@/lib/math/taxonomy";

const nb = {
  brand: "321school matematikk", title: "Brøk", subtitle: "Brøk som del av en helhet.",
  taskType: "Oppgavetype", mixed: "Blandet", shade: "Fargelegg brøk", write: "Skriv brøken", choose: "Velg riktig brøk",
  taskCount: "Antall oppgaver", parts: "Deler i helheten", minimum: "Minst", maximum: "Flest",
  visualModel: "Figurer", bar: "Brøkstripe", rectangle: "Rektangel", circle: "Sirkel", selectFigure: "Velg minst én figur",
  hints: "Vis hint", answerKey: "Vis fasit", answerKeyTitle: "Fasit", hint: "Hint",
  generate: "Lag brøkark", generating: "Lager...", save: "Lagre til mitt innhold", saving: "Lagrer...",
  share: "Del til Spaces", sharing: "Deler...", print: "Skriv ut / lagre som PDF", openContent: "Åpne Mitt innhold",
  emptyTitle: "Klar for første brøkark", saved: "Brøkarket er lagret i mitt innhold.", savedChooseSpace: "Brøkarket er lagret. Velg Space.", shared: "Brøkarket er delt til Spaces.",
  generateFailed: "Kunne ikke lage brøkarket.", saveFailed: "Kunne ikke lagre brøkarket.", shareFailed: "Kunne ikke dele brøkarket.", login: "Du må være logget inn for å lagre eller dele.", invalidRange: "Velg mellom 2 og 12 deler. Minste verdi kan ikke være større enn største.",
  selectSpace: "Velg Space", searchSpaces: "Søk etter navn eller kode", loadingSpaces: "Laster Spaces...", noSpaces: "Ingen Spaces funnet.", untitledSpace: "Space uten navn", close: "Lukk", code: "Kode", open: "Åpent", closed: "Lukket", shareHere: "Del hit",
  school: "skole", worksheet: "Arbeidsark", name: "Navn", date: "Dato", classLabel: "Klasse", answer: "Svar", task: "Oppgave", numerator: "Teller", denominator: "Nevner",
  shaded: "fargelagte deler", part: "Del", of: "av", marked: "Markert", answered: "Besvart", correct: "Riktig", tryAgain: "Ikke helt. Prøv igjen.", correctAnswer: "Ikke helt. Riktig svar er",
  shadePrompt: "Fargelegg", writePrompt: "Skriv brøken som er fargelagt.",
};

type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  brand: "321school mathematics", title: "Fractions", subtitle: "Fractions as parts of a whole.",
  taskType: "Task type", mixed: "Mixed", shade: "Shade a fraction", write: "Write the fraction", choose: "Choose the correct fraction",
  taskCount: "Number of tasks", parts: "Parts in the whole", minimum: "Minimum", maximum: "Maximum",
  visualModel: "Figures", bar: "Fraction strip", rectangle: "Rectangle", circle: "Circle", selectFigure: "Select at least one figure",
  hints: "Show hints", answerKey: "Show answer key", answerKeyTitle: "Answer key", hint: "Hint",
  generate: "Create worksheet", generating: "Creating...", save: "Save to my content", saving: "Saving...",
  share: "Share to Spaces", sharing: "Sharing...", print: "Print / save as PDF", openContent: "Open My content",
  emptyTitle: "Ready for your first fraction worksheet", saved: "The worksheet is saved to my content.", savedChooseSpace: "The worksheet is saved. Select a Space.", shared: "The worksheet is shared to Spaces.",
  generateFailed: "Could not create the worksheet.", saveFailed: "Could not save the worksheet.", shareFailed: "Could not share the worksheet.", login: "Sign in to save or share.", invalidRange: "Choose between 2 and 12 parts. The minimum cannot exceed the maximum.",
  selectSpace: "Select Space", searchSpaces: "Search by name or code", loadingSpaces: "Loading Spaces...", noSpaces: "No Spaces found.", untitledSpace: "Untitled Space", close: "Close", code: "Code", open: "Open", closed: "Closed", shareHere: "Share here",
  school: "school", worksheet: "Worksheet", name: "Name", date: "Date", classLabel: "Class", answer: "Answer", task: "Task", numerator: "Numerator", denominator: "Denominator",
  shaded: "shaded parts", part: "Part", of: "of", marked: "Marked", answered: "Answered", correct: "Correct", tryAgain: "Not quite. Try again.", correctAnswer: "Not quite. The correct answer is",
  shadePrompt: "Shade", writePrompt: "Write the fraction that is shaded.",
};
const pt: Copy = {
  brand: "321school matemática", title: "Frações", subtitle: "Frações como partes de um todo.",
  taskType: "Tipo de tarefa", mixed: "Misturado", shade: "Pinta a fração", write: "Escreve a fração", choose: "Escolhe a fração correta",
  taskCount: "Número de tarefas", parts: "Partes do todo", minimum: "Mínimo", maximum: "Máximo",
  visualModel: "Figuras", bar: "Barra de frações", rectangle: "Retângulo", circle: "Círculo", selectFigure: "Seleciona pelo menos uma figura",
  hints: "Mostrar dicas", answerKey: "Mostrar soluções", answerKeyTitle: "Soluções", hint: "Dica",
  generate: "Criar ficha", generating: "A criar...", save: "Guardar no meu conteúdo", saving: "A guardar...",
  share: "Partilhar no Spaces", sharing: "A partilhar...", print: "Imprimir / guardar em PDF", openContent: "Abrir O meu conteúdo",
  emptyTitle: "Pronto para a primeira ficha de frações", saved: "A ficha foi guardada no meu conteúdo.", savedChooseSpace: "A ficha foi guardada. Seleciona um Space.", shared: "A ficha foi partilhada no Spaces.",
  generateFailed: "Não foi possível criar a ficha.", saveFailed: "Não foi possível guardar a ficha.", shareFailed: "Não foi possível partilhar a ficha.", login: "Inicia sessão para guardar ou partilhar.", invalidRange: "Escolhe entre 2 e 12 partes. O mínimo não pode exceder o máximo.",
  selectSpace: "Seleciona um Space", searchSpaces: "Pesquisar por nome ou código", loadingSpaces: "A carregar Spaces...", noSpaces: "Nenhum Space encontrado.", untitledSpace: "Space sem nome", close: "Fechar", code: "Código", open: "Aberto", closed: "Fechado", shareHere: "Partilhar aqui",
  school: "escola", worksheet: "Ficha", name: "Nome", date: "Data", classLabel: "Turma", answer: "Resposta", task: "Tarefa", numerator: "Numerador", denominator: "Denominador",
  shaded: "partes pintadas", part: "Parte", of: "de", marked: "Marcadas", answered: "Respondidas", correct: "Correto", tryAgain: "Ainda não. Tenta novamente.", correctAnswer: "Ainda não. A resposta correta é",
  shadePrompt: "Pinta", writePrompt: "Escreve a fração que está pintada.",
};

export function getFractionCopy(language: unknown): Copy {
  return { nb, en, pt }[normalizeMathWorksheetLanguage(language)];
}
