import type { ReadingReviewCandidate } from "./semanticReview";

export const c2Quotes = {
  trial: "Byarkivet prøver ny digital tilgang i seks uker fra mars.",
  requirement: "De som vil bestride en klassifisering, må legge fram originalskjemaet på papir.",
  destruction: "Under overføringen beholdes bare bildene, mens papirskjemaene makuleres.",
  meeting: "Resultatene legges fram i rådhuset klokken atten i mai.",
  archivist: "Arkivlederen kaller et trofast gjengitt dokument en vellykket tilgjengeliggjøring.",
  historian: "Historikeren minner om at et feilfritt bilde også kan gjengi et utvalg uten å vise hvem som ble utelatt.",
  agreement: "De bestrider ikke hverandres observasjoner; spørsmålet er hvor langt observasjonene bærer.",
  improvement: "Første måling viser kortere søketid, noe det ville være urimelig å avfeie.",
  confounder: "Men personalet hadde samtidig ryddet katalogen og fjernet dubletter før den nye løsningen kom.",
  limit: "Det som kan tale for bedre drift, avgjør dermed ikke hvilken endring som virket, langt mindre om samlingen er representativ.",
  courtesy: "Man får nesten lyst til å gratulere dem som nå beskriver publikum som «selvhjulpne».",
  help: "Den veiledede åpningstiden er nettopp halvert, uten at behovet for hjelp er undersøkt.",
  resolved: "I sluttrapporten er motforestillingene «avklart» ved å bli flyttet til et vedlegg; de er fortsatt uenige, bare mindre synlige.",
  conclusion: "Forsøket fortjener å prøves, men ikke at dets foreløpige bekvemmelighet får opptre som et ferdig svar.",
};
const q = c2Quotes;
export const validC2: ReadingReviewCandidate = {
  text: `${q.trial} ${q.requirement} ${q.destruction} ${q.meeting}\n\n${q.archivist} ${q.historian} ${q.agreement}\n\n${q.improvement} ${q.confounder} ${q.limit}\n\n${q.courtesy} ${q.help} ${q.resolved} ${q.conclusion}`,
  tasks: {
    mcq: [
      {skill: "understand_attitude", prompt: "Hvordan oppfatter skribenten betegnelsen «selvhjulpne»?", options: ["Anerkjennelsen holdes tilbake: mindre hjelp dokumenterer ikke større selvstendighet", "Anerkjennelsen gjelder at undersøkelsen har vist et mindre behov for veiledning", "Anerkjennelsen gjelder hele forsøket, siden skribenten vil at det skal prøves"], correctAnswer: "Anerkjennelsen holdes tilbake: mindre hjelp dokumenterer ikke større selvstendighet", evidence: [q.courtesy, q.help, q.conclusion]},
      {skill: "understand_argument", prompt: "Hva gjør opplysningene om katalogen med argumentet?", options: ["De beviser at digitaliseringen ikke kan ha bidratt til kortere søketid", "De lar forbedringen stå, men begrenser hva den viser om årsak og kvalitet", "De gjør søketiden til et tilstrekkelig mål på om samlingen er representativ"], correctAnswer: "De lar forbedringen stå, men begrenser hva den viser om årsak og kvalitet", evidence: [q.improvement, q.confounder, q.limit]},
      {skill: "draw_inference", prompt: "Hva kan bli en følge for dem som klager?", options: ["Bildene kan erstatte papirkravet automatisk, ettersom innholdet er bevart", "Papiroriginalene vil fortsatt være tilgjengelige sammen med de digitale bildene", "Det kan bli vanskelig å oppfylle dokumentasjonskravet ved en klage"], correctAnswer: "Det kan bli vanskelig å oppfylle dokumentasjonskravet ved en klage", evidence: [q.requirement, q.destruction]},
      {skill: "vocabulary_in_context", prompt: "Hva innebærer «avklart» i omtalen av motforestillingene?", options: ["De behandles som avsluttet uten at uenigheten dermed er borte", "De er trukket tilbake etter at begrunnelsene ble tilgjengelige", "De er utdypet for at partene skal kunne svare mer presist"], correctAnswer: "De behandles som avsluttet uten at uenigheten dermed er borte", evidence: [q.resolved]},
      {skill: "compare_perspectives", prompt: "Hvordan skiller de to faglige vurderingene seg?", options: ["Begge vurderer bare bildekvaliteten, men legger vekt på ulike tekniske feil", "Lederen vurderer troskap til det bevarte; historikeren spør også hva utvalget utelater", "Historikeren avviser dokumentenes verdi, mens lederen bekrefter at utvalget er fullstendig"], correctAnswer: "Lederen vurderer troskap til det bevarte; historikeren spør også hva utvalget utelater", evidence: [q.archivist, q.historian, q.agreement]},
    ],
    trueFalse: [
      {prompt: "Forsøket varer i seks uker.", correctAnswer: true},
      {prompt: "Forsøket starter i februar.", correctAnswer: false},
      {prompt: "Resultatene legges fram i rådhuset.", correctAnswer: true},
      {prompt: "Presentasjonen begynner klokken nitten.", correctAnswer: false},
    ],
    bestSummary: {
      prompt: "Hvilket sammendrag passer best til hele teksten?",
      options: [
        "Forsøket er verdt å prøve, men raskere tilgang gir ikke alene svar om årsak, representativitet eller de forbeholdene fremstillingen demper.",
        "Byarkivet prøver digital tilgang i seks uker fra mars og legger fram resultatene i rådhuset en kveld i mai.",
        "Målingen viser kortere søketid, samtidig som personalet har ryddet katalogen og fjernet dubletter før den nye løsningen kom.",
      ],
      correctAnswer: "Forsøket er verdt å prøve, men raskere tilgang gir ikke alene svar om årsak, representativitet eller de forbeholdene fremstillingen demper.",
      optionEvidence: [[q.trial, q.historian, q.improvement, q.limit, q.resolved, q.conclusion], [q.trial, q.meeting], [q.improvement, q.confounder]],
    },
  },
};

