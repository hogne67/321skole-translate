import type { ReadingReviewCandidate } from "./semanticReview";

export const c1Quotes = {
  proposal: "Museet prøver gratis inngang på torsdager i åtte uker, med oppstart i september.",
  booking: "Alle besøk må bestilles i en mobilapp; tidligere kunne man også reservere på telefon.",
  meeting: "Resultatene presenteres i biblioteket klokken nitten i november.",
  director: "Direktøren ser offentlig relevans i bredden: et museum som når mange, har etter hans syn begrunnet sin plass.",
  educator: "Formidleren vurderer derimot verdien etter om møtet med kunsten forandrer blikket, selv når få kommer.",
  offline: "Flere av pensjonistene som museet særlig vil nå, har ingen smarttelefon.",
  increase: "Besøkstallene steg allerede måneden før billettprisen ble fjernet.",
  campaign: "Da hadde museet startet en annonsekampanje og åpnet en ny utstilling, mens inngangen fortsatt kostet det samme.",
  concession: "Prisen kan naturligvis ha holdt noen borte; det gjør ikke enhver senere økning til et mål på prisens betydning.",
  staff: "Samtidig reduseres vakttimene i salene, uten at noen mister stillingen sin.",
  label: "Brosjyren lover tettere kontakt med kunsten på egen hånd; hvem som skal svare når nysgjerrigheten trenger hjelp, omtales ikke.",
  tidy: "Ledelsen kaller sluttrapporten ryddig: uenige vurderinger fra ansatte flyttes til en fotnote, slik at hovedteksten kan tale med én stemme.",
  conclusion: "Forsøket kan gi verdifull kunnskap, forutsatt at besøkstall, formidling og presentasjonen av resultatene får bli undersøkt, ikke bare brukt som bekreftelse.",
};
const q = c1Quotes;
export const validC1: ReadingReviewCandidate = {
  text: `${q.proposal} ${q.booking} ${q.meeting}\n\n${q.director} ${q.educator} ${q.offline}\n\n${q.increase} ${q.campaign} ${q.concession}\n\n${q.staff} ${q.label} ${q.tidy} ${q.conclusion}`,
  tasks: {
    mcq: [
      { skill: "understand_attitude", prompt: "Hva antydes om brosjyrens løfte om nærhet til kunsten?", options: ["Den lovede nærheten kan skjule at publikum får mindre hjelp underveis", "Den lovede nærheten betyr at museet vil gi mer personlig veiledning enn før", "Den lovede nærheten er skribentens argument for å øke antallet besøkende"], correctAnswer: "Den lovede nærheten kan skjule at publikum får mindre hjelp underveis", evidence: [q.staff, q.label] },
      { skill: "understand_argument", prompt: "Hva gjør opplysningene om kampanjen og billettprisen med konklusjonen?", options: ["De utelukker at prisen kan ha betydning, siden besøkstallet allerede økte", "De lar en prisvirkning være mulig, men svekker veksten som bevis for den alene", "De viser at utstillingen alene forklarer hele økningen etter at inngangen ble gratis"], correctAnswer: "De lar en prisvirkning være mulig, men svekker veksten som bevis for den alene", evidence: [q.increase, q.campaign, q.concession] },
      { skill: "draw_inference", prompt: "Hvilken utfordring kan bestillingsmåten skape for museets mål?", options: ["En del av dem museet ønsker å nå, kan bli avskåret fra å bestille besøk", "De aktuelle pensjonistene kan fortsatt sikres bestilling ved at telefon og app brukes parallelt", "Pensjonistgruppen kan miste tilgangen samlet, fordi ingen i gruppen har digitale bestillingsmuligheter"], correctAnswer: "En del av dem museet ønsker å nå, kan bli avskåret fra å bestille besøk", evidence: [q.booking, q.offline] },
      { skill: "vocabulary_in_context", prompt: "Hva ligger i «ryddig» slik ordet brukes om rapporten?", options: ["En fremstilling som virker samlet fordi motstemmer får mindre plass", "En fremstilling der alle motstemmer får like stor plass i hovedteksten", "En fremstilling der alle tall er kontrollert og derfor gir sikre konklusjoner"], correctAnswer: "En fremstilling som virker samlet fordi motstemmer får mindre plass", evidence: [q.tidy] },
      { skill: "compare_perspectives", prompt: "Hvilken forskjell ligger bak direktørens og formidlerens vurderinger?", options: ["De bruker besøkstall som verdimål, men skiller seg i hvilke grupper de vil nå", "Direktøren vektlegger rekkevidde, mens formidleren vektlegger virkningen av besøket", "Direktøren vektlegger fordypning for få, mens formidleren vektlegger å nå flest mulig"], correctAnswer: "Direktøren vektlegger rekkevidde, mens formidleren vektlegger virkningen av besøket", evidence: [q.director, q.educator] },
    ],
    trueFalse: [
      { prompt: "Forsøket varer i åtte uker.", correctAnswer: true },
      { prompt: "Gratis inngang gjelder på tirsdager.", correctAnswer: false },
      { prompt: "Resultatene skal presenteres i biblioteket.", correctAnswer: true },
      { prompt: "Resultatene presenteres klokken sytten.", correctAnswer: false },
    ],
    bestSummary: {
      prompt: "Hvilket sammendrag passer best til hele teksten?",
      options: [
        "Museets forsøk kan gi kunnskap, men besøkstall og enighet må vurderes kritisk i lys av ulike verdimål og hvordan resultatene fremstilles.",
        "Museet tilbyr gratis inngang på torsdager i åtte uker og vil presentere resultatene i biblioteket en kveld i november.",
        "Direktøren forbinder museets relevans med å nå mange, mens formidleren legger vekt på hvordan kunsten kan påvirke den enkelte.",
      ],
      correctAnswer: "Museets forsøk kan gi kunnskap, men besøkstall og enighet må vurderes kritisk i lys av ulike verdimål og hvordan resultatene fremstilles.",
      optionEvidence: [[q.proposal, q.director, q.educator, q.concession, q.tidy, q.conclusion], [q.proposal, q.meeting], [q.director, q.educator]],
    },
  },
};

