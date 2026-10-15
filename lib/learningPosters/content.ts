import type { ContentItem } from "../contentFeed";
import { posterLanguageLabel, posterLevelLabel } from "./presentation";

export type PosterContentSummary = { id: string; title: string; level: string; language: string; updatedAt: number;
  sourceTitle: string; sourceHref: string | null };

export function posterContentItem(poster: PosterContentSummary, locale: string): Extract<ContentItem, { type: "learningPoster" }> {
  return { type: "learningPoster", id: poster.id, title: poster.title, level: poster.level, language: poster.language,
    updatedAt: poster.updatedAt ? new Date(poster.updatedAt) : null,
    href: `/${locale}/producer/learning-posters?posterId=${encodeURIComponent(poster.id)}`,
    sourceTitle: poster.sourceTitle, sourceHref: poster.sourceHref,
    meta: [posterLevelLabel(poster.level), posterLanguageLabel(poster.language, locale), poster.sourceTitle].filter(Boolean) };
}
