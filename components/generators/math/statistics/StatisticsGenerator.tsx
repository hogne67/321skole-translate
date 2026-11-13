"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { DEFAULT_STATISTICS_SETTINGS, getStatisticsCopy, STATISTICS_CHARTS, STATISTICS_DIFFICULTIES, STATISTICS_MODES, normalizeStatisticsSettings, sanitizeStatisticsWorksheet, type StatisticsMode, type StatisticsSettings, type StatisticsWorksheet } from "@/lib/math/statistics/worksheet";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import MathGeneratorActions from "../MathGeneratorActions";
import MathSpacePicker from "../MathSpacePicker";
import { useMathWorksheetSave } from "../useMathWorksheetSave";
import { useSavedMathWorksheet } from "../useSavedMathWorksheet";
import StatisticsWorksheetView from "./StatisticsWorksheetView";

export default function StatisticsGenerator() {
  const locale = useLocale(), copy = getStatisticsCopy(locale), common = getMeasurementCopy(locale);
  const [settings, setSettings] = useState<StatisticsSettings>({ ...DEFAULT_STATISTICS_SETTINGS });
  const [worksheet, setWorksheet] = useState<StatisticsWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false), [language, setLanguage] = useState(locale);
  const [generating, setGenerating] = useState(false), [error, setError] = useState("");
  const persistence = useMathWorksheetSave({ worksheet: worksheet ? { ...worksheet, showAnswerKey } : null, endpoint: "/api/producer/save-statistics-worksheet", language: locale });
  const restored = useSavedMathWorksheet(locale, (data, id) => {
    const result = sanitizeStatisticsWorksheet(data.mathWorksheet);
    if (!result) return false;
    setWorksheet(result); setSettings(result.settings); setShowAnswerKey(result.showAnswerKey); setLanguage(result.language);
    persistence.rememberSaved(id, result);
    return true;
  });
  const busy = generating || persistence.saving || restored.loading;
  function change(next: Partial<StatisticsSettings>) { setSettings(current => ({ ...current, ...next })); setWorksheet(null); setError(""); }
  let validation = "";
  try { normalizeStatisticsSettings(settings); }
  catch { validation = copy.invalid; }
  async function generate() {
    setGenerating(true); setError("");
    try {
      const response = await fetch("/api/generate-statistics-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language, showAnswerKey }) });
      const data = await response.json(), result = sanitizeStatisticsWorksheet(data.worksheet);
      if (!response.ok || !result) throw new Error(common.failed);
      setWorksheet(result);
    } catch (error) { setError(error instanceof Error ? error.message : common.failed); }
    finally { setGenerating(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.title}</h1><p>{copy.subtitle}</p>
      <label className="length-field">{copy.taskType}<select disabled={busy} value={settings.taskType} onChange={event => change({ taskType: event.target.value as StatisticsMode })}>{STATISTICS_MODES.map(mode => <option key={mode} value={mode}>{copy[mode]}</option>)}</select></label>
      {settings.taskType === "read_chart" || settings.taskType === "draw_chart" || settings.taskType === "mixed" ? <label className="length-field">{copy.chartType}<select disabled={busy} value={settings.chartType} onChange={event => change({ chartType: event.target.value as StatisticsSettings["chartType"] })}>{STATISTICS_CHARTS.map(chart => <option key={chart} value={chart}>{copy[chart]}</option>)}</select></label> : null}
      <label className="length-field">{copy.difficulty}<select disabled={busy} value={settings.difficulty} onChange={event => change({ difficulty: event.target.value as StatisticsSettings["difficulty"] })}>{STATISTICS_DIFFICULTIES.map(difficulty => <option key={difficulty} value={difficulty}>{copy[difficulty]}</option>)}</select></label>
      <label className="length-field">{common.count}<input disabled={busy} type="number" min={1} max={60} value={Number.isNaN(settings.taskCount) ? "" : settings.taskCount} onChange={event => change({ taskCount: event.target.valueAsNumber })} /></label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.showSupport} onChange={event => change({ showSupport: event.target.checked })} />{copy.support}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={showAnswerKey} onChange={event => setShowAnswerKey(event.target.checked)} />{common.key}</label>
      {validation ? <p role="status" className="length-error">{validation}</p> : null}
      <MathGeneratorActions language={locale} generating={generating} saving={persistence.saving} loading={restored.loading} canGenerate={!validation} hasWorksheet={!!worksheet}
        onGenerate={() => { void generate(); }} onSave={() => { void persistence.save(); }} onShare={() => { void persistence.save(true); }} />
      {error || persistence.error || restored.error ? <p role="alert" className="length-error">{error || persistence.error || restored.error}</p> : null}
      {persistence.success ? <p role="status" className="length-success">{persistence.success}</p> : null}
      {persistence.savedId ? <Link href={`/${locale}/content`}>{common.openContent}</Link> : null}
    </aside>
    <section className="length-preview" aria-label={common.worksheet}>{worksheet ? <StatisticsWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{persistence.sharing && persistence.savedId && worksheet ? <MathSpacePicker worksheetId={persistence.savedId} title={worksheet.title} language={worksheet.language} onClose={() => persistence.setSharing(false)} onShared={persistence.shared} /> : null}</main>;
}
