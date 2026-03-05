// app/(app)/admin/users/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import AuthGate from "@/components/AuthGate";

type Status = "none" | "pending" | "approved" | "rejected";
type Role2 = "student" | "teacher" | "admin" | "parent" | "creator" | string;

type UserRow = {
  id: string;
  email?: string | null;
  displayName?: string | null;

  role?: Role2 | null;

  // Creator kan fortsatt være godkjent/pending hvis dere vil
  creatorStatus?: Status;

  // Legacy roles-map (kan fortsatt ligge i gamle docs)
  roles?: {
    teacher?: boolean;
    creator?: boolean;
    admin?: boolean;
    student?: boolean;
    parent?: boolean;
  };

  caps?: {
    publish?: boolean;
    sell?: boolean;
    pdf?: boolean;
    tts?: boolean;
    vocab?: boolean;
  };

  updatedAt?: unknown;
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

function toStatus(v: unknown): Status | undefined {
  return v === "none" || v === "pending" || v === "approved" || v === "rejected" ? v : undefined;
}

function toRole(v: unknown): Role2 | null | undefined {
  if (typeof v === "string") return v;
  if (v === null) return null;
  return undefined;
}

function coerceUserRow(id: string, data: DocumentData): UserRow {
  const obj: Record<string, unknown> = isRecord(data) ? data : {};

  const rolesRaw = obj.roles;
  const roles = isRecord(rolesRaw)
    ? {
        teacher: toBool(rolesRaw.teacher),
        creator: toBool(rolesRaw.creator),
        admin: toBool(rolesRaw.admin),
        student: toBool(rolesRaw.student),
        parent: toBool(rolesRaw.parent),
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

  return {
    id,
    email: toStringOrNull(obj.email),
    displayName: toStringOrNull(obj.displayName),

    role: toRole(obj.role),

    creatorStatus: toStatus(obj.creatorStatus),

    roles,
    caps,

    updatedAt: obj.updatedAt,
  };
}

function errorMessage(e: unknown): string {
  if (isRecord(e) && typeof e.message === "string") return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

export default function AdminUsersPage() {
  return (
    <AuthGate requireRole="admin">
      <UsersInner />
    </AuthGate>
  );
}

function UsersInner() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [onlyPendingCreator, setOnlyPendingCreator] = useState(false);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const qy = query(collection(db, "users"), orderBy("updatedAt", "desc"));
      const snap = await getDocs(qy);
      const list: UserRow[] = snap.docs.map((d) => coerceUserRow(d.id, d.data()));
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

  const pendingCreators = useMemo(() => rows.filter((u) => u.creatorStatus === "pending"), [rows]);

  const visible = useMemo(() => {
    if (onlyPendingCreator) return pendingCreators;

    // Litt sortering: admin øverst, teacher, creator, student
    const rank = (u: UserRow) => {
      const r = String(u.role ?? "").toLowerCase();
      if (r === "admin" || u.roles?.admin) return 0;
      if (r === "teacher" || u.roles?.teacher) return 1;
      if (r === "creator" || u.roles?.creator) return 2;
      if (r === "parent" || u.roles?.parent) return 3;
      return 4;
    };

    return rows.slice().sort((a, b) => rank(a) - rank(b));
  }, [rows, onlyPendingCreator, pendingCreators]);

  // -------------------------
  // Role actions
  // -------------------------
  async function setRole(u: UserRow, role: "student" | "teacher") {
    setErr(null);
    try {
      await updateDoc(doc(db, "users", u.id), {
        role,
        onboardingComplete: true,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: unknown) {
      setErr(errorMessage(e));
    }
  }

  // -------------------------
  // Caps actions (optional)
  // -------------------------
  async function toggleCap(u: UserRow, capKey: keyof NonNullable<UserRow["caps"]>) {
    setErr(null);
    try {
      const current = Boolean(u.caps?.[capKey]);
      await updateDoc(doc(db, "users", u.id), {
        [`caps.${capKey}`]: !current,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: unknown) {
      setErr(errorMessage(e));
    }
  }

  // -------------------------
  // Creator actions (hvis dere fortsatt vil godkjenne creator)
  // -------------------------
  async function approveCreator(u: UserRow) {
    setErr(null);
    try {
      await updateDoc(doc(db, "users", u.id), {
        creatorStatus: "approved",
        "roles.creator": true,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: unknown) {
      setErr(errorMessage(e));
    }
  }

  async function rejectCreator(u: UserRow) {
    setErr(null);
    try {
      await updateDoc(doc(db, "users", u.id), {
        creatorStatus: "rejected",
        "roles.creator": false,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: unknown) {
      setErr(errorMessage(e));
    }
  }

  async function revokeCreator(u: UserRow) {
    setErr(null);
    try {
      await updateDoc(doc(db, "users", u.id), {
        creatorStatus: "none",
        "roles.creator": false,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: unknown) {
      setErr(errorMessage(e));
    }
  }

  async function setCreatorPending(u: UserRow) {
    setErr(null);
    try {
      await updateDoc(doc(db, "users", u.id), {
        creatorStatus: "pending",
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: unknown) {
      setErr(errorMessage(e));
    }
  }

  return (
    <main style={{ maxWidth: 1060, margin: "10px auto", padding: 12 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin • Users</h1>
          <p style={{ opacity: 0.75, marginTop: 6 }}>
            Teacher har tilgang med en gang via <code>role=teacher</code>. Creator kan fortsatt godkjennes her (valgfritt).
          </p>
          <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
            Pending creator: <b>{pendingCreators.length}</b> · Total users: <b>{rows.length}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: 0.85 }}>
            <input
              type="checkbox"
              checked={onlyPendingCreator}
              onChange={(e) => setOnlyPendingCreator(e.target.checked)}
            />
            Vis kun pending creator
          </label>

          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.14)",
              background: "white",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Laster…" : "Refresh"}
          </button>
        </div>
      </header>

      {err ? (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            background: "rgba(200,0,0,0.06)",
            border: "1px solid rgba(200,0,0,0.18)",
          }}
        >
          <b>Feil:</b> {err}
        </div>
      ) : null}

      <section style={{ marginTop: 14 }}>
        {visible.length === 0 ? (
          <p style={{ marginTop: 14, opacity: 0.75 }}>Ingen brukere å vise med dagens filter.</p>
        ) : null}

        <div style={{ marginTop: 8 }}>
          {visible.map((u) => {
            const roleStr = String(u.role ?? "—");
            return (
              <div
                key={u.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 1fr 1fr 1fr auto",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {u.displayName || u.email || u.id}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {u.email || "—"} • {u.id}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 13, opacity: 0.75 }}>role</span>
                  <div style={{ fontWeight: 700 }}>{roleStr}</div>

                  <div style={{ marginTop: 6 }}>
                    <span style={{ fontSize: 13, opacity: 0.75 }}>creatorStatus</span>
                    <div style={{ fontWeight: 700 }}>{u.creatorStatus || "—"}</div>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 13, opacity: 0.75 }}>legacy roles</span>
                  <div style={{ fontWeight: 700 }}>
                    {u.roles?.admin ? "admin " : ""}
                    {u.roles?.teacher ? "teacher " : ""}
                    {u.roles?.creator ? "creator " : ""}
                    {u.roles?.student ? "student " : ""}
                    {u.roles?.parent ? "parent " : ""}
                    {!u.roles ? "—" : ""}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 13, opacity: 0.75 }}>caps</span>
                  <div style={{ fontWeight: 700 }}>
                    {u.caps?.publish ? "publish " : ""}
                    {u.caps?.sell ? "sell " : ""}
                    {u.caps?.pdf ? "pdf " : ""}
                    {u.caps?.tts ? "tts " : ""}
                    {u.caps?.vocab ? "vocab " : ""}
                    {!u.caps ? "—" : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  {/* Role */}
                  <button
                    onClick={() => setRole(u, "teacher")}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.14)",
                      background: "white",
                    }}
                  >
                    Set role: teacher
                  </button>
                  <button
                    onClick={() => setRole(u, "student")}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.14)",
                      background: "white",
                    }}
                  >
                    Set role: student
                  </button>

                  <span style={{ opacity: 0.35 }}>│</span>

                  {/* Caps */}
                  <button
                    onClick={() => toggleCap(u, "publish")}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.14)",
                      background: "white",
                    }}
                  >
                    Toggle publish
                  </button>

                  <span style={{ opacity: 0.35 }}>│</span>

                  {/* Creator (valgfritt) */}
                  <button
                    onClick={() => approveCreator(u)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.14)",
                      background: "white",
                    }}
                  >
                    Approve creator
                  </button>
                  <button
                    onClick={() => setCreatorPending(u)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.14)",
                      background: "white",
                    }}
                  >
                    Creator pending
                  </button>
                  <button
                    onClick={() => rejectCreator(u)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.14)",
                      background: "white",
                    }}
                  >
                    Reject creator
                  </button>
                  <button
                    onClick={() => revokeCreator(u)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.14)",
                      background: "white",
                    }}
                  >
                    Revoke creator
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}