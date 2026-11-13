const nb = {
  generate: "Lag oppgaver", busy: "Arbeider…", save: "Lagre til mitt innhold",
  share: "Del til Space", print: "Skriv ut / lagre som PDF",
  loading: "Åpner lagret oppgaveark…", loadFailed: "Kunne ikke åpne oppgavearket. Kontroller at det fortsatt finnes og at du har tilgang.",
  login: "Logg inn for å lagre og dele.", failed: "Kunne ikke lagre oppgavearket. Prøv igjen.",
  saved: "Lagret i mitt innhold.", shared: "Delt til Space.",
  closed: "Dette rommet er stengt for deling.", noMatches: "Ingen rom passer med søket.",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  generate: "Create tasks", busy: "Working…", save: "Save to My Content",
  share: "Share to Space", print: "Print / save as PDF",
  loading: "Opening saved worksheet…", loadFailed: "Could not open the worksheet. Check that it still exists and you have access.",
  login: "Sign in to save and share.", failed: "Could not save the worksheet. Try again.",
  saved: "Saved to My Content.", shared: "Shared to Space.",
  closed: "This Space is closed for sharing.", noMatches: "No Spaces match your search.",
};
const pt: Copy = {
  generate: "Criar exercícios", busy: "A processar…", save: "Guardar no Meu conteúdo",
  share: "Partilhar no Space", print: "Imprimir / guardar como PDF",
  loading: "A abrir a ficha guardada…", loadFailed: "Não foi possível abrir a ficha. Verifica se ainda existe e se tens acesso.",
  login: "Inicia sessão para guardar e partilhar.", failed: "Não foi possível guardar a ficha. Tenta novamente.",
  saved: "Guardado no Meu conteúdo.", shared: "Partilhado no Space.",
  closed: "Este Space está fechado para partilha.", noMatches: "Nenhum Space corresponde à pesquisa.",
};
export function getMathEditorCopy(language: string): Copy {
  return language === "en" ? en : language === "pt" ? pt : nb;
}
