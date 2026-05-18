// app/[locale]/(app)/teacher/spaces/[spaceId]/members/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useLocale, useTranslations } from "next-intl";

type MemberData = {
  spaceId?: string;
  userId?: string;
  uid?: string;
  displayName?: string;
  role?: string;
  archived?: boolean;
  active?: boolean;
  status?: string;
  isAnon?: boolean;
  createdAt?: unknown;
};

type MemberRow = {
  id: string;
  data: MemberData;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function hasToDate(v: unknown): v is { toDate: () => Date } {
  return isRecord(v) && typeof (v as { toDate?: unknown }).toDate === "function";
}

function asDate(v: unknown): Date | null {
  if (!v) return null;
  if (hasToDate(v)) return v.toDate();
  return null;
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Locale-safe link helper:
 * - keeps absolute URLs unchanged
 * - prefixes "/{locale}" for internal paths that start with "/"
 * - avoids double-prefix if already "/en/..." or "/no/..." or "/pt/..."
 */
function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "pt") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
}

export default function TeacherSpaceMembersPage() {
  return (
    <AuthGate>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const t = useTranslations("teacherMembers");
  const locale = useLocale();

  const params = useParams<{ spaceId: string }>();
  const spaceId = params?.spaceId;

  const { user, loading } = useUserProfile();

  const [spaceTitle, setSpaceTitle] = useState<string>(() => t("fallbacks.spaceTitle"));
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [search, setSearch] = useState("");

  const fmt = useMemo(() => {
    return (d: Date | null) => {
      if (!d) return t("common.dash");
      try {
        return new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(d);
      } catch {
        return d.toISOString();
      }
    };
  }, [locale, t]);

  // Keep fallback title in sync if locale changes (only if we still show fallback)
  useEffect(() => {
    setSpaceTitle((prev) => (prev === "" || prev === t("fallbacks.spaceTitle") ? t("fallbacks.spaceTitle") : prev));
  }, [t]);

  useEffect(() => {
    if (!spaceId) return;

    getDoc(doc(db, "spaces", spaceId))
      .then((snap) => {
        const data = snap.data();
        const title = data && isRecord(data) ? safeString((data as Record<string, unknown>)["title"]) : null;
        if (title) setSpaceTitle(title);
      })
      .catch(() => {
        /* ignore */
      });
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId || !user?.uid) return;

    const qy = query(
      collection(db, "spaceMembers"),
      where("spaceId", "==", spaceId),
      where("archived", "==", false),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(qy, (snap) => {
      const next: MemberRow[] = snap.docs
        .map((d) => {
          const raw = d.data();
          const data: MemberData = isRecord(raw) ? (raw as MemberData) : {};
          return { id: d.id, data };
        })
        .filter((row) => row.data.active !== false && String(row.data.status ?? "").toLowerCase() !== "removed");
      setRows(next);
    });
  }, [spaceId, user?.uid]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const name = String(r.data.displayName ?? "").toLowerCase();
      const role = String(r.data.role ?? "").toLowerCase();
      const uid = String(r.data.userId ?? r.data.uid ?? "").toLowerCase();
      return name.includes(s) || role.includes(s) || uid.includes(s);
    });
  }, [rows, search]);

  if (loading) {
    return <div className="mx-auto max-w-4xl p-4 text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  if (!spaceId) {
    return <div className="mx-auto max-w-4xl p-4 text-sm text-red-600">{t("errors.missingSpaceId")}</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle", { spaceTitle })} · {t("labels.spaceId")}:{" "}
            <span className="font-mono text-xs">{spaceId}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={withLocale(locale, `/teacher/spaces/${spaceId}`)}
            className="rounded-xl border px-3 py-2 text-sm no-underline hover:shadow-sm"
          >
            {t("actions.backToSpace")}
          </Link>
          <Link
            href={withLocale(locale, "/teacher/spaces")}
            className="rounded-xl border px-3 py-2 text-sm no-underline hover:shadow-sm"
          >
            {t("actions.allSpaces")}
          </Link>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {t("showing")} <b>{filtered.length}</b>
          </div>
          <div className="w-full sm:w-72">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search.placeholder")}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            />
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">{t("table.name")}</th>
                <th className="py-2 pr-3">{t("table.role")}</th>
                <th className="py-2 pr-3">{t("table.joined")}</th>
                <th className="py-2 pr-3">{t("table.type")}</th>
                <th className="py-2 pr-3">{t("table.uid")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const name = String(r.data.displayName ?? t("common.dash"));
                const role = String(r.data.role ?? "member");
                const joined = fmt(asDate(r.data.createdAt));
                const isAnon = Boolean(r.data.isAnon);
                const uid = String(r.data.userId ?? r.data.uid ?? t("common.dash"));

                return (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium">{name}</td>
                    <td className="py-2 pr-3">{role}</td>
                    <td className="py-2 pr-3">{joined}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${isAnon ? "bg-slate-100" : "bg-emerald-50"}`}>
                        {isAnon ? t("types.anon") : t("types.signedIn")}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{uid}</td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-3 text-xs text-muted-foreground">
            {t("tip.prefix")} <b>displayName</b> {t("tip.suffix")}
          </div>
        </div>
      </div>
    </div>
  );
}
