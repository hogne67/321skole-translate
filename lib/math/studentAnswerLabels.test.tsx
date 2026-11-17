import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { load } from "cheerio";
import ArithmeticView from "@/components/generators/math/arithmetic/ArithmeticWorksheetStudentView";
import GeometryView from "@/components/generators/math/geometry/GeometryWorksheetPracticeView";
import { UI_COPY } from "./arithmetic/uiCopy";
import type { ArithmeticTask, ArithmeticWorksheet } from "./arithmetic/types";
import type { MathWorksheet } from "./geometry/types";
import nb from "@/messages/nb/math/mathGeometry.json";
import en from "@/messages/en/math/mathGeometry.json";
import pt from "@/messages/pt/math/mathGeometry.json";

const messages = { nb, en, pt };
for (const language of ["nb", "en", "pt"] as const) {
  test(`arithmetic answers have distinct names in every layout, including missing operands (${language})`, () => {
    const tasks: ArithmeticTask[] = [
      { id: "sum", operation: "addition", left: 2, right: 8, answer: 10, expression: "2 + 8", prompt: "2 + 8 =" },
      { id: "left", operation: "subtraction", left: 8, right: 2, answer: 8, expression: "8 - 2", prompt: "□ - 2 = 6", unknownPosition: "left" },
      { id: "right", operation: "multiplication", left: 2, right: 4, answer: 4, expression: "2 × 4", prompt: "2 × □ = 8", unknownPosition: "right" },
      { id: "divide", operation: "division", left: 8, right: 2, answer: 4, expression: "8 ÷ 2", prompt: "8 ÷ 2 =" },
    ];
    const copy = UI_COPY[language].worksheet;
    for (const layout of ["grid", "vertical", "visual"] as const) for (const readOnly of [false, true]) {
      const worksheet: ArithmeticWorksheet = { title: "Regnearter", instructions: "Regn ut.", language, layout,
        level: "grade_3_4", difficulty: "easy", operation: "mixed", taskCount: tasks.length,
        numberRange: { min: 0, max: 10 }, showAnswerKey: true, tasks };
      const $ = load(renderToStaticMarkup(<ArithmeticView worksheet={worksheet} readOnly={readOnly} answersByTaskId={{ sum: "10" }} />));
      const inputs = $("input");
      assert.equal(inputs.length, tasks.length);
      const names = inputs.map((_, input) => $(input).attr("aria-label")).get();
      assert.equal(new Set(names).size, tasks.length);
      inputs.each((index, input) => {
        assert.ok(names[index].startsWith(`${copy.task} ${index + 1}: ${copy.answer}. `));
        assert.ok(names[index].endsWith(tasks[index].prompt));
        assert.equal($(input).is("[readonly]"), readOnly);
      });
      assert.equal(inputs.first().attr("value"), "10");
    }
  });

  test(`geometry labels identify task, answer type and unit, and remain unique across views (${language})`, () => {
    const translate = createTranslator({ locale: language, messages: messages[language], namespace: "mathGeometry" });
    const t = (key: string) => translate(key as Parameters<typeof translate>[0]);
    const worksheet: MathWorksheet = { title: "Geometri", instructions: "Svar.", language, topic: "all",
      level: "grade_3_4", difficulty: "easy", selectedShapes: ["square"], showAnswerKey: true, showFormulas: false,
      tasks: ["shape_name", "perimeter", "area", "all_in_one"].map((type, index) => ({
        id: String(index), type: type as MathWorksheet["tasks"][number]["type"], prompt: "Se på figuren.",
        figure: { kind: "square", sideCm: 3 }, answer: "kvadrat; 12 cm; 9 cm²",
      })) };
    for (const readOnly of [false, true]) {
      const $ = load(renderToStaticMarkup(<>
        <GeometryView worksheet={worksheet} t={t} tBrand={() => "skole"} readOnly={readOnly} />
        <GeometryView worksheet={worksheet} t={t} tBrand={() => "skole"} readOnly={readOnly} />
      </>));
      assert.equal($("input").length, 12);
      const ids = $("input").map((_, input) => $(input).attr("id")).get();
      assert.equal(new Set(ids).size, ids.length);
      $("label").each((_, label) => {
        const id = $(label).attr("for");
        const input = $("input").filter((_, field) => $(field).attr("id") === id);
        assert.equal(input.length, 1);
        assert.ok(input.attr("aria-label")?.includes($(label).text()));
      });
      const names = $("input").map((_, input) => $(input).attr("aria-label")).get();
      assert.deepEqual(names.slice(0, 6), [
        `${t("taskLabel")} 1: ${t("writeShapeName")}`,
        `${t("taskLabel")} 2: ${t("writePerimeterAnswer")} (cm)`,
        `${t("taskLabel")} 3: ${t("writeAreaAnswer")} (cm²)`,
        `${t("taskLabel")} 4: ${t("writeShapeName")}`,
        `${t("taskLabel")} 4: ${t("writePerimeterAnswer")} (cm)`,
        `${t("taskLabel")} 4: ${t("writeAreaAnswer")} (cm²)`,
      ]);
      assert.equal($("input[disabled]").length, readOnly ? 12 : 0);
    }
  });
}
