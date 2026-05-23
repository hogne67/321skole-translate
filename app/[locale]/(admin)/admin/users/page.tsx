// \app\[locale]\(admin)\admin\users\page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query, type DocumentData } from "firebase/firestore";
import { useLocale } from "next-intl";
import { db } from "@/lib/firebase";

type Role = "student" | "teacher" | "admin" | "parent" | "creator";
type AdminLevel = "moderator" | "admin" | "superadmin";

type UserRow = {
  id: string;
  uid?: string;
  displayName?: string | null;
  email?: string | null;
  locale?: string | null;

  role?: Role | null;
  adminLevel?: AdminLevel | null;

  onboardingComplete?: boolean;
  disabled?: boolean;

  org?: {
    country?: string | null;
    municipality?: string | null;
    institutionName?: string | null;
    institutionType?: string | null;
  };

  createdAt?: unknown;
  updatedAt?: unknown;
  lastLoginAt?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toStringOrNull(v: unknown): string | null | undefined {
  if (typeof v === "string") return v;
  if (v === null) return null;
  return undefined;
}

function toBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function toRole(v: unknown): Role | null | undefined {
  return v === "student" ||
    v === "teacher" ||
    v === "admin" ||
    v === "parent" ||
    v === "creator"
    ? v
    : v === null
      ? null
      : undefined;
}

function toAdminLevel(v: unknown): AdminLevel | null | undefined {
  return v === "moderator" || v === "admin" || v === "superadmin"
    ? v
    : v === null
      ? null
      : undefined;
}

function formatDate(v: unknown): string {
  try {
    if (isRecord(v) && typeof v.toDate === "function") {
      const d = v.toDate();
      if (d instanceof Date) return d.toLocaleString("no-NO");
    }

    if (v instanceof Date) return v.toLocaleString("no-NO");
    if (typeof v === "number") return new Date(v).toLocaleString("no-NO");
    return "—";
  } catch {
    return "—";
  }
}

function coerceUserRow(id: string, data: DocumentData): UserRow {
  const obj: Record<string, unknown> = isRecord(data) ? data : {};

  const orgRaw = obj.org;
  const org = isRecord(orgRaw)
    ? {
      country: toStringOrNull(orgRaw.country),
      municipality: toStringOrNull(orgRaw.municipality),
      institutionName: toStringOrNull(orgRaw.institutionName),
      institutionType: toStringOrNull(orgRaw.institutionType),
    }
    : undefined;

  return {
    id,
    uid: toStringOrNull(obj.uid) ?? id,
    displayName: toStringOrNull(obj.displayName),
    email: toStringOrNull(obj.email),
    locale: toStringOrNull(obj.locale),

    role: toRole(obj.role),
    adminLevel: toAdminLevel(obj.adminLevel),

    onboardingComplete: toBool(obj.onboardingComplete),
    disabled: toBool(obj.disabled),

    org,

    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    lastLoginAt: obj.lastLoginAt,
  };
}

function errorMessage(e: unknown): string {
  if (isRecord(e) && typeof e.message === "string") return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

function Pill({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "blue" | "green" | "amber" | "red";
}) {
  const map = {
    neutral: {
      background: "rgba(0,0,0,0.05)",
      border: "1px solid rgba(0,0,0,0.08)",
    },
    blue: {
      background: "rgba(59,130,246,0.10)",
      border: "1px solid rgba(59,130,246,0.18)",
    },
    green: {
      background: "rgba(34,197,94,0.10)",
      border: "1px solid rgba(34,197,94,0.18)",
    },
    amber: {
      background: "rgba(245,158,11,0.12)",
      border: "1px solid rgba(245,158,11,0.20)",
    },
    red: {
      background: "rgba(239,68,68,0.10)",
      border: "1px solid rgba(239,68,68,0.18)",
    },
  } as const;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        ...map[tone],
      }}
    >
      {text}
    </span>
  );
}

