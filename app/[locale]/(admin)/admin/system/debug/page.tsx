"use client";

import AdminSection from "@/components/admin/AdminSection";
import { useUserProfile } from "@/lib/useUserProfile";

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="infoRow">
      <div className="infoLabel">{label}</div>
      <div className="infoValue">{value}</div>
    </div>
  );
}

export default function AdminSystemDebugPage() {
  const { user, profile, loading } = useUserProfile();

  if (loading) {
    return <div style={{ opacity: 0.72 }}>Loading technical info...</div>;
  }

  return (
    <div className="debugPage">
      <AdminSection
        eyebrow="System"
        title="Debug"
        description="Technical admin and profile data is collected here so the main dashboard can stay focused and clean."
      />

      <AdminSection title="Signed-in admin">
        <div className="infoTable">
          <InfoRow label="Signed in" value={user ? "Yes" : "No"} />
          <InfoRow label="UID" value={user?.uid ?? "-"} />
          <InfoRow label="Role" value={String(profile?.role ?? "-")} />
          <InfoRow label="Admin flag" value={String(profile?.roles?.admin ?? false)} />
          <InfoRow label="Teacher flag" value={String(profile?.roles?.teacher ?? false)} />
          <InfoRow label="Admin level" value={String(profile?.adminLevel ?? "-")} />
          <InfoRow label="Display name" value={String(profile?.displayName ?? "-")} />
          <InfoRow label="Email" value={String(profile?.email ?? user?.email ?? "-")} />
          <InfoRow label="Plan" value={String(profile?.plan ?? "-")} />
          <InfoRow
            label="Institution"
            value={String(profile?.institutionType ?? "-")}
          />
          <InfoRow
            label="Municipality"
            value={String(profile?.municipality ?? profile?.org?.municipality ?? "-")}
          />
        </div>
      </AdminSection>

      <style jsx>{`
        .debugPage {
          display: grid;
          gap: var(--admin-gap, 16px);
        }

        .infoTable {
          border-top: 1px solid var(--admin-border, #e5e7eb);
        }

        .infoRow {
          display: grid;
          grid-template-columns: minmax(150px, 220px) minmax(0, 1fr);
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid var(--admin-border, #e5e7eb);
        }

        .infoLabel {
          color: var(--admin-muted, #6b7280);
          font-weight: 800;
        }

        .infoValue {
          min-width: 0;
          overflow-wrap: anywhere;
          color: var(--admin-text, #111827);
        }

        @media (max-width: 640px) {
          .infoRow {
            grid-template-columns: 1fr;
            gap: 3px;
          }
        }
      `}</style>
    </div>
  );
}
