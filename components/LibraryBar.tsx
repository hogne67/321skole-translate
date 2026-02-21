// components/LibraryBar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppMode } from "@/components/ModeProvider";
import { navItemsForMode } from "@/lib/navItems";
import { useTranslations } from "next-intl";

function getLocaleFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const seg = pathname.split("/")[1];
  return seg === "en" || seg === "no" ? seg : null;
}

function withLocale(locale: string | null, href: string): string {
  // absolute URLs
  if (/^https?:\/\//i.test(href)) return href;

  // Library er foreløpig OUTSIDE locale (public ikke flyttet)
  if (href === "/321lessons") return href;

  // root / → hold som /
  if (href === "/") return href;

  // Prefix kun hvis vi faktisk er inne i /en eller /no
  if (locale && href.startsWith("/")) {
    if (href.startsWith(`/${locale}/`)) return href;
    if (href === `/${locale}`) return href;
    return `/${locale}${href}`;
  }

  return href;
}

export default function LibraryBar() {
  const t = useTranslations();
  const pathname = usePathname();
  const { mode } = useAppMode();

  const locale = getLocaleFromPathname(pathname);

  // Robust: funker både på /321lessons og /no/321lessons (hvis du tester sånn)
  const isLibrary = (pathname || "").endsWith("/321lessons");

  // Finn dashboard-lenke fra navItems (robust etter labelKey-endringen)
  const dashboardRaw =
    navItemsForMode(mode).find((x) => x.labelKey === "nav.dashboard")?.href || "/";

  const dashboardHref = withLocale(locale, dashboardRaw);

  // Library er foreløpig uten locale
  const href = isLibrary ? dashboardHref : "/321lessons";

  // Fallback dersom keys mangler i messages
  const label = isLibrary
    ? (t("library.close" as any) as string) || "Close Library"
    : (t("library.open" as any) as string) || "Open Library";

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(240, 228, 163, 0.36)",
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
            color: isLibrary ? "rgba(38, 48, 196, 0.95)" : "rgba(4, 85, 61, 0.65)",
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