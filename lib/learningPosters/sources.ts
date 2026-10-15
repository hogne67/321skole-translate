import { normalizedText } from "./model";
import { posterLanguageLabel, posterLevelLabel } from "./presentation";

export type PosterLessonChoice = { id: string; title: string; level: string; language: string;
  addedAt: number; origin: "own" | "library" };

export function posterLessonLanguage(value: string, locale: string) {
  return posterLanguageLabel(value, locale);
}
export function filterPosterLessons(lessons: PosterLessonChoice[], search: string, locale: string) {
  const words = normalizedText(search).toLocaleLowerCase().split(" ").filter(Boolean);
  return lessons.filter(lesson => {
    const text = normalizedText(`${lesson.title} ${lesson.level} ${posterLevelLabel(lesson.level)} ${lesson.language} ${posterLessonLanguage(lesson.language, locale)}`).toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
}
