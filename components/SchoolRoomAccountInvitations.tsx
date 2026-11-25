"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

type Invitation = { id: string; email: string; sourceMemberId?: string };
const invitationErrors = {
  invalid_email: "invalidEmail",
  invitation_already_used: "alreadyUsed",
  invitation_not_pending: "notPending",
  account_transfer_unavailable: "transferUnavailable",
  account_transfer_pending: "transferPending",
  account_transfer_conflict: "transferConflict",
} as const;
type InvitationError = typeof invitationErrors[keyof typeof invitationErrors] | "copyFailed" | "failed";

export default function SchoolRoomAccountInvitations({ spaceId, user, sourceMemberId, roomCode }: {
  spaceId: string;
  user: User;
  sourceMemberId?: string;
  roomCode?: string;
}) {
  const t = useTranslations("teacherMembers.accountInvite");
  const locale = useLocale();
  const localEmailId = useId();
  const emailId = sourceMemberId ? localEmailId : "account-invitation-email";
  const endpoint = `/api/teacher/spaces/${encodeURIComponent(spaceId)}/members/invite-account`;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState<"saved" | "withdrawn" | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [error, setError] = useState<InvitationError | null>(null);
  const matchingInvitations = sourceMemberId
    ? invitations?.filter(invitation => invitation.sourceMemberId === sourceMemberId)
    : invitations;
  const showForm = !sourceMemberId || (matchingInvitations?.length === 0 && !loadFailed && status !== "saved");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function load() {
      const token = await user.getIdToken();
      if (controller.signal.aborted) return;
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
      });
      if (!response.ok) throw new Error("Could not load invitations");
      const data: { invitations: Invitation[] } = await response.json();
      if (!controller.signal.aborted) {
        setInvitations(data.invitations);
        setLoadFailed(false);
      }
    }
    void load().catch(() => {
      if (!controller.signal.aborted) setLoadFailed(true);
    });
    return () => controller.abort();
  }, [endpoint, open, revision, user]);

  async function save(body: { email: string } | { invitationId: string }) {
    if (busy) return;
    const inviting = "email" in body;
    setBusy(true);
    setStatus(null);
    setLinkCopied(false);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: inviting ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify(inviting && sourceMemberId ? { ...body, sourceMemberId } : body),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        const reason = Object.hasOwn(invitationErrors, result.error)
          ? invitationErrors[result.error as keyof typeof invitationErrors]
          : undefined;
        setError(reason ?? "failed");
        if (reason === "notPending" || reason === "transferPending") setRevision(current => current + 1);
        return;
      }
      if (inviting) {
        setEmail("");
      } else {
        setInvitations(current => current?.filter(invitation => invitation.id !== body.invitationId) ?? null);
      }
      setStatus(inviting ? "saved" : "withdrawn");
      setRevision(current => current + 1);
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) void save({ email: email.trim() });
  }

  async function copyRoomLink() {
    if (!roomCode) return;
    const url = new URL(`/${locale}/join`, window.location.origin);
    url.searchParams.set("method", "account");
    url.searchParams.set("code", roomCode);
    try {
      await navigator.clipboard.writeText(url.href);
      setError(null);
      setLinkCopied(true);
    } catch {
      setError("copyFailed");
    }
  }

  return (
    <details onToggle={event => setOpen(event.currentTarget.open)} data-account-invitation-kind={sourceMemberId ? "transfer" : "general"}
      className="group mt-3 rounded-xl border border-solid border-slate-200 bg-slate-50">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        {t(sourceMemberId ? "transferTitle" : "title")}
        <ChevronDown aria-hidden="true" className="h-4 w-4 group-open:rotate-180" />
      </summary>
      <div className="space-y-3 px-3 pb-3">
        <p className="m-0 text-sm text-slate-600">{t(sourceMemberId ? "transferHelp" : "help")}</p>
        {showForm ? <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 basis-44 text-sm font-medium" htmlFor={emailId}>
            {t("email")}
            <input id={emailId} name="student-account-email" type="email" required maxLength={254} value={email} autoComplete="off"
              onChange={event => setEmail(event.target.value)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-solid border-slate-300 bg-white px-3 py-2" />
          </label>
          <button type="submit" disabled={busy || !email.trim()}
            className="min-h-11 rounded-lg bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {t(sourceMemberId ? "transferSave" : "save")}
          </button>
        </form> : null}
        {matchingInvitations === undefined && sourceMemberId && !loadFailed ? (
          <p role="status" className="m-0 text-sm text-slate-600">{t("loading")}</p>
        ) : null}
        {linkCopied || status ? (
          <p role="status" className="m-0 text-sm text-emerald-900">
            {t(linkCopied ? "linkCopied" : status === "saved" ? (sourceMemberId ? "transferSaved" : "saved") : "withdrawn")}
          </p>
        ) : null}
        {sourceMemberId && roomCode && (status === "saved" || matchingInvitations?.length) ? (
          <div className="flex flex-wrap items-center gap-x-3 text-sm">
            <span>{t("roomCode", { code: roomCode })}</span>
            <button type="button" onClick={() => void copyRoomLink()} className="min-h-10 font-semibold text-slate-700 underline">
              {t("copyRoomLink")}
            </button>
          </div>
        ) : null}
        {error ? <p role="alert" className="m-0 text-sm text-red-700">{t(error)}</p> : null}
        {loadFailed ? (
          <p role="alert" className="m-0 text-sm text-red-700">
            {t("loadFailed")} <button type="button" onClick={() => setRevision(current => current + 1)} className="underline">{t("retry")}</button>
          </p>
        ) : matchingInvitations?.length ? (
          <div>
            <p className="m-0 text-sm font-semibold">{t("pending")}</p>
            <ul className="m-0 list-none space-y-1 p-0">
              {matchingInvitations.map(invitation => (
                <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-x-3 text-sm">
                  <span className="min-w-0 break-all">
                    {invitation.email}
                    {!sourceMemberId && invitation.sourceMemberId ? <span className="ml-2 text-slate-600">{t("transferLabel")}</span> : null}
                  </span>
                  <button type="button" disabled={busy}
                    aria-label={t("withdrawNamed", { email: invitation.email })}
                    onClick={() => void save({ invitationId: invitation.id })}
                    className="min-h-10 font-semibold text-slate-700 underline disabled:opacity-60">
                    {t("withdraw")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
