"use client";
import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { auth } from "@/lib/firebase";
import { validateInviteRecipients } from "@/lib/schools/inviteBatch";
import "./schoolAdmin.css";

export default function TeacherInviteBatch({ schoolId, seatsRemaining, onCreated, disabled }: {
  schoolId: string; seatsRemaining: number; onCreated: (message: string) => void; disabled: boolean;
}) {
  const t = useTranslations("schoolAdmin.batch");
  const locale = useLocale();
  const [rows, setRows] = useState([{ displayName: "", email: "" }]);
  const [sendEmail, setSendEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const count = rows.filter((row) => row.email.trim() || row.displayName.trim()).length;
  function importRows() {
    const imported = paste.trim().split(/\r?\n/).filter(Boolean).map((line) => {
      const parts = line.split(/[\t;]/).map((part) => part.trim());
      return parts.length === 1 ? { displayName: "", email: parts[0] } : { displayName: parts[0], email: parts[1] };
    });
    if (!paste.trim() || imported.length > 50) { setError(t("invalid_batch")); return; }
    setRows(imported); setPaste(""); setError("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    let recipients;
    try { recipients = validateInviteRecipients(rows.filter((row) => row.email.trim() || row.displayName.trim())); }
    catch (err) { setError(t(err instanceof Error ? err.message : "invalid_batch")); return; }
    if (recipients.length > seatsRemaining) { setError(t("seat_limit_reached")); return; }
    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error(t("failed"));
      const token = await user.getIdToken();
      const response = await fetch("/api/schools/invite", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schoolId, recipients, sendEmail, locale }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.reason && t.has(data.reason) ? t(data.reason) : data.error || t("failed"));
      const unsent = sendEmail ? data.invites.filter((invite: { emailSent?: boolean }) => !invite.emailSent).length : 0;
      const successMessage = t(unsent ? "createdWithFailures" : sendEmail ? "createdSent" : "created", { count: recipients.length, unsent });
      setMessage(successMessage);
      setRows([{ displayName: "", email: "" }]); onCreated(successMessage);
    } catch (err) { setError(err instanceof Error ? err.message : t("failed")); }
    finally { setBusy(false); }
  }
  return (
    <details className="schoolBatch" open={message ? true : undefined}>
      <summary>{t("title")}</summary>
      <p>{t("intro")}</p>
      <form onSubmit={submit}>
        {rows.map((row, index) => (
          <div className="schoolBatchRow" key={index}>
            <label>{t("name")}<input maxLength={120} value={row.displayName} disabled={busy || disabled} onChange={(event) => setRows(rows.map((item, i) => i === index ? { ...item, displayName: event.target.value } : item))} /></label>
            <label>{t("email")}<input type="email" required={!!row.displayName || !!row.email} value={row.email} disabled={busy || disabled} onChange={(event) => setRows(rows.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} /></label>
            <button type="button" disabled={busy || rows.length === 1} onClick={() => setRows(rows.filter((_, i) => i !== index))} aria-label={t("removeRow", { number: index + 1 })}>×</button>
          </div>
        ))}
        <button type="button" disabled={busy || disabled || rows.length >= 50} onClick={() => setRows([...rows, { displayName: "", email: "" }])}>{t("addRow")}</button>
        <details className="schoolPaste"><summary>{t("pasteTitle")}</summary><p>{t("pasteHelp")}</p><textarea value={paste} onChange={(event) => setPaste(event.target.value)} disabled={busy || disabled} aria-label={t("pasteTitle")} rows={4} /><button type="button" onClick={importRows} disabled={busy || disabled}>{t("importRows")}</button></details>
        <label className="schoolBatchEmail"><input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} disabled={busy || disabled} />{t("sendEmail")}</label>
        <p>{t("capacity", { count, available: seatsRemaining })}</p>
        <button className="schoolPrimaryAction" type="submit" disabled={busy || disabled || count === 0 || count > seatsRemaining}>{busy ? t("working") : t(sendEmail ? "submitEmail" : "submitPrint")}</button>
      </form>
      {error ? <p role="alert" className="schoolBatchError">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <Link className="schoolTextAction" href={`/${locale}/school/invites/print-list?schoolId=${encodeURIComponent(schoolId)}`} target="_blank">{t("printList")}</Link>
    </details>
  );
}
