"use client";

import { useEffect, useState } from "react";
import { collection, getCountFromServer, query, Timestamp, where } from "firebase/firestore";
import AdminCard from "@/components/admin/AdminCard";
import AdminSection from "@/components/admin/AdminSection";
import AdminStatCard from "@/components/admin/AdminStatCard";
import { adminToneStyles, type AdminTone } from "@/components/admin/AdminStatusBadge";
import { db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { adminLabel } from "@/lib/adminAccess";

type AdminSchoolRow = {
  status?: string | null;
  teacherSeatLimit?: number | null;
  activeTeacherCount?: number | null;
};

type AdminSchoolsResponse = {
  ok?: boolean;
  schools?: AdminSchoolRow[];
};

type AdminPartnersResponse = {
  ok?: boolean;
  activePartners?: Array<{
    partnerFollowUpStatus?: string;
    unreviewedPartnerReplyCount?: number;
  }>;
  stats?: {
    unreviewedPartnerReplies?: number;
    needsFollowUp?: number;
    active?: number;
  };
};

type AdminSupportResponse = {
  ok?: boolean;
  stats?: {
    new?: number;
    open?: number;
  };
};

function StatusItem({
  label,
  value,
  tone = "green",
}: {
  label: string;
  value: string;
  tone?: AdminTone;
}) {
  const styles = adminToneStyles(tone);

  return (
    <div className="statusItem">
      <span
        className="statusDot"
        style={{
          background: styles.color,
        }}
      />
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, profile, loading } = useUserProfile();
  const [dashboardStats, setDashboardStats] = useState({
    analyticsLastDay: null as number | null,
    analyticsLastWeek: null as number | null,
    usersTotal: null as number | null,
    newUsersLastWeek: null as number | null,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [signals, setSignals] = useState({
    activeSchools: null as number | null,
    schoolsNeedAttention: null as number | null,
    activePartners: null as number | null,
    partnerRepliesNeedReview: null as number | null,
    partnersNeedFollowUp: null as number | null,
    newSupportTickets: null as number | null,
    openSupportTickets: null as number | null,
  });

  const displayName =
    typeof profile?.displayName === "string" && profile.displayName.trim()
      ? profile.displayName.trim()
      : user?.email ?? "admin";

  const levelLabel = adminLabel(profile?.adminLevel);
  const adminIsActive =
    profile?.disabled !== true &&
    (profile?.roles?.admin === true || profile?.role === "admin");

  useEffect(() => {
    let alive = true;

    async function loadDashboardStats() {
      if (!db) {
        setStatsLoading(false);
        return;
      }

      setStatsLoading(true);

      try {
        const now = Date.now();
        const dayAgo = Timestamp.fromDate(new Date(now - 24 * 60 * 60 * 1000));
        const weekAgo = Timestamp.fromDate(new Date(now - 7 * 24 * 60 * 60 * 1000));
        const analyticsRef = collection(db, "analyticsEvents");
        const usersRef = collection(db, "users");

        const [
          analyticsLastDaySnap,
          analyticsLastWeekSnap,
          usersTotalSnap,
          newUsersLastWeekSnap,
        ] = await Promise.all([
          getCountFromServer(query(analyticsRef, where("createdAt", ">=", dayAgo))),
          getCountFromServer(query(analyticsRef, where("createdAt", ">=", weekAgo))),
          getCountFromServer(usersRef),
          getCountFromServer(query(usersRef, where("createdAt", ">=", weekAgo))),
        ]);

        if (!alive) return;

        setDashboardStats({
          analyticsLastDay: analyticsLastDaySnap.data().count,
          analyticsLastWeek: analyticsLastWeekSnap.data().count,
          usersTotal: usersTotalSnap.data().count,
          newUsersLastWeek: newUsersLastWeekSnap.data().count,
        });
      } catch (error) {
        console.error("Admin dashboard stats failed", error);
      } finally {
        if (alive) setStatsLoading(false);
      }
    }

    void loadDashboardStats();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadOperationalSignals() {
      if (!user || user.isAnonymous) {
        setSignalsLoading(false);
        return;
      }

      setSignalsLoading(true);

      try {
        const token = await user.getIdToken();
        const [schoolsResponse, partnersResponse, supportResponse] = await Promise.all([
          fetch("/api/admin/schools", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/admin/partners", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/admin/support?status=new", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const schoolsData = (await schoolsResponse.json().catch(() => ({}))) as AdminSchoolsResponse;
        const partnersData = (await partnersResponse.json().catch(() => ({}))) as AdminPartnersResponse;
        const supportData = (await supportResponse.json().catch(() => ({}))) as AdminSupportResponse;

        if (!alive) return;

        const schools = Array.isArray(schoolsData.schools) ? schoolsData.schools : [];
        const schoolsNeedAttention = schools.filter((school) => {
          const limit = school.teacherSeatLimit ?? 0;
          const used = school.activeTeacherCount ?? 0;
          return school.status !== "active" || (limit > 0 && limit - used <= 1);
        }).length;

        setSignals({
          activeSchools: schools.filter((school) => school.status === "active").length,
          schoolsNeedAttention,
          activePartners:
            typeof partnersData.stats?.active === "number"
              ? partnersData.stats.active
              : partnersData.activePartners?.length ?? 0,
          partnerRepliesNeedReview: partnersData.stats?.unreviewedPartnerReplies ?? 0,
          partnersNeedFollowUp:
            typeof partnersData.stats?.needsFollowUp === "number"
              ? partnersData.stats.needsFollowUp
              : (partnersData.activePartners ?? []).filter(
                  (partner) => partner.partnerFollowUpStatus === "needs_follow_up"
                ).length,
          newSupportTickets: supportData.stats?.new ?? 0,
          openSupportTickets: supportData.stats?.open ?? 0,
        });
      } catch (error) {
        console.error("Admin operational signals failed", error);
      } finally {
        if (alive) setSignalsLoading(false);
      }
    }

    void loadOperationalSignals();

    return () => {
      alive = false;
    };
  }, [user]);

  function statValue(value: number | null) {
    if (statsLoading) return "...";
    return typeof value === "number" ? String(value) : "-";
  }

  function signalValue(value: number | null) {
    if (signalsLoading) return "...";
    return typeof value === "number" ? String(value) : "-";
  }

  return (
    <div className="dashboard">
      <AdminCard className="hero">
        <div>
          <div className="eyebrow">Overview</div>
          <h2>Welcome, {loading ? "admin" : displayName}</h2>
          <p>
            A quieter admin dashboard for following activity, users, operations,
            and platform health without duplicating the navigation.
          </p>
        </div>

        <div className="heroPanel">
          <span>Role</span>
          <strong>{levelLabel}</strong>
          <small>{adminIsActive ? "Admin access active" : "Admin access needs review"}</small>
        </div>
      </AdminCard>

      <AdminSection eyebrow="Analytics" title="Recent activity">
        <section className="statsRow" aria-label="Analytics activity">
          <AdminStatCard
            title="Last 24 hours"
            value={statValue(dashboardStats.analyticsLastDay)}
            text="Analytics events recorded in the last day."
            tone="blue"
          />
          <AdminStatCard
            title="Last 7 days"
            value={statValue(dashboardStats.analyticsLastWeek)}
            text="Analytics events recorded in the last week."
            tone="blue"
          />
        </section>
      </AdminSection>

      <AdminSection eyebrow="Users" title="User growth">
        <section className="statsRow" aria-label="User growth">
          <AdminStatCard
            title="Total users"
            value={statValue(dashboardStats.usersTotal)}
            text="All user profiles currently registered."
            tone="green"
          />
          <AdminStatCard
            title="New this week"
            value={statValue(dashboardStats.newUsersLastWeek)}
            text="Users created during the last 7 days."
            tone="green"
          />
        </section>
      </AdminSection>

      <AdminSection eyebrow="Operations" title="Schools and partners">
        <section className="statsRow" aria-label="Schools and partner signals">
          <AdminStatCard
            title="Active schools"
            value={signalValue(signals.activeSchools)}
            text="Schools with active license status."
            tone="green"
          />
          <AdminStatCard
            title="School attention"
            value={signalValue(signals.schoolsNeedAttention)}
            text="Schools not active, full, or almost full."
            tone={(signals.schoolsNeedAttention ?? 0) > 0 ? "amber" : "blue"}
          />
          <AdminStatCard
            title="Active partners"
            value={signalValue(signals.activePartners)}
            text="Partners with active access."
            tone="blue"
          />
          <AdminStatCard
            title="Partner follow-up"
            value={signalValue(signals.partnersNeedFollowUp)}
            text="Partners marked as needing follow-up."
            tone={(signals.partnersNeedFollowUp ?? 0) > 0 ? "amber" : "green"}
          />
          <AdminStatCard
            title="Partner replies"
            value={signalValue(signals.partnerRepliesNeedReview)}
            text="Partner replies waiting for review."
            tone={(signals.partnerRepliesNeedReview ?? 0) > 0 ? "amber" : "green"}
          />
          <AdminStatCard
            title="Support tickets"
            value={signalValue(signals.newSupportTickets)}
            text="New user reports from the in-app help button."
            tone={(signals.newSupportTickets ?? 0) > 0 ? "amber" : "green"}
          />
        </section>
      </AdminSection>

      <AdminSection eyebrow="System status" title="Operational check">
        <div className="statusGrid">
          <StatusItem
            label="Admin area"
            value={adminIsActive ? "Access active" : "Needs review"}
            tone={adminIsActive ? "green" : "amber"}
          />
          <StatusItem label="Moderation" value="Workflow available" tone="blue" />
          <StatusItem
            label="Schools"
            value={
              (signals.schoolsNeedAttention ?? 0) > 0
                ? "Some licenses need attention"
                : "License overview ready"
            }
            tone={(signals.schoolsNeedAttention ?? 0) > 0 ? "amber" : "green"}
          />
          <StatusItem
            label="Partners"
            value={
              (signals.partnerRepliesNeedReview ?? 0) > 0
                ? "Replies need review"
                : "Partner workflow ready"
            }
            tone={(signals.partnerRepliesNeedReview ?? 0) > 0 ? "amber" : "green"}
          />
          <StatusItem
            label="Support"
            value={
              (signals.newSupportTickets ?? 0) > 0
                ? "New user reports need review"
                : "No new user reports"
            }
            tone={(signals.newSupportTickets ?? 0) > 0 ? "amber" : "green"}
          />
          <StatusItem label="Billing" value="Resync tool available" tone="slate" />
          <StatusItem label="Debug" value="Technical info moved off the dashboard" tone="green" />
        </div>
      </AdminSection>

      <style jsx>{`
        .dashboard {
          display: grid;
          gap: var(--admin-gap, 16px);
        }

        :global(.hero) {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 220px;
          gap: var(--admin-gap, 16px);
          padding: 20px;
          align-items: center;
        }

        .eyebrow {
          font-size: 12px;
          line-height: 1.2;
          color: var(--admin-muted, #6b728084);
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

        .heroPanel {
          border: 1px solid #dbeafe;
          border-radius: var(--admin-radius, 10px);
          background: #eff6ff;
          padding: 16px;
          display: grid;
          gap: 4px;
        }

        .heroPanel span,
        .heroPanel small {
          color: #7d8cb4;
          font-size: 13px;
        }

        .heroPanel strong {
          font-size: 22px;
          line-height: 1.2;
        }

        .overviewGrid,
        .statsRow,
        .statusGrid {
          display: grid;
          gap: var(--admin-gap, 16px);
        }

        .overviewGrid {
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }

        .statsRow {
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        .statusGrid {
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        .statusItem {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 12px;
          border: 1px solid var(--admin-border, #e5e7eb);
          border-radius: var(--admin-radius, 10px);
          background: var(--admin-surface-subtle, #f8fafc);
        }

        .statusDot {
          flex: 0 0 auto;
          width: 10px;
          height: 10px;
          margin-top: 5px;
          border-radius: 999px;
        }

        .statusItem strong,
        .statusItem span {
          display: block;
        }

        .statusItem span {
          margin-top: 2px;
          color: var(--admin-muted, #6b7280);
          font-size: 13px;
          line-height: 1.4;
        }

        @media (max-width: 760px) {
          :global(.hero) {
            grid-template-columns: 1fr;
            padding: 18px;
          }
        }
      `}</style>
    </div>
  );
}
