"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams, usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

export default function SectionShell({
  title,
  subtitle,
  items,
  children,
  fullWidth = false,
  hideHeader = false,
  hideNav = false,
}: {
  title: string;
  subtitle?: string;
  items: NavItem[];
  children: React.ReactNode;
  fullWidth?: boolean;
  hideHeader?: boolean;
  hideNav?: boolean;
}) {
  const pathname = usePathname();
  const params = useParams<{ locale?: string }>();
  const locale = typeof params?.locale === "string" ? params.locale : "";

  function isItemActive(itemHref: string) {
    if (!pathname) return false;
    if (itemHref === "/") return pathname === "/";
    return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
  }

  function isToolsItem(itemHref: string) {
    return itemHref === "/tools" || itemHref.startsWith("/tools/");
  }

  function withLocale(href: string) {
    if (!href) return href;
    if (/^https?:\/\//i.test(href)) return href;
    if (!href.startsWith("/")) return href;
    if (!locale) return href;

    const seg = href.split("/")[1];
    if (seg === "en" || seg === "no" || seg === "pt") return href;

    if (href === "/") return `/${locale}`;
    return `/${locale}${href}`;
  }

  const navItems = useMemo(() => {
    const tools = items.filter((it) => isToolsItem(it.href));
    const rest = items.filter((it) => !isToolsItem(it.href));
    return [...tools, ...rest];
  }, [items]);

  return (
    <div className="shellRoot">
      {!hideHeader && (
        <div className="sectionHeader">
          <div className="sectionTitleWrap">
            <h1 className="sectionTitle">{title}</h1>
            {subtitle ? <p className="sectionSubtitle">{subtitle}</p> : null}
          </div>

          {!hideNav && (
            <div className="sectionNav" aria-label="Section navigation">
              {navItems.map((it, index) => {
                const isTools = isToolsItem(it.href);
                const isActive = isItemActive(it.href);
                const isPrimary = index === 0 && isTools;

                const background = isTools
                  ? "#deebde"
                  : isActive
                    ? "#eef6ff"
                    : "#ffffff";

                const color = isTools
                  ? "#1f7a1f"
                  : isActive
                    ? "#0f172a"
                    : "#1f2937";

                const border = isTools
                  ? "1px solid #81beb3"
                  : isActive
                    ? "1px solid #bfd7f7"
                    : "1px solid rgba(0,0,0,0.12)";

                const boxShadow = isTools
                  ? "0 1px 2px rgba(0,0,0,0.10)"
                  : "none";

                return (
                  <Link
                    key={it.href}
                    href={withLocale(it.href)}
                    className={`navLink ${isTools ? "navLinkTools" : ""} ${isPrimary ? "navLinkPrimary" : ""}`}
                    style={{
                      textDecoration: "none",
                      borderRadius: 999,
                      padding: "8px 14px",
                      whiteSpace: "nowrap",
                      fontSize: 14,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      background,
                      color,
                      border,
                      boxShadow,
                    }}
                  >
                    {it.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={`sectionContent ${fullWidth ? "full" : ""}`}>
        {children}
      </div>

      <style jsx>{`
        .shellRoot {
          width: 100%;
          min-width: 0;
          max-width: 100%;
        }

        .sectionHeader {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          padding: 14px 16px 8px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
          background: #fff;
        }

        .sectionTitleWrap {
          min-width: 0;
          max-width: 100%;
        }

        .sectionTitle {
          margin: 0;
          font-size: 22px;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .sectionSubtitle {
          margin: 6px 0 0;
          opacity: 0.75;
          overflow-wrap: anywhere;
        }

        .sectionNav {
          margin-top: 12px;
          display: flex;
          gap: 8px;
          min-width: 0;
          max-width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          padding-bottom: 6px;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          scroll-snap-type: x proximity;
        }

        .sectionNav::-webkit-scrollbar {
          display: none;
        }

        .navLink {
          flex: 0 0 auto;
          max-width: 100%;
          scroll-snap-align: start;
        }

        .sectionContent {
          width: 100%;
          min-width: 0;
          max-width: 100%;
          padding: 12px 16px 16px;
        }

        .sectionContent.full {
          padding: 0;
        }

        @media (max-width: 560px) {
          .sectionHeader {
            padding: 10px 10px 6px;
          }

          .sectionTitle {
            font-size: 18px;
          }

          .sectionSubtitle {
            font-size: 13px;
            margin-top: 4px;
          }

          .sectionNav {
            margin-top: 10px;
            gap: 8px;
            padding-bottom: 4px;
          }

          .navLink {
            font-size: 13px !important;
            padding: 9px 12px !important;
          }

          .navLinkPrimary {
            font-weight: 800 !important;
          }

          .sectionContent {
            padding: 10px;
          }

          .sectionContent.full {
            padding: 0;
          }
        }

        :global(*),
        :global(*::before),
        :global(*::after) {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}