import type { ReadingReviewCandidate } from "./semanticReview";

export const b2Quotes = {
  proposal: "Kommunen vil prøve gratis buss på lørdager i seks uker.",
  frequency: "Avgangene skal gå hvert tjuende minutt, slik de gjør i dag.",
  example: "I en nabokommune ble antallet bussreisende doblet under et lignende forsøk.",
  contrast: "Likevel viste tellingene der omtrent like mange biler i sentrum som før.",
  jonas: "Jonas, som leder handelsforeningen, mener billettprisen er den viktigste terskelen for å velge buss.",
  jonasReason: "Han støtter forsøket fordi en lavere pris kan få flere kunder til å la bilen stå.",
  mira: "Mira fra beboerutvalget ønsker også mindre biltrafikk, men sier at hyppige og pålitelige avganger er viktigere for henne enn gratis billetter.",
  capacity: "Samtidig er alle sitteplassene allerede opptatt på de travleste lørdagsavgangene.",
  budget: "Kommunen har ikke satt av penger til ekstra busser i forsøksperioden.",
  attitude: "Jeg mener kommunen bør gjennomføre et avgrenset forsøk, men bare dersom virkningen vurderes bredere enn antall reisende.",
  measurement: "Biltrafikken må telles både før og under forsøket, og erfaringene til dem som ikke tar buss, må også komme fram.",
  expression: "Gratisbilletter må ikke bli et frikort til å la rutetilbudet stå urørt.",
  meeting: "Resultatene skal presenteres i et åpent møte i juni før noen bestemmer om ordningen skal fortsette.",
};
const q = b2Quotes;
export const validB2: ReadingReviewCandidate = {
  text: `${q.proposal} ${q.frequency} ${q.example} ${q.contrast} Det er derfor fristende, men for tidlig, å bruke passasjertall alene som bevis på mindre biltrafikk.\n\n${q.jonas} ${q.jonasReason} ${q.mira} Hun vil derfor prioritere bedre rutetider.\n\n${q.capacity} ${q.budget} Et høyere passasjertall er likevel et av målene som skal rapporteres. Når kommunen omtaler forsøket som en løsning på transportproblemene, bør ordet løsning altså brukes med varsomhet. En vellykket kampanje er ikke nødvendigvis det samme som et bedre tilbud.\n\n${q.attitude} ${q.measurement} ${q.expression} ${q.meeting}`,
  tasks: {
    mcq: [
      { prompt: "Hvordan stiller skribenten seg til forsøket?", options: ["Støtter en utprøving, men vil at også de som ikke tar buss skal bli hørt", "Støtter en varig ordning, så lenge busselskapet kan vise til flere reisende", "Vil utsette forsøket til beboerutvalget og handelsforeningen er enige om billettprisen"], correctAnswer: "Støtter en utprøving, men vil at også de som ikke tar buss skal bli hørt", skill: "understand_attitude", evidence: [q.attitude, q.measurement] },
      { prompt: "Hva gjør eksemplet fra nabokommunen i teksten?", options: ["Beviser at gratis billetter ikke påvirker hvor mange som tar buss", "Viser at økt bussbruk ikke nødvendigvis betyr mindre biltrafikk", "Viser at handelsforeningen har undersøkt hvem som lar bilen stå"], correctAnswer: "Viser at økt bussbruk ikke nødvendigvis betyr mindre biltrafikk", skill: "understand_argument", evidence: [q.example, q.contrast] },
      { prompt: "Hva kan bli en utfordring hvis forsøket tiltrekker flere reisende?", options: ["Budsjettet gir rom for å sette inn ekstra busser ved behov", "Prisendringen kan gjøre de travleste avgangene mindre fulle", "Økt interesse kan forsterke et kapasitetsproblem som allerede finnes"], correctAnswer: "Økt interesse kan forsterke et kapasitetsproblem som allerede finnes", skill: "draw_inference", evidence: [q.capacity, q.budget] },
      { prompt: "Hva betyr «frikort» i denne sammenhengen?", options: ["En gratis billett som alle beboere skal få", "En anledning til å slippe å forbedre rutetilbudet", "En garanti for at forsøket får gode resultater"], correctAnswer: "En anledning til å slippe å forbedre rutetilbudet", skill: "vocabulary_in_context", evidence: [q.expression] },
      { prompt: "Hvordan skiller Jonas og Mira seg fra hverandre?", options: ["De ønsker færre biler, men vektlegger pris og rutetilbud ulikt", "De er enige om at gratisbilletter er viktigere enn pålitelige avganger", "Jonas vektlegger pris, mens Mira er uenig i målet om mindre biltrafikk"], correctAnswer: "De ønsker færre biler, men vektlegger pris og rutetilbud ulikt", skill: "compare_perspectives", evidence: [q.jonas, q.jonasReason, q.mira] },
    ],
    trueFalse: [
      { prompt: "Forsøket skal vare i seks uker.", correctAnswer: true },
      { prompt: "Det skal gå buss hvert tiende minutt under forsøket.", correctAnswer: false },
      { prompt: "Skribenten vil at biltrafikken bare skal telles etter forsøket.", correctAnswer: false },
      { prompt: "Resultatene skal presenteres i et åpent møte.", correctAnswer: true },
    ],
    bestSummary: {
      prompt: "Hvilket sammendrag passer best til hele teksten?",
      options: [
        "Gratis buss bør prøves forsiktig, og vurderingen må omfatte mer enn passasjertall før en videreføring avgjøres.",
        "Nabokommunen fikk flere bussreisende under et lignende forsøk, samtidig som tellingene viste omtrent uendret biltrafikk i sentrum.",
        "Jonas vektlegger billettprisen, mens Mira legger større vekt på hyppige og pålitelige avganger for å redusere biltrafikken.",
      ],
      correctAnswer: "Gratis buss bør prøves forsiktig, og vurderingen må omfatte mer enn passasjertall før en videreføring avgjøres.",
      optionEvidence: [[q.proposal, q.attitude, q.measurement], [q.example, q.contrast], [q.jonas, q.jonasReason, q.mira]],
    },
  },
};

