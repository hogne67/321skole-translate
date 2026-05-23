"use client";

import Link from "next/link";
import { adminToneStyles, type AdminTone } from "@/components/admin/AdminStatusBadge";

export default function AdminActionCard({
  title,
  text,
  href,
  tone = "slate",
}: {
  title: string;
  text: string;
  href: string;
  tone?: AdminTone;
}) {
  const styles = adminToneStyles(tone);

  return (
    <Link className="adminActionCard" href={href}>
      <div
        className="actionMarker"
        style={{
          background: styles.bg,
          borderColor: styles.border,
          color: styles.color,
        }}
      >
        {title.slice(0, 1)}
      </div>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>

      <style jsx>{`
        .adminActionCard {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr);
          gap: 12px;
          padding: 14px;
          border: 1px solid var(--admin-border, #e5e7eb);
          border-radius: var(--admin-radius, 10px);
          color: inherit;
          text-decoration: none;
          background: var(--admin-surface, #ffffff);
          box-shadow: var(--admin-shadow, 0 1px 2px rgba(15, 23, 42, 0.05));
          transition:
            background 140ms ease,
            border-color 140ms ease,
            box-shadow 140ms ease;
        }

        .adminActionCard:hover {
          border-color: #bfdbfe;
          background: var(--admin-surface-subtle, #f8fafc);
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
        }

        .actionMarker {
          width: 42px;
          height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid;
          border-radius: var(--admin-radius, 10px);
          font-weight: 900;
        }

        h3 {
          margin: 0;
          font-size: 16px;
          line-height: 1.25;
        }

        p {
          margin: 4px 0 0;
          color: var(--admin-muted, #6b7280);
          font-size: 14px;
          line-height: 1.55;
        }
      `}</style>
    </Link>
  );
}
