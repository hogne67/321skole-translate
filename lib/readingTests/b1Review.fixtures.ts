import type { ReadingReviewCandidate } from "./semanticReview";

export const b1Quotes = {
  proposal: "Biblioteket i Solvik vurderer å holde åpent fra klokken atten til tjue hver torsdag.",
  days: "Forsøket gjelder bare torsdager.",
  argument: "Lederen Amir mener dette er nyttig fordi flere kan bruke biblioteket etter jobb.",
  amir: "Han ønsker fast kveldsåpent med en gang.",
  room: "Kursrommet er ledig etter klokken sytten.",
  meeting: "Et møte med en forfatter begynner klokken atten og varer en time.",
  attitude: "Lina støtter et forsøk på én måned, men vil se hvor mange som kommer før ordningen blir fast.",
  study: "Hun ønsker et rolig sted der hun kan arbeide med norsk etter arbeidsdagen.",
  work: "Lina jobber til klokken atten på torsdager.",
  travel: "Reisen fra jobben til biblioteket tar en halv time.",
  free: "Det er gratis å komme inn.",
  books: "Alle som kommer, kan ta med en bok de vil anbefale til andre.",
};
const q = b1Quotes;
export const validB1: ReadingReviewCandidate = {
  text: `${q.proposal} ${q.days} ${q.argument} ${q.amir} ${q.room} ${q.meeting}\n\n${q.attitude} ${q.study} På kafé er det ofte mye lyd, og hun må kjøpe noe for å sitte der. Derfor håper hun at biblioteket kan være et godt alternativ.\n\n${q.work} ${q.travel} ${q.free} ${q.books} Neste uke vil Lina hjelpe Amir med å henge opp plakater i nærbutikken.`,
  tasks: {
    mcq: [
      { prompt: "Hva kan besøkende ta med til biblioteket?", options: ["Mat til alle deltakerne", "En bok de vil anbefale", "Plakater fra nærbutikken"], correctAnswer: "En bok de vil anbefale", skill: "find_information", evidence: [q.books] },
      { prompt: "Hvilken grunn gir Amir for å holde åpent om kvelden?", options: ["Det er billigere enn å sitte på kafé", "Lina trenger et rolig sted for å øve på norsk", "Flere kan bruke biblioteket etter jobb"], correctAnswer: "Flere kan bruke biblioteket etter jobb", skill: "understand_argument", evidence: [q.argument] },
      { prompt: "Hva mener Lina om fast kveldsåpent?", options: ["Ordningen bør prøves før den blir fast", "Fast kveldsåpent bør starte uten et forsøk", "Biblioteket bør være stengt om kvelden"], correctAnswer: "Ordningen bør prøves før den blir fast", skill: "understand_attitude", evidence: [q.attitude] },
      { prompt: "Hva kan vi forstå om Lina og forfattermøtet?", options: ["Hun er ferdig på jobb før møtet begynner", "Hun rekker ikke starten når hun kommer rett fra jobb", "Hun bruker hele kvelden på reisen til biblioteket"], correctAnswer: "Hun rekker ikke starten når hun kommer rett fra jobb", skill: "draw_inference", evidence: [q.meeting, q.work, q.travel] },
    ],
    trueFalse: [
      { prompt: "Forsøket gjelder alle ukedager.", correctAnswer: false },
      { prompt: "Kursrommet er ledig etter klokken sytten.", correctAnswer: true },
      { prompt: "Besøkende må betale for å komme inn.", correctAnswer: false },
    ],
    bestSummary: {
      prompt: "Hvilket sammendrag passer best til hele teksten?",
      options: [
        "Biblioteket vurderer kveldsåpent, og Lina vil prøve ordningen før den eventuelt blir fast.",
        "Lina ønsker et rolig sted der hun kan arbeide med norsk når arbeidsdagen er slutt.",
        "Forfattermøtet begynner på kvelden, og Lina har en halv times reise fra jobben til biblioteket.",
      ],
      correctAnswer: "Biblioteket vurderer kveldsåpent, og Lina vil prøve ordningen før den eventuelt blir fast.",
      optionEvidence: [[q.proposal, q.attitude], [q.study], [q.meeting, q.travel]],
    },
  },
};

export function b1ReviewCases(): { name: string; candidate: ReadingReviewCandidate; expected: boolean }[] {
  const argumentLookup = structuredClone(validB1);
  argumentLookup.tasks.mcq[1] = { ...argumentLookup.tasks.mcq[1], prompt: "Hvem er leder for biblioteket?", options: ["Amir", "Lina", "Forfatteren"], correctAnswer: "Amir" };
  const wrongHolder = structuredClone(validB1);
  wrongHolder.tasks.mcq[2].prompt = "Hva mener Amir om fast kveldsåpent?";
  const lostCondition = structuredClone(validB1);
  lostCondition.tasks.mcq[2].correctAnswer = lostCondition.tasks.mcq[2].options[1];
  const inferenceLookup = structuredClone(validB1);
  inferenceLookup.tasks.mcq[3] = { ...inferenceLookup.tasks.mcq[3], prompt: "Hvor lang tid tar reisen fra jobben til biblioteket?", options: ["En halv time", "En hel time", "To timer"], correctAnswer: "En halv time" };
  const unsupportedSummary = structuredClone(validB1);
  unsupportedSummary.tasks.bestSummary.options = [...unsupportedSummary.tasks.bestSummary.options.slice(0, 2), "Lina vil ha fast kveldsåpent med en gang."];
  return [
    { name: "b1_valid", candidate: structuredClone(validB1), expected: true },
    { name: "b1_argument_lookup", candidate: argumentLookup, expected: false },
    { name: "b1_wrong_holder", candidate: wrongHolder, expected: false },
    { name: "b1_lost_condition", candidate: lostCondition, expected: false },
    { name: "b1_inference_lookup", candidate: inferenceLookup, expected: false },
    { name: "b1_unsupported_summary", candidate: unsupportedSummary, expected: false },
  ];
}
