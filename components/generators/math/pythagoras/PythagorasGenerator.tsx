"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { DEFAULT_PYTHAGORAS_SETTINGS, getPythagorasCopy, PYTHAGORAS_UNITS, PYTHAGORAS_MODES, PYTHAGORAS_LEVELS, normalizePythagorasSettings, sanitizePythagorasWorksheet, type PythagorasSettings, type PythagorasWorksheet } from "@/lib/math/pythagoras/worksheet";
import { PYTHAGORAS_MAX_TASK_COUNT, pythagorasFullPageCounts, pythagorasPageCapacity } from "@/lib/math/pythagoras/printLayout";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import MathGeneratorActions from "../MathGeneratorActions";
import MathSpacePicker from "../MathSpacePicker";
import { useMathWorksheetSave } from "../useMathWorksheetSave";
import { useSavedMathWorksheet } from "../useSavedMathWorksheet";
import PythagorasWorksheetView from "./PythagorasWorksheetView";

export default function PythagorasGenerator() {
  const locale = useLocale(), copy = getPythagorasCopy(locale), common = getMeasurementCopy(locale);
  const [settings, setSettings] = useState<PythagorasSettings>({ ...DEFAULT_PYTHAGORAS_SETTINGS });
  const [countMode, setCountMode] = useState<"pages" | "custom">("pages");
  const [worksheet, setWorksheet] = useState<PythagorasWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false), [language, setLanguage] = useState(locale);
  const [generating, setGenerating] = useState(false), [error, setError] = useState("");
  const persistence = useMathWorksheetSave({ worksheet: worksheet ? { ...worksheet, showAnswerKey } : null, endpoint: "/api/producer/save-pythagoras-worksheet", language: locale });
  const restored = useSavedMathWorksheet(locale, (data, id) => {
    const result = sanitizePythagorasWorksheet(data.mathWorksheet);
    if (!result) return false;
    setWorksheet(result); setSettings(result.settings); setShowAnswerKey(result.showAnswerKey); setLanguage(result.language);
    setCountMode(pythagorasFullPageCounts(result.settings.showSupport).includes(result.settings.taskCount) ? "pages" : "custom");
    persistence.rememberSaved(id, result); return true;
  });
  const busy = generating || persistence.saving || restored.loading;
  const pageCounts = pythagorasFullPageCounts(settings.showSupport), capacity = pythagorasPageCapacity(settings.showSupport);
  function change(next: Partial<PythagorasSettings>) { setSettings(current => ({ ...current, ...next })); setWorksheet(null); setError(""); }
  function changeSupport(showSupport: boolean) {
    const nextCounts = pythagorasFullPageCounts(showSupport), page = Math.max(0, pageCounts.indexOf(settings.taskCount));
    change({ showSupport, ...(countMode === "pages" ? { taskCount: nextCounts[Math.min(page, nextCounts.length - 1)] } : {}) });
  }
  let validation = "";
  try { normalizePythagorasSettings(settings); } catch { validation = copy.invalid; }
  async function generate() {
    setGenerating(true); setError("");
    try {
      const response = await fetch("/api/generate-pythagoras-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language, showAnswerKey }) });
      const data = await response.json(), result = sanitizePythagorasWorksheet(data.worksheet);
      if (!response.ok || !result) throw new Error(common.failed);
      setWorksheet(result);
    } catch (error) { setError(error instanceof Error ? error.message : common.failed); }
    finally { setGenerating(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.title}</h1><p>{copy.subtitle}</p>
      <label className="length-field">{copy.taskType}<select disabled={busy} value={settings.taskType} onChange={event => change({ taskType: event.target.value as PythagorasSettings["taskType"] })}>{PYTHAGORAS_MODES.map(type => <option key={type} value={type}>{copy[type]}</option>)}</select></label>
      <label className="length-field">{copy.level}<select disabled={busy} value={settings.level} onChange={event => change({ level: event.target.value as PythagorasSettings["level"] })}>{PYTHAGORAS_LEVELS.map(level => <option key={level} value={level}>{copy[level]}</option>)}</select></label>
      <p>{copy.note}</p>
      <label className="length-field">{copy.lengthUnit}<select disabled={busy} value={settings.lengthUnit} onChange={event => change({ lengthUnit: event.target.value as PythagorasSettings["lengthUnit"] })}>{PYTHAGORAS_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
      <label className="length-field">{copy.maximum}<select disabled={busy} value={settings.maximum} onChange={event => change({ maximum: Number(event.target.value) })}>{[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.rotateFigures} onChange={event => change({ rotateFigures: event.target.checked })} />{copy.rotate}</label>
      <label className="length-field">{common.pageCount}<select disabled={busy} aria-describedby="pythagoras-page-hint" value={countMode === "custom" ? "custom" : settings.taskCount} onChange={event => {
        if (event.target.value === "custom") setCountMode("custom");
        else { setCountMode("pages"); change({ taskCount: Number(event.target.value) }); }
      }}>{pageCounts.map((count, page) => <option key={count} value={count}>{common.pageOption.replace("{pages}", String(page + 1)).replace("{tasks}", String(count))}</option>)}<option value="custom">{common.customCount}</option></select></label>
      {countMode === "custom" ? <label className="length-field">{common.count}<input disabled={busy} type="number" min={1} max={PYTHAGORAS_MAX_TASK_COUNT} value={Number.isNaN(settings.taskCount) ? "" : settings.taskCount} onChange={event => change({ taskCount: event.target.valueAsNumber })} /></label> : null}
      <p id="pythagoras-page-hint">{copy.pageHint.replace("{first}", String(capacity.first)).replace("{following}", String(capacity.following))}</p>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.showSupport} onChange={event => changeSupport(event.target.checked)} />{copy.support}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={showAnswerKey} onChange={event => setShowAnswerKey(event.target.checked)} />{common.key}</label>
      {validation ? <p role="status" className="length-error">{validation}</p> : null}
      <MathGeneratorActions language={locale} generating={generating} saving={persistence.saving} loading={restored.loading} canGenerate={!validation} hasWorksheet={!!worksheet}
        onGenerate={() => { void generate(); }} onSave={() => { void persistence.save(); }} onShare={() => { void persistence.save(true); }} />
      {error || persistence.error || restored.error ? <p role="alert" className="length-error">{error || persistence.error || restored.error}</p> : null}
      {persistence.success ? <p role="status" className="length-success">{persistence.success}</p> : null}
      {persistence.savedId ? <Link href={`/${locale}/content`}>{common.openContent}</Link> : null}
    </aside>
    <section className="length-preview" aria-label={common.worksheet}>{worksheet ? <PythagorasWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{persistence.sharing && persistence.savedId && worksheet ? <MathSpacePicker worksheetId={persistence.savedId} title={worksheet.title} language={worksheet.language} onClose={() => persistence.setSharing(false)} onShared={persistence.shared} /> : null}</main>;
}
