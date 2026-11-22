import { normalizeTextTypeKey } from "../textTypes";
import { READING_PRACTICE_TEXT_TYPES, supportsReadingPractice, type ReadingPracticeStage } from "./readingPractice";

export function getReadingPracticeStage(textType: unknown, language?: unknown): ReadingPracticeStage | null {
  if (language != null && (typeof language !== "string" || (language.trim() && !supportsReadingPractice(language)))) return null;
  const type = normalizeTextTypeKey(textType);
  if (type === READING_PRACTICE_TEXT_TYPES.one_syllable) return "one_syllable";
  if (type === READING_PRACTICE_TEXT_TYPES.one_and_two_syllables) return "one_and_two_syllables";
  return null;
}

type TextPart = { display: string; spoken: string; divided: boolean };

export function splitReadingPracticeWordParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;

  function addPlain(display: string) {
    if (display) parts.push({ display, spoken: display, divided: false });
  }

  for (const match of text.matchAll(/\*\*(\p{L}+(?:[-·]\p{L}+)+)\*\*|\p{L}+(?:[-·]\p{L}+)+/gu)) {
    const word = match[1] ?? match[0];
    const units = word.split(/[-·]/u);
    // Plain hyphens are common in older reading exercises. A single-letter prefix
    // such as e-post or T-bane needs an explicit marker to count as a reading aid.
    const divided = !!match[1] || word.includes("·") || (units.length === 2 && units[0].length >= 2 &&
      !/^\p{Lu}/u.test(units[1]) && units.every(unit => unit.match(/ei|øy|au|ai|oi|[aeiouyæøå]/gi)?.length === 1));
    if (!divided) continue;

    const index = match.index;
    addPlain(text.slice(cursor, index));
    parts.push({ display: word, spoken: units.join(""), divided: true });
    cursor = index + match[0].length;
  }

  addPlain(text.slice(cursor));
  return parts;
}

export function readingPracticeSpokenText(text: string): string {
  return splitReadingPracticeWordParts(text).map(part => part.spoken).join("");
}
