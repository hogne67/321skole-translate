"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useLocale, useTranslations } from "next-intl";
import { auth, db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { clearLastStudentSpaceId } from "@/lib/studentLastSpace";

export default function SpacePupilIdentity({ spaceId }: { spaceId: string }) {
  const { user } = useUserProfile();
  const locale = useLocale();
  const t = useTranslations("join");
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
  return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-800">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="min-w-0 break-words text-base font-semibold leading-snug sm:text-lg">{t("session.identity", { name })}</span>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !code} onClick={() => setAction(action === "switch" ? null : "switch")} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 font-semibold">{t("session.change")}</button>
        <button type="button" disabled={busy} onClick={() => setAction(action === "logout" ? null : "logout")} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 font-semibold">{t("session.logout")}</button>
      </div>
    </div>
    {action ? <div className="mt-3 space-y-2">
      <p>{t(action === "logout" ? "session.logoutConfirm" : "session.confirm")}</p>
      {action === "switch" && user && !user.isAnonymous ? <p>{t("confirmation.signOut")}</p> : null}
      <button type="button" disabled={busy} onClick={() => void endSession()} className="rounded-lg bg-emerald-700 px-3 py-2 text-white">{t(busy ? "session.loggingOut" : action === "logout" ? "session.logout" : "session.continue")}</button>
      <button type="button" disabled={busy} onClick={() => setAction(null)} className="ml-2 rounded-lg border bg-white px-3 py-2">{t("confirmation.cancel")}</button>
    </div> : null}
    {error ? <p role="alert">{t("errors.joinFailed")}</p> : null}
  </div>;
}
