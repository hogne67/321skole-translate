"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { auth } from "@/lib/firebase";
import type { LinkedPosterSummary } from "@/lib/learningPosters/content";
import type { PosterCoverSelection } from "@/lib/learningPosters/cover";
import { posterCopy } from "@/lib/learningPosters/copy";

export default function LessonPosterCoverChoice({ poster, lessonId, accountUid, disabled, onApply, onClose }: {
  poster: LinkedPosterSummary; lessonId: string; accountUid: string; disabled: boolean;
  onApply: (selection: PosterCoverSelection, revision: string) => Promise<void>; onClose: () => void;
}) {
  const copy = posterCopy(useLocale()), selectId = useId();
  const [selection, setSelection] = useState<PosterCoverSelection>("all");
  const [preview, setPreview] = useState<{ url: string; revision: string; selection: PosterCoverSelection } | null>(null);
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = "";
    async function load() {
      setLoading(true); setFailed(false); setPreview(null);
      try {
        const current = auth.currentUser;
        if (!current || current.uid !== accountUid) throw new Error("unauthorized");
        const token = await current.getIdToken();
        if (controller.signal.aborted) return;
        const response = await fetch("/api/producer/learning-posters", {
          method: "POST", signal: controller.signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cover-preview", lessonId, posterId: poster.id, selection }) });
        if (!response.ok) throw new Error("preview_failed");
        const revision = response.headers.get("X-Poster-Revision");
        if (!revision) throw new Error("preview_failed");
        const blob = await response.blob();
        if (controller.signal.aborted || auth.currentUser?.uid !== accountUid) return;
        objectUrl = URL.createObjectURL(blob); setPreview({ url: objectUrl, revision, selection });
      } catch { if (!controller.signal.aborted) setFailed(true); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [accountUid, lessonId, poster.id, selection, retry]);
  // Never apply an old preview while a newly selected motif is loading.
  const currentPreview = preview?.selection === selection ? preview : null;
  return <div className="lp-cover-choice">
    <h3 ref={heading} tabIndex={-1}>{copy.coverHeading}: {poster.title}</h3>
    <p>{copy.coverHelp}</p>
    <label htmlFor={selectId}>{copy.coverChoose}</label>
    <select id={selectId} value={String(selection)} disabled={disabled} onChange={event => setSelection(event.target.value === "all" ? "all" : Number(event.target.value))}>
      <option value="all">{copy.coverAll}</option>
      {poster.imageLabels?.map((label, index) => <option key={index} value={index}>{label}</option>)}
    </select>
    {loading && <p role="status">{copy.thumbnailLoading}</p>}
    {failed && <p role="alert">{copy.genericError} <button type="button" onClick={() => setRetry(value => value + 1)}>{copy.retryLinked}</button></p>}
    {currentPreview && <img className="lp-cover-preview" src={currentPreview.url} alt={`${copy.coverHeading}: ${poster.title}`} />}
    <p>{copy.coverReplace}</p>
    <div className="lp-cover-actions">
      <button className="lp-create" type="button" disabled={disabled || loading || !currentPreview} onClick={() => { if (currentPreview) void onApply(selection, currentPreview.revision); }}>{disabled ? copy.working : copy.coverApply}</button>
      <button type="button" disabled={disabled} onClick={onClose}>{copy.coverCancel}</button>
    </div>
  </div>;
}
