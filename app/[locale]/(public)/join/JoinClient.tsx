"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { clearLastStudentSpaceId, saveLastStudentSpaceId } from "@/lib/studentLastSpace";
import { parsePupilAccountProviders } from "@/lib/security/schoolPupilProviders";
import { useLocale, useTranslations } from "next-intl";

type JoinAction = { confirm?: boolean; switchPupil?: boolean; renew?: boolean; cancel?: boolean; submit?: boolean };

type Preview = { spaceId: string; title: string; displayName?: string; switchRequired?: boolean; currentDisplayName?: string | null; signedInAccount?: boolean; preview: boolean; approvalRequired?: boolean; approvalCode?: string; expired?: boolean; renewRequired?: boolean; requestState?: "rejected" | "cancelled" | "replace" };

function roomEntryHref(locale: string, code: string, accountJoin: boolean, openContent: boolean, page: "login" | "onboarding" = "login") {
  const params = new URLSearchParams({ code: code.trim(), method: accountJoin ? "account" : "code" });
  if (openContent) params.set("next", "content");
  const next = `/${locale}/join?${params}`;
  return `/${locale}/${page}?next=${encodeURIComponent(next)}`;
}

export default function JoinClient() {
  const params = useSearchParams();
  const initialCode = params.get("code") ?? "";
  const initialStudentCode = params.get("studentCode") ?? "";
  const method = params.get("method");
  const signedOut = params.get("signedOut") === "1";
  const openContent = params.get("next") === "content";
  // Keep the printed pupil links, dedicated code entry and shared-PC sign-out flow.
  const codeEntry = method === "code" || (method !== "account" && (openContent || signedOut));
  const accountJoin = !initialStudentCode && !codeEntry;
  return (
    <JoinForm
      key={JSON.stringify([initialCode, initialStudentCode, signedOut, openContent, accountJoin])}
      initialCode={initialCode}
      initialStudentCode={initialStudentCode}
      signedOut={signedOut}
      openContent={openContent}
      accountJoin={accountJoin}
    />
  );
}

