import { splitReadingPracticeWordParts } from "@/lib/a1start/readingPracticeText";

export default function ReadingPracticeText({ text }: { text: string }) {
  return <>{splitReadingPracticeWordParts(text).map((part, index) => (
    part.divided ? <strong key={index} style={{ whiteSpace: "nowrap" }}>{part.display}</strong> : part.display
  ))}</>;
}
