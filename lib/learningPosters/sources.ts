import { normalizedText } from "./model";

export type PosterLessonChoice = { id: string; title: string; level: string; language: string;
  addedAt: number; origin: "own" | "library" };

export function posterLessonLanguage(value: string, locale: string) {
  try {
    const code = ["no", "norsk", "bokmål"].includes(value.toLowerCase()) ? "nb" : value.replaceAll("_", "-");
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) || value;
  } catch { return value; }
}
export function filterPosterLessons(lessons: PosterLessonChoice[], search: string, locale: string) {
  const words = normalizedText(search).toLocaleLowerCase().split(" ").filter(Boolean);
  return lessons.filter(lesson => {
    const text = normalizedText(`${lesson.title} ${lesson.level} ${lesson.language} ${posterLessonLanguage(lesson.language, locale)}`).toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
}
