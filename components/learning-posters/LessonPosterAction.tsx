"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { auth } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { posterCopy } from "@/lib/learningPosters/copy";
import type { LinkedPosterSummary } from "@/lib/learningPosters/content";
import LessonPosterCard from "./LessonPosterCard";
import LessonPosterCoverChoice from "./LessonPosterCoverChoice";
import type { AppliedPosterCover, PosterCoverSelection } from "@/lib/learningPosters/cover";
import { normalizedText } from "@/lib/learningPosters/model";
import { readPosterAttachments, type PosterAttachment } from "@/lib/learningPosters/attachments";
import "./learningPosters.css";

export default function LessonPosterAction({ lessonId, sourceText, save, disabled = false, onCoverApplied }: {
  lessonId: string; sourceText: string; save: () => Promise<boolean>; disabled?: boolean;
  onCoverApplied?: (cover: AppliedPosterCover) => void;
}) {
  const locale = useLocale(); const copy = posterCopy(locale); const router = useRouter();
  const { user, loading: authLoading } = useUserProfile();
  const uid = user && !user.isAnonymous ? user.uid : "";
  const resultKey = `${uid}:${lessonId}`;
  const [busy, setBusy] = useState(false); const inFlight = useRef(false); const [error, setError] = useState("");
  const [result, setResult] = useState<{ key: string; posters: LinkedPosterSummary[]; attachments: PosterAttachment[] }>({ key: "", posters: [], attachments: [] });
  const [notice, setNotice] = useState("");
  const [coverTarget, setCoverTarget] = useState<{ id: string; key: string } | null>(null);
  const [listLoading, setListLoading] = useState(false); const [listError, setListError] = useState(false);
  const [retry, setRetry] = useState(0);
  const posters = result.key === resultKey ? result.posters : [];
  const coverPoster = coverTarget?.key === resultKey ? posters.find(poster => poster.id === coverTarget.id && poster.ready && normalizedText(poster.sourceText) === normalizedText(sourceText)) : undefined;
  useEffect(() => {
    if (!uid) return;
    let cancelled = false; let sequence = 0; let controller: AbortController | undefined;
    async function load() {
      const requestSequence = ++sequence;
      controller?.abort(); const requestController = new AbortController(); controller = requestController;
      setListLoading(true); setListError(false);
      try {
        const current = auth.currentUser;
        if (!current || current.uid !== uid) throw new Error("unauthorized");
        const token = await current.getIdToken();
        if (requestController.signal.aborted) return;
        const response = await fetch(`/api/producer/learning-posters?linkedLessonId=${encodeURIComponent(lessonId)}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: requestController.signal, cache: "no-store" });
        if (!response.ok) throw new Error("linked_posters_unavailable");
        const data = await response.json() as { ok: boolean; posters?: LinkedPosterSummary[]; attachments?: unknown };
        if (!data.ok || !Array.isArray(data.posters)) throw new Error("linked_posters_unavailable");
        if (!cancelled && requestSequence === sequence && auth.currentUser?.uid === uid) setResult({ key: resultKey, posters: data.posters, attachments: readPosterAttachments(data.attachments) });
      } catch { if (!cancelled && requestSequence === sequence) setListError(true); }
      finally { if (!cancelled && requestSequence === sequence) setListLoading(false); }
    }
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh);
    return () => { cancelled = true; controller?.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
  }, [uid, lessonId, resultKey, retry]);
  async function open(posterId?: string) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError("");
    try {
      if (!await save()) return;
      const target = posterId ? `posterId=${encodeURIComponent(posterId)}` : `lessonId=${encodeURIComponent(lessonId)}`;
      router.push(`/${locale}/producer/learning-posters?${target}`);
    } catch { setError(copy.genericError); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const actionDisabled = disabled || busy || !uid || !sourceText.trim();
  async function openCover(posterId: string) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (await save() && auth.currentUser?.uid === uid) setCoverTarget({ id: posterId, key: resultKey });
    } catch { setError(copy.genericError); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function applyCover(selection: PosterCoverSelection, revision: string) {
    if (inFlight.current || !coverPoster || !onCoverApplied) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (!await save()) return;
      const current = auth.currentUser;
      if (!current || current.uid !== uid) throw new Error("unauthorized");
      const token = await current.getIdToken();
      const response = await fetch("/api/producer/learning-posters", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cover-apply", lessonId, posterId: coverPoster.id, selection, revision }) });
      const data = await response.json() as { ok: boolean; reason?: string; cover?: AppliedPosterCover };
      if (!response.ok || !data.ok || !data.cover) throw new Error(data.reason || "generation_failed");
      if (auth.currentUser?.uid !== uid) return;
      onCoverApplied(data.cover); setCoverTarget(null); setNotice(copy.coverSaved);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setError(reason === "source_changed" ? copy.linkedSourceChanged : reason === "cover_changed" ? copy.coverChanged : reason === "review_required" ? copy.reviewError : copy.genericError);
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function changeAttachment(posterId: string, enabled: boolean) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (!await save()) return;
      const current = auth.currentUser;
      if (!current || current.uid !== uid) throw new Error("unauthorized");
      const token = await current.getIdToken();
      const response = await fetch(`/api/producer/learning-posters?locale=${encodeURIComponent(locale)}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "attachment", lessonId, posterId, enabled }) });
      const data = await response.json() as { ok: boolean; reason?: string; attachments?: unknown };
      if (!response.ok || !data.ok) throw new Error(data.reason || "generation_failed");
      if (auth.currentUser?.uid !== uid) return;
      setResult(old => ({ ...old, attachments: readPosterAttachments(data.attachments) }));
      setNotice(enabled ? copy.attachmentSaved : copy.attachmentRemoved);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setError(reason === "source_changed" ? copy.linkedSourceChanged : reason === "review_required" ? copy.attachmentNeedsReady : reason === "attachment_limit" ? copy.attachmentLimit : copy.genericError);
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="lp-launch" aria-label={copy.linked}>
    <div className="lp-launch-header"><div><h2>{copy.linked}</h2><p>{copy.linkedHelp}</p></div>
      <button className="lp-create" type="button" disabled={actionDisabled} onClick={() => void open()}>{busy ? copy.working : copy.newLinkedPoster}</button>
    </div>
    <p className="lp-launch-help">{copy.linkedSaveHelp}</p>
    {error && <p className="lp-linked-warning" role="alert">{error}</p>}
    {notice && <p className="lp-launch-help" role="status">{notice}</p>}
    {(authLoading || listLoading) && <p className="lp-launch-help" role="status">{copy.loadingLinked}</p>}
    {listError && <div className="lp-linked-warning" role="alert">{copy.linkedLoadError} <button type="button" disabled={listLoading} onClick={() => setRetry(value => value + 1)}>{copy.retryLinked}</button></div>}
    {!authLoading && !listLoading && !listError && posters.length === 0 && <p className="lp-launch-empty">{copy.noLinkedPosters}</p>}
    {posters.length > 0 && <div className="lp-linked-grid">{posters.map(poster => <LessonPosterCard key={`${resultKey}:${poster.id}`} poster={poster} sourceText={sourceText} accountUid={uid} disabled={actionDisabled} onOpen={posterId => void open(posterId)} attachment={result.attachments.find(item => item.posterId === poster.id)} onAttachment={(posterId, enabled) => void changeAttachment(posterId, enabled)} onCover={onCoverApplied ? posterId => void openCover(posterId) : undefined} />)}</div>}
    {coverPoster && <LessonPosterCoverChoice key={`${resultKey}:${coverPoster.id}:${coverPoster.revision}`} poster={coverPoster} lessonId={lessonId} accountUid={uid} disabled={actionDisabled} onApply={applyCover} onClose={() => setCoverTarget(null)} />}
  </section>;
}
