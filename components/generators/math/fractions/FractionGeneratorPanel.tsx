"use client";

import MathGeneratorActions from "../MathGeneratorActions";
import { getFractionCopy } from "@/lib/math/fractions/uiCopy";
import type { FractionLanguage, FractionTopic, FractionVisualKind } from "@/lib/math/fractions/types";
import { FRACTION_VISUAL_MAX_TASK_COUNT, fractionVisualFullPageCounts, fractionVisualPageCapacity, normalizeFractionVisualTaskCount } from "@/lib/math/fractions/printLayout";

type Props = {
  language: FractionLanguage;
  topic: FractionTopic;
  taskCount: number;
  countMode: "pages" | "custom";
  onCountModeChange: (value: "pages" | "custom") => void;
  denominatorMin: number;
  denominatorMax: number;
  visualKinds: FractionVisualKind[];
  includeHints: boolean;
  showAnswerKey: boolean;
  onTopicChange: (value: FractionTopic) => void;
  onTaskCountChange: (value: number) => void;
  onMinimumChange: (value: number) => void;
  onMaximumChange: (value: number) => void;
  onToggleVisual: (value: FractionVisualKind) => void;
  onHintsChange: (value: boolean) => void;
  onAnswerKeyChange: (value: boolean) => void;
  onGenerate: () => void;
  onSave: () => void;
  onShare: () => void;
  loadingSaved?: boolean;
  loading: boolean;
  saving: boolean;
  sharing: boolean;
  hasWorksheet: boolean;
  validRange: boolean;
};

const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600";
const labelClass = "mb-1.5 block text-sm font-bold text-slate-700";

export default function FractionGeneratorPanel(p: Props) {
  const copy = getFractionCopy(p.language);
  const options = { topic: p.topic, visualKinds: p.visualKinds, showHints: p.includeHints, denominatorMax: p.denominatorMax };
  const counts = fractionVisualFullPageCounts(options), capacity = fractionVisualPageCapacity(options);
  const busy = p.loading || p.saving || p.sharing || p.loadingSaved;
  return <div className="mt-6 grid gap-5">
    <label>
      <span className={labelClass}>{copy.taskType}</span>
      <select value={p.topic} onChange={(e) => p.onTopicChange(e.target.value as FractionTopic)} className={fieldClass}>
        <option value="mixed">{copy.mixed}</option>
        <option value="part_of_whole">{copy.shade}</option>
        <option value="write_fraction">{copy.write}</option>
        <option value="choose_fraction">{copy.choose}</option>
      </select>
    </label>
    <label>
      <span className={labelClass}>{copy.pageCount}</span>
      <select disabled={busy} value={p.countMode === "custom" ? "custom" : p.taskCount} aria-describedby="fraction-visual-page-hint" className={fieldClass} onChange={(event) => {
        if (event.target.value === "custom") p.onCountModeChange("custom");
        else { p.onCountModeChange("pages"); p.onTaskCountChange(Number(event.target.value)); }
      }}>{counts.map((count, page) => <option key={count} value={count}>{copy.pageOption.replace("{pages}", String(page + 1)).replace("{tasks}", String(count))}</option>)}<option value="custom">{copy.customCount}</option></select>
    </label>
    {p.countMode === "custom" ? <label><span className={labelClass}>{copy.taskCount}</span><input disabled={busy} type="number" min={1} max={FRACTION_VISUAL_MAX_TASK_COUNT} step={1} value={p.taskCount} className={fieldClass} onChange={event => p.onTaskCountChange(normalizeFractionVisualTaskCount(event.target.valueAsNumber, options))} /></label> : null}
    <p id="fraction-visual-page-hint" className="-mt-3 text-xs leading-5 text-slate-500">{copy.pageHint.replace("{first}", String(capacity.first)).replace("{following}", String(capacity.following))}</p>
    <fieldset>
      <legend className={labelClass}>{copy.parts}</legend>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="mb-1 block text-xs font-semibold text-slate-500">{copy.minimum}</span>
          <input type="number" min={2} max={12} step={1} value={p.denominatorMin} onChange={(e) => p.onMinimumChange(Number(e.target.value))} className={fieldClass} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-slate-500">{copy.maximum}</span>
          <input type="number" min={2} max={12} step={1} value={p.denominatorMax} onChange={(e) => p.onMaximumChange(Number(e.target.value))} className={fieldClass} />
        </label>
      </div>
      {!p.validRange ? <p className="mt-2 text-xs text-red-700" role="alert">{copy.invalidRange}</p> : null}
    </fieldset>
    <fieldset>
      <legend className={labelClass}>{copy.visualModel}</legend>
      <div className="grid gap-1.5">
        {(["bar", "rectangle", "circle"] as const).map((visual) => {
          const checked = p.visualKinds.includes(visual);
          return <label key={visual} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${checked ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 text-slate-700"}`}>
            <input type="checkbox" checked={checked} onChange={() => p.onToggleVisual(visual)} />
            {copy[visual]}
          </label>;
        })}
      </div>
      {!p.visualKinds.length ? <p className="mt-2 text-xs text-red-700" role="alert">{copy.selectFigure}</p> : null}
    </fieldset>
    <div className="grid gap-2 border-t border-slate-100 pt-4">
      <label className="flex cursor-pointer items-center gap-2 py-1 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={p.includeHints} onChange={(e) => p.onHintsChange(e.target.checked)} />{copy.hints}
      </label>
      <label className="flex cursor-pointer items-center gap-2 py-1 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={p.showAnswerKey} onChange={(e) => p.onAnswerKeyChange(e.target.checked)} />{copy.answerKey}
      </label>
    </div>
    <MathGeneratorActions language={p.language} generating={p.loading} saving={p.saving || p.sharing} loading={p.loadingSaved} canGenerate={p.validRange && p.visualKinds.length > 0} hasWorksheet={p.hasWorksheet}
      onGenerate={p.onGenerate} onSave={p.onSave} onShare={p.onShare} />

  </div>;
}
