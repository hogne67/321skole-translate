"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { authMaybe } from "@/lib/firebase";

type DeletionStatus = { deleted: boolean; canDelete: boolean; blockedBy: "members" | "submissions" | null };
class DeletionRequestError extends Error {}

export default function SpaceDeletionAction({ spaceId, title, deleted = false, compact = false, onChanged }: {
  spaceId: string; title: string; deleted?: boolean; compact?: boolean; onChanged?: () => void;
}) {
  const t = useTranslations("spaces.deletion");
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<AbortController | null>(null);
  const headingId = useId();
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  async function request(action?: "delete" | "restore", signal?: AbortSignal) {
    const user = authMaybe?.currentUser;
    if (!user) throw new DeletionRequestError(t("errors.unauthorized"));
    const response = await fetch(`/api/teacher/spaces/${encodeURIComponent(spaceId)}/deletion`, {
      method: action ? "POST" : "GET", cache: "no-store", signal,
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(action ? { "Content-Type": "application/json" } : {}) },
      ...(action ? { body: JSON.stringify({ action }) } : {}),
    });
    const data = await response.json();
    if (!response.ok) {
      const code = ["members", "submissions", "ownerOnly", "notFound", "unauthorized"].includes(data.error) ? data.error : "failed";
      throw new DeletionRequestError(t(`errors.${code}`));
    }
    return data;
  }

  async function open() {
    setStatus(null);
    setError(null);
    dialog.current?.showModal();
    if (deleted) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    try {
      const result = await request(undefined, controller.signal) as DeletionStatus;
      if (!controller.signal.aborted) setStatus(result);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof DeletionRequestError ? error.message : t("errors.failed"));
    }
  }

  async function confirm() {
    if (busy || (!deleted && !status?.canDelete)) return;
    setBusy(true);
    setError(null);
    try {
      await request(deleted ? "restore" : "delete");
      dialog.current?.close();
      onChanged?.();
    } catch (error) {
      setError(error instanceof DeletionRequestError ? error.message : t("errors.failed"));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" onClick={() => void open()}
      aria-label={t(deleted ? "restoreNamed" : "deleteNamed", { title })}
      title={t(deleted ? "restoreNamed" : "deleteNamed", { title })}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-white text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${compact ? "w-11" : "px-4 py-2"} ${deleted ? "border-emerald-200 text-emerald-800 hover:bg-emerald-50 focus-visible:ring-emerald-600" : "border-red-200 text-red-700 hover:bg-red-50 focus-visible:ring-red-600"}`}>
      {deleted ? <RotateCcw size={18} aria-hidden="true" /> : <Trash2 size={18} aria-hidden="true" />}
      {!compact ? t(deleted ? "restore" : "delete") : null}
    </button>
    <dialog ref={dialog} aria-labelledby={headingId}
      onCancel={event => { if (busy) event.preventDefault(); }}
      onClose={() => { pending.current?.abort(); setStatus(null); setError(null); }}
      className="m-auto max-h-[90vh] w-[min(92vw,32rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/50">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div className="min-w-0">
          <h2 id={headingId} className="m-0 text-lg font-bold">{t(deleted ? "restore" : "delete")}</h2>
          <p className="mb-0 mt-1 break-words text-sm text-slate-600">{title}</p>
        </div>
        <button type="button" autoFocus disabled={busy} onClick={() => dialog.current?.close()} aria-label={t("cancel")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50">
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="space-y-3 p-5 text-sm leading-6">
        <p className="m-0">{t(deleted ? "restoreHelp" : "help")}</p>
        {!deleted && !status && !error ? <p role="status" className="text-slate-600">{t("checking")}</p> : null}
        {!deleted && status?.blockedBy ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">{t(`errors.${status.blockedBy}`)}</p> : null}
        {!deleted && status?.canDelete ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">{t("eligible")}</p> : null}
        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{error}</p> : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-5">
        <button type="button" disabled={busy} onClick={() => dialog.current?.close()}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50">{t("cancel")}</button>
        <button type="button" disabled={busy || (!deleted && !status?.canDelete)} onClick={() => void confirm()}
          className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 ${deleted ? "bg-emerald-700 hover:enabled:bg-emerald-800 focus-visible:ring-emerald-600" : "bg-red-700 hover:enabled:bg-red-800 focus-visible:ring-red-600"}`}>
          {busy ? t("saving") : t(deleted ? "confirmRestore" : "confirmDelete")}
        </button>
      </div>
    </dialog>
  </>;
}
