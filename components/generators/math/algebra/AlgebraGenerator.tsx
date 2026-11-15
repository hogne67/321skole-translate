"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { DEFAULT_ALGEBRA_SETTINGS, ALGEBRA_LEVELS, getAlgebraCopy, normalizeAlgebraSettings, sanitizeAlgebraWorksheet, type AlgebraSettings, type AlgebraWorksheet } from "@/lib/math/algebra/worksheet";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import MathGeneratorActions from "../MathGeneratorActions";
import MathSpacePicker from "../MathSpacePicker";
import { useMathWorksheetSave } from "../useMathWorksheetSave";
import { useSavedMathWorksheet } from "../useSavedMathWorksheet";
import AlgebraWorksheetView from "./AlgebraWorksheetView";

export default function AlgebraGenerator() {
  const locale = useLocale(), copy = getAlgebraCopy(locale), common = getMeasurementCopy(locale);
  const [settings, setSettings] = useState<AlgebraSettings>({ ...DEFAULT_ALGEBRA_SETTINGS });
  const [worksheet, setWorksheet] = useState<AlgebraWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false), [language, setLanguage] = useState(locale);
  const [generating, setGenerating] = useState(false), [error, setError] = useState("");
  const persistence = useMathWorksheetSave({ worksheet: worksheet ? { ...worksheet, showAnswerKey } : null, endpoint: "/api/producer/save-algebra-worksheet", language: locale });
  const restored = useSavedMathWorksheet(locale, (data, id) => {
    const result = sanitizeAlgebraWorksheet(data.mathWorksheet);
    if (!result) return false;
    setWorksheet(result); setSettings(result.settings); setShowAnswerKey(result.showAnswerKey); setLanguage(result.language);
    persistence.rememberSaved(id, result);
    return true;
  });
  const busy = generating || persistence.saving || restored.loading;
  function change(next: Partial<AlgebraSettings>) { setSettings(current => ({ ...current, ...next })); setWorksheet(null); setError(""); }
  let validation = "";
  try { normalizeAlgebraSettings(settings); }
  catch { validation = copy.invalidSettings; }
  async function generate() {
    setGenerating(true); setError("");
    try {
      const response = await fetch("/api/generate-algebra-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language, showAnswerKey }) });
      const data = await response.json(), result = sanitizeAlgebraWorksheet(data.worksheet);
      if (!response.ok || !result) throw new Error(common.failed);
      setWorksheet(result);
    } catch (error) { setError(error instanceof Error ? error.message : common.failed); }
    finally { setGenerating(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.title}</h1><p>{copy.subtitle}</p>
      <label className="length-field">{copy.level}<select disabled={busy} value={settings.level} onChange={event => change({ level: event.target.value as AlgebraSettings["level"] })}>{ALGEBRA_LEVELS.map(level => <option key={level} value={level}>{copy[level]}</option>)}</select></label>
      <label className="length-field">{copy.maximum}<input disabled={busy} type="number" min={2} max={12} value={Number.isNaN(settings.maxCoefficient) ? "" : settings.maxCoefficient} onChange={event => change({ maxCoefficient: event.target.valueAsNumber })} /></label>
      <label className="length-field">{common.count}<input disabled={busy} type="number" min={1} max={60} value={Number.isNaN(settings.taskCount) ? "" : settings.taskCount} onChange={event => change({ taskCount: event.target.valueAsNumber })} /></label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.allowNegative} onChange={event => change({ allowNegative: event.target.checked })} />{copy.negative}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.includeSquares} onChange={event => change({ includeSquares: event.target.checked })} />{copy.squares}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.includeParentheses} onChange={event => change({ includeParentheses: event.target.checked })} />{copy.parentheses}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.showSupport} onChange={event => change({ showSupport: event.target.checked })} />{copy.support}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={showAnswerKey} onChange={event => setShowAnswerKey(event.target.checked)} />{common.key}</label>
      {validation ? <p role="status" className="length-error">{validation}</p> : null}
      <MathGeneratorActions language={locale} generating={generating} saving={persistence.saving} loading={restored.loading} canGenerate={!validation} hasWorksheet={!!worksheet}
        onGenerate={() => { void generate(); }} onSave={() => { void persistence.save(); }} onShare={() => { void persistence.save(true); }} />
      {error || persistence.error || restored.error ? <p role="alert" className="length-error">{error || persistence.error || restored.error}</p> : null}
      {persistence.success ? <p role="status" className="length-success">{persistence.success}</p> : null}
      {persistence.savedId ? <Link href={`/${locale}/content`}>{common.openContent}</Link> : null}
    </aside>
    <section className="length-preview" aria-label={common.worksheet}>{worksheet ? <AlgebraWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{persistence.sharing && persistence.savedId && worksheet ? <MathSpacePicker worksheetId={persistence.savedId} title={worksheet.title} language={worksheet.language} onClose={() => persistence.setSharing(false)} onShared={persistence.shared} /> : null}</main>;
}
