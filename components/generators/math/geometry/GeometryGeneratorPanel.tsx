"use client";

import { Printer, Save } from "lucide-react";
import { GEOMETRY_FIGURES } from "@/lib/math/geometry/types";
import type { Difficulty, FigureKind, GeometryAnswerSpace, GeometryTopic } from "@/lib/math/geometry/types";

type Props = {
  t: (key: string) => string;
  topic: GeometryTopic;
  difficulty: Difficulty;
  taskCount: number;
  answerSpace: GeometryAnswerSpace;
  selectedShapes: FigureKind[];
  includeHints: boolean;
  showFormulas: boolean;
  showAnswerKey: boolean;
  onTopicChange: (value: GeometryTopic) => void;
  onMeasurementsChange: (value: Difficulty) => void;
  onTaskCountChange: (value: number) => void;
  onAnswerSpaceChange: (value: GeometryAnswerSpace) => void;
  onToggleShape: (value: FigureKind) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onHintsChange: (value: boolean) => void;
  onFormulasChange: (value: boolean) => void;
  onAnswerKeyChange: (value: boolean) => void;
  onGenerate: () => void;
  onSave: () => void;
  onPrint: () => void;
  generating: boolean;
  saving: boolean;
  canGenerate: boolean;
  hasWorksheet: boolean;
};

const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600";
const labelClass = "mb-1.5 block text-sm font-bold text-slate-700";
const buttonClass = "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function shapeKey(shape: FigureKind) {
  if (shape === "triangle_right") return "triangleRight";
  if (shape === "triangle_isosceles") return "triangleIsosceles";
  if (shape === "triangle_equilateral") return "triangleEquilateral";
  return shape;
}

export default function GeometryGeneratorPanel(p: Props) {
  const { t } = p;
  return (
    <div className="mt-6 grid gap-5">
      <label>
        <span className={labelClass}>{t("generator.taskType")}</span>
        <select value={p.topic} onChange={(e) => p.onTopicChange(e.target.value as GeometryTopic)} className={fieldClass}>
          <option value="shapes">{t("generator.nameShapes")}</option>
          <option value="perimeter">{t("perimeter")}</option>
          <option value="area">{t("area")}</option>
          <option value="all">{t("generator.combined")}</option>
        </select>
      </label>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className={labelClass}>{t("chooseShapes")}</legend>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-500">{t("selectedCount")}: {p.selectedShapes.length}</span>
          <div className="flex gap-3">
            <button type="button" onClick={p.onSelectAll} className="font-semibold text-teal-700 underline">{t("selectAll")}</button>
            <button type="button" onClick={p.onClearAll} className="font-semibold text-slate-600 underline">{t("clearAll")}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {GEOMETRY_FIGURES.map((shape) => {
            const checked = p.selectedShapes.includes(shape);
            return (
              <label key={shape} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${checked ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 text-slate-700"}`}>
                <input type="checkbox" checked={checked} onChange={() => p.onToggleShape(shape)} className="h-4 w-4 shrink-0 accent-emerald-600" />
                <span className="min-w-0 break-words">{t(shapeKey(shape))}</span>
              </label>
            );
          })}
        </div>
        {p.selectedShapes.length === 0 ? <p className="mt-2 text-xs text-red-700">{t("selectAtLeastOneShape")}</p> : null}
      </fieldset>

      <label>
        <span className={labelClass}>{t("taskCount")}</span>
        <input type="number" min={4} max={12} step={1} value={p.taskCount} onChange={(e) => p.onTaskCountChange(Math.max(4, Math.min(12, Math.round(Number(e.target.value) || 4))))} className={fieldClass} />
      </label>

      <label>
        <span className={labelClass}>{t("generator.measurements")}</span>
        <select value={p.difficulty} onChange={(e) => p.onMeasurementsChange(e.target.value as Difficulty)} className={fieldClass}>
          <option value="easy">2–12 cm</option>
          <option value="medium">3–17 cm</option>
          <option value="hard">4–41 cm</option>
        </select>
      </label>

      <label>
        <span className={labelClass}>{t("answerSpace")}</span>
        <select value={p.answerSpace} onChange={(e) => p.onAnswerSpaceChange(e.target.value as GeometryAnswerSpace)} className={fieldClass}>
          <option value="small">{t("small")}</option>
          <option value="medium">{t("mediumSpace")}</option>
          <option value="large">{t("large")}</option>
        </select>
      </label>

      <div className="grid gap-2 border-t border-slate-100 pt-4">
        {[
          { label: t("hints"), checked: p.includeHints, change: p.onHintsChange },
          { label: t("showFormulas"), checked: p.showFormulas, change: p.onFormulasChange },
          { label: t("showAnswerKey"), checked: p.showAnswerKey, change: p.onAnswerKeyChange },
        ].map((option) => (
          <label key={option.label} className="flex cursor-pointer items-center gap-2 py-1 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={option.checked} onChange={(e) => option.change(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
            {option.label}
          </label>
        ))}
      </div>

      <div className="grid gap-2">
        <button type="button" onClick={p.onGenerate} disabled={!p.canGenerate} className="flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-950 bg-slate-950 px-3 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
          {p.generating ? t("generating") : t("generate")}
        </button>
        <button type="button" onClick={p.onSave} disabled={!p.hasWorksheet || p.saving || p.generating} className={buttonClass}>
          <Save size={16} aria-hidden="true" />{p.saving ? t("saving") : t("saveToMyContent")}
        </button>
        <button type="button" onClick={p.onPrint} disabled={!p.hasWorksheet || p.generating} className={buttonClass}>
          <Printer size={16} aria-hidden="true" />{t("print")}
        </button>
      </div>
    </div>
  );
}