export function b2ReviewCases(): { name: string; candidate: ReadingReviewCandidate; expected: boolean }[] {
  const argumentLookup = structuredClone(validB2);
  argumentLookup.tasks.mcq[1] = { ...argumentLookup.tasks.mcq[1], prompt: "Hvor mange ganger så mange tok buss i nabokommunen?", options: ["To ganger", "Tre ganger", "Fire ganger"], correctAnswer: "To ganger" };
  const lostQualification = structuredClone(validB2);
  lostQualification.tasks.mcq[0].correctAnswer = lostQualification.tasks.mcq[0].options[1];
  const inferenceLookup = structuredClone(validB2);
  inferenceLookup.tasks.mcq[2] = { ...inferenceLookup.tasks.mcq[2], prompt: "Hva mangler det penger til i forsøket?", options: ["Ekstra busser", "Telling av biltrafikk", "Det åpne møtet"], correctAnswer: "Ekstra busser" };
  const vocabularyLookup = structuredClone(validB2);
  vocabularyLookup.tasks.mcq[3] = { ...vocabularyLookup.tasks.mcq[3], prompt: "Hvilket ord står i siste avsnitt?", options: ["Frikort", "Billettkontroll", "Sykkelvei"], correctAnswer: "Frikort" };
  const singlePerspective = structuredClone(validB2);
  singlePerspective.tasks.mcq[4] = { ...singlePerspective.tasks.mcq[4], prompt: "Hva prioriterer Mira?", options: ["Gratis billetter", "Bedre rutetider", "Flere parkeringsplasser"], correctAnswer: "Bedre rutetider" };
  const swappedPerspectives = structuredClone(validB2);
  swappedPerspectives.tasks.mcq[4] = { ...swappedPerspectives.tasks.mcq[4], options: ["Jonas vektlegger rutetider, mens Mira mener pris er den viktigste terskelen", ...swappedPerspectives.tasks.mcq[4].options.slice(1)], correctAnswer: "Jonas vektlegger rutetider, mens Mira mener pris er den viktigste terskelen" };
  const unsupportedSummary = structuredClone(validB2);
  unsupportedSummary.tasks.bestSummary.options = [...unsupportedSummary.tasks.bestSummary.options.slice(0, 2), "Skribenten vil ha permanent gratis buss fordi flere passasjerer beviser at biltrafikken går ned."];
  return [
    { name: "b2_valid", candidate: structuredClone(validB2), expected: true },
    { name: "b2_argument_lookup", candidate: argumentLookup, expected: false },
    { name: "b2_lost_qualification", candidate: lostQualification, expected: false },
    { name: "b2_inference_lookup", candidate: inferenceLookup, expected: false },
    { name: "b2_vocabulary_lookup", candidate: vocabularyLookup, expected: false },
    { name: "b2_single_perspective", candidate: singlePerspective, expected: false },
    { name: "b2_swapped_perspectives", candidate: swappedPerspectives, expected: false },
    { name: "b2_unsupported_summary", candidate: unsupportedSummary, expected: false },
  ];
}
