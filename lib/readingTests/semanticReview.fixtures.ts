import type { ReadingReviewCandidate } from "./semanticReview";

const needsFood = "Hun trenger å kjøpe mat til middag.";
const purchases = "Tonje tar med seg grønnsaker, brød og melk.";
const dinner = "Hun lager en salat med grønnsaker og brød.";
const maybeFilm = "Kanskje hun skal se en film eller lese en bok.";
const coat = "Først tar hun på seg jakken og finner vesken sin.";
const closeShop = "Hun går til butikken som ligger nær huset hennes.";

// The user's regression: plausible skill labels and real quotations conceal
// repeated facts, a retrieval disguised as a connection, and invented summaries.
export const tonjeRegression: ReadingReviewCandidate = {
  text: `I dag bestemmer Tonje seg for å gå til butikken. ${needsFood} ${coat} ${closeShop} Der ser hun mange forskjellige varer. ${purchases} Hun liker å lage sunn mat.\n\nNår hun kommer hjem, begynner hun å lage middag. ${dinner} Tonje er glad for at hun har kjøpt alt hun trenger. Mens hun lager maten, tenker hun på hva hun skal gjøre etter middag. ${maybeFilm} Det blir en fin kveld.`,
  tasks: {
    mcq: [
      { prompt: "Hva trenger Tonje å kjøpe?", options: ["Klær", "Mat", "Bøker"], correctAnswer: "Mat", skill: "find_information", evidence: [needsFood] },
      { prompt: "Hvorfor går Tonje til butikken?", options: ["For å kjøpe klær", "For å kjøpe mat", "For å møte venner"], correctAnswer: "For å kjøpe mat", skill: "understand_reason", evidence: [needsFood] },
      { prompt: "Hva lager Tonje til middag?", options: ["En salat med grønnsaker", "En kake", "Pasta med kjøtt"], correctAnswer: "En salat med grønnsaker", skill: "connect_information", evidence: [purchases, dinner] },
    ],
    trueFalse: [
      { prompt: "Tonje går til butikken for å kjøpe mat.", correctAnswer: true },
      { prompt: "Tonje lager middag med bare pasta.", correctAnswer: false },
    ],
    bestSummary: {
      prompt: "Hvilken oppsummering passer best?",
      options: ["Tonje går til butikken for å kjøpe mat og lager middag hjemme.", "Tonje liker å se filmer etter middag.", "Tonje kjøper klær til seg selv i butikken."],
      correctAnswer: "Tonje går til butikken for å kjøpe mat og lager middag hjemme.",
      optionEvidence: [[needsFood, dinner], [maybeFilm], [purchases]],
    },
  },
};

export const revisedQuotes = {
  bag: coat,
  cause: "Hun går til fots fordi butikken ligger nær huset hennes.",
  bagContents: "Brødet legger hun i en egen pose.",
  meal: "Det som ligger i den egne posen, serverer hun ved siden av salaten.",
  purchases,
  maybeFilm,
};
export const revisedA2: ReadingReviewCandidate = {
  text: `I dag bestemmer Tonje seg for å gå til butikken. ${needsFood} ${coat} ${revisedQuotes.cause} Der ser hun mange forskjellige varer. ${purchases} ${revisedQuotes.bagContents} Hun liker å lage sunn mat.\n\nNår hun kommer hjem, begynner hun å lage middag. Hun lager en salat med grønnsaker. ${revisedQuotes.meal} Tonje er glad for at hun har kjøpt alt hun trenger. Mens hun lager maten, tenker hun på hva hun skal gjøre etter middag. ${maybeFilm} Det blir en fin kveld.`,
  tasks: {
    mcq: [
      { prompt: "Hva finner Tonje fram før hun drar?", options: ["En bok", "Vesken sin", "En matboks"], correctAnswer: "Vesken sin", skill: "find_information", evidence: [coat] },
      { prompt: "Hvorfor går Tonje til butikken til fots?", options: ["Bussen er forsinket", "Hun skal møte venner", "Butikken ligger nær huset"], correctAnswer: "Butikken ligger nær huset", skill: "understand_reason", evidence: [revisedQuotes.cause] },
      { prompt: "Hva serverer Tonje ved siden av salaten?", options: ["Brødet", "Melken", "Grønnsakene"], correctAnswer: "Brødet", skill: "connect_information", evidence: [revisedQuotes.bagContents, revisedQuotes.meal] },
    ],
    trueFalse: [
      { prompt: "Tonje kjøper melk.", correctAnswer: true },
      { prompt: "Tonje har bestemt seg for å se en film etter middag.", correctAnswer: false },
    ],
    bestSummary: {
      prompt: "Hvilken oppsummering passer best til hele teksten?",
      options: ["Tonje handler mat og lager middag hjemme.", "Tonje tar på seg jakken og finner vesken sin.", "Tonje vurderer å se en film eller lese en bok."],
      correctAnswer: "Tonje handler mat og lager middag hjemme.",
      optionEvidence: [[purchases, revisedQuotes.meal], [coat], [maybeFilm]],
    },
  },
};
