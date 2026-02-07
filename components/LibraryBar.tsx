// components/LibraryBar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppMode } from "@/components/ModeProvider";
import { navItemsForMode } from "@/lib/navItems";

export default function LibraryBar() {
  const pathname = usePathname();
  const { mode } = useAppMode();

  const isLibrary = pathname === "/321lessons";

  // Finn dashboard-lenke fra navItems (robust)
  const dashboardHref =
    navItemsForMode(mode).find((x) => x.label === "Dashboard")?.href || "/";

  const href = isLibrary ? dashboardHref : "/321lessons";
  const label = isLibrary ? "Lukk Library" : "Åpne Library";

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(0,0,0,0.08)",

        // 👇 HER styrer du bakgrunn for HELE laget
        // Bytt f.eks. til: "rgba(240,240,240,0.8)" senere
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

            // Aktiv / inaktiv farge
            color: isLibrary
              ? "rgba(38, 48, 196, 0.95)"
              : "rgba(4, 85, 61, 0.65)",
          }}
        >
          {label}
        </Link>
      </div>

      {/* Hover-effekt – helt kontrollert her */}
      <style jsx>{`
        .libraryToggle:hover {
          background: rgba(48, 202, 58, 0.53);
        }
      `}</style>
    </div>
  );
}