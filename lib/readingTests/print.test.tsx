import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import ReadingTestWorksheet from "../../components/assessments/ReadingTestWorksheet";
import { automaticReadingPrintLayout, isReadingTestPrintLesson, orderedPrintTasks, readingTestPrintContent, type ReadingTestPrintContent } from "./print";
import { getReadingTestPrintCopy } from "./printCopy";

const content: ReadingTestPrintContent = {
  title: "Tonje går til butikken",
  sourceText: "Tonje går til butikken.\n\nHun lager middag hjemme.",
  level: "A2", language: "nb",
  tasks: [
    { id: "summary", order: 3, type: "best_summary", prompt: "Hvilken oppsummering passer best?", options: ["Tonje handler og lager middag.", "Tonje spiser ute."], correctAnswer: "Tonje handler og lager middag." },
    { id: "hidden", order: 0, type: "mcq", prompt: "DISABLED QUESTION", options: ["HIDDEN"], correctAnswer: "HIDDEN", enabled: false },
    { id: "mcq", order: 1, type: "mcq", prompt: "Hvor går Tonje?", options: ["Til skolen", "Til butikken", "Til parken"], correctAnswer: "Til butikken" },
    { id: "false", order: 2, type: "true_false", prompt: "Tonje spiser middag ute.", options: ["True", "False"], correctAnswer: false },
  ],
};

test("the learner sheet shows ordered active questions without answer markings or teacher guidance", () => {
  const $ = load(renderToStaticMarkup(<ReadingTestWorksheet content={content} locale="nb" mode="learner" />));
  assert.equal($(".reading-test-sheet-task").length, 3);
  assert.deepEqual($(".reading-test-sheet-prompt").map((_, element) => $(element).text()).get(), [
    "1. Hvor går Tonje?", "2. Tonje spiser middag ute.", "3. Hvilken oppsummering passer best?",
  ]);
  assert.equal($(".reading-test-sheet-source p").length, 2);
  assert.equal($(".reading-test-sheet-answer, .reading-test-sheet-note").length, 0);
  assert.ok(!$.text().includes("DISABLED QUESTION"));
  assert.ok(!$.text().includes("Riktig svar"));
  assert.ok(!$.text().includes("True"));
  assert.ok(!$.text().includes("False"));
  assert.ok($.text().includes("Sant"));
  assert.ok($.text().includes("Usant"));
  assert.equal($("input, textarea, form").length, 0, "name and date are paper blanks, not collected fields");
});

test("the separate key preserves option letters and a false answer in every UI language", () => {
  for (const locale of ["nb", "en", "pt"]) {
    const copy = getReadingTestPrintCopy(locale);
    const $ = load(renderToStaticMarkup(<ReadingTestWorksheet content={content} locale={locale} mode="key" />));
    assert.deepEqual($(".reading-test-sheet-answer strong").map((_, element) => $(element).text()).get(), [
      "B. Til butikken", copy.falseLabel, "A. Tonje handler og lager middag.",
    ]);
    assert.equal($(".reading-test-sheet-source, .reading-test-sheet-identity, .reading-test-sheet-options").length, 0);
    assert.ok($.text().includes(copy.key));
    assert.ok($.text().includes(copy.teacherNote));
  }
});

test("printing an edited worksheet uses current text and warns about an invalid key rather than inventing an answer", () => {
  const edited: ReadingTestPrintContent = {
    ...content, sourceText: "<script>not executable</script>",
    tasks: [{ id: "edited", type: "mcq", prompt: "Et endret spørsmål", options: ["Nytt alternativ"], correctAnswer: "An old deleted option" },
      { id: "unknown", type: "true_false", prompt: "Uavklart påstand", correctAnswer: "unknown" }],
  };
  const learner = load(renderToStaticMarkup(<ReadingTestWorksheet content={edited} locale="nb" mode="learner" />));
  assert.equal(learner("script").length, 0);
  assert.ok(learner.text().includes(edited.sourceText));
  const key = load(renderToStaticMarkup(<ReadingTestWorksheet content={edited} locale="nb" mode="key" />));
  assert.deepEqual(key(".reading-test-sheet-answer strong").map((_, element) => key(element).text()).get(), [getReadingTestPrintCopy("nb").missingAnswer, getReadingTestPrintCopy("nb").missingAnswer]);
});

