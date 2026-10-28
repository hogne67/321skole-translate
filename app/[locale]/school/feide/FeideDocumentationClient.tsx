"use client";
import { municipalityReportIntroduction, municipalityReportUi } from "@/lib/trust/schoolReport";
import { trustDocumentUrl, trustPrintDocuments, trustPrintSupplier, trustReportSummaries } from "@/lib/trust/printDocuments";
import { trustReportPrintStyles } from "@/lib/trust/reportPrintStyles";
import { TrustDocumentPackage } from "@/components/trust/TrustDocumentPackage";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckSquare, Square, Printer, RotateCcw } from "lucide-react";

export function FeideDocumentationClient({ locale }: { locale: string }) {
  const documents = useMemo(() => trustReportSummaries(locale), [locale]);
  const ui = municipalityReportUi(locale);
  const introduction = municipalityReportIntroduction(locale);
  const [format, setFormat] = useState<"short" | "full">("short");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState(ui.defaultNote);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => Object.fromEntries(documents.map(document => [document.id, true])));
  const fullDocuments = useMemo(() => format === "full" ? trustPrintDocuments(locale) : [], [format, locale]);
  const selectedCount = documents.filter(document => selected[document.id]).length;
  const setAll = () => setSelected(Object.fromEntries(documents.map(document => [document.id, true])));
  const toggle = (id: string) => setSelected(current => ({ ...current, [id]: !current[id] }));
  const scope = format === "full" ? ui.fullScope : ui.scope;

  return (
    <>
      <style>{trustReportPrintStyles}</style>
      <section className="no-print bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 lg:grid-cols-[1fr_340px] lg:items-start">
          <div>
            <p className="inline-flex rounded-full bg-sky-50 px-4 py-2 text-sm font-bold text-sky-800">{ui.eyebrow}</p>
            <h1 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">{ui.title}</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-700">{ui.lead}</p>
            <div className="mt-6 grid gap-4 text-sm text-slate-700">
              <label className="grid gap-2 font-bold">{ui.recipient}
                <input name="report-recipient" value={recipient} maxLength={160} onChange={event => setRecipient(event.target.value)} placeholder={ui.recipientPlaceholder} className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-950 focus:outline-sky-700" />
              </label>
              <label className="grid gap-2 font-bold">{ui.noteLabel}
                <textarea name="report-note" rows={3} value={note} maxLength={1200} onChange={event => setNote(event.target.value)} className="resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-950 focus:outline-sky-700" />
              </label>
            </div>
            <p className="mt-3 text-xs leading-6 text-slate-600">{ui.localFields}</p>
            <p className="mt-4 text-sm font-semibold text-slate-500">{ui.updated}</p>
          </div>
          <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <fieldset>
              <legend className="text-lg font-black">{ui.formatTitle}</legend>
              <div className="mt-3 grid gap-3">
                {(["short", "full"] as const).map(value => (
                  <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${format === value ? "border-sky-600 bg-sky-50" : "border-slate-200 bg-white"}`}>
                    <input type="radio" name="report-format" value={value} checked={format === value} onChange={() => setFormat(value)} className="mt-1 accent-sky-700" />
                    <span><span className="block text-sm font-bold">{value === "short" ? ui.shortFormat : ui.fullFormat}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{value === "short" ? ui.shortDescription : ui.fullDescription}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            {format === "short" ? <div className="mt-6">
              <h2 className="text-sm font-black">{ui.selectTitle}</h2>
              <p className="mt-2 text-xs leading-6 text-slate-600" aria-live="polite">{ui.countText(selectedCount, documents.length)}</p>
              <div className="mt-3 grid gap-2">{documents.map(document => (
                <button key={document.id} type="button" aria-pressed={Boolean(selected[document.id])} onClick={() => toggle(document.id)} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm font-bold hover:bg-slate-100 focus-visible:outline-sky-700">
                  {selected[document.id] ? <CheckSquare className="h-5 w-5 shrink-0 text-emerald-600" /> : <Square className="h-5 w-5 shrink-0 text-slate-400" />}{document.title}
                </button>
              ))}</div>
              <button type="button" onClick={setAll} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-sky-800 underline underline-offset-4"><RotateCcw className="h-4 w-4" />{ui.all}</button>
            </div> : null}
            <button type="button" data-report-print="true" onClick={() => window.print()} disabled={format === "short" && selectedCount === 0} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"><Printer className="h-4 w-4 shrink-0" />{format === "full" ? ui.printFull : ui.print}</button>
            <p className="mt-3 text-xs leading-6 text-slate-600">{ui.printHelp}</p>
          </aside>
        </div>
      </section>

      <div className="trust-report-shell mx-auto max-w-6xl px-6 pb-12" data-report-format={format}>
        <header className="trust-print-heading rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-sky-800">321school Trust Center · {format === "full" ? ui.fullFormat : ui.shortFormat}</p>
          <h2 className="mt-2 break-words text-2xl font-black">{ui.reportFor} {recipient.trim() || ui.defaultRecipient}</h2>
          {note.trim() ? <p className="trust-report-note mt-3 text-sm leading-6">{note}</p> : null}
          <p className="mt-2 text-sm font-semibold">{ui.updated}</p>
          <p className="mt-1 text-xs text-slate-600">{trustPrintSupplier}</p>
          <p className="mt-3 text-sm leading-6 text-slate-700">{scope}</p>
        </header>
        <section className="trust-report-introduction my-6 rounded-2xl border border-slate-200 bg-white p-5" aria-label={introduction[0].title}>
          {introduction.map((section, index) => <div key={section.title} className={index ? "mt-6" : undefined}>
            {index === 0 ? <h2 className="text-2xl font-black">{section.title}</h2> : <h3 className="text-lg font-bold">{section.title}</h3>}
            {section.paragraphs.map(paragraph => <p key={paragraph} className="mt-3 text-sm leading-7 text-slate-700">{paragraph}</p>)}
          </div>)}
        </section>
        {format === "full" ? <section className="trust-package-contents my-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-black">{ui.contentsTitle}</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">{fullDocuments.map(document => <li key={document.id}>
            <Link href={`/${locale}${document.path}`} className="no-print text-sky-800 underline underline-offset-4">{document.title}</Link>
            <a href={`#report-document-${document.id}`} className="trust-print-only">{document.title}</a>
          </li>)}</ol>
        </section> : null}
        <section className="trust-summary-grid mt-6 grid gap-4 md:grid-cols-2">
          <aside className="trust-analytics-plan rounded-2xl border border-amber-200 bg-amber-50 p-5 md:col-span-2" aria-labelledby="report-analytics-plan">
            <h2 id="report-analytics-plan" className="text-lg font-bold">{ui.analyticsTitle}</h2>
            <p className="mt-3 text-sm leading-7">{ui.analyticsPlan}</p>
          </aside>
          {documents.map(document => {
            const included = format === "full" || Boolean(selected[document.id]);
            return <article key={document.id} data-print-included={included ? "true" : "false"} className={`trust-summary-card rounded-2xl border bg-white p-5 ${included ? "border-slate-200" : "border-slate-100 opacity-50"}`}>
              <p className="trust-topic text-xs font-bold uppercase text-slate-500">{ui.topic}</p>
              <h2 className="mt-1 text-xl font-black">{document.title}</h2>
              <p className="trust-summary-body mt-3 text-sm leading-6">{document.summary}</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">{document.points.map(point => <li key={point}>{point}</li>)}</ul>
              <div className="no-print mt-4 grid gap-2">{document.links.map(link => <Link key={link.href} href={`/${locale}${link.href}`} className="text-sm font-semibold text-sky-800 underline underline-offset-4">{link.label}</Link>)}</div>
              <div className="trust-print-only trust-print-links">{document.links.map(link => <a key={link.href} href={trustDocumentUrl(locale, link.href)}>{link.label}: {trustDocumentUrl(locale, link.href)}</a>)}</div>
            </article>;
          })}
        </section>
        {format === "full" ? <TrustDocumentPackage locale={locale} documents={fullDocuments} /> : null}
      </div>
    </>
  );
}
