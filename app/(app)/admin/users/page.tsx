// app/(app)/admin/users/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, orderBy, query, updateDoc, serverTimestamp, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import AuthGate from "@/components/AuthGate";

type Status = "none" | "pending" | "approved" | "rejected";

type UserRow = {
  id: string;
  email?: string | null;
  displayName?: string | null;

  teacherStatus?: Status;
  creatorStatus?: Status;

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

    teacherStatus: toStatus(obj.teacherStatus),
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

  const [onlyPendingTeacher, setOnlyPendingTeacher] = useState(true);
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

  const pendingTeachers = useMemo(() => rows.filter((u) => u.teacherStatus === "pending"), [rows]);

  const pendingCreators = useMemo(() => rows.filter((u) => u.creatorStatus === "pending"), [rows]);

  const visible = useMemo(() => {
    // Filtrering:
    if (onlyPendingTeacher && !onlyPendingCreator) return pendingTeachers;
    if (!onlyPendingTeacher && onlyPendingCreator) return pendingCreators;

    if (onlyPendingTeacher && onlyPendingCreator) {
      // slå sammen (unik per id)
      const map = new Map<string, UserRow>();
      pendingTeachers.forEach((u) => map.set(u.id, u));
      pendingCreators.forEach((u) => map.set(u.id, u));
      return Array.from(map.values());
    }

    // ingen filter: vis alle, med litt sortering
    const score = (u: UserRow) => {
      // teacher approved først, deretter creator approved, så pending, etc
      const t = u.teacherStatus === "approved" ? 0 : u.teacherStatus === "pending" ? 1 : 2;
      const c = u.creatorStatus === "approved" ? 0 : u.creatorStatus === "pending" ? 1 : 2;
      return t * 10 + c;
    };
    return rows.slice().sort((a, b) => score(a) - score(b));
  }, [rows, onlyPendingTeacher, onlyPendingCreator, pendingTeachers, pendingCreators]);

  // -------------------------
  // Teacher actions
  // -------------------------
  async function approveTeacher(u: UserRow) {
    setErr(null);
    try {
      await updateDoc(doc(db, "users", u.id), {
        teacherStatus: "approved",
        "roles.teacher": true,

        // ✅ Policy: teacher får creator automatisk
        creatorStatus: "approved",
        "roles.creator": true,

        // (som før)
        "caps.publish": true,

        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: unknown) {
      setErr(errorMessage(e));
    }
  }

  async function setTeacherPending(u: UserRow) {
    setErr(null);
    try {
      await updateDoc(doc(db, "users", u.id), {
        teacherStatus: "pending",
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: unknown) {
      setErr(errorMessage(e));
    }
  }

  async function revokeTeacher(u: UserRow) {
    setErr(null);
    try {
      await updateDoc(doc(db, "users", u.id), {
        teacherStatus: "none",
        "roles.teacher": false,
        "caps.publish": false,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: unknown) {
      setErr(errorMessage(e));
    }
  }

  // -------------------------
  // Creator actions (NYTT)
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
            Teacher: Approve gir også creator automatisk. Creator for andre brukere må godkjennes her.
          </p>
          <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
            Pending teacher: <b>{pendingTeachers.length}</b> · Pending creator: <b>{pendingCreators.length}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: 0.85 }}>
            <input
              type="checkbox"
              checked={onlyPendingTeacher}
              onChange={(e) => setOnlyPendingTeacher(e.target.checked)}
            />
            Vis kun pending teacher
          </label>

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
          {visible.map((u) => (
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
                <span style={{ fontSize: 13, opacity: 0.75 }}>teacherStatus</span>
                <div style={{ fontWeight: 700 }}>{u.teacherStatus || "—"}</div>

                <div style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 13, opacity: 0.75 }}>creatorStatus</span>
                  <div style={{ fontWeight: 700 }}>{u.creatorStatus || "—"}</div>
                </div>
              </div>

              <div>
                <span style={{ fontSize: 13, opacity: 0.75 }}>roles</span>
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
                {/* Teacher */}
                <button
                  onClick={() => approveTeacher(u)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.14)",
                    background: "white",
                  }}
                >
                  Approve teacher
                </button>
                <button
                  onClick={() => setTeacherPending(u)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.14)",
                    background: "white",
                  }}
                >
                  Teacher pending
                </button>
                <button
                  onClick={() => revokeTeacher(u)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.14)",
                    background: "white",
                  }}
                >
                  Revoke teacher
                </button>

                <span style={{ opacity: 0.35 }}>│</span>

                {/* Creator */}
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
          ))}
        </div>
      </section>
    </main>
  );
}
