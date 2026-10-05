import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { load } from "cheerio";
import GeometryFigure from "@/components/generators/math/geometry/GeometryFigure";
import FigureMeta from "@/components/generators/math/geometry/FigureMeta";
import GeometryWorksheetView from "@/components/generators/math/geometry/GeometryWorksheetView";
import GeometryWorksheetPracticeView from "@/components/generators/math/geometry/GeometryWorksheetPracticeView";
import nb from "@/messages/nb/math/mathGeometry.json";
import en from "@/messages/en/math/mathGeometry.json";
import pt from "@/messages/pt/math/mathGeometry.json";
import { formatFigureMeta, formatNumber, getGeometryFigureNote, getGeometryTaskPrompt } from "./measurements";
import type { FigureSpec, MathWorksheet, MathWorksheetTask, WorksheetLanguage } from "./types";

const figures: FigureSpec[] = [
  { kind: "square", sideCm: 6 },
  { kind: "rectangle", widthCm: 8, heightCm: 5 },
  { kind: "parallelogram", baseCm: 10, sideCm: 5, heightCm: 4 },
  { kind: "rhombus", sideCm: 5, heightCm: 4 },
  { kind: "trapezoid", baseCm: 12, topCm: 6, sideLeftCm: 5, sideRightCm: 5, heightCm: 4 },
  { kind: "triangle_right", baseCm: 6, sideBcm: 8, sideCcm: 10, heightCm: 8 },
  { kind: "triangle_isosceles", baseCm: 8, sideBcm: 5, sideCcm: 5, heightCm: 3 },
  { kind: "triangle_equilateral", sideCm: 6, heightCm: 5.2 },
  { kind: "circle", radiusCm: 5 },
];
const prompt = "Finn navn, omkrets og areal.";
const messages = { nb, en, pt };

function worksheet(language: WorksheetLanguage): MathWorksheet {
  return {
    title: "Geometri", instructions: prompt, language, level: "grade_5_7",
    topic: "all", difficulty: "easy", showFormulas: false, showAnswerKey: true,
    selectedShapes: figures.map((figure) => figure.kind),
    tasks: figures.map((figure, index) => ({
      id: String(index + 1), type: "all_in_one", figure,
      prompt: `${prompt} ${formatFigureMeta(figure, language)}`,
      answer: "Fasit", inputMode: "split_name_perimeter_area",
      expected: { shapeName: "kvadrat", perimeterValue: 24, areaValue: 36 },
    })),
  };
}

test("legacy generated measurement suffixes are hidden without changing saved tasks", () => {
  for (const language of ["nb", "en", "pt"] as const) {
    const sheet = worksheet(language);
    const before = structuredClone(sheet);
    for (const task of sheet.tasks) {
      assert.ok(formatFigureMeta(task.figure!, language));
      assert.equal(getGeometryTaskPrompt(task, language), prompt);
    }
    assert.deepEqual(sheet, before);
  }
});

test("new and custom prompts and tasks without figures are preserved", () => {
  const task: MathWorksheetTask = { id: "1", type: "area", prompt, answer: "36", figure: figures[0] };
  assert.equal(getGeometryTaskPrompt(task, "nb"), prompt);
  const custom = { ...task, prompt: "Finn arealet. Side: 6 cm. Forklar svaret." };
  assert.equal(getGeometryTaskPrompt(custom, "nb"), custom.prompt);
  assert.equal(getGeometryTaskPrompt({ ...custom, figure: undefined }, "nb"), custom.prompt);
});

test("circle guidance and decimal separators follow the worksheet language", () => {
  assert.equal(formatNumber(5.2, "nb"), "5,2");
  assert.equal(formatNumber(5.2, "pt"), "5,2");
  assert.equal(formatNumber(5.2, "en"), "5.2");
  assert.equal(getGeometryFigureNote(figures[8], "nb"), "Bruk π = 3,14");
  assert.equal(getGeometryFigureNote(figures[8], "pt"), "Usa π = 3,14");
  assert.equal(getGeometryFigureNote(figures[8], "en"), "Use π = 3.14");
  assert.equal(getGeometryFigureNote(figures[0], "nb"), null);
  assert.equal(getGeometryFigureNote(undefined, "nb"), null);
});

