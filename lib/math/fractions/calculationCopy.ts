import { normalizeMathWorksheetLanguage } from "@/lib/math/taxonomy";

const nb = {
  title: "Brøkregning", subtitle: "Mengdetrening med brøk.",
  operation: "Regneart", addition: "Addisjon", subtraction: "Subtraksjon", multiplication: "Multiplikasjon", division: "Divisjon", mixed: "Blandet",
  denominator: "Nevnere", same: "Like nevnere", different: "Ulike nevnere", minimum: "Minst", maximum: "Størst",
  differentRange: "Ulike nevnere krever at minst og størst er forskjellige.",
  requireReduced: "Krev forkortet svar", invalidRange: "Velg hele nevnere fra 2 til 100. Minste verdi kan ikke være større enn største.",
  instructions: "Regn ut oppgavene. Svar med brøk, ikke blandet tall. Hele svar skrives med nevner 1.", reducedInstructions: "Regn ut oppgavene. Forkort svarene så langt som mulig. Svar med brøk, ikke blandet tall. Hele svar skrives med nevner 1.",
  answerPlaceholder: "Svar", answerLabel: "Brøk", partial: "Delvis riktig", wrong: "Feil", unanswered: "Ubesvart", score: "Score",
  reduceFeedback: "Riktig verdi. Forkort brøken.", invalidAnswer: "Skriv både teller og nevner. Hele svar skrives med nevner 1.",
  emptyTitle: "Klar for første brøkregningsark",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  title: "Fraction arithmetic", subtitle: "Fraction fluency practice.",
  operation: "Operation", addition: "Addition", subtraction: "Subtraction", multiplication: "Multiplication", division: "Division", mixed: "Mixed",
  denominator: "Denominators", same: "Like denominators", different: "Unlike denominators", minimum: "Minimum", maximum: "Maximum",
  differentRange: "Unlike denominators require different minimum and maximum values.",
  requireReduced: "Require simplified answers", invalidRange: "Choose whole denominators from 2 to 100. The minimum cannot exceed the maximum.",
  instructions: "Calculate the answers. Use fractions, not mixed numbers. Write whole-number answers with denominator 1.", reducedInstructions: "Calculate the answers. Simplify each answer as far as possible. Use fractions, not mixed numbers. Write whole-number answers with denominator 1.",
  answerPlaceholder: "Answer", answerLabel: "Fraction", partial: "Partially correct", wrong: "Wrong", unanswered: "Unanswered", score: "Score",
  reduceFeedback: "Correct value. Simplify the fraction.", invalidAnswer: "Enter both numerator and denominator. Write whole-number answers with denominator 1.",
  emptyTitle: "Ready for your first fraction arithmetic worksheet",
};
const pt: Copy = {
  title: "Cálculo com frações", subtitle: "Prática de cálculo com frações.",
  operation: "Operação", addition: "Adição", subtraction: "Subtração", multiplication: "Multiplicação", division: "Divisão", mixed: "Misturado",
  denominator: "Denominadores", same: "Iguais", different: "Diferentes", minimum: "Mínimo", maximum: "Máximo",
  differentRange: "Denominadores diferentes exigem valores mínimo e máximo diferentes.",
  requireReduced: "Exigir respostas simplificadas", invalidRange: "Escolhe denominadores inteiros de 2 a 100. O mínimo não pode exceder o máximo.",
  instructions: "Calcula as respostas. Responde com frações, não com números mistos. Escreve as respostas inteiras com denominador 1.", reducedInstructions: "Calcula as respostas. Simplifica cada resposta o máximo possível. Responde com frações, não com números mistos. Escreve as respostas inteiras com denominador 1.",
  answerPlaceholder: "Resposta", answerLabel: "Fração", partial: "Parcialmente correto", wrong: "Incorreto", unanswered: "Sem resposta", score: "Pontuação",
  reduceFeedback: "Valor correto. Simplifica a fração.", invalidAnswer: "Escreve o numerador e o denominador. Escreve as respostas inteiras com denominador 1.",
  emptyTitle: "Pronto para a primeira ficha de cálculo com frações",
};
export function getCalculationCopy(language: unknown): Copy {
  return { nb, en, pt }[normalizeMathWorksheetLanguage(language)];
}
