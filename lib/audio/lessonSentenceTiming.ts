type SentenceTiming = { startRatio: number };

export function splitLessonSentences(text: string): string[] {
  return text.trim().split(/(?<=[.!?])\s+|\r?\n+/u).map(part => part.trim()).filter(Boolean);
}

export function readLessonSentenceStarts(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value[0] !== 0 || !value.every((time, index) => (
    typeof time === "number" && Number.isFinite(time) && (index === 0 || time > value[index - 1])
  ))) return undefined;
  return value;
}

export function lessonSentenceStartTime(
  sentences: readonly SentenceTiming[], index: number, duration: number, sentenceStarts?: readonly number[],
): number {
  if (sentenceStarts?.length === sentences.length && (sentenceStarts.at(-1) ?? 0) < duration) {
    return sentenceStarts[index];
  }
  return sentences[index].startRatio * duration;
}

export function activeLessonSentenceIndex(
  sentences: readonly SentenceTiming[], time: number, duration: number, sentenceStarts?: readonly number[],
): number {
  const next = sentences.findIndex((_, index) => lessonSentenceStartTime(sentences, index, duration, sentenceStarts) > time);
  return next < 0 ? sentences.length - 1 : Math.max(0, next - 1);
}
