"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import ReadingTestWorksheet from "./ReadingTestWorksheet";
import { automaticReadingPrintLayout, orderedPrintTasks, printReadingTest, type ReadingTestPrintContent, type ReadingTestPrintLayout } from "@/lib/readingTests/print";
import { getReadingTestPrintCopy } from "@/lib/readingTests/printCopy";
import { getListeningCopy } from "@/lib/listeningTests/copy";
import "./readingTestPrint.css";

export default function ReadingTestPrintPreview({ content, locale, initiallyOpen = false, initialMode = "learner" }: {
  content: ReadingTestPrintContent; locale: string; initiallyOpen?: boolean; initialMode?: "learner" | "key";
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [mode, setMode] = useState(initialMode);
  const [layout, setLayout] = useState<ReadingTestPrintLayout>("auto");
  const [measurement, setMeasurement] = useState<{content: ReadingTestPrintContent; locale: string; layout: "after_text" | "new_page"} | null>(null);
  const printRoot = useRef<HTMLDivElement>(null);
  const printingDocument = useRef(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState(false);
  const id = useId();
  const copy = getReadingTestPrintCopy(locale);
  const isListening = content.modality === "listening";
  const hasSource = !isListening && content.modality !== "grammar";
  const listenCopy = getListeningCopy(locale);
  const unsupported = (content.unsupportedTaskCount ?? 0) > 0;
  const ready = Boolean((content.modality === "grammar" || content.sourceText.trim()) && orderedPrintTasks(content.tasks).length && !unsupported);
  const measured = measurement?.content === content && measurement.locale === locale;
  const effectiveLayout = !hasSource ? "after_text" : layout === "auto" ? measured ? measurement.layout : "after_text" : layout;
  const calculating = hasSource && mode === "learner" && layout === "auto" && !measured;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const before = () => { printingDocument.current = true; };
    const after = () => { printingDocument.current = false; };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  useEffect(() => {
    if (!mounted || !open || !ready || !hasSource || mode !== "learner" || layout !== "auto") return;
    const root = printRoot.current;
    const sheet = root?.querySelector<HTMLElement>(".reading-test-print-sheet");
    if (!root || !sheet) return;
    let active = true;
    const measure = () => {
      // A paged print layout has fragmented element dimensions. Never let a
      // print-time ResizeObserver callback change the chosen page break.
      if (!active || printingDocument.current || window.matchMedia("print").matches) return;
      const next = automaticReadingPrintLayout(sheet.getBoundingClientRect().height, root.getBoundingClientRect().width);
      setMeasurement(previous => previous?.content === content && previous.locale === locale && previous.layout === next ? previous : {content, locale, layout: next});
    };
    void Promise.resolve(document.fonts?.ready).then(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    return () => { active = false; observer.disconnect(); };
  }, [mounted, open, ready, hasSource, mode, layout, content, locale]);

  async function handlePrint() {
    setPrinting(true);
    setError(false);
    try { await printReadingTest(); }
    catch { setError(true); }
    finally { setPrinting(false); }
  }

  return (
    <section className="reading-test-print-preview">
      <button ref={toggle} type="button" className="reading-test-print-button" aria-expanded={open} aria-controls={id} disabled={!ready} onClick={() => setOpen(previous => !previous)}>
        <Printer size={17} aria-hidden="true" />{copy.open}
      </button>
      {!ready && <p className="reading-test-print-help" role={unsupported ? "alert" : undefined}>{unsupported ? copy.unsupportedTasks : copy.incomplete}</p>}
      {open && ready && (
        <div id={id} className="reading-test-print-panel">
          <div className="reading-test-print-toolbar">
            <div><h2>{copy.title}</h2><p>{content.modality === "grammar" ? "Skriv ut elevark og separat fasit med forklaringer." : isListening ? listenCopy.check : copy.description}</p></div>
            <button type="button" className="reading-test-print-button" onClick={() => { setOpen(false); toggle.current?.focus(); }}><X size={16} aria-hidden="true" />{copy.close}</button>
            <label>{copy.mode}<select value={mode} disabled={printing} onChange={event => setMode(event.target.value === "key" ? "key" : "learner")}><option value="learner">{copy.learner}</option><option value="key">{isListening ? listenCopy.teacherPrint : copy.key}</option></select></label>
            {hasSource && <label>{copy.layout}<select value={layout} disabled={printing || mode === "key"} aria-describedby={`${id}-layout-help`} onChange={event => setLayout(event.target.value === "new_page" ? "new_page" : event.target.value === "after_text" ? "after_text" : "auto")}><option value="auto">{copy.automatic}</option><option value="after_text">{copy.afterText}</option><option value="new_page">{copy.newPage}</option></select></label>}
            <button type="button" className="reading-test-print-button reading-test-print-primary" disabled={printing || calculating} onClick={handlePrint}><Printer size={17} aria-hidden="true" />{printing ? copy.printing : calculating ? copy.calculating : copy.print}</button>
            {error && <p role="alert">{copy.printError}</p>}
            {hasSource && <p id={`${id}-layout-help`} className="reading-test-print-layout-help">{copy.layoutHelp}</p>}
            {hasSource && mode === "learner" && layout === "auto" && measured && <p className="reading-test-print-layout-help" role="status">{effectiveLayout === "new_page" ? copy.autoNewPage : copy.autoAfterText}</p>}
          </div>
          <ReadingTestWorksheet content={content} locale={locale} mode={mode} layout={effectiveLayout} />
          {mounted && createPortal(
            <div ref={printRoot} className="reading-test-print-root"><ReadingTestWorksheet content={content} locale={locale} mode={mode} layout={effectiveLayout} /></div>,
            document.body,
          )}
        </div>
      )}
    </section>
  );
}
