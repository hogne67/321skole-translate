import Link from "next/link";

type DashboardShortcutRowProps = {
  title: string;
  text: string;
  href: string;
  actionLabel: string;
  tone?: "blue" | "teal";
};

export function DashboardShortcutRow({
  title,
  text,
  href,
  actionLabel,
  tone = "blue",
}: DashboardShortcutRowProps) {
  const accent =
    tone === "teal"
      ? {
          border: "rgba(15,118,110,0.28)",
          bg: "rgba(240,253,250,0.82)",
          dot: "#0f766e",
          button: "#0f766e",
        }
      : {
          border: "rgba(37,99,235,0.24)",
          bg: "rgba(239,246,255,0.82)",
          dot: "#2563eb",
          button: "#2563eb",
        };

  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        border: `1px solid ${accent.border}`,
        borderRadius: 12,
        background: accent.bg,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          minWidth: 0,
          flex: "1 1 360px",
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: accent.dot,
            flex: "0 0 auto",
          }}
        />
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              lineHeight: 1.25,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: 0,
            }}
          >
            {title}
          </h2>
          <p
            style={{
              margin: "3px 0 0",
              fontSize: 13,
              lineHeight: 1.35,
              color: "#475569",
            }}
          >
            {text}
          </p>
        </div>
      </div>

      <Link
        href={href}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 38,
          borderRadius: 8,
          padding: "8px 14px",
          fontSize: 14,
          fontWeight: 800,
          textDecoration: "none",
          background: accent.button,
          color: "#ffffff",
          boxShadow: "0 1px 2px rgba(15,23,42,0.10)",
          flex: "0 0 auto",
        }}
      >
        {actionLabel}
      </Link>
    </div>
  );
}
