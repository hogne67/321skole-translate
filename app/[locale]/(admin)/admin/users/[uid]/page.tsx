"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc, serverTimestamp, updateDoc, type DocumentData } from "firebase/firestore";
import { useLocale } from "next-intl";
import { db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { isSuperAdmin } from "@/lib/adminAccess";

type Role = "student" | "teacher" | "admin" | "parent" | "creator";
type AdminLevel = "moderator" | "admin" | "superadmin";

type UserDetail = {
  id: string;
  uid?: string;
  displayName?: string | null;
  email?: string | null;
  locale?: string | null;

  role?: Role | null;
  adminLevel?: AdminLevel | null;

  onboardingComplete?: boolean;
  disabled?: boolean;
  mode?: string | null;

  attestation?: {
    version?: string | null;
    acceptedAt?: unknown;
  };

  caps?: {
    publish?: boolean;
    sell?: boolean;
    pdf?: boolean;
    tts?: boolean;
    vocab?: boolean;
  };

  roles?: {
    student?: boolean;
    teacher?: boolean;
    admin?: boolean;
    parent?: boolean;
    creator?: boolean;
    teacherStatus?: string;
    creatorStatus?: string;
  };

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

function coerceUserDetail(id: string, data: DocumentData): UserDetail {
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

  const capsRaw = obj.caps;
  const caps = isRecord(capsRaw)
    ? {
        publish: toBool(capsRaw.publish),
        sell: toBool(capsRaw.sell),
        pdf: toBool(capsRaw.pdf),
        tts: toBool(capsRaw.tts),
        vocab: toBool(capsRaw.vocab),
      }
    : undefined;

  const rolesRaw = obj.roles;
  const roles = isRecord(rolesRaw)
    ? {
        student: toBool(rolesRaw.student),
        teacher: toBool(rolesRaw.teacher),
        admin: toBool(rolesRaw.admin),
        parent: toBool(rolesRaw.parent),
        creator: toBool(rolesRaw.creator),
        teacherStatus: toStringOrNull(rolesRaw.teacherStatus) ?? undefined,
        creatorStatus: toStringOrNull(rolesRaw.creatorStatus) ?? undefined,
      }
    : undefined;

  const attRaw = obj.attestation;
  const attestation = isRecord(attRaw)
    ? {
        version: toStringOrNull(attRaw.version),
        acceptedAt: attRaw.acceptedAt,
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
    mode: toStringOrNull(obj.mode),

    attestation,
    caps,
    roles,
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        padding: 18,
        borderRadius: 18,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "white",
      }}
    >
      <h3 style={{ margin: "0 0 12px" }}>{title}</h3>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontWeight: 700, opacity: 0.75 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
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

export default function AdminUserDetailPage() {
  const params = useParams();
  const locale = useLocale();
  const { profile: currentProfile } = useUserProfile();

  const uid = useMemo(() => {
    const raw = params?.uid;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  }, [params]);

  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [editRole, setEditRole] = useState<Role>("student");
  const [editAdminLevel, setEditAdminLevel] = useState<"" | AdminLevel>("");
  const [editDisabled, setEditDisabled] = useState(false);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canWrite = isSuperAdmin(currentProfile);

    const load = useCallback(async () => {
    if (!db) {
      setErr("Firestore db is null.");
      setLoading(false);
      return;
    }

    if (!uid) {
      setErr("Missing uid.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const ref = doc(db, "users", uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setData(null);
        setErr("User not found.");
        return;
      }

      const next = coerceUserDetail(snap.id, snap.data());
      setData(next);

      setEditRole(next.role ?? "student");
      setEditAdminLevel(next.adminLevel ?? "");
      setEditDisabled(next.disabled === true);
    } catch (e: unknown) {
      setErr(errorMessage(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  async function saveChanges() {
    if (!db) {
      setErr("Firestore db is null.");
      return;
    }

    if (!uid) {
      setErr("Missing uid.");
      return;
    }

    if (!canWrite) {
      setErr("Only superadmin can edit users.");
      return;
    }

    setSaving(true);
    setErr(null);
    setMsg(null);

    try {
      const ref = doc(db, "users", uid);

      const nextRole: Role = editRole;
      const nextAdminLevel: AdminLevel | null = nextRole === "admin" && editAdminLevel ? editAdminLevel : null;

      await updateDoc(ref, {
        role: nextRole,
        adminLevel: nextAdminLevel,
        disabled: editDisabled,
        updatedAt: serverTimestamp(),
      });

      setMsg("Bruker oppdatert ✅");
      await load();
    } catch (e: unknown) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

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
            <h2 style={{ margin: "4px 0 0", fontSize: 24 }}>User detail</h2>
            <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
              Brukerprofil, rolle, admin-nivå og grunnleggende kontodata.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={load}
              disabled={loading || saving}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "white",
                cursor: loading || saving ? "not-allowed" : "pointer",
                fontWeight: 800,
              }}
            >
              {loading ? "Laster…" : "Oppdater"}
            </button>

            <Link
              href={`/${locale}/admin/users`}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "white",
                textDecoration: "none",
                color: "inherit",
                fontWeight: 800,
              }}
            >
              Tilbake til users
            </Link>
          </div>
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
          <b>Feil:</b> {err}
        </section>
      ) : null}

      {msg ? (
        <section
          style={{
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(34,197,94,0.20)",
            background: "rgba(34,197,94,0.06)",
          }}
        >
          {msg}
        </section>
      ) : null}

      {loading ? (
        <section
          style={{
            padding: 18,
            borderRadius: 18,
            border: "1px solid rgba(0,0,0,0.08)",
            background: "white",
          }}
        >
          Laster bruker…
        </section>
      ) : null}

      {!loading && data ? (
        <>
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
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ fontSize: 28, fontWeight: 900 }}>
                  {data.displayName || data.email || data.uid || data.id}
                </div>
                <div style={{ marginTop: 8, opacity: 0.8 }}>{data.email || "—"}</div>
                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.65 }}>
                  uid: {data.uid || data.id}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {data.role ? (
                  <Pill
                    text={data.role}
                    tone={
                      data.role === "admin"
                        ? "amber"
                        : data.role === "teacher"
                        ? "blue"
                        : data.role === "student"
                        ? "green"
                        : "neutral"
                    }
                  />
                ) : (
                  <Pill text="no role" tone="red" />
                )}

                {data.role === "admin" && data.adminLevel ? (
                  <Pill text={data.adminLevel} tone="red" />
                ) : null}

                {data.disabled ? <Pill text="disabled" tone="red" /> : null}
                {data.onboardingComplete ? <Pill text="onboarded" tone="green" /> : null}
              </div>
            </div>
          </section>

          <Section title="Rediger bruker">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800, marginBottom: 6 }}>
                  ROLE
                </div>
                <select
                  value={editRole}
                  onChange={(e) => {
                    const nextRole = e.target.value as Role;
                    setEditRole(nextRole);
                    if (nextRole !== "admin") setEditAdminLevel("");
                  }}
                  disabled={!canWrite || saving}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: canWrite ? "white" : "rgba(0,0,0,0.03)",
                  }}
                >
                  <option value="student">student</option>
                  <option value="teacher">teacher</option>
                  <option value="admin">admin</option>
                  <option value="parent">parent</option>
                  <option value="creator">creator</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800, marginBottom: 6 }}>
                  ADMIN LEVEL
                </div>
                <select
                  value={editAdminLevel}
                  onChange={(e) => setEditAdminLevel(e.target.value as "" | AdminLevel)}
                  disabled={!canWrite || saving || editRole !== "admin"}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background:
                      canWrite && editRole === "admin" ? "white" : "rgba(0,0,0,0.03)",
                  }}
                >
                  <option value="">none</option>
                  <option value="moderator">moderator</option>
                  <option value="admin">admin</option>
                  <option value="superadmin">superadmin</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800, marginBottom: 6 }}>
                  DISABLED
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 42,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: canWrite ? "white" : "rgba(0,0,0,0.03)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={editDisabled}
                    onChange={(e) => setEditDisabled(e.target.checked)}
                    disabled={!canWrite || saving}
                  />
                  <span>{editDisabled ? "Bruker er deaktivert" : "Bruker er aktiv"}</span>
                </label>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={saveChanges}
                disabled={!canWrite || saving}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: canWrite ? "#111827" : "rgba(0,0,0,0.08)",
                  color: canWrite ? "white" : "rgba(0,0,0,0.45)",
                  cursor: !canWrite || saving ? "not-allowed" : "pointer",
                  fontWeight: 800,
                }}
              >
                {saving ? "Lagrer…" : "Lagre endringer"}
              </button>

              <div style={{ fontSize: 13, opacity: 0.75 }}>
                {canWrite
                  ? "Bare superadmin kan lagre endringer."
                  : "Du har lesetilgang, men ikke skrivetilgang."}
              </div>
            </div>
          </Section>

          <Section title="Konto">
            <Row label="Role" value={data.role || "—"} />
            <Row label="Admin level" value={data.adminLevel || "—"} />
            <Row label="Locale" value={data.locale || "—"} />
            <Row label="Mode" value={data.mode || "—"} />
            <Row label="Onboarding complete" value={data.onboardingComplete ? "Ja" : "Nei"} />
            <Row label="Disabled" value={data.disabled ? "Ja" : "Nei"} />
            <Row label="Created" value={formatDate(data.createdAt)} />
            <Row label="Updated" value={formatDate(data.updatedAt)} />
            <Row label="Last login" value={formatDate(data.lastLoginAt)} />
          </Section>

          <Section title="Organisasjon">
            <Row label="Country" value={data.org?.country || "—"} />
            <Row label="Municipality" value={data.org?.municipality || "—"} />
            <Row label="Institution name" value={data.org?.institutionName || "—"} />
            <Row label="Institution type" value={data.org?.institutionType || "—"} />
          </Section>

          <Section title="Attestation">
            <Row label="Version" value={data.attestation?.version || "—"} />
            <Row label="Accepted at" value={formatDate(data.attestation?.acceptedAt)} />
          </Section>

          <Section title="Caps">
            <Row label="publish" value={data.caps?.publish ? "true" : "false"} />
            <Row label="sell" value={data.caps?.sell ? "true" : "false"} />
            <Row label="pdf" value={data.caps?.pdf ? "true" : "false"} />
            <Row label="tts" value={data.caps?.tts ? "true" : "false"} />
            <Row label="vocab" value={data.caps?.vocab ? "true" : "false"} />
          </Section>

          <Section title="Legacy roles">
            <Row label="student" value={data.roles?.student ? "true" : "false"} />
            <Row label="teacher" value={data.roles?.teacher ? "true" : "false"} />
            <Row label="admin" value={data.roles?.admin ? "true" : "false"} />
            <Row label="parent" value={data.roles?.parent ? "true" : "false"} />
            <Row label="creator" value={data.roles?.creator ? "true" : "false"} />
            <Row label="teacherStatus" value={data.roles?.teacherStatus || "—"} />
            <Row label="creatorStatus" value={data.roles?.creatorStatus || "—"} />
          </Section>
        </>
      ) : null}
    </main>
  );
}