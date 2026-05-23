"use client";

export type AdminTone = "blue" | "green" | "amber" | "slate";

export function adminToneStyles(tone: AdminTone = "slate") {
  if (tone === "blue") {
    return {
      border: "#bfdbfe",
      bg: "#eff6ff",
      color: "#1d4ed8",
    };
  }

  if (tone === "green") {
    return {
      border: "#bbf7d0",
      bg: "#f0fdf4",
      color: "#15803d",
    };
  }

  if (tone === "amber") {
    return {
      border: "#fde68a",
      bg: "#fffbeb",
      color: "#b45309",
    };
  }

  return {
    border: "#e2e8f0",
    bg: "#f8fafc",
    color: "#475569",
  };
}

export default function AdminStatusBadge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: AdminTone;
}) {
  const styles = adminToneStyles(tone);

  return (
    <span
      className="adminStatusBadge"
      style={{
        background: styles.bg,
        borderColor: styles.border,
        color: styles.color,
      }}
    >
      {children}

      <style jsx>{`
        .adminStatusBadge {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 5px 9px;
          border: 1px solid;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.2;
          white-space: nowrap;
        }
      `}</style>
    </span>
  );
}
