// components/UsageCard.tsx
"use client";

import Link from "next/link";
import { useLocale } from "next-intl";

type Props = {
  title: string;
  used: number;
  limit: number;
};

export default function UsageCard({ title, used, limit }: Props) {
  const locale = useLocale();

  const safeLimit = typeof limit === "number" && limit > 0 ? limit : 0;
  const safeUsed = typeof used === "number" ? used : 0;

  const percentage =
    safeLimit > 0 ? Math.min(100, (safeUsed / safeLimit) * 100) : 0;

  const isNearLimit = percentage >= 80 && percentage < 100;
  const isLimitReached = safeLimit > 0 && safeUsed >= safeLimit;

  let barColor = "#10b981"; // grønn
  if (isLimitReached) barColor = "#ef4444"; // rød
  else if (isNearLimit) barColor = "#f59e0b"; // gul

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        background: "#ffffff",
      }}
    >
      {/* Tittel */}
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>

      {/* Tall */}
      <div style={{ fontSize: 14, marginBottom: 8 }}>
        {safeUsed} / {safeLimit} brukt
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 8,
          background: "#f1f5f9",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            background: barColor,
          }}
        />
      </div>

      {/* 🟡 Nær grense */}
      {isNearLimit && !isLimitReached && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, color: "#92400e" }}>
            Du nærmer deg grensen din.
          </div>

          <Link
            href={`/${locale}/pricing`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 6,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
              color: "#111827",
              background: "#ffffff",
            }}
          >
            Se planer
          </Link>
        </div>
      )}

      {/* 🔴 Nådd grense */}
      {isLimitReached && (
        <div style={{ marginTop: 10 }}>
          <div style={{ color: "#ef4444", fontSize: 13 }}>
            Du har nådd grensen din.
          </div>

          <Link
            href={`/${locale}/pricing`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 8,
              background: "#10b981",
              color: "#ffffff",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Oppgrader
          </Link>
        </div>
      )}
    </div>
  );
}