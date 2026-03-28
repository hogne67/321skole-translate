// components/SectionShell.tsx
"use client";

import Link from "next/link";
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

  const toolsItem = items.find((it) => isToolsItem(it.href));
  const navItems = items;

  return (
    <div style={{ width: "100%" }}>
      {!hideHeader && (
        <div className="sectionHeader">
          <div className="sectionHeaderTop">
            <div className="sectionTitleWrap">
              <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
              {subtitle ? (
                <p style={{ margin: "6px 0 0", opacity: 0.75 }}>{subtitle}</p>
              ) : null}
            </div>
          </div>

          {!hideNav && (
            <div className="sectionNav">
              {navItems.map((it) => {
                const isTools = isToolsItem(it.href);
                const isActive = isItemActive(it.href);

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
                    className={isTools ? "navLink navLinkTools" : "navLink"}
                    style={{
                      textDecoration: "none",
                      borderRadius: 999,
                      padding: "8px 14px",
                      whiteSpace: "nowrap",
                      fontSize: 14,
                      fontWeight: 600,
                      display: "inline-block",
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

      <div
        className={`sectionContent ${fullWidth ? "full" : ""} ${
          toolsItem && !hideNav ? "hasMobileCreate" : ""
        }`}
      >
        {children}
      </div>

      {!hideNav && toolsItem ? (
        <div className="mobileCreateWrap" aria-hidden={false}>
          <Link
            href={withLocale(toolsItem.href)}
            style={{
              pointerEvents: "auto",
              margin: "0 auto",
              width: "fit-content",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              textDecoration: "none",
              borderRadius: 999,
              padding: "12px 18px",
              fontSize: 15,
              fontWeight: 700,
              color: "#1f7a1f",
              background: "#deebde",
              border: "1px solid #81beb3",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.14)",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            <span>Create</span>
          </Link>
        </div>
      ) : null}

      <style jsx>{`
        .sectionHeader {
          padding: 14px 16px 8px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
          background: #fff;
        }

        .sectionHeaderTop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .sectionTitleWrap {
          min-width: 0;
        }

        .sectionNav {
          margin-top: 12px;
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 6px;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }

        .sectionNav::-webkit-scrollbar {
          display: none;
        }

        .navLink {
          flex: 0 0 auto;
        }

        .sectionContent 

        .sectionContent.full {
          padding: 0;
        }

        .mobileCreateWrap {
          display: none;
        }

        @media (max-width: 560px) {
          .sectionHeader {
            padding: 12px 10px 6px;
          }

          .sectionContent {
            padding: 10px;
          }

          .sectionContent.full {
            padding: 0;
          }

          .sectionContent.hasMobileCreate {
            padding-bottom: 88px;
          }

          .navLinkTools {
            display: none !important;
          }

          .mobileCreateWrap {
            display: block;
            position: fixed;
            left: 0;
            right: 0;
            bottom: max(12px, env(safe-area-inset-bottom));
            z-index: 40;
            pointer-events: none;
          }
        }
      `}</style>
    </div>
  );
}