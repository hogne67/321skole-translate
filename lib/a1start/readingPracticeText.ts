import { normalizeTextTypeKey } from "../textTypes";
import { READING_PRACTICE_STAGES, READING_PRACTICE_TEXT_TYPES, supportsReadingPractice, type ReadingPracticeStage } from "./readingPractice";

export function getReadingPracticeStage(textType: unknown, language?: unknown): ReadingPracticeStage | null {
  if (language != null && (typeof language !== "string" || (language.trim() && !supportsReadingPractice(language)))) return null;
  const type = normalizeTextTypeKey(textType);
  return READING_PRACTICE_STAGES.find(stage => READING_PRACTICE_TEXT_TYPES[stage] === type) ?? null;
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
    // Accept pasted forms such as ba-na-nen. Keep ordinary hyphenated prefixes
    // such as e-post and names such as Anne-Lise unless explicitly marked.
    const plainDivisionLength = units.length === 3 || (units.length === 2 && units[0].length >= 2);
    const divided = !!match[1] || word.includes("·") || (plainDivisionLength &&
      units.slice(1).every(unit => !/^\p{Lu}/u.test(unit)) &&
      units.every(unit => unit.match(/ei|øy|au|ai|oi|[aeiouyæøå]/gi)?.length === 1));
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

export function readingPracticeWordPairs(text: string) {
  const words = new Map<string, { divided: string; whole: string }>();
  for (const part of splitReadingPracticeWordParts(text)) {
    if (!part.divided) continue;
    const key = part.spoken.normalize().toLowerCase();
    if (!words.has(key)) words.set(key, { divided: part.display, whole: part.spoken });
  }
  return [...words.values()];
}
