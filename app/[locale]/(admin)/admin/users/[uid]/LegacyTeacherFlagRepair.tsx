"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { auth } from "@/lib/firebase";

type RepairPreview = {
  state: "ready" | "review_required" | "not_applicable" | "already_disabled";
  blockers?: string[];
};

type RepairReply = Partial<RepairPreview> & { ok?: boolean; changed?: boolean };

const reasonLimit = 300;
const blockerDescriptions: Record<string, string> = {
  platform_privilege: "The account has protected platform permissions.",
  school_staff: "The account has an active school staff role.",
  owns_rooms: "The account owns one or more rooms.",
  room_staff: "The account has an active teaching role in a room.",
  owns_courses: "The account owns one or more courses.",
};

const primaryButton = "rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50";

export default function LegacyTeacherFlagRepair({
  uid,
  account,
  onComplete,
}: {
  uid: string;
  account: string;
  onComplete: (changed: boolean) => void;
}) {
  const reasonId = useId();
  const request = useRef<AbortController | null>(null);
  const [preview, setPreview] = useState<RepairPreview | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<"check" | "repair" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function checkOrRepair(correctionReason?: string) {
    if (request.current) return;

    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
      setError("Sign in as a superadmin to continue.");
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    const isRepair = correctionReason !== undefined;
    setPending(isRepair ? "repair" : "check");
    setError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/legacy-teacher-flag`, {
        method: isRepair ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(isRepair ? { "Content-Type": "application/json" } : {}),
        },
        body: isRepair ? JSON.stringify({ reason: correctionReason }) : undefined,
        cache: "no-store",
        signal: controller.signal,
      });
      const reply: RepairReply = await response.json();
      if (controller.signal.aborted) return;

      if (isRepair && response.ok && reply.ok === true && typeof reply.changed === "boolean") {
        onComplete(reply.changed);
        return;
      }
      if ((response.ok || response.status === 409) && reply.state) {
        setPreview({ state: reply.state, blockers: reply.blockers });
        return;
      }
      if (response.status === 401 || response.status === 403) {
        setError("An active superadmin sign-in is required. Sign in again if your session expired.");
        return;
      }
      if (response.status === 404) {
        setError("The account could not be found. Refresh the profile and check it again.");
        return;
      }
      throw new Error("Unexpected repair response");
    } catch {
      if (!controller.signal.aborted) {
        setError(isRepair
          ? "Could not confirm the correction. Check the account again before retrying."
          : "Could not check the account. Try again.");
        if (isRepair) setPreview(null);
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const correctionReason = reason.trim();
    if (preview?.state !== "ready" || !correctionReason || correctionReason.length > reasonLimit) return;
    void checkOrRepair(correctionReason);
  }

  function cancel() {
    setPreview(null);
    setReason("");
    setError(null);
  }

  return (
    <div className="grid gap-3 text-sm" aria-busy={pending !== null}>
      <p className="m-0 text-slate-700">This pupil account has an old teacher flag that can block room invitations.</p>
      {error ? <p className="m-0 text-red-700" role="alert">{error}</p> : null}

      {preview?.state === "ready" ? (
        <form className="grid gap-3" onSubmit={submit}>
          <p className="m-0">
            Set <code>roles.teacher</code> from <b>true</b> to <b>false</b> for <strong>{account}</strong>.
            This removes permissions based on that flag. The correction is recorded in the admin log.
          </p>
          <div className="grid gap-1">
            <label htmlFor={reasonId} className="font-semibold">Reason for correction</label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              maxLength={reasonLimit}
              disabled={pending !== null}
              rows={2}
              className="w-full max-w-xl rounded-lg border border-slate-300 p-2"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={primaryButton} type="submit" disabled={pending !== null || !reason.trim()}>
              {pending === "repair" ? "Updating..." : "Turn off legacy teacher flag"}
            </button>
            <button className={secondaryButton} type="button" onClick={cancel} disabled={pending !== null}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          {preview ? (
            <div className="rounded-lg bg-slate-50 p-3 text-slate-800" role="status">
              {preview.state === "review_required" ? (
                <>
                  <p className="m-0 font-semibold">This account needs manual review.</p>
                  {preview.blockers?.length ? (
                    <ul className="mb-0 list-disc pl-5">
                      {preview.blockers.map((blocker) => (
                        <li key={blocker}>{blockerDescriptions[blocker] ?? "The account has a role or permission that needs review."}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p className="m-0">
                  {preview.state === "already_disabled"
                    ? "The old teacher flag is already off."
                    : "The account is no longer eligible for this correction."}
                </p>
              )}
            </div>
          ) : null}
          <button className={secondaryButton + " justify-self-start"} type="button" onClick={() => void checkOrRepair()} disabled={pending !== null}>
            {pending === "check" ? "Checking..." : preview ? "Check again" : "Check account"}
          </button>
        </>
      )}
    </div>
  );
}
