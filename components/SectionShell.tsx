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
    if (seg === "en" || seg === "no" || seg === "nb" || seg === "pt") return href;

    if (href === "/") return `/${locale}`;
    return `/${locale}${href}`;
  }

  const navItems = useMemo(() => {
    const tools = items.filter((it) => isToolsItem(it.href));
    const rest = items.filter((it) => !isToolsItem(it.href));
    return [...tools, ...rest];
  }, [items]);

  const primaryItem = useMemo(() => {
    return (
      navItems.find((it) => it.href.includes("/producer")) ??
      navItems.find((it) => it.href.includes("/texts/new")) ??
      navItems.find((it) => it.href.includes("/new")) ??
      null
    );
  }, [navItems]);

  return (
    <div className="shellRoot">
      {!hideHeader && (
        <div className="sectionHeader">
          <div className="sectionTitleRow">
            <div className="sectionTitleWrap">
              <h1 className="sectionTitle">{title}</h1>
              {subtitle ? <p className="sectionSubtitle">{subtitle}</p> : null}
            </div>

            {primaryItem && !hideNav ? (
              <Link href={withLocale(primaryItem.href)} className="mobilePrimaryBtn">
                {primaryItem.label}
              </Link>
            ) : null}
          </div>

          {!hideNav && (
            <div className="sectionNav" aria-label="Section navigation">
              {navItems.map((it, index) => {
                const isTools = isToolsItem(it.href);
                const isActive = isItemActive(it.href);
                const isPrimary = index === 0 && isTools;
                const isMobilePrimary = primaryItem?.href === it.href;

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

                const boxShadow = isTools ? "0 1px 2px rgba(0,0,0,0.10)" : "none";

                return (
                  <Link
                    key={it.href}
                    href={withLocale(it.href)}
                    className={`navLink ${isTools ? "navLinkTools" : ""} ${isPrimary ? "navLinkPrimary" : ""
                      } ${isMobilePrimary ? "hideOnMobile" : ""}`}
                    style={{
                      textDecoration: "none",
                      borderRadius: 999,
                      padding: "8px 14px",
                      whiteSpace: "nowrap",
                      fontSize: 14,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
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

      <div className={`sectionContent ${fullWidth ? "full" : ""}`}>{children}</div>

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

        .sectionTitleRow {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          min-width: 0;
          max-width: 100%;
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

        .mobilePrimaryBtn {
          display: none;
        }

        .sectionNav {
          margin-top: 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          min-width: 0;
          max-width: 100%;
          overflow: visible;
          padding-bottom: 6px;
        }

        .navLink {
          flex: 0 1 auto;
          max-width: 100%;
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

          .mobilePrimaryBtn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            padding: 7px 10px;
            border-radius: 999px;
            background: #deebde;
            border: 1px solid #81beb3;
            color: #1f7a1f;
            font-size: 12px;
            font-weight: 800;
            line-height: 1.2;
            text-decoration: none;
            white-space: nowrap;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
          }

          .sectionNav {
            margin-top: 10px;
            gap: 6px;
            padding-bottom: 4px;
          }

          .navLink {
            font-size: 12px !important;
            padding: 7px 10px !important;
          }

          .navLinkPrimary {
            font-weight: 800 !important;
          }

          .hideOnMobile {
            display: none !important;
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