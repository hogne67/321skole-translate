"use client";

import { useEffect, useId, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
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

export default function SpacePupilIdentity({ spaceId, returnToContent = false }: {
  spaceId: string | null;
  returnToContent?: boolean;
}) {
  const { user } = useUserProfile();
  const memberId = spaceId && user?.uid ? `${spaceId}_${user.uid}` : null;
  const [identity, setIdentity] = useState<{ memberId: string; name: string } | null>(null);
  useEffect(() => {
    if (!memberId) return;
    return onSnapshot(doc(db, "spaceMembers", memberId), snapshot => {
      const d = snapshot.data();
      const name = d?.role === "student" && d.active !== false && d.archived !== true ? String(d.displayName ?? "") : "";
      setIdentity({ memberId, name });
    }, () => setIdentity(null));
  }, [memberId]);
  const name = identity?.memberId === memberId ? identity.name : "";
  if (!user || (spaceId && !name)) return null;
  return <SpacePupilSession key={memberId ?? user.uid} name={name} returnToContent={returnToContent} />;
}

export function SpacePupilSession({ name, returnToContent }: { name: string; returnToContent: boolean }) {
  const locale = useLocale();
  const t = useTranslations("join");
  const confirmationId = useId();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function endSession() {
    setBusy(true); setError(false);
    try {
      await signOut(auth);
      clearLastStudentSpaceId();
      // Reload to discard the previous pupil's in-memory page and data state.
      const next = returnToContent ? "&next=content" : "";
      window.location.replace(`/${locale}/join?signedOut=1${next}`);
    } catch { setError(true); setBusy(false); }
  }
  return (
    <div className="min-w-0 rounded-xl border border-solid border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 sm:p-4">
      <div className={`flex flex-wrap items-center gap-3 ${name ? "justify-between" : "justify-end"}`}>
        {name ? (
          <div className="flex min-w-0 items-center gap-2">
            <UserRound aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-800" />
            <p className="m-0 min-w-0 break-words text-base font-semibold leading-snug">{t("session.identity", { name })}</p>
          </div>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming((previous) => !previous)}
          aria-expanded={confirming}
          aria-controls={confirmationId}
          className={secondaryAction}
        >
          <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
          {t("session.logout")}
        </button>
      </div>
      <div id={confirmationId} hidden={!confirming}>
        {confirming ? (
          <div className="mt-3 space-y-2 rounded-lg bg-white p-3">
            <p className="m-0">{t("session.logoutConfirm")}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void endSession()} className={primaryAction}>
                {t(busy ? "session.loggingOut" : "session.logout")}
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={secondaryAction}>
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
