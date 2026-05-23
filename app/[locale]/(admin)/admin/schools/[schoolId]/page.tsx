"use client";

import { getAuth, getIdToken } from "firebase/auth";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import AdminCard from "@/components/admin/AdminCard";
import AdminSection from "@/components/admin/AdminSection";
import AdminStatCard from "@/components/admin/AdminStatCard";

type SchoolDetail = {
  id?: string;
  name?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  planKey?: string | null;
  billingType?: string | null;
  status?: string | null;
  teacherSeatLimit?: number | null;
  activeTeacherCount?: number | null;
  createdByUid?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type SchoolMember = {
  id?: string;
  uid?: string | null;
  email?: string | null;
  displayName?: string | null;
  role?: string | null;
  status?: string | null;
  createdAt?: string | null;
  joinedAt?: string | null;
  disabledAt?: string | null;
};

type SchoolDetailResponse = {
  ok?: boolean;
  error?: string;
  schoolId?: string;
  school?: SchoolDetail;
  members?: SchoolMember[];
};

export default function AdminSchoolDetailPage() {
  const locale = useLocale();
  const params = useParams<{ schoolId?: string }>();
  const schoolId = useMemo(() => {
    const raw = params?.schoolId;
    return typeof raw === "string" ? raw : "";
  }, [params]);
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [memberFilter, setMemberFilter] = useState("all");
  const [editName, setEditName] = useState("");
  const [editContactName, setEditContactName] = useState("");
  const [editContactEmail, setEditContactEmail] = useState("");
  const [editBillingType, setEditBillingType] = useState<"manual" | "stripe">("manual");
  const [editPlanKey, setEditPlanKey] = useState<"school_5" | "school_10" | "school_25" | "custom">("school_5");
  const [editStatus, setEditStatus] = useState<"inactive" | "trialing" | "active" | "past_due" | "canceled">("active");
  const [editTeacherSeatLimit, setEditTeacherSeatLimit] = useState("1");

  useEffect(() => {
    let alive = true;

    async function loadSchool() {
      if (!schoolId) {
        setLoading(false);
        setError("Missing school ID");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const user = getAuth().currentUser;
        if (!user) throw new Error("Not signed in");

        const token = await getIdToken(user, true);
        const response = await fetch(`/api/admin/schools/${encodeURIComponent(schoolId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = (await response.json().catch(() => ({}))) as SchoolDetailResponse;

        if (!response.ok || !data.ok || !data.school) {
          throw new Error(data.error || `Could not load school (${response.status})`);
        }

        if (!alive) return;

        setSchool(data.school);
        setMembers(data.members ?? []);
        setEditName(data.school.name ?? "");
        setEditContactName(data.school.contactName ?? "");
        setEditContactEmail(data.school.contactEmail ?? "");
        setEditBillingType(data.school.billingType === "stripe" ? "stripe" : "manual");
        setEditPlanKey(
          data.school.planKey === "school_10" ||
            data.school.planKey === "school_25" ||
            data.school.planKey === "custom"
            ? data.school.planKey
            : "school_5"
        );
        setEditStatus(
          data.school.status === "inactive" ||
            data.school.status === "trialing" ||
            data.school.status === "past_due" ||
            data.school.status === "canceled"
            ? data.school.status
            : "active"
        );
        setEditTeacherSeatLimit(String(data.school.teacherSeatLimit ?? 1));
      } catch (err: unknown) {
        if (!alive) return;

        setError(err instanceof Error ? err.message : "Could not load school");
        setSchool(null);
        setMembers([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void loadSchool();

    return () => {
      alive = false;
    };
  }, [schoolId]);

  async function saveSchoolSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in");

      const token = await getIdToken(user, true);
      const response = await fetch(`/api/admin/schools/${encodeURIComponent(schoolId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editName,
          contactName: editContactName,
          contactEmail: editContactEmail,
          billingType: editBillingType,
          planKey: editPlanKey,
          status: editStatus,
          teacherSeatLimit: Number(editTeacherSeatLimit),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Could not update school (${response.status})`);
      }

      const nextTeacherSeatLimit = Number(editTeacherSeatLimit);
      setSchool((current) =>
        current
          ? {
              ...current,
              name: editName,
              contactName: editContactName || null,
              contactEmail: editContactEmail || null,
              billingType: editBillingType,
              planKey: editPlanKey,
              status: editStatus,
              teacherSeatLimit: Number.isFinite(nextTeacherSeatLimit) ? nextTeacherSeatLimit : current.teacherSeatLimit,
            }
          : current
      );
      setMessage("School settings saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update school");
    } finally {
      setSaving(false);
    }
  }

  const activeTeacherCount = school?.activeTeacherCount ?? 0;
  const teacherSeatLimit = school?.teacherSeatLimit ?? 0;
  const schoolAdmins = members.filter((member) => member.role === "school_admin");
  const activeTeachers = members.filter(
    (member) => member.role === "school_teacher" && member.status === "active"
  );
  const disabledMembers = members.filter((member) => member.status !== "active");
  const seatsRemaining = Math.max(teacherSeatLimit - activeTeacherCount, 0);
  const seatUsagePercent =
    teacherSeatLimit > 0 ? Math.min(Math.round((activeTeacherCount / teacherSeatLimit) * 100), 100) : 0;
  const isLicenseFull = teacherSeatLimit > 0 && activeTeacherCount >= teacherSeatLimit;
  const isAlmostFull = !isLicenseFull && teacherSeatLimit > 0 && seatsRemaining <= 1;
  const filteredMembers = members.filter((member) => {
    if (memberFilter === "all") return true;
    if (memberFilter === "active_teachers") {
      return member.role === "school_teacher" && member.status === "active";
    }
    if (memberFilter === "admins") return member.role === "school_admin";
    if (memberFilter === "disabled") return member.status !== "active";
    return true;
  });

  return (
    <div className="schoolDetailPage">
      <AdminSection
        eyebrow="Schools"
        title={school?.name || "School detail"}
        description="Review license status, seat usage, and school administrators."
        actionHref={`/${locale}/admin/schools`}
        actionLabel="Back to schools"
      />

      {error ? (
        <AdminCard className="messageCard">
          <strong>Error:</strong> {error}
        </AdminCard>
      ) : null}

      {message ? <AdminCard className="successCard">{message}</AdminCard> : null}

      {loading ? <AdminCard className="loadingCard">Loading school...</AdminCard> : null}

      {!loading && school ? (
        <>
          <section className="statsGrid" aria-label="School license summary">
            <AdminStatCard
              title="Status"
              value={school.status || "-"}
              text="Current license status."
              tone={school.status === "active" ? "green" : "amber"}
            />
            <AdminStatCard
              title="Plan"
              value={school.planKey || "-"}
              text={`Billing type: ${school.billingType || "-"}`}
              tone="blue"
            />
            <AdminStatCard
              title="Teacher seats"
              value={`${activeTeacherCount} / ${teacherSeatLimit}`}
              text="Active teachers against licensed seats."
              tone={isLicenseFull || isAlmostFull ? "amber" : "green"}
            />
            <AdminStatCard
              title="Seats left"
              value={String(seatsRemaining)}
              text={isLicenseFull ? "Teacher seat limit reached." : "Available teacher seats."}
              tone={isLicenseFull ? "amber" : "blue"}
            />
            <AdminStatCard
              title="Admins"
              value={String(schoolAdmins.length)}
              text="School administrators on this license."
              tone="slate"
            />
          </section>

          <AdminCard className={isLicenseFull ? "seatNotice danger" : isAlmostFull ? "seatNotice warning" : "seatNotice"}>
            <div className="seatNoticeHeader">
              <div>
                <strong>License usage</strong>
                <p>
                  {activeTeacherCount} of {teacherSeatLimit} teacher seats are currently in use.
                </p>
              </div>
              <b>{seatUsagePercent}%</b>
            </div>
            <div className="seatTrack" aria-hidden="true">
              <div
                className={isLicenseFull ? "seatFill full" : isAlmostFull ? "seatFill almost" : "seatFill ok"}
                style={{ width: `${seatUsagePercent}%` }}
              />
            </div>
            {isLicenseFull ? (
              <p className="seatHelp">This school has no free teacher seats. Increase seats or disable a teacher before more teachers can be added.</p>
            ) : isAlmostFull ? (
              <p className="seatHelp">This school is almost full. Consider increasing the teacher seat limit before more invitations are sent.</p>
            ) : (
              <p className="seatHelp">This license has available teacher capacity.</p>
            )}
          </AdminCard>

          <AdminSection title="License details">
            <div className="infoGrid">
              <InfoItem label="School ID" value={schoolId} />
              <InfoItem label="Contact name" value={school.contactName || "-"} />
              <InfoItem label="Contact email" value={school.contactEmail || "-"} />
              <InfoItem label="Created by UID" value={school.createdByUid || "-"} />
              <InfoItem label="Stripe customer" value={school.stripeCustomerId || "-"} />
              <InfoItem label="Stripe subscription" value={school.stripeSubscriptionId || "-"} />
              <InfoItem label="Created" value={formatDate(school.createdAt)} />
              <InfoItem label="Updated" value={formatDate(school.updatedAt)} />
            </div>
          </AdminSection>

          <AdminSection title="License settings">
            <form onSubmit={saveSchoolSettings} className="settingsForm">
              <div className="formGrid">
                <label>
                  School name
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    required
                  />
                </label>

                <label>
                  Contact name
                  <input
                    value={editContactName}
                    onChange={(event) => setEditContactName(event.target.value)}
                  />
                </label>

                <label>
                  Contact email
                  <input
                    value={editContactEmail}
                    onChange={(event) => setEditContactEmail(event.target.value)}
                    type="email"
                  />
                </label>

                <label>
                  Status
                  <select
                    value={editStatus}
                    onChange={(event) =>
                      setEditStatus(
                        event.target.value as
                          | "inactive"
                          | "trialing"
                          | "active"
                          | "past_due"
                          | "canceled"
                      )
                    }
                  >
                    <option value="active">active</option>
                    <option value="trialing">trialing</option>
                    <option value="past_due">past_due</option>
                    <option value="inactive">inactive</option>
                    <option value="canceled">canceled</option>
                  </select>
                </label>

                <label>
                  Plan
                  <select
                    value={editPlanKey}
                    onChange={(event) =>
                      setEditPlanKey(
                        event.target.value as "school_5" | "school_10" | "school_25" | "custom"
                      )
                    }
                  >
                    <option value="school_5">school_5</option>
                    <option value="school_10">school_10</option>
                    <option value="school_25">school_25</option>
                    <option value="custom">custom</option>
                  </select>
                </label>

                <label>
                  Teacher seats
                  <input
                    value={editTeacherSeatLimit}
                    onChange={(event) => setEditTeacherSeatLimit(event.target.value)}
                    type="number"
                    min={1}
                    required
                  />
                </label>

                <label>
                  Billing type
                  <select
                    value={editBillingType}
                    onChange={(event) =>
                      setEditBillingType(event.target.value as "manual" | "stripe")
                    }
                  >
                    <option value="manual">manual</option>
                    <option value="stripe">stripe</option>
                  </select>
                </label>
              </div>

              <div className="formActions">
                <button type="submit" disabled={saving || !editName.trim()}>
                  {saving ? "Saving..." : "Save school"}
                </button>
                <span>Only superadmins can save changes.</span>
              </div>
            </form>
          </AdminSection>

          <AdminSection title="School administrators">
            {schoolAdmins.length === 0 ? (
              <div className="muted">No school administrators found.</div>
            ) : (
              <div className="memberList">
                {schoolAdmins.map((member) => (
                  <MemberRow key={member.uid || member.id} member={member} />
                ))}
              </div>
            )}
          </AdminSection>

          <AdminSection title="Members">
            {members.length === 0 ? (
              <div className="muted">No members found.</div>
            ) : (
              <>
                <div className="memberToolbar">
                  <select value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)}>
                    <option value="all">All members</option>
                    <option value="active_teachers">Active teachers</option>
                    <option value="admins">Admins</option>
                    <option value="disabled">Disabled</option>
                  </select>
                  <span>
                    Showing <b>{filteredMembers.length}</b> of <b>{members.length}</b>
                  </span>
                  <span>
                    {activeTeachers.length} active teachers, {disabledMembers.length} disabled members
                  </span>
                </div>

                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map((member) => (
                        <tr key={member.uid || member.id}>
                          <td>
                            <div className="strongText">{member.displayName || member.email || "-"}</div>
                            <div className="subText">{member.uid || member.id || "-"}</div>
                          </td>
                          <td>{member.role || "-"}</td>
                          <td>{member.status || "-"}</td>
                          <td>{formatDate(member.joinedAt || member.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </AdminSection>
        </>
      ) : null}

      <style jsx>{`
        .schoolDetailPage {
          display: grid;
          gap: var(--admin-gap, 16px);
        }

        :global(.messageCard),
        :global(.loadingCard),
        :global(.successCard) {
          padding: 14px;
        }

        :global(.seatNotice) {
          display: grid;
          gap: 10px;
          padding: 14px;
        }

        :global(.seatNotice.warning) {
          border-color: #fed7aa;
          background: #fff7ed;
          color: #9a3412;
        }

        :global(.seatNotice.danger) {
          border-color: #fecaca;
          background: #fef2f2;
          color: #991b1b;
        }

        .seatNoticeHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .seatNoticeHeader p,
        .seatHelp {
          margin: 4px 0 0;
          color: var(--admin-muted, #6b7280);
          font-size: 13px;
          line-height: 1.45;
        }

        .seatTrack {
          height: 9px;
          overflow: hidden;
          border-radius: 999px;
          background: #e5e7eb;
        }

        .seatFill {
          height: 100%;
          border-radius: 999px;
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

        :global(.messageCard) {
          border-color: #fecaca;
          background: #fef2f2;
          color: #991b1b;
        }

        :global(.successCard) {
          border-color: #bbf7d0;
          background: #f0fdf4;
          color: #166534;
        }

        .statsGrid,
        .infoGrid,
        .formGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: var(--admin-gap, 16px);
        }

        :global(.infoItem) {
          padding: 12px;
          border: 1px solid var(--admin-border, #e5e7eb);
          border-radius: var(--admin-radius, 10px);
          background: var(--admin-surface-subtle, #f8fafc);
        }

        :global(.label),
        th,
        :global(.subText),
        .muted {
          color: var(--admin-muted, #6b7280);
        }

        :global(.label),
        th {
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
        }

        :global(.value) {
          margin-top: 4px;
          overflow-wrap: anywhere;
          font-weight: 700;
        }

        .settingsForm {
          display: grid;
          gap: 16px;
        }

        label {
          display: grid;
          gap: 6px;
          font-size: 13px;
          font-weight: 800;
        }

        input,
        select {
          min-height: 40px;
          border: 1px solid var(--admin-border-strong, #d1d5db);
          border-radius: var(--admin-radius, 10px);
          padding: 9px 11px;
          background: #ffffff;
          color: var(--admin-text, #111827);
          font: inherit;
          font-weight: 500;
        }

        .formActions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        .formActions button {
          min-height: 38px;
          padding: 8px 12px;
          border-radius: var(--admin-radius, 10px);
          border: 1px solid #111827;
          background: #111827;
          color: #ffffff;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
        }

        .formActions button:disabled {
          border-color: #d1d5db;
          background: #e5e7eb;
          color: #6b7280;
          cursor: not-allowed;
        }

        .formActions span {
          color: var(--admin-muted, #6b7280);
          font-size: 13px;
        }

        .memberList {
          display: grid;
          gap: 10px;
        }

        .memberToolbar {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 12px;
        }

        .memberToolbar select {
          min-height: 38px;
          border: 1px solid var(--admin-border-strong, #d1d5db);
          border-radius: var(--admin-radius, 10px);
          padding: 8px 10px;
          background: #ffffff;
          color: var(--admin-text, #111827);
          font: inherit;
          font-weight: 700;
        }

        .memberToolbar span {
          color: var(--admin-muted, #6b7280);
          font-size: 13px;
        }

        :global(.memberRow) {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 12px;
          border: 1px solid var(--admin-border, #e5e7eb);
          border-radius: var(--admin-radius, 10px);
          background: var(--admin-surface-subtle, #f8fafc);
        }

        :global(.strongText) {
          font-weight: 900;
        }

        :global(.subText) {
          margin-top: 3px;
          font-size: 12px;
          overflow-wrap: anywhere;
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
      `}</style>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="infoItem">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function MemberRow({ member }: { member: SchoolMember }) {
  return (
    <div className="memberRow">
      <div>
        <div className="strongText">{member.displayName || member.email || member.uid || "-"}</div>
        <div className="subText">{member.uid || member.id || "-"}</div>
      </div>
      <div>
        <div className="strongText">{member.status || "-"}</div>
        <div className="subText">{member.role || "-"}</div>
      </div>
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
