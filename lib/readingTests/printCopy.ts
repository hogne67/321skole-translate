const nb = {
  open: "Utskrift / PDF", close: "Lukk forhåndsvisning", title: "Forhåndsvis utskrift",
  description: "Skriv ut fra nettleseren, eller velg «Lagre som PDF» i utskriftsdialogen. Elevark og fasit skrives ut hver for seg. Bruker du egen tekst, må du sjekke innholdet før utdeling.",
  print: "Skriv ut / lagre PDF", printing: "Klargjør utskrift …", printError: "Kunne ikke åpne utskriftsdialogen. Prøv igjen.",
  mode: "Velg ark", learner: "Elevark", key: "Lærerark / fasit",
  defaultTitle: "Leseprøve", layout: "Plassering av oppgaver", automatic: "Automatisk", afterText: "Etter teksten", newPage: "Oppgaver på ny side",
  backToTest: "Tilbake til leseprøven",
  layoutHelp: "Automatisk legger oppgavene etter teksten når hele prøven får god plass på ett A4-ark. Ellers starter oppgavene på neste side.",
  calculating: "Beregner sideoppsett …", autoAfterText: "Automatisk: Oppgavene følger etter teksten.", autoNewPage: "Automatisk: Oppgavene starter på neste side.",
  unsupportedTasks: "Prøven inneholder oppgaver som ikke kan skrives ut med dette oppsettet. Kontroller oppgavene før utskrift.",
  name: "Navn", date: "Dato", level: "Nivå", tasks: "Oppgaver", reading: "Les teksten",
  instructions: "Les teksten. Kryss av for ett svar i hver oppgave.",
  trueLabel: "Sant", falseLabel: "Usant", answer: "Riktig svar", missingAnswer: "Kontroller fasiten før bruk.",
  teacherNote: "Sjekk tekst, oppgaver og fasit før utdeling. Bruk svarene som grunnlag for videre undervisning. Resultatet alene fastsetter ikke elevens språknivå.",
  brand: "321skole · Kartlegging og prøver", incomplete: "Legg til tekst og minst én aktiv oppgave for å forhåndsvise utskrift.",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  open: "Print / PDF", close: "Close preview", title: "Print preview",
  description: "Print from your browser, or choose Save as PDF in the print dialog. Print learner sheets and answer keys separately. Check your own text before handing it out.",
  print: "Print / save PDF", printing: "Preparing print …", printError: "Could not open the print dialog. Please try again.",
  mode: "Choose sheet", learner: "Learner sheet", key: "Teacher sheet / answer key",
  defaultTitle: "Reading test", layout: "Question placement", automatic: "Automatic", afterText: "After the text", newPage: "Questions on a new page",
  backToTest: "Back to the reading test",
  layoutHelp: "Automatic places questions after the text when the complete test fits comfortably on one A4 sheet. Otherwise, questions start on the next page.",
  calculating: "Calculating page layout …", autoAfterText: "Automatic: Questions follow the text.", autoNewPage: "Automatic: Questions start on the next page.",
  unsupportedTasks: "The test contains tasks that this layout cannot print. Check the tasks before printing.",
  name: "Name", date: "Date", level: "Level", tasks: "Questions", reading: "Read the text",
  instructions: "Read the text. Tick one answer for each question.",
  trueLabel: "True", falseLabel: "False", answer: "Correct answer", missingAnswer: "Check the answer key before use.",
  teacherNote: "Check the text, questions and answer key before use. Use the answers to inform further teaching. The result alone does not determine a learner's language level.",
  brand: "321school · Assessments and tests", incomplete: "Add a text and at least one active question to preview printing.",
};
const pt: Copy = {
  open: "Imprimir / PDF", close: "Fechar pré-visualização", title: "Pré-visualização de impressão",
  description: "Imprima a partir do navegador ou escolha Guardar como PDF na janela de impressão. Imprima as fichas dos alunos e as soluções em separado. Verifique o seu próprio texto antes de o distribuir.",
  print: "Imprimir / guardar PDF", printing: "A preparar a impressão …", printError: "Não foi possível abrir a janela de impressão. Tente novamente.",
  mode: "Escolher ficha", learner: "Ficha do aluno", key: "Ficha do professor / soluções",
  defaultTitle: "Prova de leitura", layout: "Posição das perguntas", automatic: "Automático", afterText: "Após o texto", newPage: "Perguntas numa nova página",
  backToTest: "Voltar à prova de leitura",
  layoutHelp: "O modo automático coloca as perguntas após o texto quando a prova completa cabe numa folha A4 com espaço suficiente. Caso contrário, as perguntas começam na página seguinte.",
  calculating: "A calcular a paginação …", autoAfterText: "Automático: As perguntas seguem o texto.", autoNewPage: "Automático: As perguntas começam na página seguinte.",
  unsupportedTasks: "A prova contém exercícios que este formato não consegue imprimir. Verifique os exercícios antes de imprimir.",
  name: "Nome", date: "Data", level: "Nível", tasks: "Perguntas", reading: "Leia o texto",
  instructions: "Leia o texto. Assinale uma resposta por pergunta.",
  trueLabel: "Verdadeiro", falseLabel: "Falso", answer: "Resposta correta", missingAnswer: "Verifique as soluções antes de utilizar.",
  teacherNote: "Verifique o texto, as perguntas e as soluções antes de utilizar. Use as respostas para orientar o ensino. O resultado, por si só, não determina o nível linguístico do aluno.",
  brand: "321school · Avaliação e provas", incomplete: "Adicione um texto e pelo menos uma pergunta ativa para pré-visualizar a impressão.",
};

export function getReadingTestPrintCopy(locale: string): Copy {
  return locale === "en" ? en : locale === "pt" ? pt : nb;
}
