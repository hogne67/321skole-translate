// app/(app)/student/spaces/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, type Firestore } from "firebase/firestore";
import { listMySpaceIds } from "@/lib/spaceMembership";
import type { SpaceDoc } from "@/lib/spacesClient";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getKey(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

function codeOfSpace(s: SpaceDoc | null | undefined): string | null {
  const code = safeString(getKey(s, "code"));
  if (code) return code;

  const joinCode = safeString(getKey(s, "joinCode"));
  if (joinCode) return joinCode;

  const join = getKey(s, "join");
  if (!isRecord(join)) return null;

  const nested = safeString(join["code"]);
  return nested ?? null;
}

function errMessage(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

export default function StudentSpacesPage() {
  const t = useTranslations("studentSpaces");
  const locale = useLocale();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [spaces, setSpaces] = useState<Array<{ id: string; data: SpaceDoc }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const collatorLocale = useMemo(() => (locale === "no" ? "nb" : "en"), [locale]);

  function titleOfSpace(s: SpaceDoc): string {
    const title = safeString(getKey(s, "title"));
    return title ?? t("defaultTitle");
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    let alive = true;

    async function run() {
      setErr(null);

      if (!user) {
        if (alive) {
          setSpaces([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      try {
        const dbx = requireDb(db);
        const ids = await listMySpaceIds(dbx, user.uid);

        if (!ids.length) {
          if (alive) setSpaces([]);
          return;
        }

        const docs = await Promise.all(
          ids.map(async (id) => {
            const snap = await getDoc(doc(dbx, "spaces", id));
            if (!snap.exists()) return null;
            return { id, data: snap.data() as SpaceDoc };
          })
        );

        const items = docs.filter((x): x is { id: string; data: SpaceDoc } => x !== null);
        items.sort((a, b) => titleOfSpace(a.data).localeCompare(titleOfSpace(b.data), collatorLocale));

        if (alive) setSpaces(items);
      } catch (e: unknown) {
        if (alive) setErr(errMessage(e, t("errors.loadFailed")));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, collatorLocale]);

  if (loading) {
    return <div className="w-full py-4 text-sm text-slate-600">{t("loading")}</div>;
  }

  return (
    <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-3 sm:space-y-4">
      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-50 p-3 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 break-words text-2xl font-semibold text-slate-900">{t("title")}</h1>
            <div className="mt-2 break-words text-sm text-slate-600">{t("subtitle")}</div>
          </div>

          <div className="flex w-full min-w-0 justify-start lg:w-auto lg:justify-end">
            <Link
              href="/join"
              className="inline-flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-2 text-base font-semibold text-white no-underline shadow-sm hover:bg-green-500 hover:shadow-md sm:w-auto"
            >
              {t("actions.joinSpace")}
            </Link>
          </div>
        </div>
      </div>

      {err ? (
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-200 p-3 shadow-md sm:p-5">
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-900">{t("title")}</div>
          <div className="mt-1 break-words text-sm text-slate-600">
            {spaces.length} {spaces.length === 1 ? t("meta.oneSpace") : t("meta.manySpaces")}
          </div>
        </div>

        <div className="mt-4 grid min-w-0 gap-3">
          {spaces.length === 0 ? (
            <div className="rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-600 shadow-sm sm:p-6">
              {t.rich("empty", {
                b: (chunks) => <b>{chunks}</b>,
              })}
            </div>
          ) : (
            spaces.map((s) => {
              const title = titleOfSpace(s.data);
              const code = codeOfSpace(s.data);

              const openHref = `/student/spaces/${s.id}`;
              const boardHref = `/student/spaces/${s.id}/board`;

              return (
                <div
                  key={s.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(openHref)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") router.push(openHref);
                  }}
                  className="box-border w-full min-w-0 max-w-full cursor-pointer rounded-2xl border border-slate-300 bg-white p-3 shadow-sm transition hover:shadow-md sm:p-5"
                >
                  <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-base font-semibold text-slate-900">{title}</div>

                      {code ? (
                        <div className="mt-2 break-words text-sm text-slate-600">
                          {t("meta.code")}: <b className="text-slate-900">{code}</b>
                        </div>
                      ) : null}

                      <div className="mt-3 break-words text-sm text-slate-500">{t("actions.openSpace")}</div>
                    </div>

                    <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:w-auto xl:min-w-[320px]">
                      <Link
                        href={boardHref}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
                        title={t("actions.openBoard")}
                      >
                        {t("actions.board")}
                      </Link>

                      <Link
                        href={openHref}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white no-underline hover:bg-slate-800"
                        title={t("actions.openSpace")}
                      >
                        {t("actions.openSpace")}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
