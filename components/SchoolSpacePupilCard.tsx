"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { auth } from "@/lib/firebase";

type PupilNames = { fullName: string; displayName: string };
type SchoolPupilResult = { error?: string; pupil?: PupilNames; member?: { studentCode?: string }; studentCode?: string };

const inputClass = "mt-1 min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950";
const buttonClass = "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60";

export function SchoolPupilNameFields({
  names, onChange, disabled,
}: {
  names: PupilNames;
  onChange: (names: PupilNames) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("teacherMembers.schoolPupil");
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-sm font-medium">
        {t("fullName")}
        <input required maxLength={160} autoComplete="off" className={inputClass} value={names.fullName}
          disabled={disabled} onChange={event => onChange({ ...names, fullName: event.target.value })} />
      </label>
      <label className="text-sm font-medium">
        {t("displayName")}
        <input maxLength={80} autoComplete="off" className={inputClass} value={names.displayName} placeholder={t("displayNamePlaceholder")}
          disabled={disabled} onChange={event => onChange({ ...names, displayName: event.target.value })} />
      </label>
    </div>
  );
}

async function requestPupil(endpoint: string, init?: RequestInit): Promise<SchoolPupilResult> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("pupil_forbidden");
  const response = await fetch(endpoint, {
    ...init, cache: "no-store",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
  });
  const data = await response.json() as SchoolPupilResult;
  if (!response.ok) throw new Error(data.error ?? "failed");
  return data;
}

export default function SchoolSpacePupilCard({
  spaceId, memberId, registered, onCodeIssued,
}: {
  spaceId: string;
  memberId: string;
  registered: boolean;
  onCodeIssued: (code: string) => void;
}) {
  const t = useTranslations("teacherMembers.schoolPupil");
  const endpoint = "/api/teacher/spaces/" + encodeURIComponent(spaceId) + "/members/create-student";
  const [names, setNames] = useState<PupilNames | null>(registered ? null : { fullName: "", displayName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!registered) return;
    const controller = new AbortController();
    void requestPupil(endpoint + "?memberId=" + encodeURIComponent(memberId), { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted) {
          if (data.pupil) setNames(data.pupil);
          else setError("failed");
        }
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "failed"); });
    return () => controller.abort();
  }, [endpoint, memberId, registered]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!names?.fullName.trim() || busy) return;
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const data = await requestPupil(endpoint, {
        method: "POST",
        body: JSON.stringify({ targetMemberId: memberId, ...names, ...(registered ? { action: "rename" } : {}) }),
      });
      if (data.pupil) setNames(data.pupil);
      if (data.member?.studentCode) onCodeIssued(data.member.studentCode);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function rotateCode() {
    if (busy || !window.confirm(t("rotateConfirmation"))) return;
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const data = await requestPupil(endpoint, {
        method: "POST", body: JSON.stringify({ action: "rotate_code", targetMemberId: memberId }),
      });
      if (!data.studentCode) throw new Error("failed");
      onCodeIssued(data.studentCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  const form = names ? (
    <>
      <form onSubmit={save} className="space-y-3">
        <SchoolPupilNameFields names={names} onChange={setNames} disabled={busy} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy || !names.fullName.trim()} className={buttonClass}>
            {t(registered ? "save" : "create")}
          </button>
          {registered ? (
            <button type="button" disabled={busy} onClick={() => void rotateCode()} className={buttonClass}>
              {t("rotate")}
            </button>
          ) : null}
        </div>
      </form>
      {saved ? <p role="status" className="mt-2 text-sm text-emerald-800">{t("saved")}</p> : null}
    </>
  ) : error ? null : <p role="status" className="m-0 text-sm">{t("loading")}</p>;

  const alert = error ? (
    <p role="alert" className="mt-2 text-sm text-red-800">{t.has("errors." + error) ? t("errors." + error) : t("errors.failed")}</p>
  ) : null;
  if (!registered) return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-semibold">{t("convert")}</summary>
      <div className="mt-3">{form}{alert}</div>
    </details>
  );
  return <div className="rounded-lg bg-slate-50 p-3">{form}{alert}</div>;
}
