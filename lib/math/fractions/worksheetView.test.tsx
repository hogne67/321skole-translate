import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import FractionGeneratorPanel from "@/components/generators/math/fractions/FractionGeneratorPanel";
import FractionCalculationPanel from "@/components/generators/math/fractions/FractionCalculationPanel";
import { generateWorksheet, normalizeRequest } from "./generateWorksheet";
import { generateCalculationWorksheet, normalizeCalculationRequest } from "./generateCalculationWorksheet";
import { getFractionCopy } from "./uiCopy";

// Styles are checked in the browser; Node markup tests only need the component.
const nodeRequire = createRequire(import.meta.url);
nodeRequire.extensions[".css"] = () => {};
const View = nodeRequire("../../../components/generators/math/fractions/FractionWorksheetView").default as typeof import("@/components/generators/math/fractions/FractionWorksheetView").default;

test("the generator offers task, part and model controls instead of grade and difficulty", () => {
  const $ = load(renderToStaticMarkup(<FractionGeneratorPanel
    language="nb" topic="mixed" taskCount={6} denominatorMin={2} denominatorMax={8}
    visualKinds={["bar"]} includeHints showAnswerKey={false} loading={false} saving={false} sharing={false} hasWorksheet={false} validRange
    onTopicChange={() => {}} onTaskCountChange={() => {}} onMinimumChange={() => {}} onMaximumChange={() => {}}
    onToggleVisual={() => {}} onHintsChange={() => {}} onAnswerKeyChange={() => {}} onGenerate={() => {}} onSave={() => {}} onShare={() => {}} onPrint={() => {}}
  />));
  assert.equal($("select").length, 1);
  assert.equal($("input[type='checkbox']").length, 5);
  assert.equal($("input[type='number']").length, 3);
  assert.doesNotMatch($.text(), /Språk|Nivå|Vanskelighetsgrad|trinn/);
  assert.ok($.text().includes("Deler i helheten"));
});

test("saved answer keys remain printable but never appear in embedded student view", () => {
  const worksheet = generateWorksheet(normalizeRequest({ showAnswerKey: true }));
  const printed = load(renderToStaticMarkup(<View worksheet={worksheet} printMode showAutoCheck={false} />));
  assert.equal(printed(".fraction-answer-key").length, 1);
  const student = load(renderToStaticMarkup(<View worksheet={worksheet} variant="embedded" showIdentityFields={false} />));
  assert.equal(student(".fraction-answer-key").length, 0);
  assert.equal(student("article").length, worksheet.tasks.length);
});

test("generator, digital and readonly views retain every chosen shape and localized labels", () => {
  for (const language of ["nb", "en", "pt"] as const) {
    for (const visual of ["bar", "rectangle", "circle"] as const) {
      const worksheet = generateWorksheet(normalizeRequest({ language, topic: "part_of_whole", visualKinds: [visual], denominatorMin: 12, denominatorMax: 12 }));
      const copy = getFractionCopy(language);
      const print = load(renderToStaticMarkup(<View worksheet={worksheet} printMode showAutoCheck={false} />));
      assert.equal(print('svg[data-visual]').length, 6);
      assert.equal(print(`svg[data-visual='${visual}']`).length, 6);
      assert.equal(print('path[fill="#10b981"]').length, 0);
      assert.ok(print.text().includes(copy.hint));
      const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, { selectedParts: Array.from({ length: task.fraction.numerator }, (_, index) => index) }]));
      const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly variant="embedded" showIdentityFields={false} />));
      assert.equal(teacher('path[role="button"]').length, 0);
      assert.ok(teacher.text().includes(`${copy.correct}: 6 / 6`));
      assert.equal(teacher('path[fill="#10b981"]').length, worksheet.tasks.reduce((sum, task) => sum + task.fraction.numerator, 0));
    }
  }
});

