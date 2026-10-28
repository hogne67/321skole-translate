"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { User } from "firebase/auth";

export type SpaceAccessRequest = { id: string; name: string; isAnon: boolean };
export default function SpaceAccessRequests({ spaceId, user, requests }: { spaceId: string; user: User; requests: SpaceAccessRequest[] }) {
  const t = useTranslations("teacherMembers.approval");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function decide(id: string, action: "approve" | "reject") {
    if (busy) return;
    setBusy(id); setError(null);
    try {
      const response = await fetch(`/api/teacher/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(id)}/access-request`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ action, confirmationCode: codes[id] ?? "" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(t(data.error === "confirmation_mismatch" ? "wrongCode" : data.error === "request_expired" ? "expired" : "failed"));
      setCodes(current => { const next = { ...current }; delete next[id]; return next; });
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("failed")); }
    finally { setBusy(null); }
  }
  if (!requests.length) return null;
  return <section aria-labelledby="access-requests-title" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <h2 id="access-requests-title" className="text-lg font-semibold">{t("title")}</h2>
    <p className="mt-1 text-sm">{t("description")}</p>
    {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
    <ul className="mt-3 space-y-3">
      {requests.map(row => <li key={row.id} className="rounded-xl border bg-white p-3">
        <form onSubmit={event => { event.preventDefault(); void decide(row.id, "approve"); }}>
          <h3 className="font-semibold">{row.name || t("unknown")}</h3>
          <p className="text-xs text-slate-600">{t(row.isAnon ? "anonymous" : "account")}</p>
          <label htmlFor={`access-code-${row.id}`} className="mt-2 block text-sm">{t("codeLabel")}</label>
          <input id={`access-code-${row.id}`} inputMode="numeric" autoComplete="off" required pattern="[0-9]{6}" maxLength={6} value={codes[row.id] ?? ""}
            onChange={event => setCodes(current => ({ ...current, [row.id]: event.target.value.replace(/[^0-9]/g, "") }))}
            disabled={busy !== null} className="mt-1 w-40 rounded-lg border px-2 py-2 font-mono" />
          <div className="mt-2 flex gap-2">
            <button type="submit" disabled={busy !== null} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("approve")}</button>
            <button type="button" disabled={busy !== null} onClick={() => void decide(row.id, "reject")} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{t("reject")}</button>
          </div>
        </form>
      </li>)}
    </ul>
  </section>;
}
