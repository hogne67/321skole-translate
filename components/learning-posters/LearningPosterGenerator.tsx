"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { logUsageEvent } from "@/lib/usageClient";
import { posterCopy } from "@/lib/learningPosters/copy";
import { POSTER_LANGUAGES, posterLanguageCode, posterLanguageLabel, posterLevelLabel } from "@/lib/learningPosters/presentation";
import { filterPosterLessons, posterLessonLanguage, type PosterLessonChoice } from "@/lib/learningPosters/sources";
import { normalizedText, POSTER_KINDS, POSTER_PURPOSES, sourceWarnings, type LearningPoster, type PosterPlan, type PosterSource } from "@/lib/learningPosters/model";
import PosterPreview from "./PosterPreview";
import "./learningPosters.css";

type LessonChoice = PosterLessonChoice;
type Summary = { id: string; title: string };
type ApiResult = { ok: boolean; reason?: string; goal?: string; source?: PosterSource; lessons?: LessonChoice[]; posters?: Summary[]; poster?: LearningPoster; plan?: PosterPlan };
const endpoint = "/api/producer/learning-posters";
async function request(query = "", body?: unknown) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("unauthorized");
  const token = await user.getIdToken();
  const response = await fetch(endpoint + query, { method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json() as ApiResult;
  if (!response.ok || !data.ok) throw new Error(data.reason || "generation_failed");
  return data;
}
const emptySource: PosterSource = { lessonId: null, title: "", text: "", hash: "" };
const emptyItem = () => ({ label: "", caption: "", explanation: "", quote: "", visualPrompt: "" });

export default function LearningPosterGenerator({ initialLessonId, initialPosterId, initialMode = "content" }: { initialLessonId?: string; initialPosterId?: string; initialMode?: "content" | "manual" }) {
  const locale = useLocale(); const copy = posterCopy(locale); const { user, loading } = useUserProfile();
  const router = useRouter();
  const signedIn = !!user && !user.isAnonymous;
  const [sourceMode, setSourceMode] = useState(initialMode);
  const [pendingSourceMode, setPendingSourceMode] = useState<"content" | "manual" | null>(null);
  const workspaceRevision = useRef(0);
  const [source, setSource] = useState<PosterSource>(emptySource);
  const [settings, setSettings] = useState<Omit<PosterPlan, "items">>({ title: "", goal: "", focus: "", level: "A1_START", language: locale, kind: "keywords", purpose: "during", includeExplanations: false });
  const [goalNotice, setGoalNotice] = useState<"" | "reset" | "changed">("");
  const [plan, setPlan] = useState<PosterPlan | null>(null);
  const [id, setId] = useState<string>(); const [images, setImages] = useState<LearningPoster["images"]>([]);
  const [approved, setApproved] = useState(false); const [saved, setSaved] = useState(""); const [stale, setStale] = useState(false);
  const [lessons, setLessons] = useState<LessonChoice[]>([]); const [posters, setPosters] = useState<Summary[]>([]);
  const [lessonSearch, setLessonSearch] = useState(""); const [lessonsLoading, setLessonsLoading] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState(initialLessonId || "");
  const [busy, setBusy] = useState(""); const inFlight = useRef(false);
  const [imageStage, setImageStage] = useState<"" | "saving" | "illustrating" | "finishing">("");
  const reviewHeading = useRef<HTMLHeadingElement>(null); const previewHeading = useRef<HTMLHeadingElement>(null);
  const [nextStep, setNextStep] = useState<{ target: "review" | "preview" } | null>(null);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [hidden, setHidden] = useState(false);
  const fingerprint = JSON.stringify({ source, plan, approved });
  const dirty = fingerprint !== saved;
  const invalidQuotes = plan ? sourceWarnings(plan, source.text) : [];
  const complete = !!plan && images.length === plan.items.length;
  const filteredLessons = filterPosterLessons(lessons, lessonSearch, locale);
  const languageCode = posterLanguageCode(settings.language);
  const languageOptions = POSTER_LANGUAGES.includes(languageCode) ? POSTER_LANGUAGES : [languageCode, ...POSTER_LANGUAGES];
  const missingFocus = settings.kind === "sounds" && !settings.focus.trim();
  useEffect(() => {
    if (!nextStep) return;
    const heading = (nextStep.target === "review" ? reviewHeading : previewHeading).current;
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }, [nextStep]);
  function errorText(reason: string) {
    if (reason.startsWith("quota")) return copy.quotaError;
    if (reason === "source_changed") return copy.sourceChanged;
    if (reason === "email_verification_required") return copy.verifyError;
    if (["source_not_found", "invalid_source"].includes(reason)) return copy.sourceError;
    if (reason === "review_required") return copy.reviewError;
    if (reason === "generation_busy") return copy.busyError;
    if (reason === "invalid_quote") return copy.badQuote;
    if (reason === "invalid_input") return copy.invalid;
    if (reason === "unauthorized") return copy.sessionError;
    if (reason === "forbidden") return copy.accessError;
    if (reason === "authentication_unavailable") return copy.authUnavailable;
    return copy.genericError;
  }
  async function run(name: string, work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(name); setError(""); setMessage("");
    try { await work(); }
    catch (err) {
      const reason = err instanceof Error ? err.message : "generation_failed";
      if (reason === "source_changed") setStale(true);
      setError(errorText(reason));
    } finally { inFlight.current = false; setBusy(""); setImageStage(""); }
  }
  function applyPoster(p: LearningPoster) {
    const includeExplanations = p.plan.includeExplanations ?? p.plan.items.some(item => !!item.explanation);
    setId(p.id); setSource(p.source); setPlan(p.plan); setSettings({ ...p.plan, includeExplanations }); setImages(p.images); setGoalNotice("");
    setLessonSearch(""); setSelectedLesson(p.source.lessonId || "");
    setSourceMode(p.source.lessonId ? "content" : "manual");
    setApproved(!!p.reviewedHash); setStale(!!p.stale); setHidden(false);
    setSaved(JSON.stringify({ source: p.source, plan: p.plan, approved: !!p.reviewedHash }));
  }
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    let cancelled = false;
    const revision = workspaceRevision.current;
    setLessonsLoading(true);
    void (async () => {
      try {
        const data = await request(initialLessonId ? `?lessonId=${encodeURIComponent(initialLessonId)}` : "");
        if (cancelled || revision !== workspaceRevision.current) return;
        setLessons(data.lessons || []); setPosters(data.posters || []);
        setLessonSearch(""); setSelectedLesson(initialLessonId || data.lessons?.[0]?.id || "");
        if (initialPosterId) {
          const loaded = await request(`?posterId=${encodeURIComponent(initialPosterId)}`);
          if (!cancelled && revision === workspaceRevision.current && loaded.poster) applyPoster(loaded.poster);
        } else if (data.source) {
          setSource(data.source);
          const lesson = data.lessons?.find(l => l.id === initialLessonId);
          setSettings(s => ({ ...s, title: data.source!.title, goal: "", focus: "", level: lesson?.level || s.level, language: lesson?.language || s.language }));
        }
      } catch (err) { if (!cancelled) setError(errorText(err instanceof Error ? err.message : "generation_failed")); }
      finally { if (!cancelled) setLessonsLoading(false); }
    })();
    return () => { cancelled = true; };
    // Initialization follows account and route changes, not edits in the work area.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, initialLessonId, initialPosterId]);
  function startNew(mode: "content" | "manual", confirmed = false) {
    const unsavedWork = dirty && (plan || (sourceMode === "manual" && source.text.trim()) || settings.goal.trim());
    if (unsavedWork && !confirmed) { setPendingSourceMode(mode); return; }
    setPendingSourceMode(null);
    setNextStep(null);
    workspaceRevision.current++;
    setSourceMode(mode); setSource(emptySource); setPlan(null); setId(undefined); setImages([]);
    setSettings({ title: "", goal: "", focus: "", level: "A1_START", language: locale, kind: "keywords", purpose: "during", includeExplanations: false });
    setApproved(false); setSaved(""); setStale(false); setGoalNotice(""); setHidden(false); setError(""); setMessage("");
    setLessonSearch(""); setSelectedLesson(lessons[0]?.id || ""); setLessonsLoading(false);
    router.replace(`/${locale}/producer/learning-posters${mode === "manual" ? "?mode=manual" : ""}`, { scroll: false });
  }
  function editSettings(patch: Partial<Omit<PosterPlan, "items">>) {
    if (patch.goal !== undefined) setGoalNotice(plan && normalizedText(patch.goal) !== normalizedText(plan.goal) ? "changed" : "");
    setSettings(s => ({ ...s, ...patch }));
    if (plan) setPlan({ ...plan, ...patch, ...(patch.includeExplanations === false ? { items: plan.items.map(item => ({ ...item, explanation: "" })) } : {}) });
    setApproved(false);
  }
  function resetGoalForText() {
    if (settings.goal || plan?.goal) setGoalNotice("reset");
    setSettings(s => ({ ...s, goal: "", focus: "" }));
    setPlan(p => p ? { ...p, goal: "", focus: "" } : null); setApproved(false);
  }
  function editPlan(patch: Partial<PosterPlan>) {
    if (plan) setPlan({ ...plan, ...patch }); setApproved(false);
    if (patch.title !== undefined || patch.goal !== undefined) setSettings(s => ({ ...s,
      ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.goal !== undefined ? { goal: patch.goal } : {}) }));
  }
  function replaceAllowed() { return !plan || window.confirm(copy.replace); }
  async function loadSource(keepPlan = false) {
    if (!keepPlan && !replaceAllowed()) return;
    await run("load", async () => {
      const lessonId = keepPlan ? source.lessonId : selectedLesson;
      if (!lessonId) return;
      const data = await request(`?lessonId=${encodeURIComponent(lessonId)}`);
      if (!data.source) throw new Error("source_not_found");
      setSource(data.source); setStale(false); setApproved(false);
      if (!keepPlan) {
        setPlan(null); setId(undefined); setImages([]); setSaved("");
        const lesson = lessons.find(l => l.id === lessonId);
        if (settings.goal) setGoalNotice("reset");
        setSettings(s => ({ ...s, title: data.source!.title, goal: "", focus: "", level: lesson?.level || s.level, language: lesson?.language || s.language }));
      } else if (data.source.hash !== source.hash) resetGoalForText();
    });
  }
  async function saveCurrent() {
    if (!plan) throw new Error("invalid_input");
    const data = await request("", { action: "save", ...(id ? { id } : {}), source, plan, approved });
    if (!data.poster) throw new Error("generation_failed");
    applyPoster(data.poster); setPosters(current => [{ id: data.poster!.id, title: data.poster!.plan.title }, ...current.filter(p => p.id !== data.poster!.id)]);
    return data.poster;
  }
  async function download() {
    await run("download", async () => {
      if (!id || !auth.currentUser) return;
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${endpoint}?posterId=${encodeURIComponent(id)}&download=png&locale=${encodeURIComponent(locale)}${hidden ? "&hideText=1" : ""}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { const data = await response.json(); throw new Error(data.reason || "generation_failed"); }
      const url = URL.createObjectURL(await response.blob()); const a = document.createElement("a");
      a.href = url; a.download = "321school-learning-poster.png"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  return <main className="learning-poster">
    <Link href={`/${locale}/tools`}>← {locale === "nb" ? "Verktøy" : locale === "pt" ? "Ferramentas" : "Tools"}</Link>
    <h1 style={{ marginTop: 16 }}>{copy.title}</h1><p>{copy.subtitle}</p>
    {(source.text || id || initialPosterId || initialLessonId) && <button disabled={!!busy} onClick={() => startNew(sourceMode)}>{copy.newPoster}</button>}
    {pendingSourceMode && <div className="lp-alert" role="alert"><p>{copy.newTextConfirm}</p><div className="lp-actions">
      <button onClick={() => setPendingSourceMode(null)}>{copy.keepText}</button>
      <button onClick={() => startNew(pendingSourceMode, true)}>{copy.startFresh}</button>
    </div></div>}
    {!loading && !signedIn && <p className="lp-alert"><Link href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/producer/learning-posters`)}`}>{copy.login}</Link></p>}
    {error && <p className="lp-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {stale && <div className="lp-alert" role="status">{copy.sourceChanged}{source.lessonId && <button disabled={!!busy} onClick={() => void loadSource(true)}>{copy.refreshSource}</button>}</div>}
    <section className="lp-panel"><h2>{copy.source}</h2>
      <div className="lp-source-tabs" role="group" aria-label={copy.sourceMode}>
        <button type="button" aria-pressed={sourceMode === "content"} disabled={!!busy} onClick={() => { if (sourceMode !== "content") startNew("content"); }}>{copy.fromContent}</button>
        <button type="button" aria-pressed={sourceMode === "manual"} disabled={!!busy} onClick={() => { if (sourceMode !== "manual") startNew("manual"); }}>{copy.writeText}</button>
      </div>
      {sourceMode === "content" && <>
      <label>{copy.lessonSearch}<input type="search" value={lessonSearch} placeholder={copy.lessonSearchPlaceholder} disabled={!!busy || !signedIn || lessonsLoading} onChange={e => {
        setLessonSearch(e.target.value);
        const matches = filterPosterLessons(lessons, e.target.value, locale);
        setSelectedLesson(current => matches.some(lesson => lesson.id === current) ? current : matches[0]?.id || "");
      }} /></label>
      <div className="lp-fields"><label>{copy.choose}<select value={selectedLesson} disabled={!!busy || !signedIn || lessonsLoading} onChange={e => setSelectedLesson(e.target.value)}>
        <option value="">{copy.choosePlaceholder}</option>{filteredLessons.map(l => <option key={l.id} value={l.id}>{l.title || copy.untitledLesson} · {posterLevelLabel(l.level)} · {posterLessonLanguage(l.language, locale)} · {l.origin === "library" ? copy.libraryLesson : copy.ownLesson}</option>)}</select></label>
        <div className="lp-actions"><button disabled={!!busy || lessonsLoading || !selectedLesson || !signedIn} onClick={() => void loadSource()}>{copy.load}</button></div></div>
      <p className="lp-help" role="status">{lessonsLoading ? copy.lessonsLoading : lessonSearch && !filteredLessons.length ? copy.noLessonsFound : copy.lessonsHelp}</p>
      </>}
      {sourceMode === "manual" && <p className="lp-help">{copy.manualHelp}</p>}
      <label>{copy.sourceTitle}<input maxLength={120} value={source.title} disabled={sourceMode === "content" || !!busy} onChange={e => { setSource({ ...source, title: e.target.value, hash: "" }); setSettings(s => ({ ...s, title: e.target.value })); setApproved(false); }} /></label>
      <label style={{ marginTop: 12 }}>{copy.text}<textarea rows={8} maxLength={12000} placeholder={sourceMode === "manual" ? copy.manualPlaceholder : copy.contentPlaceholder} readOnly={sourceMode === "content"} disabled={!!busy} value={source.text}
        onChange={e => { if (normalizedText(e.target.value) !== normalizedText(source.text)) resetGoalForText(); setSource({ ...source, text: e.target.value, hash: "" }); setApproved(false); }} /></label>
      <p className="lp-help">{sourceMode === "manual" ? copy.manualLimit : copy.textLimit} {copy.privacy}</p>
      {goalNotice === "reset" && <p className="lp-help" role="status">{copy.goalReset}</p>}
      <div className="lp-fields">
        <label>{copy.kind}<select value={settings.kind} disabled={!!busy} onChange={e => editSettings({ kind: e.target.value as PosterPlan["kind"], focus: "" })}>{POSTER_KINDS.map(k => <option key={k} value={k}>{copy.kinds[k]}</option>)}</select></label>
        <label>{copy.purpose}<select value={settings.purpose} disabled={!!busy} onChange={e => editSettings({ purpose: e.target.value as PosterPlan["purpose"] })}>{POSTER_PURPOSES.map(p => <option key={p} value={p}>{copy.purposes[p]}</option>)}</select></label>
        <label>{copy.level}<select value={settings.level} disabled={!!busy} onChange={e => editSettings({ level: e.target.value })}>{["A1_START", "A1", "A2", "B1", "B2", "C1", "C2"].map(l => <option key={l} value={l}>{posterLevelLabel(l)}</option>)}</select></label>
        <label>{copy.language}<select value={languageCode} disabled={!!busy} onChange={e => editSettings({ language: e.target.value })}>{languageOptions.map(code => <option key={code} value={code}>{posterLanguageLabel(code, locale)}</option>)}</select></label>
      </div>
      {settings.kind !== "keywords" && <div className="lp-focus-field">
        <label>{copy.focusLabels[settings.kind]}<input maxLength={60} value={settings.focus} required={settings.kind === "sounds"} aria-describedby="lp-focus-help" placeholder={copy.focusPlaceholders[settings.kind]} disabled={!!busy} onChange={e => editSettings({ focus: e.target.value })} /></label>
        <p className="lp-help" id="lp-focus-help">{copy.focusHelp[settings.kind]}</p>
      </div>}
      <details><summary>{copy.moreOptions}</summary>
        {settings.kind === "keywords" && <label style={{ marginTop: 14 }}>{copy.focusLabels.keywords}<input maxLength={60} value={settings.focus} placeholder={copy.focusPlaceholders.keywords} disabled={!!busy} onChange={e => editSettings({ focus: e.target.value })} /></label>}
        {!plan && <div style={{ marginTop: 14 }}>
          <label>{copy.optionalGoal}<textarea rows={2} maxLength={240} value={settings.goal} placeholder={copy.goalPlaceholder} disabled={!!busy} onChange={e => editSettings({ goal: e.target.value })} /></label>
          <p className="lp-help">{copy.goalHelp}</p>
        </div>}
        <label className="lp-approve" style={{ marginTop: 10, padding: 10 }}><input type="checkbox" checked={settings.includeExplanations ?? false} disabled={!!busy} onChange={e => editSettings({ includeExplanations: e.target.checked })} /><span>{copy.includeExplanations}</span></label>
      </details>
      <div className="lp-actions"><button className="lp-primary" disabled={!!busy || !signedIn || !source.text.trim() || missingFocus} onClick={() => {
        if (!replaceAllowed()) return;
        void run("suggest", async () => {
          const data = await request("", { action: "suggest", source, settings: { ...settings, title: settings.title || source.title || copy.title } });
          if (!data.plan) throw new Error("generation_failed");
          setPlan(data.plan); setSettings(data.plan); setImages([]); setApproved(false); setSaved(""); setGoalNotice("");
          setNextStep({ target: "review" });
        });
      }}>{busy === "suggest" ? copy.working : copy.suggest}</button>
      <button disabled={!!busy || !source.text.trim() || missingFocus} onClick={() => {
        if (!replaceAllowed()) return;
        setPlan({ ...settings, title: settings.title || source.title || copy.title, items: Array.from({ length: 6 }, emptyItem) }); setApproved(false); setImages([]);
        setNextStep({ target: "review" });
      }}>{copy.manualPlan}</button></div><p className="lp-help">{copy.imageCost}</p>
    </section>
    {plan && <><section className="lp-panel"><h2 ref={reviewHeading} tabIndex={-1} className="lp-step-heading">{copy.review}</h2><div className="lp-fields">
      <label>{copy.posterTitle}<input maxLength={120} value={plan.title} disabled={!!busy} onChange={e => editPlan({ title: e.target.value })} /></label>
      <label>{copy.goal}<textarea rows={2} maxLength={240} value={plan.goal} placeholder={copy.goalPlaceholder} disabled={!!busy} onChange={e => editSettings({ goal: e.target.value })} /></label>
    </div><p className="lp-help">{copy.reviewGoalHelp}</p>
    {goalNotice === "changed" && <p className="lp-help" role="status">{copy.goalChanged}</p>}
    {plan.items.map((item, index) => <fieldset className="lp-editor" key={index} disabled={!!busy}><legend>{index + 1}</legend>
      <div className="lp-fields">{([ ["label", copy.label, 60], ["caption", copy.caption, 180], ["explanation", copy.explanation, 220], ["quote", copy.quote, 500], ["visualPrompt", copy.visual, 800] ] as const).filter(([key]) => key !== "explanation" || settings.includeExplanations).map(([key, label, max]) => <label key={key}>{label}
        <textarea rows={key === "visualPrompt" ? 3 : 2} maxLength={max} value={item[key]} onChange={e => editPlan({ items: plan.items.map((old, i) => i === index ? { ...old, [key]: e.target.value } : old) })} /></label>)}</div>
      <span className="lp-badge">{item.quote ? copy.sourceQuote : copy.newContent}</span>{invalidQuotes.includes(index) && <p className="lp-error">{copy.badQuote}</p>}
      <button style={{ marginLeft: 12 }} disabled={plan.items.length <= 1} onClick={() => editPlan({ items: plan.items.filter((_, i) => i !== index) })}>{copy.remove}</button>
    </fieldset>)}
    <p className="lp-help">{copy.quoteHelp}</p><button disabled={!!busy || plan.items.length >= 6} onClick={() => editPlan({ items: [...plan.items, emptyItem()] })}>{copy.add}</button>
    <label className="lp-approve" style={{ marginTop: 18 }}><input type="checkbox" checked={approved} disabled={!!busy || invalidQuotes.length > 0 || stale || !plan.goal.trim()} onChange={e => setApproved(e.target.checked)} /><span>{copy.approve}</span></label>
    {imageStage && <div className="lp-progress" role="status"><span className="lp-spinner" aria-hidden="true" /><div><strong>{copy.imageStages[imageStage]}</strong><p className="lp-help">{copy.imageWait}</p></div></div>}
    <div className="lp-actions"><button disabled={!!busy || !signedIn || invalidQuotes.length > 0} onClick={() => void run("save", async () => { await saveCurrent(); setMessage(copy.saved); })}>{busy === "save" ? copy.working : copy.save}</button>
      <button className="lp-primary" disabled={!!busy || !signedIn || !approved || stale || invalidQuotes.length > 0} onClick={() => void run("generate", async () => {
        setImageStage("saving"); const p = await saveCurrent();
        setImageStage("illustrating"); await request("", { action: "generate", id: p.id });
        setImageStage("finishing"); const data = await request(`?posterId=${encodeURIComponent(p.id)}`);
        if (!data.poster) throw new Error("generation_failed");
        applyPoster(data.poster); setMessage(copy.imagesReady); setNextStep({ target: "preview" });
      })}>{busy === "generate" ? copy.working : copy.generate}</button></div>
    </section>
    <section className="lp-panel"><h2 ref={previewHeading} tabIndex={-1} className="lp-step-heading">{copy.preview}</h2><div className="lp-actions">
      <button disabled={!!busy || !complete || dirty || !approved || stale} onClick={() => void download()}>{copy.download}</button>
      <button disabled={!!busy || !complete || dirty || !approved || stale} onClick={() => void run("print", async () => {
        await logUsageEvent({ feature: "pdf_download", contentId: id, contentType: "learning_poster", source: "own", path: window.location.pathname });
        window.print();
      })}>{copy.print}</button>
      <label className="lp-approve" style={{ padding: 8 }}><input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} /><span>{copy.hide}</span></label>
      {complete && !dirty && approved && <Link href={`/${locale}/content?filter=poster`}>{copy.inMyContent}</Link>}
    </div>{dirty && <p className="lp-help">{copy.editHint}</p>}<PosterPreview plan={plan} images={images} locale={locale} hidden={hidden} /></section></>}
    {posters.length > 0 && <section className="lp-panel"><h2>{copy.gallery}</h2>{posters.map(p => <p key={p.id}><Link href={`/${locale}/producer/learning-posters?posterId=${encodeURIComponent(p.id)}`} onClick={e => { if (plan && dirty && !window.confirm(copy.replace)) e.preventDefault(); }}>{p.title || copy.title}</Link></p>)}</section>}
  </main>;
}
