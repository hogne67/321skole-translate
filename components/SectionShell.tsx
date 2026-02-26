// components/SectionShell.tsx
import Link from "next/link";

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
  fullWidth?: boolean; // ✅ content edge-to-edge
  hideHeader?: boolean; // ✅ hide header + divider
  hideNav?: boolean; // ✅ hide pill-nav row
}) {
  return (
    <div style={{ width: "100%" }}>
      {/* Seksjonsheader */}
      {!hideHeader && (
        <div className="sectionHeader">
          <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
          {subtitle ? <p style={{ margin: "6px 0 0", opacity: 0.75 }}>{subtitle}</p> : null}

          {/* Subnav (mobilvennlig horisontal) */}
          {!hideNav && (
            <div className="sectionNav">
              {items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  style={{
                    textDecoration: "none",
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 999,
                    padding: "8px 12px",
                    whiteSpace: "nowrap",
                    fontSize: 14,
                    display: "inline-block",
                  }}
                >
                  {it.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Innhold */}
      <div className={`sectionContent ${fullWidth ? "full" : ""}`}>{children}</div>

      <style jsx>{`
        .sectionHeader {
          padding: 14px 16px 8px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.08); /* ← den “tynne streken” */
        }

        .sectionNav {
          margin-top: 12px;
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 6px;
          -webkit-overflow-scrolling: touch;
        }

        .sectionContent {
          width: 100%;
          box-sizing: border-box;
          padding: 16px;
          overflow-x: hidden; /* ✅ stopper høyre-overflow fra layouten */
        }

        .sectionContent.full {
          padding: 0; /* ✅ edge-to-edge for producer */
        }

        @media (max-width: 560px) {
          .sectionHeader {
            padding: 12px 10px 6px; /* litt tight */
          }

          .sectionContent {
            padding: 10px; /* ✅ mindre “80%”-følelse i spaces på mobil */
          }

          .sectionContent.full {
            padding: 0;
          }
        }
      `}</style>
    </div>
  );
}