export default function AdminUsersPage() {
  const locale = useLocale();

  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [qText, setQText] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");

  async function load() {
    if (!db) {
      setErr("Firestore db is null.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const qy = query(collection(db, "users"), orderBy("updatedAt", "desc"));
      const snap = await getDocs(qy);
      const list = snap.docs.map((d) => coerceUserRow(d.id, d.data()));
      setRows(list);
    } catch (e: unknown) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = qText.trim().toLowerCase();

    return rows.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;

      if (!q) return true;

      const hay = [
        u.displayName ?? "",
        u.email ?? "",
        u.uid ?? "",
        u.role ?? "",
        u.adminLevel ?? "",
        u.org?.country ?? "",
        u.org?.municipality ?? "",
        u.org?.institutionName ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, qText, roleFilter]);

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <section
        style={{
          padding: 18,
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "white",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>ADMIN</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 24 }}>Users</h2>
            <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
              Overview of users, roles, and basic account information.
            </p>
          </div>

          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "white",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </section>

      <section
        style={{
          padding: 18,
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "white",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder="Search name, email, uid, role..."
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              minWidth: 280,
              flex: "1 1 280px",
            }}
          />

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as "" | Role)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "white",
            }}
          >
            <option value="">All roles</option>
            <option value="student">student</option>
            <option value="teacher">teacher</option>
            <option value="admin">admin</option>
            <option value="parent">parent</option>
            <option value="creator">creator</option>
          </select>
        </div>

        <div style={{ marginTop: 12, fontSize: 13, opacity: 0.75 }}>
          Showing <b>{filtered.length}</b> of <b>{rows.length}</b> users
        </div>
      </section>

      {err ? (
        <section
          style={{
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(239,68,68,0.20)",
            background: "rgba(239,68,68,0.05)",
          }}
        >
          <b>Error:</b> {err}
        </section>
      ) : null}

      <section style={{ display: "grid", gap: 12 }}>
        {loading ? <div style={{ opacity: 0.75 }}>Loading users...</div> : null}

        {!loading && filtered.length === 0 ? (
          <div
            style={{
              padding: 18,
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "white",
            }}
          >
            No users match the search or filter.
          </div>
        ) : null}

        {filtered.map((u) => (
          <article
            key={u.id}
            style={{
              padding: 18,
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "white",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 280, flex: "1 1 320px" }}>
                <Link
                  href={`/${locale}/admin/users/${u.id}`}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    {u.displayName || u.email || u.uid || u.id}
                  </div>
                </Link>

                <div style={{ marginTop: 6, opacity: 0.8 }}>
                  {u.email || "—"}
                </div>

                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.65 }}>
                  uid: {u.uid || u.id}
                </div>

                <div style={{ marginTop: 10 }}>
                  <Link
                    href={`/${locale}/admin/users/${u.id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.12)",
                      textDecoration: "none",
                      color: "inherit",
                      background: "white",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    Open user
                  </Link>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Pill
                  text={u.role || "—"}
                  tone={
                    u.role === "admin"
                      ? "amber"
                      : u.role === "teacher"
                        ? "blue"
                        : u.role === "student"
                          ? "green"
                          : "neutral"
                  }
                />
                {u.role === "admin" && u.adminLevel ? (
                  <Pill text={u.adminLevel} tone="red" />
                ) : null}
                {u.disabled ? <Pill text="disabled" tone="red" /> : null}
                {u.onboardingComplete ? <Pill text="onboarded" tone="green" /> : null}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                marginTop: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>LOCALE</div>
                <div style={{ marginTop: 4 }}>{u.locale || "—"}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>
                  COUNTRY / MUNICIPALITY
                </div>
                <div style={{ marginTop: 4 }}>
                  {u.org?.country || "—"} {u.org?.municipality ? `· ${u.org.municipality}` : ""}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>INSTITUTION</div>
                <div style={{ marginTop: 4 }}>
                  {u.org?.institutionName || "—"}
                  {u.org?.institutionType ? ` · ${u.org.institutionType}` : ""}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>LAST LOGIN</div>
                <div style={{ marginTop: 4 }}>{formatDate(u.lastLoginAt)}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>UPDATED</div>
                <div style={{ marginTop: 4 }}>{formatDate(u.updatedAt)}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>CREATED</div>
                <div style={{ marginTop: 4 }}>{formatDate(u.createdAt)}</div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
