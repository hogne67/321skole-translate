import { LANGUAGES } from "../languages";
import { lessonTasksJsonSchema, normalizeLessonTasks } from "./tasks";
import { LessonError, onlyKeys, record, requiredString, stringField } from "./validation";

const INPUT_KEYS = ["title", "level", "language", "prompt", "topic", "textType", "sourceText",
  "highFrequencyWord", "highFrequencyReadingSentences", "highFrequencyExplanation", "tasks", "aiQuality",
  "tags", "aiCoverPrompt", "aiCoverStyle"];

/** Discovery schema; normalizeCreateLessonInput remains the authoritative validator. */
export const createLessonInputJsonSchema = {
  type: "object" as const, additionalProperties: false, required: ["title", "sourceText"], properties: {
    title: { type: "string", minLength: 1, maxLength: 500 }, sourceText: { type: "string", minLength: 1, maxLength: 200000 },
    level: { type: "string", enum: ["A1_START", "A1", "A2", "B1", "B2", "C1", "C2"], default: "A2" },
    language: { type: "string", enum: [...LANGUAGES.map(item => item.code), "no", "pt"], default: "nb" },
    prompt: { type: "string", maxLength: 8000 },
    topic: { type: "string", maxLength: 8000, description: "Short subject label for the lesson, not the instructions used to generate it." },
    textType: { type: "string", maxLength: 500 },
    tags: { type: "array", maxItems: 30, items: { type: "string", minLength: 1, maxLength: 100 },
      description: "Relevant searchable topic tags in the lesson language. Usually 3–8 short tags; no commas inside a tag." },
    aiCoverPrompt: { type: "string", maxLength: 8000,
      description: "Optional ready-to-use cover image prompt. Describe subject, scene and composition suited to the lesson and learner age. Use a 16:9 composition without text. This saves the prompt; the teacher generates the image in the editor." },
    aiCoverStyle: { type: "string", enum: ["illustration", "realistic"],
      description: "Optional cover image style. Defaults to illustration when a cover prompt is supplied." },
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
  // Text type may be a localized label or custom text from the existing editor.
  const textType = stringField(body.textType, "textType", 500, "").replace(/^"+|"+$/g, "").trim();
  const prompt = stringField(body.prompt, "prompt", 8000, "");
  const tags = normalizeTags(body.tags);
  const aiCoverPrompt = stringField(body.aiCoverPrompt, "aiCoverPrompt", 8000, "");
  if (body.aiCoverStyle !== undefined && body.aiCoverStyle !== "illustration" && body.aiCoverStyle !== "realistic") {
    throw new LessonError("aiCoverStyle is invalid.", 400);
  }
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
    // Omitted metadata stays omitted, preserving existing save-retry fingerprints.
    ...(tags === undefined ? {} : { tags }),
    ...(body.aiCoverPrompt === undefined ? {} : { aiCoverPrompt }),
    ...(body.aiCoverStyle === undefined && !aiCoverPrompt ? {} : { aiCoverStyle: body.aiCoverStyle ?? "illustration" }),
    ...(aiCoverPrompt ? { coverImageSource: "ai", aiCoverPromptMode: "custom", coverImageFormat: "16:9" } : {}),
  };
  if (new TextEncoder().encode(JSON.stringify(normalized)).length > 750000) {
    throw new LessonError("Lesson payload is too large.", 400);
  }
  return normalized;
}

function normalizeTags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 30) throw new LessonError("tags must be an array of at most 30 strings.", 400);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    const tag = requiredString(item, "tags item", 100);
    if (tag.includes(",") || /[\r\n]/.test(tag)) throw new LessonError("Tags cannot contain commas or line breaks.", 400);
    const key = tag.toLowerCase();
    if (!seen.has(key)) { seen.add(key); tags.push(tag); }
  }
  return tags;
}