export function c2ReviewCases(): {name: string; candidate: ReadingReviewCandidate; expected: boolean}[] {
  const overreadAttitude = structuredClone(validC2);
  overreadAttitude.tasks.mcq[0] = {...overreadAttitude.tasks.mcq[0], options: ["Skribenten avviser at noen kan klare seg selv og mener digital tilgang bør oppgis", ...overreadAttitude.tasks.mcq[0].options.slice(1)], correctAnswer: "Skribenten avviser at noen kan klare seg selv og mener digital tilgang bør oppgis"};
  const oppositeProof = structuredClone(validC2);
  oppositeProof.tasks.mcq[1].correctAnswer = oppositeProof.tasks.mcq[1].options[0];
  const statedInference = structuredClone(validC2);
  statedInference.text = statedInference.text.replace(q.destruction, `${q.destruction} Dermed kan det bli vanskelig å oppfylle dokumentasjonskravet ved en klage.`);
  const dictionary = structuredClone(validC2);
  dictionary.tasks.mcq[3] = {...dictionary.tasks.mcq[3], prompt: "Hva betyr «avklart» vanligvis?", options: ["Oppklart eller avgjort", "Gjemt eller fjernet", "Ukjent eller uvanlig"], correctAnswer: "Oppklart eller avgjort"};
  const swappedVoices = structuredClone(validC2);
  swappedVoices.tasks.mcq[4] = {...swappedVoices.tasks.mcq[4], options: ["Historikeren vurderer bare troskap til det bevarte, mens lederen problematiserer hvem utvalget utelater", ...swappedVoices.tasks.mcq[4].options.slice(1)], correctAnswer: "Historikeren vurderer bare troskap til det bevarte, mens lederen problematiserer hvem utvalget utelater"};
  const overstatedSummary = structuredClone(validC2);
  overstatedSummary.tasks.bestSummary.options = [...overstatedSummary.tasks.bestSummary.options.slice(0, 2), "Kortere søketid beviser at digitaliseringen alene har forbedret driften og gjort samlingen representativ."];
  const ambiguousNuance = structuredClone(validC2);
  ambiguousNuance.tasks.mcq[3].options = [ambiguousNuance.tasks.mcq[3].options[0], "De fremstilles som ferdigbehandlet, selv om partene fortsatt ikke er enige", ambiguousNuance.tasks.mcq[3].options[2]];
  const explicitQualifiedStance = structuredClone(validC2);
  const statedOpinion = "Jeg støtter forsøket, men bare dersom behovet for veiledning blir undersøkt.";
  explicitQualifiedStance.text = explicitQualifiedStance.text.replace(q.courtesy, statedOpinion);
  explicitQualifiedStance.tasks.mcq[0] = {...explicitQualifiedStance.tasks.mcq[0], prompt: "Hva mener skribenten om forsøket?", options: ["Støtter et forsøk med forbehold om at hjelpebehovet undersøkes", "Støtter et forsøk uten noen forbehold om veiledning", "Avviser et forsøk selv om hjelpebehovet blir undersøkt"], correctAnswer: "Støtter et forsøk med forbehold om at hjelpebehovet undersøkes", evidence: [statedOpinion, q.help]};
  const disguisedDictionary = structuredClone(validC2);
  disguisedDictionary.tasks.mcq[3] = {...disguisedDictionary.tasks.mcq[3], prompt: "Hva betyr «makuleres» her?", options: ["Ødelegges", "Arkiveres", "Signeres"], correctAnswer: "Ødelegges", evidence: [q.destruction]};
  return [
    {name: "c2_valid", candidate: structuredClone(validC2), expected: true},
    {name: "c2_overread_attitude", candidate: overreadAttitude, expected: false},
    {name: "c2_opposite_proof", candidate: oppositeProof, expected: false},
    {name: "c2_stated_inference", candidate: statedInference, expected: false},
    {name: "c2_dictionary", candidate: dictionary, expected: false},
    {name: "c2_swapped_voices", candidate: swappedVoices, expected: false},
    {name: "c2_overstated_summary", candidate: overstatedSummary, expected: false},
    {name: "c2_ambiguous_nuance", candidate: ambiguousNuance, expected: false},
    {name: "c2_explicit_qualified_stance", candidate: explicitQualifiedStance, expected: false},
    {name: "c2_disguised_dictionary", candidate: disguisedDictionary, expected: false},
  ];
}