export function c1ReviewCases(): { name: string; candidate: ReadingReviewCandidate; expected: boolean }[] {
  const argumentLookup = structuredClone(validC1);
  argumentLookup.tasks.mcq[1] = { ...argumentLookup.tasks.mcq[1], prompt: "Når begynte besøkstallene å stige?", options: ["Måneden før inngangen ble gratis", "Måneden etter at inngangen ble gratis", "Først da rapporten ble presentert"], correctAnswer: "Måneden før inngangen ble gratis" };
  const explicitAttitude = structuredClone(validC1);
  explicitAttitude.tasks.mcq[0] = { ...explicitAttitude.tasks.mcq[0], prompt: "Hva mener direktøren begrunner museets plass?", options: ["At museet når mange", "At museet har få vakttimer", "At rapporten bare har en fotnote"], correctAnswer: "At museet når mange" };
  const explicitInference = structuredClone(validC1);
  explicitInference.text = explicitInference.text.replace(q.offline, `${q.offline} Dermed kan en del av dem museet ønsker å nå, bli avskåret fra å bestille besøk.`);
  const lostConnotation = structuredClone(validC1);
  lostConnotation.tasks.mcq[3] = { ...lostConnotation.tasks.mcq[3], prompt: "Hva betyr «ryddig» vanligvis?", options: ["Ordnet og oversiktlig", "Ukjent og uvanlig", "Trangt og mørkt"], correctAnswer: "Ordnet og oversiktlig" };
  const shallowComparison = structuredClone(validC1);
  shallowComparison.tasks.mcq[4] = { ...shallowComparison.tasks.mcq[4], prompt: "Hvem mener det er viktig å nå mange?", options: ["Direktøren", "Formidleren", "Pensjonistene"], correctAnswer: "Direktøren" };
  const distortedSummary = structuredClone(validC1);
  distortedSummary.tasks.bestSummary.options = [...distortedSummary.tasks.bestSummary.options.slice(0, 2), "Skribenten avviser forsøket fordi høye besøkstall aldri sier noe om museets verdi."];
  return [
    { name: "c1_valid", candidate: structuredClone(validC1), expected: true },
    { name: "c1_argument_lookup", candidate: argumentLookup, expected: false },
    { name: "c1_explicit_attitude", candidate: explicitAttitude, expected: false },
    { name: "c1_explicit_inference", candidate: explicitInference, expected: false },
    { name: "c1_dictionary_lookup", candidate: lostConnotation, expected: false },
    { name: "c1_shallow_comparison", candidate: shallowComparison, expected: false },
    { name: "c1_distorted_summary", candidate: distortedSummary, expected: false },
  ];
}
