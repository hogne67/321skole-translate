// components/LibraryBar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";
import { navItemsForRole } from "@/lib/navItems";
import { useTranslations } from "next-intl";

/* =========================
   Locale helpers
========================= */

const SUPPORTED_LOCALES = ["en", "no", "pt"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function isLocale(x: string | undefined | null): x is Locale {
  return !!x && (SUPPORTED_LOCALES as readonly string[]).includes(x);
}

function getLocaleFromPathname(pathname: string | null): Locale | null {
  if (!pathname) return null;
  const seg = pathname.split("/")[1];
  return isLocale(seg) ? seg : null;
}

function withLocale(locale: Locale | null, href: string): string {
  // absolute URLs
  if (/^https?:\/\//i.test(href)) return href;

  // root / → hold som /
  if (href === "/") return href;

  // already localized?
  const seg = href.split("/")[1];
  if (isLocale(seg)) return href;

  // Prefix only if we have locale and href is internal
  if (locale && href.startsWith("/")) return `/${locale}${href}`;

  return href;
}

type Role = "student" | "teacher";
function safeRole(role: unknown): Role {
  return role === "teacher" ? "teacher" : "student";
}

function readStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  const v = rec[key];
  return typeof v === "string" ? v : null;
}

/* =========================
   Component
========================= */

export default function LibraryBar() {
  const tLib = useTranslations("library");
  const pathname = usePathname();
  const { user, profile } = useUserProfile();

  // anon -> student
  const roleStr = readStringField(profile, "role");
  const role: Role = user?.isAnonymous ? "student" : safeRole(roleStr);

  const locale = getLocaleFromPathname(pathname);

  // true for /en/321lessons, /no/321lessons, /pt/321lessons
  const isLibrary = (pathname || "").split("?")[0].endsWith("/321lessons");

  // dashboard link from nav items
  const dashboardRaw = navItemsForRole(role).find((x) => x.labelKey === "nav.dashboard")?.href || "/";

  const dashboardHref = withLocale(locale, dashboardRaw);

  // Toggle: when in library -> back to dashboard (with locale),
  // else -> go to library (with locale)
  const href = isLibrary ? dashboardHref : withLocale(locale, "/321lessons");

  const label = isLibrary ? tLib("close") : tLib("open");

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(117, 214, 231, 0.36)",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "10px 12px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Link
          href={href}
          className="libraryToggle"
          style={{
            textDecoration: "none",
            fontWeight: 800,
            fontSize: 18,
            padding: "6px 8px",
            borderRadius: 8,
            transition: "color 120ms ease, background-color 120ms ease",
            color: isLibrary ? "rgba(216, 17, 27, 0.95)" : "rgba(4, 85, 61, 0.65)",
          }}
        >
          {label}
        </Link>
      </div>

      <style jsx>{`
        .libraryToggle:hover {
          background: rgba(48, 202, 58, 0.53);
        }
      `}</style>
    </div>
  );
}