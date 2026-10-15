"use client";
import { useLocale } from "next-intl";
import type { LinkedPosterSummary } from "@/lib/learningPosters/content";
import { posterCopy } from "@/lib/learningPosters/copy";
import { normalizedText } from "@/lib/learningPosters/model";
import { posterLanguageLabel, posterLevelLabel } from "@/lib/learningPosters/presentation";
import PosterThumbnail from "./PosterThumbnail";
import type { PosterAttachment } from "@/lib/learningPosters/attachments";

export default function LessonPosterCard({ poster, sourceText, accountUid, disabled, onOpen, attachment, onAttachment, onCover }: {
  poster: LinkedPosterSummary; sourceText: string; accountUid: string; disabled: boolean; onOpen: (posterId: string) => void;
  attachment?: PosterAttachment; onAttachment?: (posterId: string, enabled: boolean) => void;
  onCover?: (posterId: string) => void;
}) {
  const locale = useLocale(); const copy = posterCopy(locale);
  const stale = normalizedText(poster.sourceText) !== normalizedText(sourceText);
  const outdated = !!attachment && (attachment.planHash !== poster.revision || attachment.sourceHash !== poster.sourceHash);
  return <article className="lp-linked-card">
    <button className="lp-linked-thumb" type="button" disabled={disabled} onClick={() => onOpen(poster.id)} aria-label={`${copy.openEdit}: ${poster.title}`}>
      {poster.ready ? <PosterThumbnail key={`${accountUid}:${locale}:${poster.id}:${poster.updatedAt}`} posterId={poster.id} accountUid={accountUid} version={poster.updatedAt} title={poster.title} />
        : <span className="lp-linked-placeholder">{copy.linkedDraft}</span>}
    </button>
    <div className="lp-linked-body">
      <div className="lp-linked-title"><h3>{poster.title}</h3><span className={`lp-linked-status ${poster.ready ? "lp-linked-ready" : ""}`}>{poster.ready ? copy.linkedReady : copy.linkedDraft}</span></div>
      <p className="lp-linked-meta">{posterLevelLabel(poster.level)} · {posterLanguageLabel(poster.language, locale)}</p>
      {stale && <p className="lp-linked-warning">{copy.linkedSourceChanged}</p>}
      <div className="lp-linked-actions"><button type="button" disabled={disabled} onClick={() => onOpen(poster.id)}>{copy.openEdit}</button>
        {onCover && <button type="button" disabled={disabled || !poster.ready || stale} onClick={() => onCover(poster.id)}>{copy.usePosterCover}</button>}
      </div>
      {onAttachment && <div className="lp-attachment-choice">
        <label><input type="checkbox" checked={!!attachment} disabled={disabled || (!attachment && (!poster.ready || stale))} onChange={event => onAttachment(poster.id, event.target.checked)} /><span>{copy.attachForStudent}</span></label>
        <p>{copy.purposes[poster.purpose || "during"]} · {copy.attachmentChoiceHelp}</p>
        {!poster.ready && !attachment && <p>{copy.attachmentNeedsReady}</p>}
        {attachment && outdated && <><p>{copy.attachmentOutdated}</p><button type="button" disabled={disabled || !poster.ready || stale} onClick={() => onAttachment(poster.id, true)}>{copy.updateAttachment}</button></>}
      </div>}
    </div>
  </article>;
}
