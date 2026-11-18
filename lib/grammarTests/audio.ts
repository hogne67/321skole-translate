import type { GrammarTask } from "./types";
export type GrammarAudioSource = { lessonId: string; revision: string } | { spaceId: string; assignmentId: string };
export type GrammarAudioPart = { kind: "audio"; url: string } | { kind: "pause"; milliseconds: number };
export const GRAMMAR_GAP_PAUSE_MS = 1000;
export function grammarSpeechParts(task: GrammarTask, mode: "gap" | "solution"): (string | number)[] {
  if (mode === "solution") return [task.prompt.replace("___", task.correctAnswer)];
  const [before, after] = task.prompt.split("___");
  return [before.trim(), GRAMMAR_GAP_PAUSE_MS, after.trim()].filter(part => typeof part === "number" || part.length > 0);
}
