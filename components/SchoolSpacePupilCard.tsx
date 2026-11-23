"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { auth } from "@/lib/firebase";
import { printSchoolPupilCard } from "@/lib/printSchoolPupilCard";

type PupilNames = { fullName: string; displayName: string };
type SchoolPupilResult = {
  error?: string;
  pupil?: PupilNames;
  member?: { studentCode?: string };
  studentCode?: string | null;
  displayName?: string;
};

const inputClass = "mt-1 min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950";
const buttonClass = "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-60";

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
  const requester = auth.currentUser;
  const token = await requester?.getIdToken();
  if (!token || auth.currentUser !== requester) throw new Error("pupil_forbidden");
  const response = await fetch(endpoint, {
    ...init, cache: "no-store",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
  });
  const data = await response.json() as SchoolPupilResult;
  if (auth.currentUser !== requester) throw new Error("pupil_forbidden");
  if (!response.ok) throw new Error(data.error ?? "failed");
  return data;
}

export default function SchoolSpacePupilCard({
  spaceId, roomTitle, roomCode, memberId, registered, viewerUid, onCodeIssued, onCodeShown, recoveryOnly = false,
}: {
  spaceId: string;
  roomTitle: string;
  roomCode: string;
  memberId: string;
  registered: boolean;
  viewerUid: string;
  onCodeIssued: (code: string) => void;
  onCodeShown: () => void;
  recoveryOnly?: boolean;
}) {
  const t = useTranslations("teacherMembers.schoolPupil");
  const codeCopy = useTranslations("teacherMembers.studentCode");
  const locale = useLocale();
  const endpoint = "/api/teacher/spaces/" + encodeURIComponent(spaceId) + "/members/create-student";
  const [names, setNames] = useState<PupilNames | null>(registered ? null : { fullName: "", displayName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [shownCode, setShownCode] = useState<{ value: string; displayName: string } | null>(null);
  const [codeFeedback, setCodeFeedback] = useState<"legacyCode" | "copied" | null>(null);
  const codeId = useId();
  const pendingCodeRequest = useRef<AbortController | null>(null);
  const printFrame = useRef<HTMLIFrameElement | null>(null);
  const visibleCode = auth.currentUser?.uid === viewerUid ? shownCode : null;

  useEffect(() => () => {
    pendingCodeRequest.current?.abort();
    printFrame.current?.remove();
  }, []);

  useEffect(() => {
    if (!registered || recoveryOnly) return;
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
  }, [endpoint, memberId, registered, recoveryOnly]);

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

  function hideCode() {
    setShownCode(null);
    setCodeFeedback(null);
    printFrame.current?.remove();
    printFrame.current = null;
  }

  async function requestCode(action: "reveal_code" | "rotate_code") {
    if (busy || pendingCodeRequest.current || auth.currentUser?.uid !== viewerUid) return;
    if (recoveryOnly && action === "reveal_code") return;
    if (action === "rotate_code" && !window.confirm(t("rotateConfirmation"))) return;
    const controller = new AbortController();
    pendingCodeRequest.current = controller;
    hideCode();
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const data = await requestPupil(endpoint, {
        method: "POST",
        body: JSON.stringify({ action, targetMemberId: memberId }),
        signal: controller.signal,
      });
      if (controller.signal.aborted || auth.currentUser?.uid !== viewerUid) return;
      if (!data.studentCode) {
        if (action === "rotate_code") throw new Error("failed");
        setCodeFeedback("legacyCode");
        return;
      }
      setShownCode({ value: data.studentCode, displayName: data.displayName ?? "" });
      onCodeShown();
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "failed");
    } finally {
      pendingCodeRequest.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function copyCode() {
    if (!visibleCode || auth.currentUser?.uid !== viewerUid) return;
    setError("");
    try {
      await navigator.clipboard.writeText(visibleCode.value);
      setCodeFeedback("copied");
    } catch {
      setError("pupil_code_copy_failed");
    }
  }

  function printCode() {
    if (!visibleCode || !roomCode || auth.currentUser?.uid !== viewerUid) return;
    setError("");
    printFrame.current?.remove();
    try {
      printFrame.current = printSchoolPupilCard(locale, t("print.title"), visibleCode.displayName, [
        { label: t("print.room"), value: roomTitle },
        { label: t("print.roomCode"), value: roomCode, code: true },
        { label: t("issued"), value: visibleCode.value, code: true },
        { label: t("print.address"), value: new URL(`/${locale}/join?next=content`, window.location.origin).href },
      ]);
    } catch {
      setError("pupil_code_print_failed");
    }
  }

  const form = names ? (
    <>
      <form onSubmit={save} className="space-y-3">
        <SchoolPupilNameFields names={names} onChange={setNames} disabled={busy} />
        <button type="submit" disabled={busy || !names.fullName.trim()} className={buttonClass}>
          {t(registered ? "save" : "create")}
        </button>
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
  return (
    <div className="rounded-xl border border-solid border-slate-200 bg-white">
      {!recoveryOnly ? <div className="rounded-t-xl bg-slate-50 p-3 sm:p-4">{form}</div> : null}
      {names || recoveryOnly ? (
        <section className={`p-3 sm:p-4 ${recoveryOnly ? "" : "border-0 border-t border-solid border-slate-200"}`} aria-labelledby={`${codeId}-label`}>
          <h4 id={`${codeId}-label`} className="m-0 text-base font-semibold text-slate-950">{t("issued")}</h4>
          {visibleCode ? (
            <div id={codeId} className="mt-2" role="status">
              <p className="m-0 inline-block max-w-full break-all rounded-lg bg-emerald-50 px-3 py-1 font-mono text-lg font-semibold tracking-wide text-emerald-950">
                {visibleCode.value}
              </p>
            </div>
          ) : null}
          {!recoveryOnly || visibleCode ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={buttonClass} aria-expanded={Boolean(visibleCode)}
                aria-controls={visibleCode ? codeId : undefined} onClick={visibleCode ? hideCode : () => void requestCode("reveal_code")}>
                {t(visibleCode ? "hideCode" : "showCode")}
              </button>
              {visibleCode ? (
                <>
                  <button type="button" disabled={busy} className={buttonClass} onClick={() => void copyCode()}>
                    {codeCopy("actions.copy")}
                  </button>
                  <button type="button" disabled={busy || !roomCode} className={buttonClass} onClick={printCode}>
                    {t("print.action")}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          {codeFeedback ? <p role="status" className="mb-0 mt-2 text-sm text-slate-700">{t(codeFeedback)}</p> : null}
          <div className={recoveryOnly && !visibleCode ? "mt-2" : "mt-3 border-0 border-t border-solid border-slate-200 pt-3"}>
            <button type="button" disabled={busy} onClick={() => void requestCode("rotate_code")} className={buttonClass}>
              {t("rotate")}
            </button>
          </div>
        </section>
      ) : null}
      {alert ? <div className="px-3 pb-3 sm:px-4">{alert}</div> : null}
    </div>
  );
}
