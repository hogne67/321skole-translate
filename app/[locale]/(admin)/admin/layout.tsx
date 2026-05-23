"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import AuthGate from "@/components/AuthGate";

type AdminNavItem = {
  href: string;
  label: string;
  section: "Core" | "Operations" | "Insights" | "System";
};

const adminNavItems: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", section: "Core" },
  { href: "/admin/review", label: "Moderation", section: "Core" },
  { href: "/admin/users", label: "Users", section: "Core" },
  { href: "/admin/schools", label: "Schools", section: "Core" },
  { href: "/admin/partners", label: "Partners", section: "Core" },
  { href: "/admin/partners/inbox", label: "Partner Inbox", section: "Core" },
  { href: "/admin/partners/broadcast", label: "Partner Broadcast", section: "Core" },
  { href: "/admin/trash", label: "Trash", section: "Operations" },
  { href: "/admin/billing", label: "Billing", section: "Operations" },
  { href: "/admin/communication", label: "Communication", section: "Operations" },
  { href: "/admin/stats", label: "Stats", section: "Insights" },
  { href: "/admin/analytics", label: "Analytics", section: "Insights" },
  { href: "/admin/system/debug", label: "Debug", section: "System" },
];

function AdminNavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`adminNavLink ${active ? "active" : ""}`}
    >
      {label}
    </Link>
  );
}

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = useLocale();
  const pathname = usePathname();

  function localizedHref(href: string) {
    return `/${locale}${href}`;
  }

  function isActive(href: string) {
    const localized = localizedHref(href);
    if (!pathname) return false;
    if (href === "/admin") return pathname === localized;
    return pathname === localized || pathname.startsWith(`${localized}/`);
  }

  const sections = adminNavItems.reduce<Record<AdminNavItem["section"], AdminNavItem[]>>(
    (acc, item) => {
      acc[item.section].push(item);
      return acc;
    },
    {
      Core: [],
      Operations: [],
      Insights: [],
      System: [],
    }
  );

  return (
    <AuthGate requireRole="admin">
      <div className="adminShell">
        <aside className="adminSidebar">
          <div className="adminBrand">
            <Image
              src="/logo321ny.png"
              alt="321school logo"
              width={34}
              height={34}
              className="adminBrandLogo"
            />
            <div className="adminBrandTitle">321school</div>
          </div>

          <nav className="adminNav" aria-label="Admin navigation">
            {(Object.keys(sections) as AdminNavItem["section"][]).map((section) => (
              <div key={section} className="adminNavSection">
                <div className="adminNavHeading">{section}</div>
                <div className="adminNavItems">
                  {sections[section].map((item) => (
                    <AdminNavLink
                      key={item.href}
                      href={localizedHref(item.href)}
                      label={item.label}
                      active={isActive(item.href)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="adminMain">
          <header className="adminTopbar">
            <div>
              <div className="adminTopbarLabel">Admin Console</div>
              <h1>Control panel</h1>
            </div>

            <Link href={`/${locale}/admin`} className="adminHomeLink">
              Dashboard
            </Link>
          </header>

          <main className="adminContent">{children}</main>
        </div>

        <style jsx>{`
          .adminShell {
            --admin-bg: #f7f8fa;
            --admin-surface: #ffffff;
            --admin-surface-subtle: #f8fafc;
            --admin-border: #e5e7eb;
            --admin-border-strong: #d1d5db;
            --admin-text: #111827;
            --admin-muted: #6b7280;
            --admin-link: #2563eb;
            --admin-link-bg: #eff6ff;
            --admin-sidebar: #0647c7;
            --admin-sidebar-muted: rgba(255, 255, 255, 0.72);
            --admin-sidebar-hover: rgba(255, 255, 255, 0.12);
            --admin-sidebar-active: rgba(255, 255, 255, 0.18);
            --admin-radius: 10px;
            --admin-gap: 16px;
            --admin-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
            min-height: 100vh;
            display: grid;
            grid-template-columns: 248px minmax(0, 1fr);
            background: var(--admin-bg);
            color: var(--admin-text);
          }

          .adminSidebar {
            position: sticky;
            top: 0;
            height: 100vh;
            overflow-y: auto;
            border-right: 1px solid rgba(255, 255, 255, 0.16);
            background: var(--admin-sidebar);
            padding: 0 14px 18px;
          }

          .adminBrand {
            min-height: 76px;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 0 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.18);
            margin-bottom: 24px;
          }

          .adminBrandKicker,
          .adminTopbarLabel,
          .adminNavHeading {
            font-size: 11px;
            line-height: 1.2;
            letter-spacing: 0;
            text-transform: uppercase;
            color: var(--admin-sidebar-muted);
            font-weight: 800;
          }

          .adminBrandTitle {
            font-size: 19px;
            line-height: 1.15;
            font-weight: 900;
            color: #ffffff;
          }

          :global(.adminBrandLogo) {
            display: block;
            border-radius: 8px;
          }

          .adminNav {
            display: grid;
            gap: 12px;
          }

          .adminNavSection {
            display: grid;
            gap: 5px;
          }

          .adminNavHeading {
            padding: 0 8px;
          }

          .adminNavItems {
            display: grid;
            gap: 1px;
          }

          :global(.adminNavLink) {
            display: flex;
            align-items: center;
            min-height: 30px;
            padding: 5px 10px;
            border-radius: var(--admin-radius);
            border: 1px solid transparent;
            text-decoration: none;
            color: #ffffff;
            background: transparent;
            font-weight: 700;
            font-size: 14px;
            transition:
              background 140ms ease,
              border-color 140ms ease,
              color 140ms ease;
          }

          :global(.adminNavLink:hover) {
            background: var(--admin-sidebar-hover);
            border-color: rgba(255, 255, 255, 0.22);
            color: #ffffff;
          }

          :global(.adminNavLink.active) {
            background: var(--admin-sidebar-active);
            border-color: rgba(255, 255, 255, 0.32);
            color: #ffffff;
          }

          .adminMain {
            min-width: 0;
          }

          .adminTopbar {
            min-height: 76px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 16px 24px;
            border-bottom: 1px solid var(--admin-border);
            background: rgba(255, 255, 255, 0.92);
            backdrop-filter: blur(10px);
            position: sticky;
            top: 0;
            z-index: 5;
          }

          .adminTopbar h1 {
            margin: 3px 0 0;
            font-size: 22px;
            line-height: 1.2;
          }

          .adminHomeLink {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 38px;
            padding: 8px 12px;
            border-radius: var(--admin-radius);
            border: 1px solid var(--admin-border-strong);
            background: var(--admin-surface);
            color: var(--admin-text);
            text-decoration: none;
            font-size: 14px;
            font-weight: 800;
            white-space: nowrap;
            box-shadow: var(--admin-shadow);
            transition:
              background 140ms ease,
              border-color 140ms ease,
              box-shadow 140ms ease;
          }

          .adminHomeLink:hover {
            background: var(--admin-surface-subtle);
            border-color: #9ca3af;
            box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
          }

          .adminContent {
            width: 100%;
            max-width: 1180px;
            margin: 0 auto;
            padding: 24px;
          }

          @media (max-width: 820px) {
            .adminShell {
              grid-template-columns: 1fr;
            }

            .adminSidebar {
              position: static;
              height: auto;
              border-right: 0;
              border-bottom: 1px solid rgba(255, 255, 255, 0.18);
            }

            .adminNav {
              display: block;
            }

            .adminNavSection {
              margin-top: 12px;
            }

            .adminNavItems {
              display: flex;
              gap: 6px;
              overflow-x: auto;
              padding-bottom: 2px;
            }

            .adminTopbar {
              position: static;
              padding: 14px 16px;
            }

            .adminContent {
              padding: 16px;
            }
          }
        `}</style>
      </div>
    </AuthGate>
  );
}