test("print and editable fraction fields and multiple-choice layouts stay distinct", () => {
  const write = generateWorksheet(normalizeRequest({ topic: "write_fraction", language: "en" }));
  const digital = load(renderToStaticMarkup(<View worksheet={write} showAutoCheck={false} answersByTaskId={{ "1": "11/12" }} />));
  assert.equal(digital("input").length, 12);
  assert.deepEqual(digital("article").first().find("input").map((_, el) => digital(el).attr("value")).get(), ["11", "12"]);
  assert.ok(digital.text().includes("Numerator"));
  const print = load(renderToStaticMarkup(<View worksheet={write} printMode showAutoCheck={false} />));
  assert.equal(print("input").length, 0);
  assert.equal(print(".fraction-blank").length, 6);
  const choose = generateWorksheet(normalizeRequest({ topic: "choose_fraction" }));
  const choices = load(renderToStaticMarkup(<View worksheet={choose} printMode showAutoCheck={false} />));
  assert.equal(choices("article button").length, 18);
  assert.equal(choices("article button[disabled]").length, 18);
});

test("generator and saved print views share the same compact-print layout hooks", () => {
  const worksheet = generateWorksheet(normalizeRequest({ topic: "mixed" }));
  for (const variant of ["generator", "worksheet"] as const) {
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode variant={variant} includeHints showAutoCheck={false} />));
    assert.equal($("header.fraction-worksheet-header").length, 1);
    assert.equal($(".fraction-worksheet-brand").length, 1);
    assert.equal($(".fraction-worksheet-identity > div").length, 3);
    assert.equal($(".fraction-task-list > article").length, 6);
    assert.equal($(".fraction-task-hint").length, 6);
    assert.equal($(".fraction-blank").length, 2);
    assert.equal($(".fraction-print-options").length, 2);
    assert.equal($(".fraction-print-task-shade_fraction svg").length, 2);
  }
});

test("calculation views retain half credit and whole-number answers across student, teacher and print", () => {
  const worksheet = generateCalculationWorksheet(normalizeCalculationRequest({ taskCount: 6, requireReduced: true, showAnswerKey: true }));
  worksheet.tasks = worksheet.tasks.map((task, index) => ({ ...task, answer: index === 2 ? "1" : "1/2" }));
  const answers = { "1": "2/4", "2": "1/2", "3": "1/1" };
  const student = load(renderToStaticMarkup(<View worksheet={worksheet} variant="embedded" answersByTaskId={answers} showIdentityFields={false} />));
  assert.equal(student(".fraction-answer-key").length, 0);
  assert.match(student.text(), /Delvis riktig: 1/);
  assert.match(student.text(), /Score: 42%/);
  assert.match(student("article").first().text(), /Riktig verdi.*50%/);
  const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} variant="embedded" answersByTaskId={answers} readOnly showIdentityFields={false} />));
  assert.equal(teacher("fieldset[disabled]").length, 6);
  assert.equal(teacher("input").length, 12);
  assert.deepEqual(teacher("article").first().find("input").map((_, el) => teacher(el).attr("value")).get(), ["2", "4"]);
  assert.match(teacher.text(), /Score: 42%/);
  const print = load(renderToStaticMarkup(<View worksheet={worksheet} printMode showAutoCheck={false} />));
  assert.equal(print(".fraction-calculation-blank").length, 6);
  assert.equal(print("input").length, 0);
  assert.equal(print(".fraction-answer-key").length, 1);
  assert.equal(print(".fraction-answer-key [aria-label='1/1']").length, 1);
});

test("fraction calculations use stacked operands and answers without diagrams in every view", () => {
  for (const language of ["nb", "en", "pt"] as const) {
    const worksheet = generateCalculationWorksheet(normalizeCalculationRequest({ language, taskCount: 6 }));
    for (const variant of ["embedded", "worksheet", "generator"] as const) {
      const $ = load(renderToStaticMarkup(<View worksheet={worksheet} variant={variant} showAutoCheck={false} answersByTaskId={{ "1": "5/4", "2": "1/1" }} />));
      assert.equal($("svg").length, 0);
      assert.equal($(".fraction-calculation-expression > span[aria-label]").length, 12);
      assert.equal($(".fraction-calculation-answer").length, 6);
      assert.deepEqual($("article").first().find("input").map((_, el) => $(el).attr("value")).get(), ["5", "4"]);
      assert.deepEqual($("article").eq(1).find("input").map((_, el) => $(el).attr("value")).get(), ["1", "1"]);
      const instructions = $("header p").text();
      assert.match(instructions, language === "nb" ? /ikke blandet tall/ : language === "en" ? /not mixed numbers/ : /não com números mistos/);
      assert.match(instructions, language === "nb" ? /nevner 1/ : language === "en" ? /denominator 1/ : /denominador 1/);
    }
  }
});

