// app/[locale]/(public)/join/JoinClient.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { collection, getDocs, limit, query, where, type Firestore } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { ensureSpaceMember } from "@/lib/spaceMembership";
import { useLocale, useTranslations } from "next-intl";

async function findSpaceByCode(dbx: Firestore, codeRaw: string) {
  const code = (codeRaw || "").trim().toUpperCase();
  if (!code) return null;

  const tries = [
    query(collection(dbx, "spaces"), where("code", "==", code), limit(1)),
    query(collection(dbx, "spaces"), where("joinCode", "==", code), limit(1)),
    query(collection(dbx, "spaces"), where("join.code", "==", code), limit(1)),
  ];

  for (const qy of tries) {
    const snap = await getDocs(qy);
    if (!snap.empty) return snap.docs[0];
  }
  return null;
}

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

function errToText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const maybe = e as { code?: unknown; message?: unknown };
    const code = typeof maybe.code === "string" ? maybe.code : "";
    const msg = typeof maybe.message === "string" ? maybe.message : "";
    return code && msg ? `${code}: ${msg}` : msg || JSON.stringify(e);
  }
  return String(e);
}

function getErrMeta(e: unknown): { code?: string; message?: string } {
  if (e && typeof e === "object") {
    const obj = e as { code?: unknown; message?: unknown };
    return {
      code: typeof obj.code === "string" ? obj.code : undefined,
      message: typeof obj.message === "string" ? obj.message : undefined,
    };
  }
  if (e instanceof Error) return { message: e.message };
  if (typeof e === "string") return { message: e };
  return { message: String(e) };
}

async function waitForUser(): Promise<User> {
  const current = auth.currentUser;
  if (current) return current;

  return await new Promise<User>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out while waiting for auth user."));
    }, 10000);

    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        clearTimeout(timeout);
        unsub();
        resolve(u);
      }
    }, (err) => {
      clearTimeout(timeout);
      unsub();
      reject(err);
    });
  });
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
  const [err, setErr] = useState<string | null>(null);

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
      const dbx = requireDb(db);

      const spaceDoc = await findSpaceByCode(dbx, c);
      if (!spaceDoc) {
        setErr(t("errors.spaceNotFound"));
        return;
      }

      const spaceId = spaceDoc.id;

      await ensureAnonymousUser();
      const u = await waitForUser();

      console.log("[join] uid:", u.uid, "spaceId:", spaceId, "code:", c, "isAnon:", u.isAnonymous);

      await ensureSpaceMember(dbx, spaceId, u.uid, "student", {
        code: c,
        isAnon: Boolean(u.isAnonymous),
        displayName: name,
      });

      router.push(`/${locale}/student/spaces/${spaceId}`);
    } catch (e2: unknown) {
  const meta = getErrMeta(e2);

  console.error("JOIN FAILED");
  console.error("code:", meta.code);
  console.error("message:", meta.message);
  console.error("error object:", e2);

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