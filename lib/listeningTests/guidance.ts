import { readingGenerationPolicy } from "../readingTests/generationBudget";
import type { ListeningLevel } from "./types";

export function listeningGenerationPolicy(level:ListeningLevel) {
  const base=readingGenerationPolicy(level==="A1Start"?"A1":level);
  return {...base,totalMs:level==="B2"?110_000:level==="C1"||level==="C2"?210_000:150_000,maxAttempts:level==="B2"?2:3};
}

export const LISTENING_GENERATION_GUIDANCE = `This is a LISTENING comprehension test, not a reading worksheet. Interpret the text field as the exact spoken script.
Write one natural, self-contained monologue suitable for one synthetic voice: a message, announcement, personal account or spoken commentary. Use short spoken transitions and clear references. Use a neutral title that does not reveal a tested answer. Do not write speaker labels, stage directions, sound effects, bullet lists, URLs, abbreviations that need spelling, or visual formatting. Higher levels may contain nuanced argument and implied stance, but every answer must be recoverable by listening alone. Keep the script below 4000 characters.
Use the required paragraph/sentence structure only to organise the teacher's script; the learner never sees it. A paragraph boundary cannot be a clue. Questions must never ask which paragraph, line, spelling, heading or written word occurs on the page. When existing instructions refer to a writer, article or text, use a speaker, talk or recording instead. Ask about the meaning of what is heard. Questions and answer options remain short and easy to read.
PLAN DISTINCT INFORMATION BEFORE WRITING: reserve a different fact or relationship for every question, including each true/false. Give the script enough practical details (what to bring, a location, a contact instruction, a time, a sequence) to support those separate targets. Never recycle the cause question's answer as a true/false statement or factual lookup.
For A2/B1 connection or inference, supply TWO separate necessary clues and DO NOT explicitly state their combined conclusion anywhere. For example, a closing time and a later arrival can jointly rule out a meeting location; a sentence already saying they cannot meet there is not a two-clue inference. Cite only the clues that are actually necessary. Asking which alternative plan was explicitly announced is retrieval, not connection.
True/false statements must be clearly supported or contradicted by the recording. Both summary distractors must be TRUE, intentionally narrow details from the recording. Do not invent a future plan, preference, habit or motive to make a wrong summary. Write these two options by selecting actual stated details, then write a broader main summary. Keep all required task counts, answer checks and level requirements. Do not ask the listener to count or recall a long arbitrary sequence of numbers. Do not add auditory clues that are absent from the actual script.`;

export const LISTENING_REVIEW_GUIDANCE = `Additional modality check: this packet is a listening test. The supplied text is a VERBATIM SCRIPT read by ONE voice, not a text visible to the learner. Judge a speaker's stance in place of a writer's stance. Organising the teacher's script in paragraphs is fine, but the questions must be answerable without seeing paragraph boundaries, spelling, headings, typography, speaker labels or pictures. A phrase such as 'in this context' can assess the meaning of something heard; 'which word is written in paragraph 3' cannot. Do not require prosody, distinct actors, music or sounds not guaranteed by this single-voice script.
Complete listeningScopeCheck independently of the main task checks: understandableWithoutScript, questionsUseOnlyHeardInformation and singleVoiceScript must each be true. Set a flag false for any actual violation and give one short explanation. Keep every other content, evidence, answer-key and level check.`;

export function evaluateListeningScope(raw: unknown): {accepted: boolean; issues: string[]} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {accepted: false, issues: ["The listening-specific review is missing."]};
  const check = raw as Record<string, unknown>;
  const accepted = ["understandableWithoutScript", "questionsUseOnlyHeardInformation", "singleVoiceScript"].every(key => check[key] === true)
    && typeof check.explanation === "string" && check.explanation.trim().length > 0;
  return {accepted, issues: accepted ? [] : [`The test must work through listening alone with one voice. ${typeof check.explanation === "string" ? check.explanation : "Incomplete listening review."}`]};
}
