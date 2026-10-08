"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Settings2 } from "lucide-react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useLocale, useTranslations } from "next-intl";
import { db } from "@/lib/firebase";
import type { SpaceDoc } from "@/lib/spacesClient";

const actionClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 no-underline transition hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50";

export default function SpaceAdministration({ spaceId, space, canControl }: {
  spaceId: string;
  space: SpaceDoc;
  canControl: boolean;
}) {
  const t = useTranslations("spaces");
  const detail = useTranslations("spaceDetail");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const code = space.joinCode || space.code || "";
  const basePath = `/${locale}/teacher/spaces/${spaceId}`;

  function cancelEditing() {
    setEditing(false);
    setError(null);
    setFeedback(null);
  }

  async function save(fields: Partial<Pick<SpaceDoc, "title">>) {
    if (!canControl || busy) return false;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await updateDoc(doc(db, "spaces", spaceId), { ...fields, updatedAt: serverTimestamp() });
      setFeedback(detail("administration.saved"));
      return true;
    } catch {
      setError(detail("administration.saveFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function joinUrl() {
    return `${window.location.origin}/${locale}/join?code=${encodeURIComponent(code)}`;
  }

  async function copy(value: string) {
    setError(null);
    setFeedback(null);
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(t("list.copied"));
    } catch {
      setError(detail("administration.copyFailed"));
    }
  }

  async function showQr() {
    if (qr) { setQr(null); return; }
    setQrBusy(true);
    setError(null);
    try {
      const QRCode = (await import("qrcode")).default;
      setQr(await QRCode.toDataURL(joinUrl(), { margin: 2, scale: 6 }));
    } catch {
      setError(detail("administration.qrFailed"));
    } finally {
      setQrBusy(false);
    }
  }

  return (
    <details className="group rounded-2xl border border-emerald-100 bg-white shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-emerald-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 group-open:rounded-b-none [&::-webkit-details-marker]:hidden sm:px-5">
        <Settings2 className="h-5 w-5 text-emerald-700" aria-hidden="true" />
        {detail("administration.title")}
        <ChevronDown className="ml-auto h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-5 border-t border-emerald-100 p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href={`${basePath}/members`} className={actionClass}>{t("list.seeMembers")}</Link>
          <Link href={`${basePath}/members/print`} className={actionClass}>{t("list.studentCodes")}</Link>
        </div>

        {canControl ? (
          <div className="rounded-xl bg-slate-50 p-4">
            {editing ? (
              <form onSubmit={async (event) => {
                event.preventDefault();
                const title = titleDraft.trim();
                if (!title) { setError(t("list.editTitleRequired")); return; }
                if (await save({ title })) setEditing(false);
              }} className="space-y-2">
                <label htmlFor="space-title" className="block text-sm font-semibold text-slate-900">{t("list.editTitleLabel")}</label>
                <input id="space-title" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} disabled={busy} autoFocus
                  onKeyDown={(event) => { if (event.key === "Escape" && !busy) cancelEditing(); }}
                  className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={busy} className={actionClass}>{busy ? t("list.savingTitle") : t("list.saveTitle")}</button>
                  <button type="button" disabled={busy} onClick={cancelEditing} className={actionClass}>{t("list.cancelEditTitle")}</button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">{t("list.editTitleLabel")}</p>
                  <p className="break-words text-sm font-semibold text-slate-900">{space.title}</p>
                </div>
                <button type="button" onClick={() => { setTitleDraft(space.title); setEditing(true); setError(null); setFeedback(null); }} className={actionClass}>{t("list.editTitle")}</button>
              </div>
            )}
          </div>
        ) : null}

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">{detail("administration.accessTitle")}</h2>
          <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-slate-700">{detail("administration.personalAccess")}</p>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-slate-600">{detail("administration.sharedEntrance")}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {t("list.code")}
            <button type="button" disabled={!code} onClick={() => void copy(code)} className={`${actionClass} font-mono`} title={t("list.copyCodeTitle")}>{code || "—"}</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" disabled={!code} onClick={() => void copy(joinUrl())} className={actionClass}>{t("list.copyJoinLink")}</button>
            <button type="button" disabled={!code || qrBusy} onClick={() => void showQr()} aria-expanded={Boolean(qr)} aria-controls="space-join-qr" className={actionClass}>{t("list.joinWithQr")}</button>
            <Link href={`${basePath}/print`} className={actionClass}>{t("list.printRoom")}</Link>
          </div>
          {qrBusy ? <p role="status" className="text-sm text-slate-500">{t("qr.generating")}</p> : null}
          <div id="space-join-qr" hidden={!qr}>
            {qr ? <Image src={qr} alt={t("qr.imageAlt")} width={256} height={256} unoptimized className="mx-auto h-auto max-w-full rounded-xl border border-slate-200" /> : null}
          </div>
        </div>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <p role="status" className="text-sm text-emerald-700">{feedback}</p>
      </div>
    </details>
  );
}
