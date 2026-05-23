"use client";

import Link from "next/link";
import AdminCard from "@/components/admin/AdminCard";

export default function AdminSection({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <AdminCard className="adminSectionCard">
      <div className="sectionHeader">
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>

        {actionHref && actionLabel ? (
          <Link href={actionHref} className="adminButton">
            {actionLabel}
          </Link>
        ) : null}
      </div>

      {children ? <div className="sectionBody">{children}</div> : null}

      <style jsx>{`
        :global(.adminSectionCard) {
          padding: 18px;
        }

        .sectionHeader {
          display: flex;
          justify-content: space-between;
          gap: var(--admin-gap, 16px);
          align-items: center;
        }

        .sectionBody {
          margin-top: var(--admin-gap, 16px);
        }

        .eyebrow {
          font-size: 12px;
          line-height: 1.2;
          color: var(--admin-muted, #6b7280);
          font-weight: 800;
          text-transform: uppercase;
        }

        h2 {
          margin: 4px 0 0;
          font-size: 25px;
          line-height: 1.2;
        }

        p {
          margin: 8px 0 0;
          color: var(--admin-muted, #6b7280);
          line-height: 1.55;
        }

        .adminButton {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 36px;
          padding: 8px 11px;
          border: 1px solid var(--admin-border-strong, #d1d5db);
          border-radius: var(--admin-radius, 10px);
          background: var(--admin-surface, #ffffff);
          color: var(--admin-text, #111827);
          text-decoration: none;
          font-size: 13px;
          font-weight: 800;
          white-space: nowrap;
          box-shadow: var(--admin-shadow, 0 1px 2px rgba(15, 23, 42, 0.05));
          transition:
            background 140ms ease,
            border-color 140ms ease,
            box-shadow 140ms ease;
        }

        .adminButton:hover {
          background: var(--admin-surface-subtle, #f8fafc);
          border-color: #9ca3af;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
        }

        @media (max-width: 760px) {
          .sectionHeader {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </AdminCard>
  );
}