test("calculation controls replace fixed and varied modes with same and different denominators", () => {
  const props = {
    language: "nb" as const, operation: "addition" as const, denominatorRelation: "different" as const,
    denominatorMin: 7, denominatorMax: 7, requireReduced: false, taskCount: 36, showAnswerKey: false,
    loading: false, saving: false, sharing: false, hasWorksheet: false, validRange: true, validDenominators: false,
    onOperationChange: () => {}, onDenominatorRelationChange: () => {}, onMinimumChange: () => {}, onMaximumChange: () => {},
    onTaskCountChange: () => {}, onRequireReducedChange: () => {}, onAnswerKeyChange: () => {},
    onGenerate: () => {}, onSave: () => {}, onShare: () => {}, onPrint: () => {},
  };
  const $ = load(renderToStaticMarkup(<FractionCalculationPanel {...props} />));
  assert.doesNotMatch($.text(), /Fast nevner|Variert nevner/);
  assert.ok($.text().includes("Like nevnere"));
  assert.ok($.text().includes("Ulike nevnere"));
  assert.deepEqual($("select option").map((_, option) => $(option).text()).get(), ["Addisjon", "Subtraksjon", "Multiplikasjon", "Divisjon", "Blandet"]);
  assert.equal($("input[type='number']").length, 3);
  assert.match($("[role='alert']").text(), /minst og størst er forskjellige/);
  assert.equal($("button").first().is("[disabled]"), true);
  const valid = load(renderToStaticMarkup(<FractionCalculationPanel {...props} denominatorMax={8} validDenominators />));
  assert.equal(valid("[role='alert']").length, 0);
  assert.equal(valid("button").first().attr("disabled"), undefined);
});

test("multiplication and division symbols and grades agree in student, teacher and print views", () => {
  for (const operation of ["multiplication", "division"] as const) {
    const worksheet = generateCalculationWorksheet(normalizeCalculationRequest({ operation, denominatorRelation: "different", taskCount: 6, showAnswerKey: true }));
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, task.answer]));
    for (const readOnly of [false, true]) {
      const $ = load(renderToStaticMarkup(<View worksheet={worksheet} variant="embedded" answersByTaskId={answers} readOnly={readOnly} />));
      assert.equal($("svg").length, 0);
      assert.deepEqual($("[data-operation]").map((_, symbol) => $(symbol).text()).get(), Array(6).fill(operation === "multiplication" ? "×" : "÷"));
      assert.equal($(".fraction-answer-key").length, 0);
      assert.match($.text(), /Score: 100%/);
    }
    const print = load(renderToStaticMarkup(<View worksheet={worksheet} printMode showAutoCheck={false} />));
    assert.equal(print(".fraction-calculation-blank").length, 6);
    assert.equal(print(".fraction-answer-key").length, 1);
    assert.ok(print("[data-operation]").map((_, symbol) => print(symbol).text()).get().every(symbol => symbol === (operation === "multiplication" ? "×" : "÷")));
  }
});

test("saved unlike-denominator tasks retain both operands and correct answers in every presentation", () => {
  const worksheet = JSON.parse(JSON.stringify(generateCalculationWorksheet(normalizeCalculationRequest({ denominatorRelation: "different", operation: "mixed", taskCount: 6 }))));
  const answers = Object.fromEntries(worksheet.tasks.map((task: { id: string; answer: string }) => [task.id, task.answer]));
  for (const printMode of [false, true]) {
    for (const variant of ["embedded", "worksheet", "generator"] as const) {
      const $ = load(renderToStaticMarkup(<View worksheet={worksheet} variant={variant} answersByTaskId={answers} printMode={printMode} readOnly />));
      assert.equal($("svg").length, 0);
      $("article").each((index, el) => {
        const { left, right } = worksheet.tasks[index].calculation;
        assert.notEqual(left.denominator, right.denominator);
        assert.deepEqual($(el).find(".fraction-calculation-expression > span[aria-label]").map((_, fraction) => $(fraction).attr("aria-label")).get(), [`${left.numerator}/${left.denominator}`, `${right.numerator}/${right.denominator}`]);
      });
      if (printMode) assert.equal($(".fraction-calculation-blank").length, 6);
      else assert.match($.text(), /Score: 100%/);
    }
  }
});
