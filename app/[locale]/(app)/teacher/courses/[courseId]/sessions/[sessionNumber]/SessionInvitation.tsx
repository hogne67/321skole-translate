"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { User } from "firebase/auth";
import type { Course, CoursePlanSession } from "@/lib/courses/types";
import { sessionInvitationUrl } from "@/lib/courses/sessionInvitation";

const button = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 disabled:opacity-50";

export function SessionInvitation({ course, session, user, onSendingChange }: { course: Course; session: CoursePlanSession; user: User; onSendingChange: (busy: boolean) => void }) {
  const t = useTranslations("academy.sessionInvitation");
  const locale = useLocale();
  const sendingRef = useRef(false);
  const [emails, setEmails] = useState<string[] | null>(null);
  const [configured, setConfigured] = useState(false);
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [subject, setSubject] = useState(() => t("defaultSubject", { title: session.title || course.title }));
  const [body, setBody] = useState(() => {
    const date = session.startsAt ? new Date(session.startsAt) : null;
    const when = date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Oslo" }).format(date)
      : t("dateNotSet");
    return t("defaultBody", { course: course.title, title: session.title || course.title, when, minutes: session.durationMinutes || 120 });
  });
  const endpoint = `/api/teacher/courses/${encodeURIComponent(course.id)}/messages`;

  useEffect(() => {
    let cancelled = false;
    setLink(sessionInvitationUrl(window.location.origin, locale, course.id, session.sessionNumber));
    async function load() {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`${endpoint}?invitation=1`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.invitationEmails)) throw new Error();
        if (!cancelled) {
          setEmails(data.invitationEmails);
          setConfigured(data.emailConfigured === true);
        }
      } catch {
        if (!cancelled) setError(t("loadFailed"));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [course.id, endpoint, locale, session.sessionNumber, t, user]);

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setFeedback(t("copied")); }
    catch { setError(t("copyFailed")); }
  }

  async function showQr() {
    setQrBusy(true);
    try {
      const QRCode = (await import("qrcode")).default;
      setQr(await QRCode.toDataURL(link, { margin: 2, width: 300 }));
    } catch { setError(t("qrFailed")); }
    finally { setQrBusy(false); }
  }

  async function send() {
    if (sendingRef.current || !emails?.length || sent) return;
    sendingRef.current = true;
    onSendingChange(true);
    setSending(true); setError(""); setFeedback("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, recipients: "active_enrolled", sessionNumber: session.sessionNumber, locale, expectedRecipients: emails }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "recipients_changed") { setEmails(null); throw new Error(t("recipientsChanged")); }
        throw new Error(data.code === "email_not_configured" ? t("notConfigured") : t("sendFailed"));
      }
      // A partial send must not be retried blindly: successful recipients would get duplicates.
      setSent(true);
      if (data.status !== "sent") setError(t("partialFailed"));
      else setFeedback(t("sent", { count: data.recipientsCount }));
    } catch (err) { setError(err instanceof Error ? err.message : t("sendFailed")); }
    finally { sendingRef.current = false; setSending(false); onSendingChange(false); }
  }

  return <section className="rounded-lg border border-emerald-200 bg-white p-5 shadow-sm" aria-label={t("title")}>
    <h2 className="m-0 text-lg font-black">{t("title")}</h2>
    <p className="text-sm text-slate-600">{t("intro")}</p>
    <label className="grid gap-2 text-sm font-bold">{t("link")}
      <input readOnly value={link} onFocus={(event) => event.target.select()} className="w-full rounded-lg border border-slate-300 p-2 font-normal" />
    </label>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={button} onClick={() => void copyLink()} disabled={!link}>{t("copy")}</button>
      <button type="button" className={button} onClick={() => qr ? setQr("") : void showQr()} disabled={!link || qrBusy}>{qr ? t("hideQr") : t("showQr")}</button>
    </div>
    {qr ? <div className="mt-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt={t("qrAlt")} width={300} height={300} className="max-w-full" />
      <a href={qr} download={`321school-session-${session.sessionNumber}.png`} className="text-sm underline">{t("downloadQr")}</a>
    </div> : null}
    <hr className="my-5 border-slate-200" />
    <h3 className="text-base font-bold">{t("emailTitle")}</h3>
    <p className="text-sm text-slate-600">{emails === null ? t("loading") : t("recipients", { count: emails.length })}</p>
    {emails?.length ? <details className="mb-3 text-sm"><summary className="cursor-pointer">{t("showRecipients")}</summary><p className="break-words">{emails.join(", ")}</p></details> : null}
    {emails !== null && !configured ? <p role="alert" className="text-sm text-rose-700">{t("notConfigured")}</p> : null}
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm font-bold">{t("subject")}<input value={subject} maxLength={180} disabled={sending || sent} onChange={(event) => setSubject(event.target.value)} className="rounded-lg border border-slate-300 p-2 font-normal" /></label>
      <label className="grid gap-1 text-sm font-bold">{t("body")}<textarea rows={7} maxLength={5000} value={body} disabled={sending || sent} onChange={(event) => setBody(event.target.value)} className="rounded-lg border border-slate-300 p-2 font-normal" /></label>
    </div>
    <details className="my-4 rounded-lg bg-sky-50 p-3 text-sm" open>
      <summary className="cursor-pointer font-bold">{t("preview")}</summary>
      <p className="font-bold">{subject}</p><p className="whitespace-pre-wrap">{body}</p>
      <span className="inline-block rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white">{t("goToSession")}</span>
      <p className="text-slate-600">{t("loginHelp")}</p>
    </details>
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
    <p role="status" className="text-sm text-emerald-800">{feedback}</p>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <a href={`/${locale}/teacher/courses/${course.id}?section=Messages`} className="text-sm underline">{t("history")}</a>
      <button type="button" onClick={() => void send()} disabled={sending || sent || !configured || !emails?.length || emails.length > 100 || !subject.trim() || !body.trim()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{sending ? t("sending") : sent ? t("done") : t("send", { count: emails?.length || 0 })}</button>
    </div>
    {emails && emails.length > 100 ? <p role="alert" className="text-sm text-rose-700">{t("limit")}</p> : null}
  </section>;
}
