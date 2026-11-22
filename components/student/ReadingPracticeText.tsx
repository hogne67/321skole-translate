import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { readingPracticeWordPairs, splitReadingPracticeWordParts } from "@/lib/a1start/readingPracticeText";

export default function ReadingPracticeText({ text }: { text: string }) {
  return <>{splitReadingPracticeWordParts(text).map((part, index) => (
    part.divided ? <strong key={index} style={{ whiteSpace: "nowrap" }}>{part.display}</strong> : part.display
  ))}</>;
}

export function ReadingPracticeWordList({ text, textStyle }: { text: string; textStyle?: CSSProperties }) {
  const t = useTranslations("studentLesson");
  const words = readingPracticeWordPairs(text);
  if (words.length === 0) return null;

  return (
    <div className="reading-practice-words mt-4 border-t border-slate-200 pt-3">
      <h3 className="text-sm font-bold">{t("text.readingPracticeWords")}</h3>
      <ul className="mt-2 grid list-none gap-x-8 gap-y-1 p-0 text-lg sm:grid-cols-2" role="list" style={textStyle}>
        {words.map(({ divided, whole }) => (
          <li key={whole}><strong>{divided}</strong> <span aria-hidden="true">→</span> {whole}</li>
        ))}
      </ul>
    </div>
  );
}
