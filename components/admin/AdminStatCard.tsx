"use client";

import AdminCard from "@/components/admin/AdminCard";
import AdminStatusBadge, { type AdminTone } from "@/components/admin/AdminStatusBadge";

export default function AdminStatCard({
  title,
  value,
  text,
  tone = "slate",
}: {
  title: string;
  value: string;
  text: string;
  tone?: AdminTone;
}) {
  return (
    <AdminCard className="adminStatCard">
      <AdminStatusBadge tone={tone}>{title}</AdminStatusBadge>
      <div className="statValue">{value}</div>
      <p>{text}</p>

      <style jsx>{`
        :global(.adminStatCard) {
          padding: 16px;
        }

        .statValue {
          margin-top: 14px;
          font-size: 24px;
          line-height: 1.1;
          font-weight: 900;
        }

        p {
          margin: 8px 0 0;
          color: var(--admin-muted, #6b7280);
          line-height: 1.55;
        }
      `}</style>
    </AdminCard>
  );
}
