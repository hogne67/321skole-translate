"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { saveLastStudentSpaceId } from "@/lib/studentLastSpace";
import { useLocale, useTranslations } from "next-intl";

type JoinApiSuccess = {
  ok: true;
  spaceId: string;
  title?: string;
  alreadyMember?: boolean;
};

type JoinApiError = {
  error?: string;
  used?: number;
  limit?: number;
  remaining?: number;
};

function errToText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;

  if (e && typeof e === "object") {
    const maybe = e as { message?: unknown };
    if (typeof maybe.message === "string" && maybe.message.trim()) {
      return maybe.message;
    }
    return JSON.stringify(e);
  }

  return String(e);
}

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export default function JoinClient() {
  const t = useTranslations("join");
  const locale = useLocale();
  const sp = useSearchParams();
  const router = useRouter();

  const initialCode = useMemo(() => (sp.get("code") ?? "").trim(), [sp]);

  const [code, setCode] = useState(initialCode);
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function waitForUser(): Promise<User> {
    const current = auth.currentUser;
    if (current) return current;

    return await new Promise<User>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(t("errors.authTimeout")));
      }, 10000);

      const unsub = onAuthStateChanged(
        auth,
        (u) => {
          if (u) {
            clearTimeout(timeout);
            unsub();
            resolve(u);
          }
        },
        (authErr) => {
          clearTimeout(timeout);
          unsub();
          reject(authErr);
        }
      );
    });
  }

  function mapApiError(data: JoinApiError, fallback: string): string {
    if (data.error === "student_limit_reached") {
      const used = typeof data.used === "number" ? data.used : null;
      const limit = typeof data.limit === "number" ? data.limit : null;

      if (used !== null && limit !== null) {
        return t("errors.teacherLimitReachedWithCount", { used, limit });
      }

      return t("errors.teacherLimitReached");
    }

    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }

    return fallback;
  }

  useEffect(() => {
    const c = initialCode.trim().toUpperCase();
    if (!c) return;

    let cancelled = false;

    async function checkExistingMembership() {
      setCheckingExisting(true);

      try {
        await ensureAnonymousUser();

        const u = await waitForUser();
        const token = await u.getIdToken();

        const res = await fetch("/api/spaces/join", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ code: c }),
        });

        const data = (await res.json().catch(() => ({}))) as JoinApiSuccess | JoinApiError;
        if (cancelled || !res.ok) return;

        const okData = data as JoinApiSuccess;
        if (okData.alreadyMember && okData.spaceId) {
          saveLastStudentSpaceId(okData.spaceId);
          router.replace(`/${locale}/student/spaces/${okData.spaceId}`);
        }
      } catch {
        // Hvis autosjekken feiler, lar vi vanlig bli-med-skjema stå.
      } finally {
        if (!cancelled) setCheckingExisting(false);
      }
    }

    void checkExistingMembership();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, locale, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const c = code.trim().toUpperCase();
    const name = cleanName(displayName);

    if (!c) return;

    if (!name) {
      setErr(t("errors.nameRequired"));
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      await ensureAnonymousUser();

      const u = await waitForUser();
      const token = await u.getIdToken();

      const res = await fetch("/api/spaces/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: c,
          displayName: name,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as JoinApiSuccess | JoinApiError;

      if (!res.ok) {
        throw new Error(mapApiError(data as JoinApiError, t("errors.joinFailed")));
      }

      const okData = data as JoinApiSuccess;

      if (!okData.spaceId) {
        throw new Error(t("errors.missingSpaceId"));
      }

      saveLastStudentSpaceId(okData.spaceId);
      router.push(`/${locale}/student/spaces/${okData.spaceId}`);
    } catch (e2: unknown) {
      setErr(errToText(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>

      <form onSubmit={onSubmit} className="mt-4 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm">
        {checkingExisting ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {t("status.checkingExisting")}
          </div>
        ) : null}

        <div>
          <label htmlFor="space-code" className="text-sm font-medium">
            {t("fields.spaceCode.label")}
          </label>
          <input
            id="space-code"
            name="spaceCode"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("fields.spaceCode.placeholder")}
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
            disabled={busy}
            autoCapitalize="characters"
            autoCorrect="off"
          />
        </div>

        <div>
          <label htmlFor="displayName" className="text-sm font-medium">
            {t("fields.name.label")}
          </label>
          <input
            id="displayName"
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("fields.name.placeholder")}
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
            disabled={busy}
          />
          <div className="mt-1 text-xs text-muted-foreground">{t("fields.name.tip")}</div>
        </div>

        <button
          type="submit"
          className="rounded-xl bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={busy}
        >
          {busy ? t("actions.joining") : t("actions.join")}
        </button>

        {err && <div className="whitespace-pre-wrap text-sm text-red-600">{err}</div>}
      </form>
    </div>
  );
}
