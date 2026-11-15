"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { DEFAULT_WORD_PROBLEMS_SETTINGS, getWordProblemsCopy, WORD_PROBLEMS_OPERATIONS, WORD_PROBLEMS_THEMES, normalizeWordProblemsSettings, sanitizeWordProblemsWorksheet, type WordProblemsSettings, type WordProblemsWorksheet } from "@/lib/math/word-problems/worksheet";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import MathGeneratorActions from "../MathGeneratorActions";
import MathSpacePicker from "../MathSpacePicker";
import { useMathWorksheetSave } from "../useMathWorksheetSave";
import { useSavedMathWorksheet } from "../useSavedMathWorksheet";
import WordProblemsWorksheetView from "./WordProblemsWorksheetView";

export default function WordProblemsGenerator() {
  const locale = useLocale(), copy = getWordProblemsCopy(locale), common = getMeasurementCopy(locale);
  const [settings, setSettings] = useState<WordProblemsSettings>({ ...DEFAULT_WORD_PROBLEMS_SETTINGS });
  const [worksheet, setWorksheet] = useState<WordProblemsWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false), [language, setLanguage] = useState(locale);
  const [generating, setGenerating] = useState(false), [error, setError] = useState("");
  const persistence = useMathWorksheetSave({ worksheet: worksheet ? { ...worksheet, showAnswerKey } : null, endpoint: "/api/producer/save-word-problems-worksheet", language: locale });
  const restored = useSavedMathWorksheet(locale, (data, id) => {
    const result = sanitizeWordProblemsWorksheet(data.mathWorksheet);
    if (!result) return false;
    setWorksheet(result); setSettings(result.settings); setShowAnswerKey(result.showAnswerKey); setLanguage(result.language);
    persistence.rememberSaved(id, result);
    return true;
  });
  const busy = generating || persistence.saving || restored.loading;
  function change(next: Partial<WordProblemsSettings>) { setSettings(current => ({ ...current, ...next })); setWorksheet(null); setError(""); }
  let validation = "";
  try { normalizeWordProblemsSettings(settings); }
  catch { validation = copy.invalid; }
  async function generate() {
    setGenerating(true); setError("");
    try {
      const response = await fetch("/api/generate-word-problems-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language, showAnswerKey }) });
      const data = await response.json(), result = sanitizeWordProblemsWorksheet(data.worksheet);
      if (!response.ok || !result) throw new Error(common.failed);
      setWorksheet(result);
    } catch (error) { setError(error instanceof Error ? error.message : common.failed); }
    finally { setGenerating(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.title}</h1><p>{copy.subtitle}</p>
      <label className="length-field">{copy.operation}<select disabled={busy} value={settings.operation} onChange={event => change({ operation: event.target.value as WordProblemsSettings["operation"] })}>{WORD_PROBLEMS_OPERATIONS.map(op => <option key={op} value={op}>{copy[op]}</option>)}</select></label>
      <label className="length-field">{copy.steps}<select disabled={busy} value={settings.steps} onChange={event => change({ steps: event.target.value === "mixed" ? "mixed" : Number(event.target.value) as 1 | 2 })}><option value="1">{copy.one}</option><option value="2">{copy.two}</option><option value="mixed">{copy.mixed}</option></select></label>
      <label className="length-field">{copy.theme}<select disabled={busy} value={settings.theme} onChange={event => change({ theme: event.target.value as WordProblemsSettings["theme"] })}>{WORD_PROBLEMS_THEMES.map(theme => <option key={theme} value={theme}>{copy[theme]}</option>)}</select></label>
      <label className="length-field">{copy.maximum}<select disabled={busy} value={settings.maximum} onChange={event => change({ maximum: Number(event.target.value) as WordProblemsSettings["maximum"] })}>{[20, 100, 1000].map(n => <option key={n} value={n}>0–{n}</option>)}</select></label>
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
    <section className="length-preview" aria-label={common.worksheet}>{worksheet ? <WordProblemsWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{persistence.sharing && persistence.savedId && worksheet ? <MathSpacePicker worksheetId={persistence.savedId} title={worksheet.title} language={worksheet.language} onClose={() => persistence.setSharing(false)} onShared={persistence.shared} /> : null}</main>;
}
