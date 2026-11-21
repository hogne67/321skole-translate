"use client";

import { useEffect, useId, useState } from "react";
import { ArrowLeftRight, LogOut, UserRound } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useLocale, useTranslations } from "next-intl";
import { auth, db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { clearLastStudentSpaceId } from "@/lib/studentLastSpace";

const actionClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryAction = `${actionClass} border border-solid border-emerald-200 bg-white text-emerald-950 hover:bg-emerald-100`;
const primaryAction = `${actionClass} border-0 bg-emerald-800 text-white hover:bg-emerald-900`;

export default function SpacePupilIdentity({ spaceId }: { spaceId: string }) {
  const { user } = useUserProfile();
  const locale = useLocale();
  const t = useTranslations("join");
  const confirmationId = useId();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [action, setAction] = useState<"switch" | "logout" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    setName("");
    if (!user?.uid) return;
    const member = onSnapshot(doc(db, "spaceMembers", `${spaceId}_${user.uid}`), snapshot => {
      const d = snapshot.data();
      setName(d?.role === "student" && d.active !== false && d.archived !== true ? String(d.displayName ?? "") : "");
    }, () => setName(""));
    const room = onSnapshot(doc(db, "spaces", spaceId), snapshot => {
      setCode(String(snapshot.data()?.joinCode ?? snapshot.data()?.code ?? ""));
    }, () => setCode(""));
    return () => { member(); room(); };
  }, [spaceId, user?.uid]);
  if (!name) return null;
  async function endSession() {
    setBusy(true); setError(false);
    try {
      await signOut(auth);
      clearLastStudentSpaceId();
      // Reload to discard the previous pupil's in-memory page and data state.
      window.location.replace(action === "logout"
        ? `/${locale}/join?signedOut=1`
        : `/${locale}/join?code=${encodeURIComponent(code)}`);
    } catch { setError(true); setBusy(false); }
  }
  return (
    <div className="min-w-0 rounded-xl border border-solid border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <UserRound aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-800" />
          <p className="m-0 min-w-0 break-words text-base font-semibold leading-snug">{t("session.identity", { name })}</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !code}
            onClick={() => setAction(action === "switch" ? null : "switch")}
            aria-expanded={action === "switch"}
            aria-controls={confirmationId}
            className={secondaryAction}
          >
            <ArrowLeftRight aria-hidden="true" className="h-4 w-4 shrink-0" />
            {t("session.change")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setAction(action === "logout" ? null : "logout")}
            aria-expanded={action === "logout"}
            aria-controls={confirmationId}
            className={secondaryAction}
          >
            <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
            {t("session.logout")}
          </button>
        </div>
      </div>
      <div id={confirmationId} hidden={!action}>
        {action ? (
          <div className="mt-3 space-y-2 rounded-lg bg-white p-3">
            <p className="m-0">{t(action === "logout" ? "session.logoutConfirm" : "session.confirm")}</p>
            {action === "switch" && user && !user.isAnonymous ? <p className="m-0">{t("confirmation.signOut")}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void endSession()} className={primaryAction}>
                {t(busy ? "session.loggingOut" : action === "logout" ? "session.logout" : "session.continue")}
              </button>
              <button type="button" disabled={busy} onClick={() => setAction(null)} className={secondaryAction}>
                {t("confirmation.cancel")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {error ? <p role="alert" className="mb-0 mt-2 font-medium text-red-700">{t("session.endFailed")}</p> : null}
    </div>
  );
}
