// \app\[locale]\(admin)\admin\users\page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
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

type LookupProfile = {
  id: string;
  uid?: unknown;
  email?: unknown;
  displayName?: unknown;
  role?: unknown;
  adminLevel?: unknown;
  partnerStatus?: unknown;
};

type UserLookupResponse = {
  ok?: boolean;
  error?: string;
  email?: string;
  authError?: string | null;
  authUser?: {
    uid: string;
    email: string | null;
    displayName: string | null;
    disabled: boolean;
    emailVerified: boolean;
    providerData: Array<{
      providerId: string;
      uid: string;
      email: string | null;
      displayName: string | null;
    }>;
  } | null;
  profileByUid?: LookupProfile | null;
  profilesByEmail?: LookupProfile[];
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
    if (typeof v === "string") {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString("no-NO");
    }
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
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<UserLookupResponse | null>(null);

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

  async function lookupUser() {
    const email = lookupEmail.trim();
    if (!email) return;

    setLookupLoading(true);
    setLookupErr(null);

    try {
      const currentUser = getAuth().currentUser;
      if (!currentUser) throw new Error("No signed-in Firebase Auth user.");

      const token = await currentUser.getIdToken();
      const res = await fetch(`/api/admin/users/lookup?email=${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as UserLookupResponse;

      if (!res.ok) throw new Error(data.error || "Lookup failed.");
      setLookupResult(data);
    } catch (e: unknown) {
      setLookupErr(errorMessage(e));
      setLookupResult(null);
    } finally {
      setLookupLoading(false);
    }
  }

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

      <section
        style={{
          padding: 18,
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "white",
          display: "grid",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>AUTH + FIRESTORE LOOKUP</div>
          <h3 style={{ margin: "4px 0 0", fontSize: 18 }}>Find user by email</h3>
          <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
            Use this when a user is missing from the list. It checks Firebase Auth and the Firestore
            users collection separately.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={lookupEmail}
            onChange={(e) => setLookupEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void lookupUser();
            }}
            placeholder="email@example.com"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              minWidth: 280,
              flex: "1 1 280px",
            }}
          />

          <button
            onClick={() => void lookupUser()}
            disabled={lookupLoading || !lookupEmail.trim()}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              background: lookupLoading || !lookupEmail.trim() ? "#f8fafc" : "#2563eb",
              color: lookupLoading || !lookupEmail.trim() ? "inherit" : "white",
              cursor: lookupLoading || !lookupEmail.trim() ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {lookupLoading ? "Checking..." : "Check email"}
          </button>
        </div>

        {lookupErr ? (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(239,68,68,0.20)",
              background: "rgba(239,68,68,0.05)",
            }}
          >
            <b>Lookup error:</b> {lookupErr}
          </div>
        ) : null}

        {lookupResult ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            <div
              style={{
                padding: 14,
                borderRadius: 14,
                border: "1px solid rgba(0,0,0,0.08)",
                background: lookupResult.authUser ? "rgba(34,197,94,0.06)" : "rgba(245,158,11,0.08)",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>FIREBASE AUTH</div>
              <div style={{ marginTop: 6, fontWeight: 900 }}>
                {lookupResult.authUser ? "Found" : "Not found"}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55 }}>
                <div>uid: {lookupResult.authUser?.uid || "—"}</div>
                <div>email: {lookupResult.authUser?.email || "—"}</div>
                <div>name: {lookupResult.authUser?.displayName || "—"}</div>
                <div>verified: {lookupResult.authUser ? String(lookupResult.authUser.emailVerified) : "—"}</div>
                <div>disabled: {lookupResult.authUser ? String(lookupResult.authUser.disabled) : "—"}</div>
                {lookupResult.authError ? <div>status: {lookupResult.authError}</div> : null}
              </div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 14,
                border: "1px solid rgba(0,0,0,0.08)",
                background: lookupResult.profileByUid ? "rgba(34,197,94,0.06)" : "rgba(245,158,11,0.08)",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>FIRESTORE PROFILE BY UID</div>
              <div style={{ marginTop: 6, fontWeight: 900 }}>
                {lookupResult.profileByUid ? "Found" : "Missing"}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55 }}>
                <div>doc: {lookupResult.profileByUid?.id || "—"}</div>
                <div>email: {String(lookupResult.profileByUid?.email ?? "—")}</div>
                <div>name: {String(lookupResult.profileByUid?.displayName ?? "—")}</div>
                <div>role: {String(lookupResult.profileByUid?.role ?? "—")}</div>
                <div>admin: {String(lookupResult.profileByUid?.adminLevel ?? "—")}</div>
                {lookupResult.profileByUid?.id ? (
                  <Link href={`/${locale}/admin/users/${lookupResult.profileByUid.id}`}>
                    Open profile
                  </Link>
                ) : null}
              </div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 14,
                border: "1px solid rgba(0,0,0,0.08)",
                background: "rgba(59,130,246,0.06)",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>FIRESTORE PROFILES BY EMAIL</div>
              <div style={{ marginTop: 6, fontWeight: 900 }}>
                {lookupResult.profilesByEmail?.length ?? 0} match(es)
              </div>
              <div style={{ marginTop: 8, display: "grid", gap: 8, fontSize: 13 }}>
                {(lookupResult.profilesByEmail ?? []).length > 0 ? (
                  lookupResult.profilesByEmail?.map((profile) => (
                    <div key={profile.id}>
                      <Link href={`/${locale}/admin/users/${profile.id}`}>
                        {String(profile.displayName || profile.email || profile.id)}
                      </Link>
                      <div style={{ opacity: 0.7 }}>doc: {profile.id}</div>
                    </div>
                  ))
                ) : (
                  <div>No Firestore profile has this exact email.</div>
                )}
              </div>
            </div>
          </div>
        ) : null}
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
