"use client";

import { useEffect, useId, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { auth } from "@/lib/firebase";
import { clearLastStudentSpaceId } from "@/lib/studentLastSpace";

const accountAction = "inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60";

export default function SignedAccountMenu({ email, accountType, homeUrl, signInUrl }: {
  email: string | null;
  accountType: "schoolAccount" | "studentAccount" | "personalAccount";
  homeUrl: string;
  signInUrl: string;
}) {
  const t = useTranslations("topNav");
  const accountLabel = t(accountType);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  async function endSession(destination: string) {
    setBusy(true);
    setFailed(false);
    try {
      await signOut(auth);
      clearLastStudentSpaceId();
      window.location.replace(destination);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div ref={root} className="sm:relative" onKeyDown={(event) => {
      if (!open || event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }}>
      <button
        ref={trigger}
        type="button"
        aria-label={t("accountMenu")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-solid border-emerald-200 bg-white px-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:px-3"
      >
        <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">{accountLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>
      <div id={panelId} hidden={!open} className="absolute right-3 top-full z-50 mt-2 w-64 max-w-[calc(100vw_-_2rem)] rounded-xl border border-solid border-slate-200 bg-white p-3 shadow-xl sm:right-0">
        <p className="m-0 font-semibold text-slate-950">{accountLabel}</p>
        {email ? <p className="mt-1 break-all text-sm text-slate-600">{email}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void endSession(signInUrl)} className={accountAction + " bg-emerald-800 text-white"}>
            {t("switchAccount")}
          </button>
          <button type="button" disabled={busy} onClick={() => void endSession(homeUrl)} className={accountAction + " gap-1.5 border border-solid border-slate-300 bg-white text-slate-800"}>
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("logout")}
          </button>
        </div>
        {failed ? <p role="alert" className="mb-0 mt-2 text-sm font-medium text-red-700">{t("signOutError")}</p> : null}
      </div>
    </div>
  );
}
