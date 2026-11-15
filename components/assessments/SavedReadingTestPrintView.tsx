import Link from "next/link";
import ReadingTestPrintPreview from "./ReadingTestPrintPreview";
import type { ReadingTestPrintContent } from "@/lib/readingTests/print";
import { getReadingTestPrintCopy } from "@/lib/readingTests/printCopy";

export default function SavedReadingTestPrintView({ content, locale, backHref, initialMode }: {
  content: ReadingTestPrintContent; locale: string; backHref: string; initialMode: "learner" | "key";
}) {
  const copy = getReadingTestPrintCopy(locale);
  return (
    <main className="mx-auto box-border w-full min-w-0 max-w-5xl px-4 py-6">
      <Link href={backHref} className="text-sm font-semibold text-sky-800 no-underline hover:underline">← {copy.backToTest}</Link>
      <h1 className="mt-5 text-2xl font-extrabold">{copy.defaultTitle} · {copy.open}</h1>
      <ReadingTestPrintPreview content={content} locale={locale} initiallyOpen initialMode={initialMode} />
    </main>
  );
}
