"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { clearLastStudentSpaceId, saveLastStudentSpaceId } from "@/lib/studentLastSpace";
import { useLocale, useTranslations } from "next-intl";

type Preview = { spaceId: string; title: string; displayName?: string; switchRequired?: boolean; currentDisplayName?: string | null; signedInAccount?: boolean; preview: boolean; approvalRequired?: boolean; approvalCode?: string; expired?: boolean; renewRequired?: boolean; requestState?: "rejected" | "cancelled" | "replace" };
export default function JoinClient() {
  const params = useSearchParams();
  const initialCode = params.get("code") ?? "";
  const initialStudentCode = params.get("studentCode") ?? "";
  const signedOut = params.get("signedOut") === "1";
  return <JoinForm key={JSON.stringify([initialCode, initialStudentCode, signedOut])} initialCode={initialCode} initialStudentCode={initialStudentCode} signedOut={signedOut} />;
}

function JoinForm({ initialCode, initialStudentCode, signedOut }: { initialCode: string; initialStudentCode: string; signedOut: boolean }) {
  const t = useTranslations("join");
  const locale = useLocale();
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [studentCode, setStudentCode] = useState(initialStudentCode);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(Boolean(initialCode.trim() && initialStudentCode.trim()));
  const [error, setError] = useState<string | null>(null);
  const automaticCheckStarted = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);

  const request = useCallback(async (confirm: boolean, switchPupil = false, renew = false, cancel = false) => {
    if (activeRequest.current) return;
    const controller = new AbortController(); activeRequest.current = controller;
    setBusy(true); setError(null);
    try {
      if (confirm && switchPupil) {
        await signOut(auth);
        clearLastStudentSpaceId();
      }
      await auth.authStateReady();
      const user = auth.currentUser ?? await ensureAnonymousUser();
      const response = await fetch("/api/spaces/join", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ code: code.trim(), studentCode: studentCode.trim(), confirm, renew, cancel }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        setPreview(null); // Stop polling a rejected/removed/invalid request.
        const key: Record<string, string> = {
          space_not_found: "spaceNotFound", student_code_required: "studentCodeRequired", invalid_student_code: "invalidStudentCode",
          identity_conflict: "identityConflict", missing_pupil_name: "missingPupilName", access_revoked: "accessRevoked", room_unavailable: "roomUnavailable",
          manager_account: "managerAccount",
          request_not_pending: "requestChanged", request_closed: "requestChanged",
        };
        throw new Error(t(`errors.${key[data.error] ?? "joinFailed"}`));
      }
      if (data.cancelled) setPreview(null);
      else if (!data.preview) {
        saveLastStudentSpaceId(data.spaceId);
        router.replace(`/${locale}/student/spaces/${data.spaceId}`);
      } else setPreview(data);
    } catch (e) { if (!controller.signal.aborted) { setPreview(null); setError(e instanceof Error ? e.message : t("errors.joinFailed")); } }
    finally { if (activeRequest.current === controller) { activeRequest.current = null; setBusy(false); } }
  }, [code, studentCode, locale, router, t]);

  useEffect(() => () => { activeRequest.current?.abort(); activeRequest.current = null; }, []);

  async function cancelPreview() {
    activeRequest.current?.abort(); activeRequest.current = null; setBusy(false);
    if (preview?.approvalRequired && preview.approvalCode) await request(false, false, false, true);
    else setPreview(null);
  }

  useEffect(() => {
    if (automaticCheckStarted.current || !initialCode.trim() || !initialStudentCode.trim()) return;
    automaticCheckStarted.current = true;
    void request(false);
  }, [initialCode, initialStudentCode, request]);

  const waiting = Boolean(preview?.approvalRequired && preview.approvalCode && !preview.expired);
  useEffect(() => {
    if (!waiting) return;
    // Read-only checks do not renew or create requests. Stop polling on unmount.
    const timer = window.setInterval(() => { if (!document.hidden) void request(false); }, 5000);
    return () => window.clearInterval(timer);
  }, [waiting, request]);

  function codeInput(id: string, field: string, value: string, setValue: (value: string) => void) {
    return <div>
      <label htmlFor={id} className="text-sm font-medium">{t(`fields.${field}.label`)}</label>
      <input id={id} value={value} onChange={e => { setValue(e.target.value.toUpperCase()); setPreview(null); }}
        required disabled={busy || Boolean(preview)} maxLength={12} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-50" />
    </div>;
  }
  return <div className="mx-auto max-w-md p-4">
    <h1 className="text-2xl font-semibold">{t("title")}</h1>
    <p className="mt-2 text-sm text-slate-600">{t("subtitle")}</p>
    {signedOut ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-800">{t("session.signedOut")}</p> : null}
    <form autoComplete="off" onSubmit={e => { e.preventDefault(); void request(false); }} className="mt-4 grid gap-4 rounded-2xl border bg-white p-4 shadow-sm">
      {codeInput("space-code", "spaceCode", code, setCode)}
      {codeInput("student-code", "studentCode", studentCode, setStudentCode)}
      <p className="m-0 text-xs text-slate-600">{t("fields.studentCode.tip")}</p>
      {preview?.approvalRequired ? <div aria-live="polite" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="m-0 text-sm font-semibold">{t("approval.title")}</p>
        <p className="m-0 text-sm">{t(preview.requestState ? `approval.${preview.requestState}` : preview.expired ? "approval.expired" : waiting ? "approval.waiting" : "approval.description")}</p>
        {waiting ? <p className="m-0 font-mono text-3xl font-bold tracking-widest" aria-label={t("approval.codeLabel")}>{preview.approvalCode}</p> : null}
        <button type="button" disabled={busy} onClick={() => void request(true, false, Boolean(preview.expired || preview.renewRequired))} className="rounded-xl bg-slate-950 px-3 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? t("actions.checking") : t(waiting ? "approval.check" : preview.renewRequired || preview.expired ? "approval.renew" : "approval.request")}
        </button>
        <button type="button" disabled={busy} onClick={() => void cancelPreview()} className="ml-2 rounded-xl border bg-white px-3 py-3 text-sm">{t("confirmation.cancel")}</button>
      </div> : preview ? <div aria-live="polite" className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="m-0 text-sm font-semibold">{t("confirmation.identity", { name: preview.displayName ?? "", room: preview.title })}</p>
        {preview.switchRequired ? <p className="m-0 text-sm">{t("confirmation.switch", { name: preview.currentDisplayName ?? "" })}</p> : null}
        {preview.switchRequired && preview.signedInAccount ? <p className="m-0 text-sm">{t("confirmation.signOut")}</p> : null}
        <button type="button" disabled={busy} onClick={() => void request(true, Boolean(preview.switchRequired))} className="w-full rounded-xl bg-emerald-700 px-3 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? t("actions.joining") : t("confirmation.continue", { name: preview.displayName ?? "" })}
        </button>
        <button type="button" disabled={busy} onClick={() => void cancelPreview()} className="w-full rounded-xl border bg-white px-3 py-2 text-sm">{t("confirmation.cancel")}</button>
      </div> : <button type="submit" disabled={busy} className="rounded-xl bg-slate-950 px-3 py-3 font-semibold text-white disabled:opacity-50">{busy ? t("actions.checking") : t("actions.check")}</button>}
      {error ? <p role="alert" className="m-0 text-sm text-red-700">{error}</p> : null}
    </form>
  </div>;
}
