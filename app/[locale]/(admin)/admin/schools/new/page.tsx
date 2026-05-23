"use client";

import Link from "next/link";
import { getAuth, getIdToken } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useMemo, useState } from "react";

import AdminCard from "@/components/admin/AdminCard";
import AdminSection from "@/components/admin/AdminSection";

type CreateSchoolResponse = {
  ok?: boolean;
  error?: string;
  schoolId?: string;
};

const planDefaults = {
  school_5: 5,
  school_10: 10,
  school_25: 25,
  custom: 1,
} as const;

export default function NewAdminSchoolPage() {
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [billingType, setBillingType] = useState<"manual" | "stripe">("manual");
  const [planKey, setPlanKey] = useState<keyof typeof planDefaults>("school_5");
  const [teacherSeatLimit, setTeacherSeatLimit] = useState("5");
  const [adminUid, setAdminUid] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    return name.trim() && adminUid.trim() && Number(teacherSeatLimit) > 0;
  }, [adminUid, name, teacherSeatLimit]);

  function changePlan(nextPlan: keyof typeof planDefaults) {
    setPlanKey(nextPlan);
    setTeacherSeatLimit(String(planDefaults[nextPlan]));
  }

  async function createNewSchool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in");

      const token = await getIdToken(user, true);
      const response = await fetch("/api/admin/schools", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          contactName,
          contactEmail,
          billingType,
          planKey,
          teacherSeatLimit: Number(teacherSeatLimit),
          adminUid,
          adminEmail,
          adminDisplayName,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as CreateSchoolResponse;

      if (!response.ok || !data.ok || !data.schoolId) {
        throw new Error(data.error || `Could not create school (${response.status})`);
      }

      router.push(`/${locale}/admin/schools/${data.schoolId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not create school");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="newSchoolPage">
      <AdminSection
        eyebrow="Schools"
        title="Create school"
        description="Create a school license and connect the first school administrator."
      />

      {error ? (
        <AdminCard className="messageCard">
          <strong>Error:</strong> {error}
        </AdminCard>
      ) : null}

      <AdminSection title="School license">
        <form onSubmit={createNewSchool} className="form">
          <div className="grid">
            <label>
              School name
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>

            <label>
              Contact name
              <input value={contactName} onChange={(event) => setContactName(event.target.value)} />
            </label>

            <label>
              Contact email
              <input
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                type="email"
              />
            </label>

            <label>
              Billing type
              <select
                value={billingType}
                onChange={(event) => setBillingType(event.target.value as "manual" | "stripe")}
              >
                <option value="manual">manual</option>
                <option value="stripe">stripe</option>
              </select>
            </label>

            <label>
              Plan
              <select
                value={planKey}
                onChange={(event) => changePlan(event.target.value as keyof typeof planDefaults)}
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
                value={teacherSeatLimit}
                onChange={(event) => setTeacherSeatLimit(event.target.value)}
                type="number"
                min={1}
                required
              />
            </label>
          </div>

          <div className="subSection">
            <h3>First school administrator</h3>
            <p>
              The UID must belong to an existing user. After creation, this user gets school admin
              access to the school dashboard.
            </p>
          </div>

          <div className="grid">
            <label>
              Admin UID
              <input
                value={adminUid}
                onChange={(event) => setAdminUid(event.target.value)}
                required
              />
            </label>

            <label>
              Admin email
              <input
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                type="email"
              />
            </label>

            <label>
              Admin display name
              <input
                value={adminDisplayName}
                onChange={(event) => setAdminDisplayName(event.target.value)}
              />
            </label>
          </div>

          <div className="actions">
            <button type="submit" disabled={!canSubmit || saving}>
              {saving ? "Creating..." : "Create school"}
            </button>
            <Link href={`/${locale}/admin/schools`}>Cancel</Link>
          </div>
        </form>
      </AdminSection>

      <style jsx>{`
        .newSchoolPage {
          display: grid;
          gap: var(--admin-gap, 16px);
        }

        :global(.messageCard) {
          padding: 14px;
          border-color: #fecaca;
          background: #fef2f2;
          color: #991b1b;
        }

        .form {
          display: grid;
          gap: 18px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: var(--admin-gap, 16px);
        }

        label {
          display: grid;
          gap: 6px;
          color: var(--admin-text, #111827);
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

        .subSection h3 {
          margin: 0;
          font-size: 17px;
        }

        .subSection p {
          margin: 5px 0 0;
          color: var(--admin-muted, #6b7280);
          line-height: 1.5;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        button,
        .actions a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 38px;
          padding: 8px 12px;
          border-radius: var(--admin-radius, 10px);
          font-size: 14px;
          font-weight: 800;
          text-decoration: none;
        }

        button {
          border: 1px solid #111827;
          background: #111827;
          color: #ffffff;
          cursor: pointer;
        }

        button:disabled {
          border-color: #d1d5db;
          background: #e5e7eb;
          color: #6b7280;
          cursor: not-allowed;
        }

        .actions a {
          border: 1px solid var(--admin-border-strong, #d1d5db);
          color: var(--admin-text, #111827);
          background: #ffffff;
        }
      `}</style>
    </div>
  );
}