function JoinForm({ initialCode, initialStudentCode, signedOut, openContent, accountJoin }: {
  initialCode: string;
  initialStudentCode: string;
  signedOut: boolean;
  openContent: boolean;
  accountJoin: boolean;
}) {
  const t = useTranslations("join");
  const tLanding = useTranslations("landing.hero");
  const locale = useLocale();
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [studentCode, setStudentCode] = useState(initialStudentCode);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(Boolean(initialCode.trim() && initialStudentCode.trim()));
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<"code" | "provider" | "profile" | null>(null);
  const [accountUser, setAccountUser] = useState<User | null>();
  const automaticCheckStarted = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!accountJoin) return;
    return onAuthStateChanged(auth, setAccountUser);
  }, [accountJoin]);

  const request = useCallback(async ({ confirm, switchPupil, renew, cancel, submit }: JoinAction = {}) => {
    if (activeRequest.current) return;
    const controller = new AbortController(); activeRequest.current = controller;
    setBusy(true); setError(null); setRecovery(null);
    try {
      if (confirm && switchPupil) {
        await signOut(auth);
        clearLastStudentSpaceId();
      }
      await auth.authStateReady();
      if (accountJoin && (!auth.currentUser || auth.currentUser.isAnonymous)) {
        router.push(roomEntryHref(locale, code, accountJoin, openContent));
        return;
      }
      const user = auth.currentUser ?? await ensureAnonymousUser();
      const response = await fetch("/api/spaces/join", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken(accountJoin)}` },
        body: JSON.stringify(accountJoin
          ? { method: "account", code: code.trim(), submit }
          : { code: code.trim(), studentCode: studentCode.trim(), confirm, renew, cancel, submit }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted || auth.currentUser?.uid !== user.uid) return;
      if (!response.ok) {
        setPreview(null); // Stop polling a rejected/removed/invalid request.
        if (!accountJoin && ["school_pupil_code_disabled", "school_pupil_account_required"].includes(data.error)) setRecovery("code");
        if (accountJoin && data.error === "account_profile_incomplete") setRecovery("profile");
        if (data.error === "school_pupil_provider_disabled") {
          setRecovery("provider");
          const providers = parsePupilAccountProviders(data.pupilAccountProviders);
          if (providers) {
            const methods = new Intl.ListFormat(locale).format(providers.map(provider => t(`account.providers.${provider}`)));
            throw new Error(t("errors.schoolProviderMethods", { methods }));
          }
        }
        const key: Record<string, string> = {
          space_not_found: "spaceNotFound", student_code_required: "studentCodeRequired", invalid_student_code: "invalidStudentCode",
          identity_conflict: "identityConflict", missing_pupil_name: "missingPupilName", access_revoked: "accessRevoked", room_unavailable: "roomUnavailable",
          manager_account: "managerAccount", student_code_attempts: "studentCodeAttempts",
          request_not_pending: "requestChanged", request_closed: "requestChanged",
          account_required: "accountRequired", account_email_unverified: "accountEmailUnverified",
          account_role_ineligible: "accountRoleIneligible", account_profile_incomplete: "accountProfileIncomplete",
          account_invitation_required: "accountInvitationRequired",
          account_capacity_reached: "teacherLimitReached",
          school_pupil_code_disabled: "schoolPupilCodeDisabled",
          school_pupil_provider_disabled: "schoolProviderDisabled",
          school_pupil_account_required: "schoolPupilAccountRequired",
          account_transfer_conflict: "accountTransferConflict",
          account_transfer_unavailable: "accountTransferUnavailable",
        };
        throw new Error(t(`errors.${key[data.error] ?? "joinFailed"}`));
      }
      if (data.cancelled) setPreview(null);
      else if (!data.preview) {
        saveLastStudentSpaceId(data.spaceId);
        router.replace(openContent || accountJoin ? `/${locale}/content` : `/${locale}/student/spaces/${data.spaceId}`);
      } else setPreview(data);
    } catch (e) { if (!controller.signal.aborted) { setPreview(null); setError(e instanceof Error ? e.message : t("errors.joinFailed")); } }
    finally { if (activeRequest.current === controller) { activeRequest.current = null; setBusy(false); } }
  }, [code, studentCode, locale, openContent, accountJoin, router, t]);

  useEffect(() => () => { activeRequest.current?.abort(); activeRequest.current = null; }, []);

  async function switchSignIn() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut(auth);
      clearLastStudentSpaceId();
      window.location.replace(roomEntryHref(locale, code, accountJoin, openContent));
    } catch {
      setError(t("errors.switchSignInFailed"));
      setBusy(false);
    }
  }

  async function cancelPreview() {
    activeRequest.current?.abort(); activeRequest.current = null; setBusy(false);
    if (preview?.approvalRequired && preview.approvalCode) await request({ cancel: true });
    else setPreview(null);
  }

  useEffect(() => {
    if (automaticCheckStarted.current || !initialCode.trim() || !initialStudentCode.trim()) return;
    automaticCheckStarted.current = true;
    void request();
  }, [initialCode, initialStudentCode, request]);

  const waiting = Boolean(preview?.approvalRequired && preview.approvalCode && !preview.expired);
  useEffect(() => {
    if (!waiting) return;
    // Read-only checks do not renew or create requests. Stop polling on unmount.
    const timer = window.setInterval(() => { if (!document.hidden) void request(); }, 5000);
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
  const useAccount = accountUser && !accountUser.isAnonymous;
  const alternateParams = new URLSearchParams({ method: accountJoin ? "code" : "account" });
  if (code.trim()) alternateParams.set("code", code.trim());
  if (openContent) alternateParams.set("next", "content");
  if (signedOut) alternateParams.set("signedOut", "1");
  const alternateEntry = !busy && !preview && (recovery === "code" || !initialStudentCode) ? (
    <Link href={`/${locale}/join?${alternateParams}`}
      className="inline-flex min-h-10 items-center text-sm font-semibold text-emerald-800 underline">
      {t(accountJoin ? "account.useCode" : "account.title")}
    </Link>
  ) : null;
  return <div className="mx-auto max-w-md p-4">
    <h1 className="text-2xl font-semibold">{!accountJoin && openContent ? tLanding("ctaStudentCode") : t("title")}</h1>
    <p className="mt-2 text-sm text-slate-600">{t(accountJoin ? "account.help" : "subtitle")}</p>
    {signedOut ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-800">{t("session.signedOut")}</p> : null}
    <form autoComplete="off" onSubmit={e => { e.preventDefault(); if (!preview) void request({ submit: true }); }} className="mt-4 grid gap-4 rounded-2xl border bg-white p-4 shadow-sm">
      {codeInput("space-code", "spaceCode", code, setCode)}
      {accountJoin ? (
        <>
          {useAccount ? (
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              {accountUser.email ? <p className="m-0 break-all text-sm text-slate-600">{t("account.signedIn", { email: accountUser.email })}</p> : null}
              <button type="button" disabled={busy} onClick={() => void switchSignIn()}
                className="min-h-11 text-sm font-semibold text-emerald-800 underline disabled:opacity-50">
                {t(recovery === "provider" ? "actions.switchSignIn" : "account.switchAccount")}
              </button>
            </div>
          ) : null}
          <button type="submit" disabled={busy || accountUser === undefined}
            className="rounded-xl bg-slate-950 px-3 py-3 font-semibold text-white disabled:opacity-50">
            {t(busy ? "actions.joining" : useAccount ? "actions.join" : "account.login")}
          </button>
        </>
      ) : (
        <>
          {codeInput("student-code", "studentCode", studentCode, setStudentCode)}
          <p className="m-0 text-xs text-slate-600">{t("fields.studentCode.tip")}</p>
          {preview?.approvalRequired ? <div aria-live="polite" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="m-0 text-sm font-semibold">{t("approval.title")}</p>
        <p className="m-0 text-sm">{t(preview.requestState ? `approval.${preview.requestState}` : preview.expired ? "approval.expired" : waiting ? "approval.waiting" : "approval.description")}</p>
        {waiting ? <p className="m-0 font-mono text-3xl font-bold tracking-widest" aria-label={t("approval.codeLabel")}>{preview.approvalCode}</p> : null}
        <button type="button" disabled={busy} onClick={() => void request({ confirm: true, renew: Boolean(preview.expired || preview.renewRequired) })} className="rounded-xl bg-slate-950 px-3 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? t("actions.checking") : t(waiting ? "approval.check" : preview.renewRequired || preview.expired ? "approval.renew" : "approval.request")}
        </button>
        <button type="button" disabled={busy} onClick={() => void cancelPreview()} className="ml-2 rounded-xl border bg-white px-3 py-3 text-sm">{t("confirmation.cancel")}</button>
      </div> : preview ? <div aria-live="polite" className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="m-0 text-sm font-semibold">{t("confirmation.identity", { name: preview.displayName ?? "", room: preview.title })}</p>
        {preview.switchRequired ? <p className="m-0 text-sm">{t("confirmation.switch", { name: preview.currentDisplayName ?? "" })}</p> : null}
        {preview.switchRequired && preview.signedInAccount ? <p className="m-0 text-sm">{t("confirmation.signOut")}</p> : null}
        <button type="button" disabled={busy} onClick={() => void request({ confirm: true, switchPupil: Boolean(preview.switchRequired) })} className="w-full rounded-xl bg-emerald-700 px-3 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? t("actions.joining") : t("confirmation.continue", { name: preview.displayName ?? "" })}
        </button>
        <button type="button" disabled={busy} onClick={() => void cancelPreview()} className="w-full rounded-xl border bg-white px-3 py-2 text-sm">{t("confirmation.cancel")}</button>
          </div> : <button type="submit" disabled={busy} className="rounded-xl bg-slate-950 px-3 py-3 font-semibold text-white disabled:opacity-50">{busy ? t("actions.checking") : t("actions.check")}</button>}
        </>
      )}
      {error ? <p role="alert" className="m-0 text-sm text-red-700">{error}</p> : null}
      {recovery === "profile" && useAccount ? (
        <Link href={roomEntryHref(locale, code, accountJoin, openContent, "onboarding")}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-solid border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
          {t("account.completeProfile")}
        </Link>
      ) : null}
      {recovery === "provider" && !useAccount ? (
        <button type="button" disabled={busy} onClick={() => void switchSignIn()}
          className="min-h-11 rounded-xl border border-solid border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
          {t("actions.switchSignIn")}
        </button>
      ) : null}
    </form>
    {alternateEntry}
  </div>;
}
