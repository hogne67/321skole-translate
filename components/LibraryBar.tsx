"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";
import { navItemsForRole } from "@/lib/navItems";
import { useTranslations } from "next-intl";

/* =========================
   Locale helpers
========================= */

const SUPPORTED_LOCALES = ["en", "nb", "pt"] as const;
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

  // root / → prefer localized root if we know locale
  if (href === "/") return locale ? `/${locale}` : "/";

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

  // true for /en/321lessons, /nb/321lessons, /pt/321lessons
  const isLibrary = (pathname || "").split("?")[0].endsWith("/321lessons");

  // dashboard link from nav items (avoid fallback "/")
  const dashboardFromNav =
    navItemsForRole(role).find((x) => x.labelKey === "nav.dashboard")?.href ?? null;

  // fallback
  const dashboardFallback = role === "teacher" ? "/teacher" : "/student";

  const dashboardRaw = dashboardFromNav ?? dashboardFallback;
  const dashboardHref = withLocale(locale, dashboardRaw);

  // Toggle
  const href = isLibrary ? dashboardHref : withLocale(locale, "/321lessons");
  const label = isLibrary ? tLib("close") : tLib("open");

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(15, 23, 42, 0.12)",
        background:
          "linear-gradient(180deg, rgba(56,189,248,0.22) 0%, rgba(16,185,129,0.10) 100%)",
        backdropFilter: "blur(6px)",
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
          className={`libraryToggle ${isLibrary ? "isActive" : "isIdle"}`}
          style={{
            textDecoration: "none",
            fontWeight: 900,
            fontSize: 14,
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid rgba(15, 23, 42, 0.14)",
            boxShadow: isLibrary
              ? "0 10px 22px rgba(2,6,23,0.14)"
              : "0 8px 18px rgba(2,6,23,0.10)",
            transition:
              "transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease, color 140ms ease, border-color 140ms ease",
            color: isLibrary ? "rgba(220, 38, 38, 0.95)" : "rgba(15, 23, 42, 0.85)",
            background: isLibrary ? "rgba(221, 208, 208, 0.92)" : "rgba(197, 212, 221, 0.78)",
          }}
          aria-label={label}
        >
          {label}
        </Link>
      </div>

      <style jsx>{`
        .libraryToggle:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 28px rgba(2, 6, 23, 0.16);
          background: rgba(255, 255, 255, 0.94);
          border-color: rgba(15, 23, 42, 0.22);
        }

        /* Subtil puls når du IKKE er i library */
        .isIdle {
          animation: softPulse 2.6s ease-in-out infinite;
        }

        .isActive {
          animation: none;
        }

        @keyframes softPulse {
          0% {
            box-shadow: 0 8px 18px rgba(2, 6, 23, 0.10),
              0 0 0 0 rgba(34, 211, 238, 0);
          }
          55% {
            box-shadow: 0 10px 22px rgba(2, 6, 23, 0.12),
              0 0 0 10px rgba(34, 211, 238, 0.12);
          }
          100% {
            box-shadow: 0 8px 18px rgba(2, 6, 23, 0.10),
              0 0 0 0 rgba(34, 211, 238, 0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .isIdle {
            animation: none;
          }

          .libraryToggle:hover {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}