// components\TopNav.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { useTranslations } from "next-intl";

/* =========================
   Locale helpers (TopNav)
========================= */

const SUPPORTED_LOCALES = ["nb", "en", "pt"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function isLocale(x: string | undefined | null): x is Locale {
  return !!x && (SUPPORTED_LOCALES as readonly string[]).includes(x);
}

function normalizeLocale(x: string | undefined | null): Locale | null {
  if (!x) return null;
  if (x === "no") return "nb";
  return isLocale(x) ? x : null;
}

function getLocaleFromPathname(pathname: string | null): Locale | null {
  if (!pathname) return null;
  const seg = pathname.split("/")[1];
  return normalizeLocale(seg);
}

/**
 * Remove any leading locale segment(s) from a pathname.
 * Handles paths like:
 *   /en/student            -> /student
 *   /en/pt/student         -> /student
 *   /pt/en/teacher/spaces  -> /teacher/spaces
 *   /space/ABC             -> /space/ABC
 */
function stripLeadingLocales(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  while (parts.length > 0 && normalizeLocale(parts[0])) parts.shift();
  return "/" + parts.join("/");
}

/**
 * Build a localized URL for a given href.
 * - Keeps absolute URLs untouched
 * - Keeps /space/* share links without locale
 * - Avoids double locale
 */
function withLocale(locale: Locale | null, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/space/")) return href;

  const cleaned = stripLeadingLocales(href);
  if (cleaned === "/") return locale ? `/${locale}` : "/";

  return locale ? `/${locale}${cleaned}` : cleaned;
}

/**
 * Swap locale in the current pathname (keeps rest of path).
 */
function setLocaleInPathname(pathname: string, nextLocale: Locale): string {
  if (!pathname) return `/${nextLocale}`;
  if (pathname.startsWith("/space/")) return pathname;

  const parts = pathname.split("/");
  const first = normalizeLocale(parts[1]);

  if (first) {
    parts[1] = nextLocale;

    while (normalizeLocale(parts[2])) {
      parts.splice(2, 1);
    }

    return parts.join("/") || `/${nextLocale}`;
  }

  return `/${nextLocale}${pathname === "/" ? "" : pathname}`;
}

/* =========================
   Role helpers
========================= */

type AppRole = "student" | "teacher" | "parent" | "admin" | "creator";

function readStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  const v = rec[key];
  return typeof v === "string" ? v : null;
}

function safeRole(role: unknown): AppRole | null {
  if (role === "student") return "student";
  if (role === "teacher") return "teacher";
  if (role === "parent") return "parent";
  if (role === "admin") return "admin";
  if (role === "creator") return "creator";
  return null;
}

function defaultHomeForRole(role: AppRole | null): string {
  if (role === "teacher") return "/teacher";
  if (role === "parent") return "/parent";
  if (role === "admin") return "/admin";
  if (role === "creator") return "/creator";
  return "/student";
}

export default function TopNav() {
  const tTop = useTranslations("topNav");
  const tBrand = useTranslations("brandLogo");

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const locale = getLocaleFromPathname(pathname);
  const currentLocale: Locale = locale ?? "nb";

  const { profile, loading } = useUserProfile();
  const [authUser, setAuthUser] = useState<User | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, setAuthUser);
  }, []);

  const isAnon = !!authUser?.isAnonymous;
  const isLoggedIn = !!authUser && !isAnon;

  const role = useMemo<AppRole | null>(() => {
    if (isAnon) return "student";
    const roleStr = readStringField(profile, "role");
    return safeRole(roleStr);
  }, [isAnon, profile]);

  const needsOnboarding = isLoggedIn && !loading && !role;

  async function handleLogout() {
    await signOut(auth);
    router.replace(withLocale(locale, "/"));
  }

  const nextAfterLogin = useMemo(() => {
    if (pathname) return pathname;
    return withLocale(locale, defaultHomeForRole(role));
  }, [pathname, locale, role]);

  const loginNext = encodeURIComponent(nextAfterLogin);

  function switchLocale(next: Locale) {
    if (next === currentLocale) return;
    const nextPath = setLocaleInPathname(pathname || "/", next);
    const qs = searchParams?.toString();
    router.push(qs ? `${nextPath}?${qs}` : nextPath);
  }

  const onboardingHref = withLocale(locale, "/onboarding");

  return (
    <header
      style={{
        background: "rgba(69, 57, 97, 0.15)",
        backdropFilter: "saturate(150%) blur(6px)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Link
          href={withLocale(locale, "/")}
          style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}
          aria-label="321"
        >
          <Image
            src="/logo321ny.png"
            alt="321 logo"
            width={34}
            height={34}
            style={{ display: "block" }}
          />
          <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: 0.2 }}>
            321 <span style={{ color: "#7cc7ff" }}>{tBrand("school")}</span>
          </span>
        </Link>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label className="langWrap" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="langIcon" aria-hidden="true" style={{ fontSize: 18, opacity: 0.85 }}>
            🌐
          </span>
          <select
            className="langSelect"
            value={currentLocale}
            onChange={(e) => switchLocale(e.target.value as Locale)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.14)",
              background: "white",
              cursor: "pointer",
            }}
            aria-label={tTop("language")}
            title={tTop("language")}
          >
            <option value="nb">NB</option>
            <option value="en">EN</option>
            <option value="pt">PT</option>
          </select>
        </label>

        {isAnon && (
          <>
            <span style={{ fontSize: 13, opacity: 0.7 }}>{tTop("guestMode")}</span>
            <Link href={withLocale(locale, `/login?next=${loginNext}`)} style={btnStyle}>
              {tTop("loginOrCreate")}
            </Link>
          </>
        )}

        {isLoggedIn && (
          <>
            {needsOnboarding && (
              <Link href={onboardingHref} style={btnStyle}>
                {tTop("completeProfile")}
              </Link>
            )}

            <button onClick={handleLogout} style={btnStyle}>
              {tTop("logout")}
            </button>
          </>
        )}

        {!authUser && (
          <Link href={withLocale(locale, `/login?next=${loginNext}`)} style={btnStyle}>
            {tTop("login")}
          </Link>
        )}
      </div>

      <style jsx>{`
        @media (max-width: 520px) {
          .langIcon {
            display: none;
          }
          .langSelect {
            padding: 6px 8px !important;
            border-radius: 10px !important;
            font-size: 13px !important;
          }
        }
      `}</style>
    </header>
  );
}

const btnStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.14)",
  background: "rgba(89, 131, 93, 0.23)",
  borderRadius: 10,
  padding: "8px 10px",
  cursor: "pointer",
  textDecoration: "none",
};