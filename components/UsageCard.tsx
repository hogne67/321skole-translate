// components/UsageCard.tsx
"use client";

import Link from "next/link";
import { useLocale } from "next-intl";

type Props = {
  title: string;
  used: number;
  limit: number;
  upgradeHref?: string;
  showUpgrade?: boolean;
};

const UNLIMITED_THRESHOLD = 999999;

export default function UsageCard({
  title,
  used,
  limit,
  upgradeHref,
  showUpgrade = true,
}: Props) {
  const locale = useLocale();

  const safeUsed = typeof used === "number" && Number.isFinite(used) ? used : 0;
  const safeLimit = typeof limit === "number" && Number.isFinite(limit) ? limit : 0;

  const isUnlimited = safeLimit >= UNLIMITED_THRESHOLD;
  const effectiveLimit = isUnlimited ? safeUsed : Math.max(0, safeLimit);

  const percentage =
    !isUnlimited && effectiveLimit > 0
      ? Math.min(100, (safeUsed / effectiveLimit) * 100)
      : 0;

  const remaining = isUnlimited ? null : Math.max(0, effectiveLimit - safeUsed);

  const isNearLimit = !isUnlimited && percentage >= 80 && percentage < 100;
  const isLimitReached = !isUnlimited && effectiveLimit > 0 && safeUsed >= effectiveLimit;

  let barColor = "#10b981";
  if (isLimitReached) barColor = "#ef4444";
  else if (isNearLimit) barColor = "#f59e0b";

  const pricingHref = upgradeHref ?? `/${locale}/pricing`;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        background: "#ffffff",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>

      {isUnlimited ? (
        <div style={{ fontSize: 14, marginBottom: 8 }}>Ubegrenset</div>
      ) : (
        <div style={{ fontSize: 14, marginBottom: 8 }}>
          {safeUsed} / {effectiveLimit} brukt
          <span style={{ color: "#64748b" }}> · {remaining} igjen</span>
        </div>
      )}

      {!isUnlimited ? (
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
              transition: "width 180ms ease",
            }}
          />
        </div>
      ) : (
        <div
          style={{
            height: 8,
            background: "#ecfdf5",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "#10b981",
            }}
          />
        </div>
      )}

      {isNearLimit && !isLimitReached && showUpgrade && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, color: "#92400e" }}>
            Du nærmer deg grensen din.
          </div>

          <Link
            href={pricingHref}
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

      {isLimitReached && showUpgrade && (
        <div style={{ marginTop: 10 }}>
          <div style={{ color: "#ef4444", fontSize: 13 }}>
            Du har nådd grensen din.
          </div>

          <Link
            href={pricingHref}
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