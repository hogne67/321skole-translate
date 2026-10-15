"use client";
import type { LearningPoster, PosterPlan } from "@/lib/learningPosters/model";
import { posterCopy } from "@/lib/learningPosters/copy";
import { posterLanguageLabel, posterLevelLabel } from "@/lib/learningPosters/presentation";
export default function PosterPreview({ plan, images, locale, hidden = false }: {
  plan: PosterPlan; images: LearningPoster["images"]; locale: string; hidden?: boolean;
}) {
  const copy = posterCopy(locale);
  function highlight(text: string) {
    if (!plan.focus) return text;
    const parts: React.ReactNode[] = []; let remaining = text; let offset = 0;
    while (remaining) {
      const at = remaining.toLocaleLowerCase().indexOf(plan.focus.toLocaleLowerCase());
      if (at < 0) { parts.push(remaining); break; }
      parts.push(remaining.slice(0, at));
      parts.push(<mark key={offset + at}>{remaining.slice(at, at + plan.focus.length)}</mark>);
      remaining = remaining.slice(at + plan.focus.length); offset += at + plan.focus.length;
    }
    return parts;
  }
  return <article className="learning-poster-print" aria-label={copy.title}>
    <header><div className="lp-poster-top"><span>{posterLevelLabel(plan.level)} · {posterLanguageLabel(plan.language, locale)}</span>
      <div className="lp-poster-brand"><img src="/logo321ny.png" alt="" width={36} height={33} /><span>321school</span></div>
    </div><h2>{plan.title}</h2><p>{plan.goal}</p></header>
    <div className="learning-poster-cards">
      {plan.items.map((item, i) => <section className="learning-poster-card" key={i}>
        {/* Generated images have independent labels so text stays editable and readable. */}
        {images[i]?.url ? <img src={images[i].url} alt={item.visualPrompt} /> : <div className="learning-poster-placeholder">{copy.empty}</div>}
        {!hidden && <><h3>{highlight(item.label)}</h3><p>{highlight(item.caption)}</p>{item.explanation && <p className="learning-poster-explanation">{item.explanation}</p>}</>}
      </section>)}
    </div>
  </article>;
}