test("print task ordering matches the digital player's enabled/order rules without mutating the editor", () => {
  const original = content.tasks.map(task => task.id);
  assert.deepEqual(orderedPrintTasks(content.tasks).map(task => task.id), ["mcq", "false", "summary"]);
  assert.deepEqual(content.tasks.map(task => task.id), original);
});

test("saved reading tests preserve all three task types and legacy false keys without importing lesson decorations", () => {
  const saved = { ...content, lessonType: "reading_test", readingTestConfig: {cefrLevel: "B1"},
    coverImageUrl: "https://invalid.example/cover.png", beforeReading: "BEFORE READING MUST NOT PRINT",
    tasks: [...content.tasks, {id: "legacy", type: "truefalse", prompt: "Legacy statement", correctAnswer: "False"}],
  };
  assert.equal(isReadingTestPrintLesson(saved), true);
  const normalized = readingTestPrintContent(saved, "Fallback", "nb");
  assert.equal(normalized.level, "B1");
  assert.equal(normalized.tasks.length, 4);
  assert.equal(normalized.unsupportedTaskCount, 0);
  const $ = load(renderToStaticMarkup(<ReadingTestWorksheet content={normalized} locale="nb" mode="learner" />));
  assert.equal($(".reading-test-sheet-task").length, 4);
  assert.equal($(".reading-test-sheet-options").length, 4);
  assert.equal($("img").length, 0);
  assert.ok(!$.text().includes(saved.beforeReading));
  assert.ok(!$.html().includes(saved.coverImageUrl));
  const key = load(renderToStaticMarkup(<ReadingTestWorksheet content={normalized} locale="nb" mode="key" />));
  assert.equal(key(".reading-test-sheet-task").filter((_, element) => key(element).text().includes("Legacy statement")).find(".reading-test-sheet-answer strong").text(), "Usant");
});

test("unsupported active tasks are reported instead of silently producing an incomplete reading test", () => {
  const normalized = readingTestPrintContent({ ...content, tasks: [...content.tasks,
    {id: "open", type: "open", prompt: "Unsupported active task"},
    {id: "disabled-open", type: "open", prompt: "Disabled task", enabled: false},
  ] }, "Fallback", "nb");
  assert.equal(normalized.unsupportedTaskCount, 1);
  assert.equal(normalized.tasks.length, 3);
  assert.equal(isReadingTestPrintLesson({lessonType:"text",tasks:content.tasks}), false);
  assert.equal(isReadingTestPrintLesson({meta:["reading_test"]}), true);
  assert.equal(isReadingTestPrintLesson({lesson_type:" READING_TEST "}), true);
});

test("question page breaks apply only to learner sheets and retain all summary and true/false options", () => {
  for (const layout of ["after_text", "new_page"] as const) {
    const $ = load(renderToStaticMarkup(<ReadingTestWorksheet content={content} locale="nb" mode="learner" layout={layout} />));
    assert.equal($(".reading-test-questions-new-page").length, layout === "new_page" ? 1 : 0);
    assert.equal($(".reading-test-sheet-options li").length, 7);
    const key = load(renderToStaticMarkup(<ReadingTestWorksheet content={content} locale="nb" mode="key" layout={layout} />));
    assert.equal(key(".reading-test-questions-new-page").length, 0);
    assert.equal(key(".reading-test-sheet-answer").length, 3);
  }
});

test("automatic layout uses printable A4 space rather than a level label", () => {
  // Measured at 182 mm printable width and 269 mm printable height.
  assert.equal(automaticReadingPrintLayout(800, 688), "after_text");
  assert.equal(automaticReadingPrintLayout(1200, 688), "new_page");
  assert.equal(automaticReadingPrintLayout(688 * 269 / 182, 688), "new_page", "leave a small rounding margin");
  assert.equal(automaticReadingPrintLayout(800, 0), "new_page");
});
