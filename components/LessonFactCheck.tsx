"use client";

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { useLocale } from "next-intl";
import { reviewContent } from "@/lib/lessons/reviewContent";

const labels = {
  nb: {
    title: "Faktasjekk av tekst og oppgaver", help: "Kontrollen gir merknader og kilder. Den endrer ikke teksten, oppgavene eller fasiten. Du korrigerer selv det som er nødvendig.",
    run: "Lagre og kjør faktasjekk", running: "Sjekker fakta og kilder …", confirm: "Lagre og bekreft gjennomgangen", confirming: "Lagrer bekreftelse …",
    acceptance: "Jeg har vurdert merknadene, korrigert det som er nødvendig og kontrollert at tekst, oppgaver og fasit stemmer.",
    changed: "Innholdet er endret etter kontrollen. Vurder merknadene og berørte oppgaver på nytt. Du kan kjøre en ny sjekk eller bekrefte den korrigerte versjonen.",
    done: "Gjennomgangen er bekreftet for denne versjonen. Senere endringer i tekst eller oppgaver krever ny bekreftelse.", sources: "Kilder", failed: "Faktasjekken kunne ikke fullføres. Prøv igjen.",
  },
  en: {
    title: "Fact check of text and tasks", help: "The check provides comments and sources. It does not change the text, tasks or answer keys. You make any necessary corrections.",
    run: "Save and run fact check", running: "Checking facts and sources …", confirm: "Save and confirm review", confirming: "Saving confirmation …",
    acceptance: "I have considered the comments, made necessary corrections and checked that the text, tasks and answer keys are accurate and consistent.",
    changed: "Content has changed since the check. Review the comments and affected tasks again. You can run another check or confirm the corrected version.",
    done: "Review confirmed for this version. Later changes to the text or tasks require a new confirmation.", sources: "Sources", failed: "The fact check could not be completed. Please try again.",
  },
  pt: {
    title: "Verificação de factos do texto e das tarefas", help: "A verificação apresenta comentários e fontes. Não altera o texto, as tarefas nem as respostas. As correções necessárias são feitas por si.",
    run: "Guardar e verificar factos", running: "A verificar factos e fontes …", confirm: "Guardar e confirmar revisão", confirming: "A guardar confirmação …",
    acceptance: "Avaliei os comentários, fiz as correções necessárias e verifiquei a exatidão e coerência do texto, das tarefas e das respostas.",
    changed: "O conteúdo foi alterado após a verificação. Reveja os comentários e as tarefas afetadas. Pode executar outra verificação ou confirmar a versão corrigida.",
    done: "Revisão confirmada para esta versão. Alterações posteriores ao texto ou às tarefas exigem nova confirmação.", sources: "Fontes", failed: "Não foi possível concluir a verificação. Tente novamente.",
  },
};

export type FactCheckDisplay = { report: string; sources: { title: string; url: string; start?: number; end?: number }[] };
type Review = FactCheckDisplay & { reviewId: string };
type Result = { review: Review | null; content: string; changedSinceCheck: boolean; acknowledged: boolean };

async function request(lessonId: string, action: string, reportLanguage: string, reviewId?: string, signal?: AbortSignal): Promise<Result> {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Unauthorized");
  const response = await fetch("/api/producer/fact-check", { method: "POST", signal,
    headers: { "Content-Type": "application/json", authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ lessonId, action, reportLanguage, reviewId }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

export function FactCheckReport({ review }: { review: FactCheckDisplay }) {
  const parts = [];
  let cursor = 0;
  for (const source of [...review.sources].sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))) {
    if (source.start === undefined || source.end === undefined || source.start < cursor || source.end <= source.start || source.end > review.report.length || !/^https?:\/\//.test(source.url)) continue;
    parts.push(review.report.slice(cursor, source.start));
    parts.push(<a key={`${source.start}-${source.url}`} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>);
    cursor = source.end;
  }
  parts.push(review.report.slice(cursor));
  return <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.6 }}>{parts}</div>;
}

export default function LessonFactCheck({ lessonId, lesson, save, disabled = false }: {
  lessonId: string; lesson: Record<string, unknown>; save: () => Promise<boolean>; disabled?: boolean;
}) {
  const locale = useLocale();
  const language = locale.startsWith("en") ? "en" : locale.startsWith("pt") ? "pt" : "nb";
  const t = labels[language];
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<"review" | "acknowledge" | null>(null);
  const [acceptedContent, setAcceptedContent] = useState<string | null>(null);
  const [error, setError] = useState("");
  const content = reviewContent(lesson);
  const confirmed = result?.acknowledged && result.content === content;

  useEffect(() => {
    const controller = new AbortController();
    request(lessonId, "read", language, undefined, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult(data);
    }).catch(() => { if (!controller.signal.aborted) setError(t.failed); });
    return () => controller.abort();
  }, [lessonId, language, t.failed]);

  async function run(action: "review" | "acknowledge") {
    setBusy(action);
    setError("");
    try {
      if (!await save()) return;
      setResult(await request(lessonId, action, language, result?.review?.reviewId));
      setAcceptedContent(null);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(null);
    }
  }

  return <section aria-label={t.title} style={{ padding: 16, border: "1px solid #bfdbfe", borderRadius: 12, background: "#f8fafc", display: "grid", gap: 12 }}>
    <h3 style={{ margin: 0 }}>{t.title}</h3>
    <p style={{ margin: 0 }}>{t.help}</p>
    <button type="button" className="plain-btn" disabled={disabled || !!busy || !String(lesson.sourceText ?? "").trim()} onClick={() => run("review")}>{busy === "review" ? t.running : t.run}</button>
    {error && <p role="alert">{error}</p>}
    {result?.review && <>
      <FactCheckReport review={result.review} />
      {!!result.review.sources.length && <div><b>{t.sources}</b><ul>{result.review.sources.filter((source, index, sources) => /^https?:\/\//.test(source.url) && sources.findIndex(item => item.url === source.url) === index).map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul></div>}
      {!confirmed && (result.changedSinceCheck || result.content !== content) && <p role="status">{t.changed}</p>}
      {confirmed ? <p role="status" style={{ color: "#166534" }}>{t.done}</p> : <>
        <label style={{ display: "flex", gap: 8, alignItems: "start" }}><input type="checkbox" checked={acceptedContent === content} disabled={!!busy || disabled} onChange={event => setAcceptedContent(event.target.checked ? content : null)} />{t.acceptance}</label>
        <button type="button" className="plain-btn" disabled={!!busy || disabled || acceptedContent !== content} onClick={() => run("acknowledge")}>{busy === "acknowledge" ? t.confirming : t.confirm}</button>
      </>}
    </>}
  </section>;
}
