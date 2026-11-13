"use client";
import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { DEFAULT_PERCENTAGE_SETTINGS, PERCENTAGE_MODES, getPercentageCopy, isPercentageChange, normalizePercentageSettings, percentageChoices, percentageTasksPerPage, sanitizePercentageWorksheet, type PercentageSettings, type PercentageMode, type PercentageWorksheet } from "@/lib/math/percentage/worksheet";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import MathSpacePicker from "../MathSpacePicker";
import MathGeneratorActions from "../MathGeneratorActions";
import { useMathWorksheetSave } from "../useMathWorksheetSave";
import { useSavedMathWorksheet } from "../useSavedMathWorksheet";
import PercentageWorksheetView from "./PercentageWorksheetView";

export default function PercentageGenerator() {
  const locale = useLocale(), copy = getPercentageCopy(locale), common = getMeasurementCopy(locale);
  const [settings, setSettings] = useState<PercentageSettings>({ ...DEFAULT_PERCENTAGE_SETTINGS });
  const [hasCustomCount, setHasCustomCount] = useState(false);
  const supportLabel = { find_percentage: copy.support, find_part: copy.partSupport, find_whole: copy.wholeSupport, mixed: copy.mixedSupport, discount: copy.changeSupport, increase: copy.changeSupport }[settings.taskType ?? "find_percentage"];
  const [worksheet, setWorksheet] = useState<PercentageWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState(locale);
  const persistence = useMathWorksheetSave({ worksheet: worksheet ? { ...worksheet, showAnswerKey } : null, endpoint: "/api/producer/save-percentage-worksheet", language: locale });
  const { savedId, sharing, setSharing, success } = persistence;
  const restored = useSavedMathWorksheet(locale, (data, id) => {
    const result = sanitizePercentageWorksheet(data.mathWorksheet);
    if (!result) return false;
    setWorksheet(result); setSettings(result.settings); setShowAnswerKey(result.showAnswerKey); setLanguage(result.language);
    setHasCustomCount(true);
    persistence.rememberSaved(id, result);
    return true;
  });
  function change(next: Partial<PercentageSettings>) {
    setSettings(current => {
      const updated = { ...current, ...next };
      return !hasCustomCount && (next.showConclusion !== undefined || next.taskType !== undefined) ? { ...updated, taskCount: percentageTasksPerPage(updated) } : updated;
    });
    setWorksheet(null); setError("");
  }
  let validation = "";
  try { if (!percentageChoices(normalizePercentageSettings(settings)).length) validation = copy.invalidCombinations; }
  catch (error) { validation = error instanceof Error && error.message === "INVALID_COUNT" ? common.invalidCount : error instanceof Error && error.message === "INVALID_TYPE" ? copy.invalidType : copy.invalidRange; }
  async function generate() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/generate-percentage-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language, showAnswerKey }) });
      const data = await response.json(), result = sanitizePercentageWorksheet(data.worksheet);
      if (!response.ok || !result) throw new Error(common.failed);
      setWorksheet(result);
    } catch (error) { setError(error instanceof Error ? error.message : common.failed); }
    finally { setBusy(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.title}</h1><p>{copy.subtitle}</p>
      <label className="length-field">{copy.taskType}<select disabled={busy} value={settings.taskType ?? "find_percentage"} onChange={e => change({ taskType: e.target.value as PercentageMode })}>{PERCENTAGE_MODES.map(type => <option key={type} value={type}>{copy[type]}</option>)}</select></label>
      <label className="length-field">{common.count}<input disabled={busy} type="number" min={1} max={100} value={Number.isNaN(settings.taskCount) ? "" : settings.taskCount} onChange={e => { setHasCustomCount(true); change({ taskCount: e.target.valueAsNumber }); }} /></label>
      <fieldset disabled={busy}><legend>{isPercentageChange(settings.taskType) ? copy.priceRange : copy.range}</legend><div className="length-range">{(["minimum", "maximum"] as const).map(field => <label key={field}>{field === "minimum" ? common.minimum : common.maximum}<input type="number" min={1} max={10000} value={Number.isNaN(settings[field]) ? "" : settings[field]} onChange={e => change({ [field]: e.target.valueAsNumber })} /></label>)}</div></fieldset>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.showSupport} onChange={e => change({ showSupport: e.target.checked })} />{supportLabel}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.showConclusion ?? false} onChange={e => change({ showConclusion: e.target.checked })} />{copy.showConclusion}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={showAnswerKey} onChange={e => { setShowAnswerKey(e.target.checked); }} />{common.key}</label>
      {validation ? <p className="length-error" role="status">{validation}</p> : null}
      <MathGeneratorActions language={locale} generating={busy} saving={persistence.saving} loading={restored.loading} canGenerate={!validation} hasWorksheet={!!worksheet}
        onGenerate={() => { void generate(); }} onSave={() => { void persistence.save(); }} onShare={() => { void persistence.save(true); }} />
      {error || persistence.error || restored.error ? <p className="length-error" role="alert">{error || persistence.error || restored.error}</p> : null}{success ? <p className="length-success" role="status">{success}</p> : null}
      {savedId ? <Link href={`/${locale}/content`}>{common.openContent}</Link> : null}
    </aside>
    <section className="length-preview" aria-label={common.worksheet}>{worksheet ? <PercentageWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{sharing && savedId && worksheet ? <MathSpacePicker worksheetId={savedId} title={worksheet.title} language={worksheet.language} onClose={() => setSharing(false)} onShared={persistence.shared} /> : null}</main>;
}
