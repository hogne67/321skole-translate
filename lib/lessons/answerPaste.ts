/** Only an explicit teacher choice enables pasting; legacy and plugin lessons default to off. */
export function isAnswerPasteAllowed(value: unknown): boolean {
  return value === true;
}

export function answerPasteCopy(locale: string) {
  if (locale.startsWith("en")) return {
    heading: "Pasting into students' answer fields",
    disallowed: "Not allowed",
    disallowedHelp: "Students write their own answers.",
    allowed: "Allowed",
    allowedHelp: "Students may paste text into the answer fields.",
    defaultLabel: "Default",
    blocked: "Pasting text is not allowed in this assignment.",
  };
  if (locale.startsWith("pt")) return {
    heading: "Colar nos campos de resposta dos alunos",
    disallowed: "Não permitido",
    disallowedHelp: "Os alunos escrevem as próprias respostas.",
    allowed: "Permitido",
    allowedHelp: "Os alunos podem colar texto nos campos de resposta.",
    defaultLabel: "Padrão",
    blocked: "Não é permitido colar texto nesta atividade.",
  };
  return {
    heading: "Innliming i elevens svarfelt",
    disallowed: "Ikke tillatt",
    disallowedHelp: "Eleven skriver svarene selv.",
    allowed: "Tillatt",
    allowedHelp: "Eleven kan lime inn tekst i svarfeltene.",
    defaultLabel: "Standard",
    blocked: "Innliming av tekst er ikke tillatt i denne oppgaven.",
  };
}