test("every diagram retains measurements and an accessible description", () => {
  for (const language of ["nb", "en", "pt"] as const) {
    for (const figure of figures) {
      const $ = load(renderToStaticMarkup(<GeometryFigure figure={figure} language={language} />));
      assert.equal($("svg").attr("role"), "img");
      assert.equal($("svg").attr("aria-label"), formatFigureMeta(figure, language));
      assert.equal($("title").text(), formatFigureMeta(figure, language));
      assert.ok($("polygon, rect, circle").length > 0);
      assert.ok($("text").length > 0);
      for (const value of Object.values(figure).filter((value): value is number => typeof value === "number")) {
        assert.ok($("text").toArray().some((label) => $(label).text().includes(`${formatNumber(value, language)} cm`)));
      }
      if (figure.kind === "triangle_right") assert.equal($("polyline").length, 1);
      if (figure.kind === "circle") assert.match($("text").text(), /r = 5 cm/);
      if (figure.kind === "triangle_equilateral") assert.match($("text").text(), language === "en" ? /h = 5\.2 cm/ : /h = 5,2 cm/);
    }
  }
});

test("optional right-triangle metadata distinguishes the leg and hypotenuse", () => {
  const t = createTranslator({ locale: "nb", messages: nb, namespace: "mathGeometry" });
  const html = renderToStaticMarkup(<FigureMeta figure={figures[5]} tMeasurement={(key) => t(`measurements.${key}`)} />);
  assert.match(html, /katet: 8 cm/);
  assert.match(html, /hypotenus: 10 cm/);
});

for (const language of ["nb", "en", "pt"] as const) {
  test(`print, student and teacher presentations agree in ${language}`, () => {
    const sheet = worksheet(language);
    const translate = createTranslator({ locale: language, messages: messages[language], namespace: "mathGeometry" });
    const t = (key: string) => translate(key as Parameters<typeof translate>[0]);
    const tBrand = () => "skole";
    const print = load(renderToStaticMarkup(<GeometryWorksheetView worksheet={sheet} t={t} tBrand={tBrand} answerSpace="medium" includeHints />));
    assert.equal(print(".print-task-list").first().find(".print-task-prompt").length, figures.length);
    print(".print-task-list").first().find(".print-task-prompt").each((_, element) => assert.equal(print(element).text(), prompt));
    assert.equal(print(".figure-meta-text").length, 2);
    assert.equal(print(".print-answer-key").length, figures.length);

    for (const readOnly of [false, true]) {
      const $ = load(renderToStaticMarkup(<GeometryWorksheetPracticeView
        worksheet={sheet} t={t} tBrand={tBrand} readOnly={readOnly}
        answersByTaskId={{ "1": { taskId: "1", shapeName: "Kvadrat", perimeterValue: 24, areaValue: 36 } }}
        showInlineFeedback={readOnly}
        auto={{ byTaskId: { "1": { status: "correct", parts: { perimeter: { isCorrect: true }, area: { isCorrect: true }, shapeName: { isCorrect: true } } } } }}
      />));
      $("article h3").each((_, element) => assert.equal($(element).text(), prompt));
      assert.equal($(".figure-meta-text").length, 1);
      assert.equal($("svg").length, figures.length);
      assert.equal($("input").length, figures.length * 3);
      assert.equal($("input[disabled]").length, readOnly ? figures.length * 3 : 0);
      assert.deepEqual($("article").first().find("input").map((_, el) => $(el).attr("value")).get(), ["Kvadrat", "24", "36"]);
      $("input[placeholder]").each((_, el) => assert.equal($(el).attr("placeholder"), t("numberOnlyHelp")));
      assert.equal($("div").filter((_, el) => $(el).children().length === 0 && $(el).text() === t("numberOnlyHelp")).length, 0);
      if (language !== "en") assert.doesNotMatch($.html(), /Write only the number|Partially correct|Unanswered/);
      if (readOnly) assert.ok($("article").first().text().includes(t("correct")));
    }
  });
}
