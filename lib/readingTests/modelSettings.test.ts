import assert from "node:assert/strict";
import test from "node:test";
import { readingGenerationModel, readingReviewModel, readingGenerationSettings, readingGenerationTimeout, readingReviewSettings } from "./modelSettings";

test("C1 uses the stronger reasoning workload while existing level defaults remain", () => {
  assert.equal(readingGenerationModel("C1", {}), "gpt-5");
  assert.equal(readingReviewModel("C1", {}), "gpt-5");
  assert.equal(readingGenerationModel("B2", {}), "gpt-4.1");
  assert.equal(readingReviewModel("B2", {}), "gpt-5-mini");
  assert.equal(readingGenerationModel("A2", {}), "gpt-4o-mini");
  assert.equal(readingReviewModel("B1", {}), "gpt-5-mini");
});

test("C2 has a separate configurable model profile and keeps shared review overrides", () => {
  assert.equal(readingGenerationModel("C2", {}), "gpt-5");
  assert.equal(readingReviewModel("C2", {}), "gpt-5");
  const env = {OPENAI_READING_C2_MODEL: "c2", OPENAI_READING_C2_REVIEW_MODEL: "c2-review", OPENAI_READING_C1_MODEL: "c1", OPENAI_READING_C1_REVIEW_MODEL: "c1-review", OPENAI_READING_REVIEW_MODEL: "shared"};
  assert.equal(readingGenerationModel("C2", env), "c2");
  assert.equal(readingReviewModel("C2", env), "c2-review");
  assert.equal(readingGenerationModel("C1", env), "c1");
  assert.equal(readingReviewModel("C1", env), "c1-review");
  assert.equal(readingReviewModel("C2", {OPENAI_READING_REVIEW_MODEL: "shared"}), "shared");
});

test("level-specific and shared model configuration keep their precedence", () => {
  const env = {OPENAI_MODEL: "general", OPENAI_READING_B2_MODEL: "b2", OPENAI_READING_C1_MODEL: "c1", OPENAI_READING_REVIEW_MODEL: "review", OPENAI_READING_C1_REVIEW_MODEL: "c1-review"};
  assert.equal(readingGenerationModel("A1", env), "general");
  assert.equal(readingGenerationModel("B2", env), "b2");
  assert.equal(readingGenerationModel("C1", env), "c1");
  assert.equal(readingReviewModel("C1", env), "c1-review");
  assert.equal(readingReviewModel("B2", env), "review");
  assert.equal(readingReviewModel("C1", {OPENAI_READING_REVIEW_MODEL: "shared"}), "shared");
});

test("reasoning generation omits temperature and has a bounded larger output/time budget", () => {
  const reasoning = readingGenerationSettings("gpt-5");
  assert.deepEqual(reasoning.reasoning, {effort: "low"});
  assert.equal(reasoning.temperature, undefined);
  assert.equal(reasoning.max_output_tokens, 12000);
  assert.equal(readingGenerationTimeout("gpt-5"), 90000);
  assert.deepEqual(readingGenerationSettings("gpt-4.1"), {temperature: 0.4, max_output_tokens: 5000});
  assert.equal(readingGenerationTimeout("gpt-4.1"), 45000);
});

test("B2 uses its measured shorter review workload while other levels keep their reasoning settings", () => {
  assert.deepEqual(readingReviewSettings("B2", "gpt-5-mini"), { reasoning: { effort: "low" }, max_output_tokens: 8000 });
  for (const level of ["A2", "B1"] as const) assert.deepEqual(readingReviewSettings(level, "gpt-5-mini"), { reasoning: { effort: "medium" }, max_output_tokens: 9000 });
  for (const level of ["C1", "C2"] as const) assert.deepEqual(readingReviewSettings(level, "gpt-5"), { reasoning: { effort: "medium" }, max_output_tokens: 12000 });
  assert.deepEqual(readingReviewSettings("B2", "gpt-4.1"), { temperature: 0, max_output_tokens: 4500 });
});
