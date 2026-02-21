// components/TopNav.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { useAppMode } from "@/components/ModeProvider";
import type { AppMode } from "@/lib/mode";
import { useTranslations } from "next-intl";

/* =========================
   Locale helpers (TopNav)
========================= */

const SUPPORTED_LOCALES = ["no", "en", "pt"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function isLocale(x: string | undefined | null): x is Locale {
  return !!x && (SUPPORTED_LOCALES as readonly string[]).includes(x);
}

function getLocaleFromPathname(pathname: string | null): Locale | null {
  if (!pathname) return null;
  const seg = pathname.split("/")[1];
  return isLocale(seg) ? seg : null;
}

/**
 * Remove any leading locale segment(s) from a pathname.
 * Handles paths like:
 *   /en/student            -> /student
 *   /en/pt/student         -> /student   (cleans double locale)
 *   /pt/en/teacher/spaces  -> /teacher/spaces (cleans double locale)
 *   /space/ABC             -> /space/ABC (untouched)
 */
function stripLeadingLocales(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean); // remove empty
  while (parts.length > 0 && isLocale(parts[0])) {
    parts.shift();
  }
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

  // Share/public routes without locale should stay stable
  if (href.startsWith("/space/")) return href;

  const cleaned = stripLeadingLocales(href);

  if (cleaned === "/") {
    // keep root stable; middleware can redirect if needed
    return "/";
  }

  if (locale) return `/${locale}${cleaned}`;
  return cleaned;
}

/**
 * Swap locale in the current pathname (keeps rest of path).
 * - If current path has a locale, replace it.
 * - If path has NO locale (e.g. /space/...), keep unchanged.
 * - If path has DOUBLE locale, clean it (so you end up with single locale).
 */
function setLocaleInPathname(pathname: string, nextLocale: Locale): string {
  if (!pathname) return `/${nextLocale}`;

  // Share links should remain non-localized
  if (pathname.startsWith("/space/")) return pathname;

  const current = getLocaleFromPathname(pathname);
  if (current) {
    // Replace first locale segment and also remove any extra locale segments right after
    const parts = pathname.split("/");
    parts[1] = nextLocale;

    // Remove accidental double locale like /en/pt/...
    if (isLocale(parts[2])) {
      parts.splice(2, 1);
    }

    const joined = parts.join("/");
    return joined || `/${nextLocale}`;
  }

  // If there is no locale in the path, do not force it here (keeps share links stable etc.)
  return pathname;
}

/* =========================
   Nav helpers
========================= */

function homeForMode(m: AppMode) {
  switch (m) {
    case "teacher":
      return "/teacher";
    case "creator":
      return "/creator";
    case "admin":
      return "/admin";
    case "parent":
      return "/parent";
    case "student":
    default:
      return "/student";
  }
}

export default function TopNav() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const locale = getLocaleFromPathname(pathname);
  const currentLocale: Locale = locale ?? "no";

  const { profile, loading } = useUserProfile();
  const { mode, setMode, allowed } = useAppMode();

  const [authUser, setAuthUser] = useState<User | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, setAuthUser);
  }, []);

  const isAnon = !!authUser?.isAnonymous;
  const isLoggedIn = !!authUser && !isAnon;

  const isTeacherApproved = useMemo(() => {
    return profile?.teacherStatus === "approved" && !!profile?.roles?.teacher;
  }, [profile]);

  const isTeacherPending = profile?.teacherStatus === "pending";

  function labelForMode(m: AppMode) {
    switch (m) {
      case "student":
        return t("modes.student");
      case "parent":
        return t("modes.parent");
      case "teacher":
        return t("modes.teacher");
      case "creator":
        return t("modes.creator");
      case "admin":
        return t("modes.admin");
      default:
        return m;
    }
  }

  async function handleLogout() {
    await signOut(auth);
    router.replace(withLocale(locale, "/"));
  }

  function handleModeChange(next: AppMode) {
    setMode(next);
    router.push(withLocale(locale, homeForMode(next)));
  }

  const loginNext = encodeURIComponent(pathname || withLocale(locale, "/student"));

  function switchLocale(next: Locale) {
    if (next === currentLocale) return;

    const nextPath = setLocaleInPathname(pathname || "/", next);
    const qs = searchParams?.toString();
    router.push(qs ? `${nextPath}?${qs}` : nextPath);
  }

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
      {/* LEFT */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Link
          href={withLocale(locale, "/")}
          style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}
          aria-label="321"
        >
          <Image
            src="/logo 321_1.png"
            alt="321 logo"
            width={34}
            height={34}
            priority
            style={{ display: "block" }}
          />
          <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: 0.2 }}>
            321{" "}
            <span style={{ color: "#7cc7ff" }}>
              {t("brand.school")}
            </span>
          </span>
        </Link>
      </div>

      {/* RIGHT */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* Language dropdown */}
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden="true" style={{ fontSize: 18, opacity: 0.85 }}>
            🌐
          </span>
          <select
            value={currentLocale}
            onChange={(e) => switchLocale(e.target.value as Locale)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.14)",
              background: "white",
              cursor: "pointer",
            }}
            aria-label={t("topnav.language")}
            title={t("topnav.language")}
          >
            <option value="no">Norsk</option>
            <option value="en">English</option>
            <option value="pt">Português (Brasil)</option>
          </select>
        </label>

        {/* Apply teacher – kun for innloggede (ikke anon) */}
        {isLoggedIn && !isTeacherApproved && (
          <Link
            href={withLocale(locale, "/apply/teacher")}
            style={{
              textDecoration: "none",
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.14)",
              background: isTeacherPending ? "rgba(0,0,0,0.06)" : "rgba(190,247,192,1)",
              fontWeight: 900,
              opacity: isTeacherPending ? 0.75 : 1,
              pointerEvents: isTeacherPending ? "none" : "auto",
            }}
            title={isTeacherPending ? t("topnav.applicationSentTitle") : t("topnav.applyTeacherTitle")}
          >
            {isTeacherPending ? t("topnav.applicationSent") : t("topnav.applyTeacherAccess")}
          </Link>
        )}

        {/* Anon */}
        {isAnon && (
          <>
            <span style={{ fontSize: 13, opacity: 0.7 }}>{t("topnav.guestMode")}</span>
            <Link href={withLocale(locale, `/login?next=${loginNext}`)} style={btnStyle}>
              {t("topnav.loginOrCreate")}
            </Link>
          </>
        )}

        {/* Innlogget */}
        {isLoggedIn && (
          <>
            <select
              value={mode}
              onChange={(e) => handleModeChange(e.target.value as AppMode)}
              disabled={loading || allowed.length <= 1}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.14)",
                background: "white",
              }}
              title={allowed.length <= 1 ? t("topnav.noOtherModesTitle") : t("topnav.switchModeTitle")}
            >
              {allowed.map((m) => (
                <option key={m} value={m}>
                  {labelForMode(m)}
                </option>
              ))}
            </select>

            <button onClick={handleLogout} style={btnStyle}>
              {t("topnav.logout")}
            </button>
          </>
        )}

        {/* Ikke logget inn (ingen authUser ennå) */}
        {!authUser && (
          <Link href={withLocale(locale, `/login?next=${loginNext}`)} style={btnStyle}>
            {t("topnav.login")}
          </Link>
        )}
      </div>
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