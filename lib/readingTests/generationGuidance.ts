export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export const READING_SKILLS = {
  A2: ["find_information", "understand_reason", "connect_information"],
  B1: ["find_information", "understand_argument", "understand_attitude", "draw_inference"],
  B2: ["understand_attitude", "understand_argument", "draw_inference", "vocabulary_in_context", "compare_perspectives"],
  C1: ["understand_attitude", "understand_argument", "draw_inference", "vocabulary_in_context", "compare_perspectives"],
  C2: ["understand_attitude", "understand_argument", "draw_inference", "vocabulary_in_context", "compare_perspectives"],
} as const;

export function isReviewedReadingLevel(level: CefrLevel): level is keyof typeof READING_SKILLS {
  return level in READING_SKILLS;
}

type LevelSpec = {
  minWords: number;
  maxWords: number;
  targetWords: number;
  mcqCount: number;
  trueFalseCount: number;
  topicGuidance: string;
  languageGuidance: string;
  lengthGuidance: string;
};

export const LEVEL_SPECS: Record<CefrLevel, LevelSpec> = {
  A1: {
    minWords: 60,
    maxWords: 80,
    targetWords: 70,
    mcqCount: 2,
    trueFalseCount: 1,
    topicGuidance: "Familiar everyday situations.",
    languageGuidance:
      "Use short sentences, easy words, and very little information in each sentence.",
    lengthGuidance: "Write one short paragraph of about 70 words.",
  },
  A2: {
    minWords: 100,
    maxWords: 150,
    targetWords: 125,
    mcqCount: 3,
    trueFalseCount: 2,
    topicGuidance: "Choose one concrete everyday situation within the requested topic, such as a planned visit, a shared activity, an errand or a changed plan. Give it a clear purpose and keep the title and both paragraphs focused on that situation. For a broad topic such as family, narrow it to something the family does or plans together, rather than listing unrelated habits and hobbies.",
    languageGuidance:
      "Use frequent everyday words, mainly short sentences, and clear references to named people, times and places. Include a specific plan or event, an explicitly stated reason for an action, and related information in different sentences that the reader can connect. Use simple connectors in the target language. Prefer concrete actions and useful details to repeated evaluations such as nice, fun and cosy. Avoid idioms, abstract discussion, hidden motives and unnatural collocations. Make the content richer while keeping the instructions as simple as A1.",
    lengthGuidance: "Write exactly 2 coherent paragraphs separated by a blank line (\\n\\n in the JSON text value), with about 60 words each. Do not put the whole text in one paragraph.",
  },
  B1: {
    minWords: 150,
    maxWords: 220,
    targetWords: 185,
    mcqCount: 4,
    trueFalseCount: 3,
    topicGuidance: "A familiar situation in everyday life, work, school or the local community, such as a proposed change or a shared plan. Give named people clear viewpoints and simple reasons, plus practical details that support one everyday inference. Keep the main issue focused; no specialist knowledge is needed.",
    languageGuidance:
      "Use straightforward, coherent B1 language, familiar vocabulary, and clear connectors for reasons, contrast and consequences. Clearly signal who holds each view and why. Include a simple argument (a position and a supporting reason), a clearly expressed attitude, and at least two concrete clues for a nearby everyday conclusion that is not stated verbatim. Preserve conditions and uncertainty. Do not require subtle irony, obscure idioms, hidden motives, abstract rhetoric or B2-style analysis of nuanced argumentation. Keep task instructions as short and familiar as at A1.",
    lengthGuidance: "Write exactly 3 coherent paragraphs separated by blank lines (\\n\\n in the JSON text value), with about 60 words each.",
  },
  B2: {
    minWords: 220,
    maxWords: 320,
    targetWords: 270,
    mcqCount: 5,
    trueFalseCount: 4,
    topicGuidance: "An accessible article or opinion piece about a specific proposal or dilemma in society, work, education or culture. Avoid a generic list of advantages and disadvantages. Give the writer an identifiable, qualified position and two people or groups distinct viewpoints with reasons. Include a meaningful example or counterpoint and concrete circumstances that jointly imply an unstated consequence or limitation. No specialist background knowledge is needed.",
    languageGuidance:
      "Use varied but natural vocabulary and a mix of simple and complex sentences. Make argument structure, contrast, concessions and cause/effect meaningful. Include an identifiable author attitude and one conclusion that can be inferred from at least two concrete clues. Distinguish a claim from a supporting example. Avoid obscure idioms, artificial academic language and complexity for its own sake.",
    lengthGuidance:
      "Write exactly 4 coherent paragraphs separated by blank lines (\\n\\n in the JSON text value), with about 65-75 words each. Develop viewpoints, qualifications, examples and some indirect information without requiring specialist knowledge or obscure literary interpretation.",
  },
  C1: {
    minWords: 180,
    maxWords: 260,
    targetWords: 220,
    mcqCount: 5,
    trueFalseCount: 4,
    topicGuidance: "A focused, accessible essay or commentary on a contested proposal in society, education, work or culture. Develop a line of reasoning with a concession, competing explanations and a limited conclusion. Give two identifiable voices different criteria or assumptions, not simply opposite opinions. Include concrete clues for an unstated implication and separate practical details for true/false. No specialist background is required.",
    languageGuidance:
      "Use natural C1 language, precise qualifications, varied syntax and cohesive references. Let the writer's attitude emerge through framing, contrast or measured understatement rather than explicitly naming every opinion. Include contextual connotation and a multi-step argument without obscure vocabulary for its own sake. Keep instructions short and familiar; do not require cultural allusions, specialist knowledge or speculative psychological interpretation.",
    lengthGuidance: "Write exactly 4 coherent paragraphs separated by blank lines (\\n\\n in the JSON text value), aiming for about 55 words per paragraph within the requested word range.",
  },
  C2: {
    minWords: 180,
    maxWords: 260,
    targetWords: 220,
    mcqCount: 5,
    trueFalseCount: 4,
    topicGuidance: "A compact, self-contained commentary or essay on an accessible contested issue. Develop layered reasoning with concessions and limits, two identifiable voices with partly overlapping aims, and concrete details supporting an unstated implication. Let word choice or restrained contrast reveal a subtle stance. Include separate practical details for true/false. No external specialist or cultural knowledge is required.",
    languageGuidance:
      "Use natural, precise C2 prose with subtle distinctions of register, connotation, scope and commitment. An apparently favourable formulation may carry a reservation, or a concession may leave the main objection intact, but provide enough textual cues for one defensible reading. Keep quoted views distinct from the writer's position. Do not force sarcasm, obscure allusions or speculative psychology. Instructions remain short, plain and familiar.",
    lengthGuidance: "Write exactly 4 coherent paragraphs as sentence arrays in sourceParagraphs, aiming for about 55 words per paragraph within the requested word range. The server separates the rendered paragraphs with blank lines.",
  },
};

