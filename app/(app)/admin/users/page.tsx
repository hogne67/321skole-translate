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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import AuthGate from "@/components/AuthGate";

type UserRow = {
  id: string;
  email?: string | null;
  displayName?: string | null;
  teacherStatus?: "none" | "pending" | "approved" | "rejected";
  roles?: { teacher?: boolean; admin?: boolean; student?: boolean; parent?: boolean };
  caps?: { publish?: boolean; sell?: boolean; pdf?: boolean; tts?: boolean; vocab?: boolean };
  updatedAt?: any;
};

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
  const [onlyPending, setOnlyPending] = useState(true);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const qy = query(collection(db, "users"), orderBy("updatedAt", "desc"));
      const snap = await getDocs(qy);
      const list: UserRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setRows(list);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  // ✅ Autoload
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = useMemo(
    () => rows.filter((u) => u.teacherStatus === "pending"),
    [rows]
  );

  const others = useMemo(() => {
    const list = rows.filter((u) => u.teacherStatus !== "pending");
    // sort: approved før none/rejected
    const score = (u: UserRow) =>
      u.teacherStatus === "approved" ? 0 : u.teacherStatus === "rejected" ? 2 : 1;
    return list.slice().sort((a, b) => score(a) - score(b));
  }, [rows]);

  const visible = useMemo(() => {
    if (!onlyPending) return [...pending, ...others];
    return pending;
  }, [onlyPending, pending, others]);

  async function approve(u: UserRow) {
    setErr(null);
    try {
      await updateDoc(doc(db, "users", u.id), {
        teacherStatus: "approved",
        "roles.teacher": true,

        // ✅ gi teacher publish-rett, men IKKE nullstill alt annet
        "caps.publish": true,

        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  async function revoke(u: UserRow) {
    setErr(null);
    try {
      await updateDoc(doc(db, "users", u.id), {
        teacherStatus: "none",
        "roles.teacher": false,
        "caps.publish": false,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  async function setPending(u: UserRow) {
    setErr(null);
    try {
      await updateDoc(doc(db, "users", u.id), {
        teacherStatus: "pending",
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  return (
    <main style={{ maxWidth: 980, margin: "10px auto", padding: 12 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin • Users</h1>
          <p style={{ opacity: 0.75, marginTop: 6 }}>
            Pending teacher-søknader vises øverst. Approve setter roles.teacher=true og teacherStatus=approved.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: 0.85 }}>
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
            />
            Vis kun pending
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
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "rgba(200,0,0,0.06)", border: "1px solid rgba(200,0,0,0.18)" }}>
          <b>Feil:</b> {err}
        </div>
      ) : null}

      <section style={{ marginTop: 14 }}>
        <div style={{ padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <b>Teacher applications:</b> {pending.length}
        </div>

        {visible.length === 0 ? (
          <p style={{ marginTop: 14, opacity: 0.75 }}>
            Ingen {onlyPending ? "pending" : ""} brukere å vise.
          </p>
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
              </div>

              <div>
                <span style={{ fontSize: 13, opacity: 0.75 }}>roles</span>
                <div style={{ fontWeight: 700 }}>
                  {u.roles?.admin ? "admin " : ""}
                  {u.roles?.teacher ? "teacher " : ""}
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
                <button
                  onClick={() => approve(u)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.14)",
                    background: "white",
                  }}
                >
                  Approve
                </button>

                <button
                  onClick={() => setPending(u)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.14)",
                    background: "white",
                  }}
                >
                  Set pending
                </button>

                <button
                  onClick={() => revoke(u)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.14)",
                    background: "white",
                  }}
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
