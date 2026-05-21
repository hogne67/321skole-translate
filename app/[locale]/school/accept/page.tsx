"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { useUserProfile } from "@/lib/useUserProfile";

type AcceptState = "idle" | "loading" | "success" | "error";

type AcceptInviteResponse = {
  ok?: boolean;
  reason?: string;
  error?: string;
  schoolId?: string;
  memberId?: string;
  inviteId?: string;
};

function getMessageFromResponse(data: AcceptInviteResponse, fallback: string): string {
  if (data.error) return data.error;

  switch (data.reason) {
    case "invite_not_found":
      return "Invitasjonen finnes ikke. Sjekk at lenken er riktig.";
    case "invite_not_pending":
      return "Invitasjonen er allerede brukt eller er ikke lenger aktiv.";
    case "invite_expired":
      return "Invitasjonen er utløpt. Be skoleadministratoren sende en ny.";
    case "email_mismatch":
      return "Du er innlogget med en annen e-postadresse enn invitasjonen gjelder for.";
    case "school_not_found":
      return "Skolen finnes ikke lenger.";
    case "school_not_active":
      return "Skolen er ikke aktiv akkurat nå.";
    case "invalid_seat_limit":
      return "Skolen mangler en gyldig lærergrense.";
    case "seat_limit_reached":
      return "Skolen har brukt opp lærerplassene sine.";
    default:
      return fallback;
  }
}

export default function AcceptSchoolInvitePage() {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { user, loading } = useUserProfile();
  const [state, setState] = useState<AcceptState>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AcceptInviteResponse | null>(null);
  const submittedFor = useRef<string | null>(null);

  const token = searchParams.get("token")?.trim() ?? "";
  const isSignedIn = Boolean(user && !user.isAnonymous);
  const currentPath = useMemo(() => {
    const query = token ? `?token=${encodeURIComponent(token)}` : "";

    return `/${locale}/school/accept${query}`;
  }, [locale, token]);
  const loginHref = `/${locale}/login?next=${encodeURIComponent(currentPath)}`;

  useEffect(() => {
    if (loading) return;

    if (!token) {
      setState("error");
      setMessage("Invitasjonslenken mangler token.");
      return;
    }

    if (!isSignedIn || !user) {
      setState("idle");
      setMessage("");
      return;
    }

    const signedInUser = user;

    if (submittedFor.current === token) return;
    submittedFor.current = token;

    let cancelled = false;

    async function acceptInvite() {
      setState("loading");
      setMessage("Aksepterer invitasjonen...");

      try {
        const authToken = await signedInUser.getIdToken();
        const response = await fetch("/api/schools/accept-invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ token }),
        });
        const data = (await response.json().catch(() => ({}))) as AcceptInviteResponse;

        if (cancelled) return;

        if (!response.ok || !data.ok) {
          setState("error");
          setResult(data);
          setMessage(getMessageFromResponse(data, "Kunne ikke akseptere invitasjonen."));
          return;
        }

        setState("success");
        setResult(data);
        setMessage("Invitasjonen er akseptert. Du er nå koblet til skolen.");
      } catch (error: unknown) {
        if (cancelled) return;

        setState("error");
        setMessage(error instanceof Error ? error.message : "Kunne ikke akseptere invitasjonen.");
      }
    }

    void acceptInvite();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, loading, token, user]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center px-4 py-12 text-slate-950">
      <section className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-teal-700">321school</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-normal">Skoleinvitasjon</h1>

        {loading ? (
          <p className="mt-4 text-slate-600">Sjekker innlogging...</p>
        ) : null}

        {!loading && !token ? (
          <StatusBox tone="error" title="Ugyldig lenke" message={message} />
        ) : null}

        {!loading && token && !isSignedIn ? (
          <div className="mt-5 space-y-4">
            <StatusBox
              tone="neutral"
              title="Logg inn først"
              message="Du må være innlogget med e-postadressen invitasjonen ble sendt til før du kan akseptere den."
            />
            <Link
              href={loginHref}
              className="inline-flex rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white"
            >
              Logg inn
            </Link>
          </div>
        ) : null}

        {!loading && token && isSignedIn ? (
          <div className="mt-5 space-y-4">
            {state === "loading" ? (
              <StatusBox tone="neutral" title="Jobber" message={message} />
            ) : null}

            {state === "success" ? (
              <div className="space-y-4">
                <StatusBox tone="success" title="Invitasjon akseptert" message={message} />
                {result?.schoolId ? (
                  <p className="text-sm text-slate-600">Skole-ID: {result.schoolId}</p>
                ) : null}
                <Link
                  href={`/${locale}/`}
                  className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm"
                >
                  Gå videre
                </Link>
              </div>
            ) : null}

            {state === "error" ? (
              <StatusBox tone="error" title="Kunne ikke akseptere invitasjonen" message={message} />
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function StatusBox({
  tone,
  title,
  message,
}: {
  tone: "neutral" | "success" | "error";
  title: string;
  message: string;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "error"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-slate-200 bg-slate-50 text-slate-800";

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="font-extrabold">{title}</div>
      <p className="mt-1 text-sm leading-6">{message}</p>
    </div>
  );
}
