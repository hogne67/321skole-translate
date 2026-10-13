/** Only an explicit teacher choice enables pasting; legacy and plugin lessons default to off. */
export function isAnswerPasteAllowed(value: unknown): boolean {
  return value === true;
}

export function answerPasteCopy(locale: string) {
  if (locale.startsWith("en")) return {
    label: "Do not allow pasting into students' answer fields",
    help: "Turn off if students may paste text or answers.",
    blocked: "Pasting text is not allowed in this assignment.",
  };
  if (locale.startsWith("pt")) return {
    label: "Não permitir colar nos campos de resposta dos alunos",
    help: "Desative se os alunos puderem colar texto ou respostas.",
    blocked: "Não é permitido colar texto nesta atividade.",
  };
  return {
    label: "Ikke tillat innliming i elevens svarfelt",
    help: "Slå av dersom eleven kan få lime inn tekst eller svar.",
    blocked: "Innliming av tekst er ikke tillatt i denne oppgaven.",
  };
}
