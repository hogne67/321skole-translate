// components/SectionShell.tsx
import Link from "next/link";

type NavItem = { href: string; label: string };

export default function SectionShell({
  title,
  subtitle,
  items,
  children,
}: {
  title: string;
  subtitle?: string;
  items: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div>
      {/* Seksjonsheader */}
      <div style={{ padding: "14px 16px 8px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
        {subtitle ? <p style={{ margin: "6px 0 0", opacity: 0.75 }}>{subtitle}</p> : null}

        {/* Subnav (mobilvennlig horisontal) */}
        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 6,
            WebkitOverflowScrolling: "touch",
          }}
        >
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
              }}
            >
              {it.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Innhold */}
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
