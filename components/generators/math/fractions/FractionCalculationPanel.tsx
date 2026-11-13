"use client";

import MathGeneratorActions from "../MathGeneratorActions";
import { getFractionCopy } from "@/lib/math/fractions/uiCopy";
import { getCalculationCopy } from "@/lib/math/fractions/calculationCopy";
import { FRACTION_CALCULATION_OPERATIONS } from "@/lib/math/fractions/calculationOperations";
import type { FractionCalculationSettings, FractionLanguage } from "@/lib/math/fractions/types";

type Props = Omit<FractionCalculationSettings, "denominatorMode" | "denominatorRelation"> & {
  denominatorRelation: "same" | "different";
  language: FractionLanguage; taskCount: number; showAnswerKey: boolean;
  onOperationChange: (operation: FractionCalculationSettings["operation"]) => void;
  onDenominatorRelationChange: (relation: "same" | "different") => void;
  onMinimumChange: (value: number) => void; onMaximumChange: (value: number) => void;
  onTaskCountChange: (value: number) => void; onRequireReducedChange: (value: boolean) => void;
  onAnswerKeyChange: (value: boolean) => void;
  onGenerate: () => void; onSave: () => void; onShare: () => void;
  loadingSaved?: boolean;
  loading: boolean; saving: boolean; sharing: boolean; hasWorksheet: boolean; validRange: boolean; validDenominators: boolean;
};
const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600";
const label = "mb-1.5 block text-sm font-bold text-slate-700";
export default function FractionCalculationPanel(p: Props) {
  const copy = getFractionCopy(p.language), calc = getCalculationCopy(p.language);
  return <div className="mt-6 grid gap-5">
    <label><span className={label}>{calc.operation}</span><select className={field} value={p.operation} onChange={e => p.onOperationChange(e.target.value as Props["operation"])}>
      {([...FRACTION_CALCULATION_OPERATIONS, "mixed"] as const).map(operation => <option key={operation} value={operation}>{calc[operation]}</option>)}
    </select></label>
    <label><span className={label}>{copy.taskCount}</span><input type="number" min={6} max={100} step={1} className={field} value={p.taskCount} onChange={e => p.onTaskCountChange(Math.max(6, Math.min(100, Math.round(Number(e.target.value) || 6))))} /></label>
    <fieldset><legend className={label}>{calc.denominator}</legend>
      <div className="mb-3 grid grid-cols-2 gap-2">{(["same", "different"] as const).map(relation => <label key={relation} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-xs font-semibold ${relation === p.denominatorRelation ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-300 text-slate-700"}`}>
        <input type="radio" name="denominator-relation" value={relation} checked={relation === p.denominatorRelation} onChange={() => p.onDenominatorRelationChange(relation)} />{calc[relation]}
      </label>)}</div>
      <div className="grid grid-cols-2 gap-2">
        <label><span className="mb-1 block text-xs font-semibold text-slate-500">{calc.minimum}</span><input type="number" min={2} max={100} step={1} value={p.denominatorMin} onChange={e => p.onMinimumChange(Number(e.target.value))} className={field} /></label>
        <label><span className="mb-1 block text-xs font-semibold text-slate-500">{calc.maximum}</span><input type="number" min={2} max={100} step={1} value={p.denominatorMax} onChange={e => p.onMaximumChange(Number(e.target.value))} className={field} /></label>
      </div>
      {!p.validRange ? <p role="alert" className="mt-2 text-xs text-red-700">{calc.invalidRange}</p> : null}
      {p.validRange && !p.validDenominators ? <p role="alert" className="mt-2 text-xs text-red-700">{calc.differentRange}</p> : null}
    </fieldset>
    <div className="grid gap-2 border-t border-slate-100 pt-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={p.requireReduced} onChange={e => p.onRequireReducedChange(e.target.checked)} />{calc.requireReduced}</label>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={p.showAnswerKey} onChange={e => p.onAnswerKeyChange(e.target.checked)} />{copy.answerKey}</label>
    </div>
    <MathGeneratorActions language={p.language} generating={p.loading} saving={p.saving || p.sharing} loading={p.loadingSaved} canGenerate={p.validRange && p.validDenominators} hasWorksheet={p.hasWorksheet}
      onGenerate={p.onGenerate} onSave={p.onSave} onShare={p.onShare} />

  </div>;
}
