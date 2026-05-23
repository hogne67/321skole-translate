"use client";

import Link from "next/link";
import { getAuth, getIdToken } from "firebase/auth";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import AdminCard from "@/components/admin/AdminCard";
import AdminSection from "@/components/admin/AdminSection";
import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminStatusBadge from "@/components/admin/AdminStatusBadge";

type SchoolRow = {
  id: string;
  name?: string | null;
  contactEmail?: string | null;
  planKey?: string | null;
  billingType?: string | null;
  status?: string | null;
  teacherSeatLimit?: number | null;
  activeTeacherCount?: number | null;
  createdAt?: string | null;
};

type SchoolsResponse = {
  ok?: boolean;
  error?: string;
  schools?: SchoolRow[];
};

export default function AdminSchoolsPage() {
  const locale = useLocale();
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  async function loadSchools() {
    setLoading(true);
    setError("");

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in");

      const token = await getIdToken(user, true);
      const response = await fetch("/api/admin/schools", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await response.json().catch(() => ({}))) as SchoolsResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Could not load schools (${response.status})`);
      }

      setSchools(data.schools ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load schools");
      setSchools([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSchools();
  }, []);

  const activeSchools = schools.filter((school) => school.status === "active").length;
  const totalSeats = schools.reduce((sum, school) => sum + (school.teacherSeatLimit ?? 0), 0);
  const usedSeats = schools.reduce((sum, school) => sum + (school.activeTeacherCount ?? 0), 0);
  const fullSchools = schools.filter((school) => {
    const limit = school.teacherSeatLimit ?? 0;
    return limit > 0 && (school.activeTeacherCount ?? 0) >= limit;
  }).length;
  const almostFullSchools = schools.filter((school) => {
    const limit = school.teacherSeatLimit ?? 0;
    const used = school.activeTeacherCount ?? 0;
    return limit > 0 && used < limit && limit - used <= 1;
  }).length;
  const filteredSchools = useMemo(() => {
    const q = search.trim().toLowerCase();

    return schools.filter((school) => {
      const matchesStatus = statusFilter === "all" || school.status === statusFilter;
      const matchesSearch =
        !q ||
        [
          school.name,
          school.contactEmail,
          school.planKey,
          school.billingType,
          school.status,
          school.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [schools, search, statusFilter]);

  return (
    <div className="schoolsPage">
      <AdminSection
        eyebrow="Platform"
        title="Schools"
        description="Create and monitor school licenses for 321school customers."
        actionHref={`/${locale}/admin/schools/new`}
        actionLabel="New school"
      />

      {error ? (
        <AdminCard className="messageCard">
          <strong>Error:</strong> {error}
        </AdminCard>
      ) : null}

      <section className="statsGrid" aria-label="School license summary">
        <AdminStatCard
          title="Schools"
          value={loading ? "..." : String(schools.length)}
          text="Total schools registered."
          tone="blue"
        />
        <AdminStatCard
          title="Active"
          value={loading ? "..." : String(activeSchools)}
          text="Schools with active status."
          tone="green"
        />
        <AdminStatCard
          title="Teacher seats"
          value={loading ? "..." : `${usedSeats} / ${totalSeats}`}
          text="Active teachers against available seats."
          tone="amber"
        />
        <AdminStatCard
          title="Needs attention"
          value={loading ? "..." : String(fullSchools + almostFullSchools)}
          text={`${fullSchools} full, ${almostFullSchools} almost full.`}
          tone={fullSchools > 0 ? "amber" : "blue"}
        />
      </section>

      <AdminCard className="toolbarCard">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search school, contact, plan..."
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past due</option>
          <option value="inactive">Inactive</option>
          <option value="canceled">Canceled</option>
        </select>
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setStatusFilter("all");
          }}
        >
          Reset
        </button>
        <span>
          Showing <b>{filteredSchools.length}</b> of <b>{schools.length}</b>
        </span>
      </AdminCard>

      <AdminSection title="School list">
        {loading ? <div className="muted">Loading schools...</div> : null}

        {!loading && filteredSchools.length === 0 ? (
          <div className="muted">
            No schools found. Create a new school when a customer is ready for a license, or reset
            the filters.
          </div>
        ) : null}

        {!loading && filteredSchools.length > 0 ? (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>School</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Billing</th>
                  <th>Teacher seats</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchools.map((school) => {
                  const seatLimit = school.teacherSeatLimit ?? 0;
                  const seatUsed = school.activeTeacherCount ?? 0;
                  const seatPercent =
                    seatLimit > 0 ? Math.min(Math.round((seatUsed / seatLimit) * 100), 100) : 0;
                  const seatTone =
                    seatLimit > 0 && seatUsed >= seatLimit
                      ? "full"
                      : seatLimit > 0 && seatLimit - seatUsed <= 1
                        ? "almost"
                        : "ok";

                  return (
                  <tr key={school.id}>
                    <td>
                      <Link href={`/${locale}/admin/schools/${school.id}`} className="schoolLink">
                        {school.name || school.id}
                      </Link>
                      <div className="subText">{school.contactEmail || school.id}</div>
                    </td>
                    <td>
                      <AdminStatusBadge tone={school.status === "active" ? "green" : "amber"}>
                        {school.status || "-"}
                      </AdminStatusBadge>
                    </td>
                    <td>{school.planKey || "-"}</td>
                    <td>{school.billingType || "-"}</td>
                    <td>
                      <div className="seatCell">
                        <strong>
                          {seatUsed} / {seatLimit}
                        </strong>
                        <div className="seatTrack" aria-hidden="true">
                          <div
                            className={`seatFill ${seatTone}`}
                            style={{ width: `${seatPercent}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>{formatDate(school.createdAt)}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminSection>

      <style jsx>{`
        .schoolsPage {
          display: grid;
          gap: var(--admin-gap, 16px);
        }

        :global(.messageCard) {
          padding: 14px;
          border-color: #fecaca;
          background: #fef2f2;
          color: #991b1b;
        }

        .statsGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: var(--admin-gap, 16px);
        }

        :global(.toolbarCard) {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          padding: 14px;
        }

        :global(.toolbarCard input),
        :global(.toolbarCard select) {
          min-height: 38px;
          border: 1px solid var(--admin-border-strong, #d1d5db);
          border-radius: var(--admin-radius, 10px);
          padding: 8px 10px;
          background: #ffffff;
          color: var(--admin-text, #111827);
          font: inherit;
        }

        :global(.toolbarCard input) {
          flex: 1 1 260px;
          min-width: 0;
        }

        :global(.toolbarCard button) {
          min-height: 38px;
          border: 1px solid var(--admin-border-strong, #d1d5db);
          border-radius: var(--admin-radius, 10px);
          padding: 8px 12px;
          background: #ffffff;
          color: var(--admin-text, #111827);
          font-weight: 800;
          cursor: pointer;
        }

        :global(.toolbarCard span) {
          color: var(--admin-muted, #6b7280);
          font-size: 13px;
        }

        .muted,
        .subText {
          color: var(--admin-muted, #6b7280);
        }

        .tableWrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        th,
        td {
          padding: 11px 10px;
          border-bottom: 1px solid var(--admin-border, #e5e7eb);
          text-align: left;
          vertical-align: top;
        }

        th {
          color: var(--admin-muted, #6b7280);
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .schoolLink {
          color: var(--admin-text, #111827);
          font-weight: 900;
          text-decoration: none;
        }

        .schoolLink:hover {
          color: #2563eb;
        }

        .subText {
          margin-top: 3px;
          font-size: 12px;
        }

        .seatCell {
          display: grid;
          gap: 6px;
          min-width: 110px;
        }

        .seatTrack {
          height: 7px;
          overflow: hidden;
          border-radius: 999px;
          background: #e5e7eb;
        }

        .seatFill {
          height: 100%;
          border-radius: 999px;
          background: #2563eb;
        }

        .seatFill.ok {
          background: #16a34a;
        }

        .seatFill.almost {
          background: #d97706;
        }

        .seatFill.full {
          background: #dc2626;
        }
      `}</style>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