export function buildTaskInstructions(level: CefrLevel) {
  const spec = LEVEL_SPECS[level];
  const blocks: string[] = [];

  blocks.push(`Multiple choice:
- Create exactly ${spec.mcqCount} multiple choice questions.
- Each question must have exactly 3 options.
- Only 1 option is correct.
- The correctAnswer must be exactly equal to one of the options.
- The wrong options must be plausible, but not tricky or misleading.
- The wrong options must be clearly wrong as answers to that question based on the text.`);

  blocks.push(`True or false:
- Create exactly ${spec.trueFalseCount} true/false statements.
- Each statement must be answerable directly from the text.
- Each statement must be clearly true or clearly false based on the text.
- The prompt must be the statement itself.
- correctAnswer must be a boolean: true or false.`);

  const textSupportedSummaries = isReviewedReadingLevel(level);
  blocks.push(`Best summary:
- Create exactly 1 best summary task.
- The task must have exactly 3 short summary options.
- Only 1 summary must clearly be the best representation of the main idea.
${textSupportedSummaries ? "- All 3 options must be factually supported by the text. The other 2 describe narrower true details, without inventions, contradictions or exaggeration." : "- The 2 wrong summaries should be believable, but either too narrow, contain a wrong main point, or exaggerate something."}
- The correctAnswer must be exactly equal to one of the options.`);

  blocks.push(`Simple task form at every level:
- Use the same familiar task forms as A1: a short question with 3 options, a plain true/false statement, and a choice of 3 summaries.
- Instructions must be short, direct and easier to read than the reading text, also at B2.
- Ask one thing at a time. Avoid double negatives, trick questions and unnecessary terminology.
- Answer options must be parallel in form and similar in length. Do not reveal the answer through wording or length.
- Do not repeat the same fact across multiple tasks or let one task reveal another answer.
- A false statement must be contradicted by the text, not merely absent from it.
- Distribute correct options across positions; do not always put the correct answer first.`);

  if (level === "A2") blocks.push(`A2 reading coverage:
- Plan the text and all six tasks together, before writing the final JSON. The text must actually support each reading target below.
- Create exactly one multiple-choice task for each skill: find_information (a concrete practical fact), understand_reason (why someone does something, using an explicitly stated reason), connect_information (combine information from two different parts of the text).
- Do not submit three simple location, activity or adjective lookups. A question like 'How is the flat?' answered by copying 'cosy' is not a reason or connection task.
- Use light, familiar paraphrases. Refer to a named person or an unambiguous third-person phrase in questions; do not ask 'Where do I play?' when 'I' refers to the narrator rather than the student.
- For each multiple-choice task, add an internal skill field with the exact skill code and an evidence array of exact quotes from the text. These are generation checks, not student-facing instructions.
- For find_information and understand_reason, evidence must contain at least one complete supporting sentence. Each quote must be a meaningful excerpt of at least 12 characters, not an isolated word. For connect_information, include at least two distinct, non-overlapping supporting sentences from different parts of the text; one copied fact is not a connection.
- A reason question must be answered by the stated cause, not merely a nearby detail. A connection question must require both quoted pieces. For example, comparing what a person does with family and with friends can require connecting two parts; asking where the person plays is only fact retrieval.
- Wrong multiple-choice options must represent plausible confusions of people, places, times or reasons in the text. Avoid absurd choices, unrelated activities and absolute claims that are easy to dismiss without reading.
- Compare the exact information needed for all five mcq/true_false answers. Do not test a fact again as a reason, negation or true/false statement. 'What does she buy?' -> 'food', 'Why does she shop?' -> 'to buy food', and 'She buys food: true' are repetition. Supply a separate explicit cause, such as why she walks rather than takes a bus, and assess other details in true/false.
- To ensure independent A2 targets, use a different supporting sentence for the factual lookup than for the explicit cause. For example, if the cause answer is that the shop is nearby, do not also use the shop's location as the factual lookup; ask about another practical detail.
- Test a connection by trying to answer it from each single sentence alone. If any sentence already reveals the correct option, replace the task. Listing the meal in one sentence and the purchases elsewhere does not make 'What does she cook?' a connection task. A second quote that is not needed for the answer does not count.
- The 2 true/false statements must check two other explicit details, with one true and one false statement.
- The summary task asks which summary fits the WHOLE text. All 3 options must describe information actually present in the text. The correct one covers the central situation across both paragraphs; each distractor describes only a narrower true detail. Do not use invented contradictions such as 'plays alone' when the text says 'with friends', or 'parents are never home' when the text says they make time for the family.
- Add an internal optionEvidence array with one evidence array per summary option, in the same order as options. Quote exact sentences supporting each option's content. The correct summary needs evidence from both paragraphs; each narrower distractor needs at least one supporting quote. All three options should have similar length and form, without making the correct one conspicuously longer.
- Do not require abstract interpretation or unstated motives. Keep the question language simple.`);

  if (level === "B1") blocks.push(`B1 reading coverage:
- Plan the text and all 8 tasks together. Keep the established simple forms: 4 mcq with 3 options each, 3 true/false statements, and 1 best-summary task.
- Create exactly one mcq for each skill: find_information (one useful explicit detail), understand_argument (how a simple stated reason supports a position), understand_attitude (the clearly signalled view or attitude of a named person), draw_inference (a nearby everyday conclusion requiring at least two distinct clues).
- The argument task must link a reason to what someone supports or opposes, not just ask an unrelated fact. A clear reason in a single sentence can be enough at B1; do not demand advanced rhetorical analysis. The argument and attitude tasks must test different information, for example one person's reason and another person's stated view.
- Attribute every view correctly. Do not confuse what one person says with the narrator's or another person's opinion. Preserve words for maybe, probably, if, only, often, always and never. A cautious or conditional position must not become certainty or unconditional support.
- The inference must be supported only by the text, need at least two concrete pieces of information, and not be a conclusion explicitly stated in any one sentence. Do not use background knowledge, stereotypes, arithmetic beyond straightforward everyday time/order relationships, or guesses about unstated feelings.
- Add internal skill and evidence fields to every mcq. Use the exact skill codes above and exact supporting sentences from the text. Each quote must be a meaningful excerpt of at least 12 characters. The inference needs at least two distinct, non-overlapping quotes that are both necessary. Extra decorative quotes do not turn retrieval into interpretation.
- Use short, direct questions such as 'Which reason does X give?', 'What does X think about the plan?' and 'What can we work out about X?'. Translate naturally into the target language; avoid terms such as rhetorical function or implicit positioning in the student's instructions.
- Distractors must be plausible misunderstandings of the text, comparable in length and form, with exactly one defensible answer. Do not make the key obvious through length, extreme wording or irrelevant options.
- The 3 true/false statements must assess 3 OTHER details, contain both true and false answers, and be explicitly supported or contradicted by the text. Do not repeat an mcq's answer as a true/false statement, negation or paraphrase.
- In the summary task, all 3 options must be factually supported by the text. The keyed option covers the main situation and its central viewpoint/message; the others describe accurate but narrower details. Never use an invented motive, wrong speaker or overstated certainty as a summary distractor.
- Add optionEvidence: one quote array per summary option in option order. Support the main summary from at least two paragraphs and each detail summary with at least one actual quote. The main summary need not list every minor detail from every paragraph.
- Independently check the actual mental work each task requires, the correct speaker, and any inference assumptions before returning the JSON. Do not demand B2 skills to make a B1 test look more difficult.`);

  if (level === "B2") blocks.push(`B2 reading coverage:
- Plan the text and all 10 tasks together. Keep the same simple forms: 5 mcq with 3 options, 4 true/false statements and 1 best-summary task.
- Create exactly one mcq for each skill, in any order: understand_attitude, understand_argument, draw_inference, vocabulary_in_context, compare_perspectives. Add the exact internal skill code and an evidence array of exact supporting sentences to each mcq. Each quote must be at least 12 characters; inference and perspective comparison each need at least two distinct, non-overlapping quotes actually necessary for the answer.
- Evidence is checked by literal string matching against your text. Copy each COMPLETE sentence, including its original words and punctuation. Never abbreviate with '...' or '…', omit a clause, replace a name, translate or paraphrase evidence. The same rule applies to every optionEvidence quote.
- understand_attitude must preserve the named person's or writer's nuanced view, including reservations, degrees of certainty or conditions. Require more than a bare positive/negative adjective lookup. Distinguish the author's stance from positions they quote, concede or criticise; conditional support is not unconditional endorsement.
- understand_argument must ask what a reason, example, concession, contrast or qualification does to a claim. Do not replace this with a date/name lookup or a simple 'which reason is stated?' task. The relation may be signalled explicitly, but the student must understand its role. Keep the question itself simple, for example 'Why is this example included?' or 'What does this point show?'.
- draw_inference must require a defensible interpretation of indirect information from at least two clues. The conclusion must not already be explicitly stated in one sentence. Ask about an implied consequence, limitation, priority or intention grounded in the actual text. Do not count decorative extra quotes, a direct lookup or a bare cross-sentence pronoun reference as sufficient B2 depth. No outside facts, stereotypes or speculative psychology.
- Design the inference BEFORE writing the text. For example, a proposal replaces every booking method with a smartphone app; elsewhere, the intended beneficiaries are said not to have smartphones. An unstated access barrier follows from BOTH facts. Do NOT add a sentence explicitly announcing that barrier, then ask students to copy it. Create an analogous limitation or implication suited to the requested topic; keep the answer probable/conditional when the clues warrant only that.
- vocabulary_in_context must ask what a word or expression means HERE. The keyed paraphrase must fit the actual sentence, speaker and topic, not merely provide an unrelated dictionary meaning. A literal option can be a plausible distractor when the expression is figurative. Do not use obscure idioms without adequate context.
- compare_perspectives must genuinely compare two identifiable positions, preserving who says what, their shared ground and their actual disagreement. The answer must require both viewpoints, not retrieve only one person's view or invent opposing goals where people disagree only about the means.
- Keep all 5 targets distinct. Do not restate an mcq answer in true/false form or let one question give away another answer. Sharing a topic is fine when the assessed information differs.
- The 4 true/false statements check OTHER explicit details or relationships; use two true and two false answers. A false statement must be contradicted by the text, not merely absent. Avoid double negatives and trick wording.
- Reserve four independent concrete details for true/false, such as the trial period, an agreed location, who collects feedback, or when results are discussed. Do not turn the writer's attitude, the central example or the inferred consequence into another true/false question.
- All 3 summary options must be factually supported. The key covers the main position/message AND an important qualification or contrast; the other options describe narrower true details. Do not distort attribution, certainty, conditions or causal claims to create summary distractors. Add optionEvidence in option order, supporting the main summary from at least two paragraphs and each narrow option from the text.
- Use varied, natural B2 language in the text. Keep task prompts short and direct and options parallel in length/form. Avoid unnecessary terms such as rhetorical function, implicit positioning or argumentative structure in student instructions. Difficulty must come from understanding the text.
- Before returning, check the actual comprehension required by each item, each key and every summary option against the text. Unsupported inferences and three simple fact questions wearing B2 labels must be replaced.`);

  if (level === "C1") blocks.push(`C1 reading coverage:
- Keep the same simple forms: 5 mcq with 3 parallel options each, 4 plain true/false statements (two true, two false), and 1 best-summary task. Difficulty comes from reading the text, not from long instructions or specialist terminology.
- Exactly one mcq per skill: understand_argument, understand_attitude, draw_inference, vocabulary_in_context, compare_perspectives. Add the exact skill code and evidence arrays; quotes must be COMPLETE verbatim sentences, at least 12 characters, with original wording and punctuation. No ellipses, omissions, translations or paraphrases. Argument, attitude, inference and comparison each require at least two distinct non-overlapping supporting sentences.
- understand_argument must connect multiple argumentative moves: for example how a concession and a counterexample restrict a conclusion, or why evidence supports a limited claim but not a stronger one. Finding a stated reason or naming an example is insufficient. Ask simply 'What does this example change?' or 'Why are these points compared?'.
- understand_attitude must infer the writer's or a named speaker's attitude from framing, contrast, qualification or measured understatement in at least two sentences. An explicitly stated 'I support X' plus a paraphrase is not this C1 target. Preserve the attitude holder, the object of criticism and the degree of commitment. Do not invent irony, feelings or motives unsupported by the text.
- draw_inference must integrate two independently necessary clues into an unstated implication, limitation or assumption. Plan the implication before the text; include both clues but do not explicitly announce their conclusion. A one-sentence answer, bare reference lookup, or obvious stated consequence is insufficient. Keep possibility separate from inevitability and use no external knowledge.
- vocabulary_in_context tests how a word or expression shapes meaning HERE: connotation, evaluative framing, a precise shade of meaning or contextual contrast. A generic dictionary definition or literal word lookup is insufficient; do not require obscure idioms or literary allusions.
- The keyed vocabulary option must describe what is being framed or qualified in this particular passage. For example, calling a restrictive administrative change 'streamlined' may present loss of choice as efficiency; the key must explain that local framing, not merely define 'streamlined' as 'quicker'. Do not substitute a general idiom question such as what 'not a zero-sum game' usually means.
- compare_perspectives must compare the criteria, assumptions or priorities underlying two identifiable positions. A list of who likes/dislikes the proposal is insufficient. Preserve partial agreement, differences in scope and correct attribution; quoting a view does not mean the writer endorses it.
- Keep all five targets distinct: an argument-function question and an attitude question must not merely restate the same reservation. Reserve four OTHER concrete details for true/false (such as trial duration, location, publication date, or participation arrangements). False statements must be explicitly contradicted, not just absent. No double negatives.
- Plan the implied attitude and argument question around different points in the text; compare their keyed conclusions to ensure one is not simply a paraphrase of the other. Keep the contextual word-choice task distinct from both. Use plausible partial readings of actual details in the wrong options, without absurd automatic consequences or unrelated actions.
- All three summary options must be true to the text. Only the key represents the whole central reasoning, including an important reservation, tension or limit. The other two cover narrower true details. Do not invent facts, reverse cause and effect, merge speakers or overstate certainty. Add optionEvidence in option order; the key needs support from at least three paragraphs, the others from actual source sentences.
- Before returning, independently check the actual work required by each task, not its label. Preserve C1 depth without demanding C2 allusions or making instructions harder. Keep correct and incorrect options similar in length and grammatical form.`);

  if (level === "C2") blocks.push(`C2 reading coverage:
- Preserve the simple forms: 5 mcq, 4 plain true/false statements (two true, two false), and 1 best-summary task. Each mcq has 3 parallel options and one uniquely defensible key. Keep prompts short, such as 'What is implied here?', 'What does this example change?' or 'How do the views differ?'. Do not pack a quotation or the full argument into the instruction.
- Write the text once as sourceParagraphs: exactly four arrays of complete sentence strings, in reading order. Each array item is ONE sentence, not a whole paragraph, with no embedded line breaks. Its assembled text must fit the requested word range. Reference these sentences in evidence and optionEvidence as p1s1 (paragraph 1, sentence 1), p2s3, etc. The server assembles the final text and copies the referenced sentences; do not repeat the text in a separate text field or copy quotations into evidence.
- Exactly one mcq per skill: understand_attitude, understand_argument, draw_inference, vocabulary_in_context, compare_perspectives. Include exact internal skill codes and evidence arrays of valid sentence references. Each referenced sentence needs at least 12 characters. Argument, attitude, inference and comparison require at least two distinct non-overlapping source sentences. No invented references or ellipses.
- understand_attitude must infer a subtle stance from framing, restraint, a concession or contrast. The key must preserve the precise target and degree: qualified approval is not enthusiasm; questioning a claim is not rejecting a proposal. A bare stated opinion or positive/negative label is insufficient. Do not invent irony, emotion or motive; irony is an option only when the text supports it.
- Do not use an explicit 'I share the goal, but only if...' as the attitude target. The writer may state a recommendation, but this task must concern a DIFFERENT implied evaluation of a quoted label, premise or framing. Include actual clues for that reading. If the planned text only states opinions directly, revise it before writing the attitude question.
- For example, an organisation calls a requirement 'an invitation'; elsewhere, declining it requires a written justification. A restrained juxtaposition can suggest distance from that label without explicitly declaring the policy coercive. The key should preserve that limited implication, not invent a hidden motive or reject the entire policy. Create an analogous text-grounded contrast suited to the topic, rather than relabelling an explicit recommendation as subtle.
- understand_argument must integrate layered moves and their limits: for example a concession that preserves an objection, evidence that warrants a weaker claim, or a shift in what counts as success. The key must explain the relation accurately, not merely find a reason or say that the text has two sides. Do not turn insufficient evidence into proof of the opposite.
- draw_inference must connect two independently necessary clues to a precise unstated implication. First choose the implication, then include its clues without stating the conclusion. Test whether any single sentence already gives the answer. Keep possible/probable/certain, some/all, necessary/sufficient and timing distinct. No outside facts or mind-reading.
- vocabulary_in_context must test a fine shade of contextual meaning, register, distancing or evaluative framing. The keyed paraphrase must identify what the word does HERE, not give a generic dictionary definition or a general idiom meaning. Wrong options should be close but textually distinguishable readings; do not make two synonyms equally correct.
- For example, calling a report 'settled' after dissenting comments are moved to an appendix may present disagreement as closure. A contextual key explains that editorial effect; it does not merely define 'settled' as 'resolved'. Create a distinct word-choice point for the requested topic, separate from the attitude target. Use wrong options that misread the same framing, rather than unrelated dictionary senses.
- compare_perspectives must preserve who voices, quotes or distances themselves from each claim, and compare the precise criteria, assumptions or scope behind two positions. Shared aims do not imply identical views; quoting a view does not mean endorsing it. A one-person lookup or a simple pro/against list is insufficient.
- Keep the five targets distinct. Place the attitude nuance and argument relation around different points, not two paraphrases of the same reservation. Reserve four OTHER explicit practical details for true/false, such as duration, place, publication date or participation arrangements. False statements must be contradicted rather than merely absent. Avoid double negatives and trick wording.
- Build wrong mcq options as close partial readings of the SAME evidence, with similar length and form. Example: if complaints fall during a pilot while opening hours also increase, a defensible key is 'Either change may matter; the figures do not separate their effects'. Two plausible wrong readings are 'The pilot's effect is established, but the opening hours' effect remains uncertain' and 'The opening hours' effect is established, while the pilot may only have contributed'. Both over-attribute the same evidence; neither invents an unrelated miracle solution. Avoid a nuanced long key beside short blanket support/rejection.
- All three summary options must be text-supported. Only the key represents the whole reasoning with its important tension or reservation, without losing speaker attribution, causal direction, modality, quantifiers or conditions. The other two are narrower true details. Add optionEvidence in option order; the key needs support from at least three paragraphs.
- Before returning, check the actual comprehension needed, not the level label. Remove unsupported subtle interpretations, generic vocabulary questions, implausible distractors and repeated assessed information. Sophisticated prose does not make literal lookup a C2 task.`);

  blocks.push(`Before returning JSON, check that every correct answer is supported by the text, every distractor is wrong in context, the tasks cover different information, and all instructions/options fit the target language and the requested level. Revise any ambiguous item before returning the test.`);
  return blocks.join("\n\n");
}
