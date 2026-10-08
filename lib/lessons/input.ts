import { LANGUAGES } from "../languages";
import { lessonTasksJsonSchema, normalizeLessonTasks } from "./tasks";
import { LessonError, onlyKeys, record, requiredString, stringField } from "./validation";

const INPUT_KEYS = ["title", "level", "language", "prompt", "topic", "textType", "sourceText",
  "highFrequencyWord", "highFrequencyReadingSentences", "highFrequencyExplanation", "tasks", "aiQuality"];

/** Discovery schema; normalizeCreateLessonInput remains the authoritative validator. */
export const createLessonInputJsonSchema = {
  type: "object" as const, additionalProperties: false, required: ["title", "sourceText"], properties: {
    title: { type: "string", minLength: 1, maxLength: 500 }, sourceText: { type: "string", minLength: 1, maxLength: 200000 },
    level: { type: "string", enum: ["A1_START", "A1", "A2", "B1", "B2", "C1", "C2"], default: "A2" },
    language: { type: "string", enum: [...LANGUAGES.map(item => item.code), "no", "pt"], default: "nb" },
    prompt: { type: "string", maxLength: 8000 }, topic: { type: "string", maxLength: 8000 }, textType: { type: "string", maxLength: 500 },
    highFrequencyWord: { type: "string", maxLength: 500 }, highFrequencyReadingSentences: { type: "string", maxLength: 20000 },
    highFrequencyExplanation: { type: "string", maxLength: 20000 }, tasks: lessonTasksJsonSchema,
    aiQuality: { type: "object", additionalProperties: false, properties: {
      factCheckRequired: { type: "boolean" }, factChecked: { type: "boolean" },
      factCheckReason: { type: "string", maxLength: 2000 }, generatedWith: { type: "string", maxLength: 100 },
    } },
  },
};

export function normalizeCreateLessonInput(input: unknown) {
  const body = record(input, "lesson");
  onlyKeys(body, INPUT_KEYS, "lesson");
  const level = stringField(body.level, "level", 20, "A2").toUpperCase();
  if (!["A1_START", "A1", "A2", "B1", "B2", "C1", "C2"].includes(level)) {
    throw new LessonError("level is invalid.", 400);
  }
  const languageInput = stringField(body.language, "language", 30, "nb").toLowerCase();
  const language = LANGUAGES.find((item) => item.code.toLowerCase() === languageInput)?.code
    ?? (languageInput === "no" ? "nb" : languageInput === "pt" ? "pt" : undefined);
  if (!language) throw new LessonError("language is invalid.", 400);
  const quality = body.aiQuality === undefined ? {} : record(body.aiQuality, "aiQuality");
  onlyKeys(quality, ["factCheckRequired", "factChecked", "factCheckReason", "generatedWith"], "aiQuality");
  for (const key of ["factCheckRequired", "factChecked"]) {
    if (quality[key] !== undefined && typeof quality[key] !== "boolean") {
      throw new LessonError(`aiQuality.${key} must be a boolean.`, 400);
    }
  }
  if (quality.factCheckRequired === true && quality.factChecked !== true) {
    throw new LessonError("Extra fact check is required before saving this text.", 400);
  }
  // Text type may be a localized label or custom text from the existing editor.
  const textType = stringField(body.textType, "textType", 500, "").replace(/^"+|"+$/g, "").trim();
  const prompt = stringField(body.prompt, "prompt", 8000, "");
  const normalized = {
    title: requiredString(body.title, "title", 500), level, language, prompt,
    topic: stringField(body.topic, "topic", 8000, "") || prompt,
    textType, texttype: textType,
    sourceText: requiredString(body.sourceText, "sourceText", 200000),
    highFrequencyWord: stringField(body.highFrequencyWord, "highFrequencyWord", 500, ""),
    highFrequencyReadingSentences: stringField(body.highFrequencyReadingSentences, "highFrequencyReadingSentences", 20000, ""),
    highFrequencyExplanation: stringField(body.highFrequencyExplanation, "highFrequencyExplanation", 20000, ""),
    tasks: normalizeLessonTasks(body.tasks === undefined ? [] : body.tasks),
    aiQuality: {
      factCheckRequired: quality.factCheckRequired === true,
      factChecked: quality.factChecked === true,
      factCheckReason: stringField(quality.factCheckReason, "aiQuality.factCheckReason", 2000, ""),
      generatedWith: stringField(quality.generatedWith, "aiQuality.generatedWith", 100, "unknown"),
    },
  };
  if (new TextEncoder().encode(JSON.stringify(normalized)).length > 750000) {
    throw new LessonError("Lesson payload is too large.", 400);
  }
  return normalized;
}
