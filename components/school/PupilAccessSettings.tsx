"use client";

import { useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { useTranslations } from "next-intl";
import {
  parsePupilAccountProviders,
  pupilAccountProviders,
  type PupilAccountProvider,
} from "@/lib/security/schoolPupilProviders";

const options = [
  { value: "account-only", allowCode: false, label: "accountOnly" },
  { value: "account-and-code", allowCode: true, label: "accountAndCode" },
] as const;

function sameProviders(left: PupilAccountProvider[], right: PupilAccountProvider[]) {
  return left.length === right.length && left.every((provider, index) => provider === right[index]);
}

export default function PupilAccessSettings({ schoolId, user, initialAllowCode, initialProviders }: {
  schoolId: string;
  user: User;
  initialAllowCode: boolean;
  initialProviders?: PupilAccountProvider[];
}) {
  const t = useTranslations("schoolAdmin.pupilAccess");
  const [allowCode, setAllowCode] = useState(initialAllowCode);
  const [saved, setSaved] = useState(() => ({
    allowCode: initialAllowCode,
    providers: initialProviders === undefined ? [...pupilAccountProviders] : (parsePupilAccountProviders(initialProviders) ?? []),
  }));
  const [providers, setProviders] = useState(saved.providers);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"saved" | "unavailable" | "unauthorized" | "forbidden" | null>(null);
  const providersChanged = !sameProviders(providers, saved.providers);
  const canSave = !busy && providers.length > 0 && (allowCode !== saved.allowCode || providersChanged);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/schools/${encodeURIComponent(schoolId)}/pupil-access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({
          allowPupilCodeAccess: allowCode,
          ...(providersChanged ? { pupilAccountProviders: providers } : {}),
        }),
      });
      if (response.status === 401 || response.status === 403) {
        setNotice(response.status === 401 ? "unauthorized" : "forbidden");
        return;
      }
      if (!response.ok) throw new Error("School setting could not be saved");
      const data: { ok?: boolean; allowPupilCodeAccess?: boolean; pupilAccountProviders?: unknown } = await response.json();
      const savedProviders = providersChanged ? parsePupilAccountProviders(data.pupilAccountProviders) : saved.providers;
      if (data.ok !== true || data.allowPupilCodeAccess !== allowCode
        || !savedProviders || !sameProviders(savedProviders, providers)) {
        throw new Error("Unexpected school setting");
      }
      setSaved({ allowCode, providers: savedProviders });
      setNotice("saved");
    } catch {
      setNotice("unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <fieldset disabled={busy} aria-describedby="pupil-access-help" className="m-0 min-w-0 space-y-3 border-0 p-0">
        <legend className="mb-1 text-lg font-semibold text-slate-950">{t("title")}</legend>
        <p id="pupil-access-help" className="m-0 text-sm leading-relaxed text-slate-600">{t("description")}</p>
        <div className="grid max-w-xl gap-2">
          {options.map(option => (
            <label key={option.value} className="flex min-h-11 items-center gap-3 rounded-lg border border-solid border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-950">
              <input
                type="radio"
                name="pupil-access"
                value={option.value}
                checked={allowCode === option.allowCode}
                onChange={() => {
                  setAllowCode(option.allowCode);
                  setNotice(null);
                }}
                className="h-4 w-4 shrink-0 accent-emerald-800"
              />
              {t(option.label)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={busy} aria-describedby="pupil-account-provider-help" className="m-0 mt-5 min-w-0 space-y-3 border-0 p-0">
        <legend className="mb-1 text-base font-semibold text-slate-950">{t("providersTitle")}</legend>
        <p id="pupil-account-provider-help" className="m-0 text-sm leading-relaxed text-slate-600">{t("providersHelp")}</p>
        <div className="grid max-w-xl gap-2 sm:grid-cols-3">
          {pupilAccountProviders.map(provider => (
            <label key={provider} className="flex min-h-11 items-center gap-2 rounded-lg border border-solid border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-950">
              <input
                type="checkbox"
                name="pupil-account-provider"
                value={provider}
                checked={providers.includes(provider)}
                onChange={event => {
                  const checked = event.target.checked;
                  setProviders(previous => pupilAccountProviders.filter(option =>
                    option === provider ? checked : previous.includes(option),
                  ));
                  setNotice(null);
                }}
                className="h-4 w-4 shrink-0 accent-emerald-800"
              />
              {t(`providers.${provider}`)}
            </label>
          ))}
        </div>
        {providers.length === 0 ? <p role="status" className="m-0 text-sm text-red-800">{t("providerRequired")}</p> : null}
      </fieldset>
      <button type="submit" disabled={!canSave}
        className="mt-3 min-h-11 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-55">
        {t(busy ? "saving" : "save")}
      </button>
      {notice === "saved" ? <p role="status" className="mb-0 mt-2 text-sm text-emerald-800">{t(notice)}</p> : null}
      {notice && notice !== "saved" ? <p role="alert" className="mb-0 mt-2 text-sm text-red-800">{t(notice)}</p> : null}
    </form>
  );
}
