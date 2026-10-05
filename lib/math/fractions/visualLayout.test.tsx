import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import FractionVisual from "@/components/generators/math/fractions/FractionVisual";
import FractionShadeInput, { getSelectedFractionParts } from "@/components/generators/math/fractions/FractionShadeInput";
import FractionInput from "@/components/generators/math/fractions/FractionInput";
import { getFractionVisualLayout } from "./visualLayout";
import { getFractionCopy } from "./uiCopy";

test("equal parts form complete rectangles for every supported denominator", () => {
  for (let total = 2; total <= 12; total += 1) {
    for (const visual of ["bar", "rectangle", "circle"] as const) {
      const layout = getFractionVisualLayout(total, visual);
      assert.equal(layout.parts.length, total);
      assert.ok(layout.parts.every((path) => !/NaN|Infinity/.test(path)));
      if (visual !== "circle") assert.equal(layout.rows * layout.columns, total);
      if (visual === "bar") assert.equal(layout.rows, 1);
    }
  }
});

test("invalid partitions are rejected and a single circular whole is renderable", () => {
  assert.throws(() => getFractionVisualLayout(0, "rectangle"));
  assert.throws(() => getFractionVisualLayout(2.5, "circle"));
  assert.equal(getFractionVisualLayout(1, "circle").parts[0].split("A 88").length, 3);
});

test("static and interactive figures use the selected model and exact marked indices", () => {
  for (const visual of ["bar", "rectangle", "circle"] as const) {
    const figure = load(renderToStaticMarkup(<FractionVisual fraction={{ numerator: 3, denominator: 7 }} visual={visual} />));
    assert.equal(figure("svg").attr("data-visual"), visual);
    assert.equal(figure('path[fill="#10b981"]').length, 3);
    assert.equal(figure("path").length, 7);
    const input = load(renderToStaticMarkup(<FractionShadeInput numerator={3} denominator={7} visual={visual}
      value={{ selectedParts: [0, 3, 6] }} onChange={() => {}} />));
    assert.equal(input("svg").attr("data-visual"), visual);
    assert.equal(input('[role="button"]').length, 7);
    assert.deepEqual(input('path[aria-pressed="true"]').map((_, el) => input(el).attr("aria-label")).get(), ["Del 1 av 7", "Del 4 av 7", "Del 7 av 7"]);
    const locked = load(renderToStaticMarkup(<FractionShadeInput numerator={3} denominator={7} visual={visual}
      value={{ selectedParts: [0, 3, 6] }} onChange={() => {}} disabled />));
    assert.equal(locked('[role="button"]').length, 0);
    assert.equal(locked('path[fill="#10b981"]').length, 3);
  }
});

test("selection sanitization keeps existing answer objects compatible", () => {
  assert.deepEqual(getSelectedFractionParts({ selectedParts: [6, 1, 1, -1, 7, 2.5] }, 7), [1, 6]);
  assert.deepEqual(getSelectedFractionParts("2/7", 7), []);
});

test("labels follow the worksheet language and saved fractions fill the same inputs", () => {
  for (const language of ["nb", "en", "pt"] as const) {
    const copy = getFractionCopy(language);
    const $ = load(renderToStaticMarkup(<FractionInput value="11/12" onChange={() => {}} language={language} />));
    assert.deepEqual($("label").map((_, el) => $(el).text()).get(), [copy.numerator, copy.denominator]);
    assert.deepEqual($("input").map((_, el) => $(el).attr("value")).get(), ["11", "12"]);
    const visual = load(renderToStaticMarkup(<FractionVisual fraction={{ numerator: 2, denominator: 4 }} language={language} />));
    assert.match(visual("title").text(), new RegExp(copy.shaded));
  }
});
