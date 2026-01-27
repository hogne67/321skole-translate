"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type TrashRow = {
  id: string;
  ownerId?: string;
  title?: string;
  level?: string;
  language?: string;
  textType?: string;
  texttype?: string;
  status?: string;
  deletedAt?: any;
  updatedAt?: any;
};

function formatMaybeDate(v: any) {
  try {
    const d: Date | null =
      v?.toDate?.() instanceof Date
        ? v.toDate()
        : v instanceof Date
        ? v
        : typeof v === "number"
        ? new Date(v)
        : null;

    if (!d) return "—";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  } catch {
    return "—";
  }
}

function coerceTextType(d: any): string {
  const a = String(d?.textType ?? "").trim();
  if (a) return a;
  const b = String(d?.texttype ?? "").trim();
  if (b) return b;
  return "";
}

export default function AdminTrashPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<TrashRow[]>([]);
  const [qText, setQText] = useState("");

  const [busyById, setBusyById] = useState<Record<string, boolean>>({});

  function setBusy(id: string, v: boolean) {
    setBusyById((m) => ({ ...m, [id]: v }));
  }

  async function requireUser() {
    const u = getAuth().currentUser;
    if (!u) throw new Error("Not signed in");
    return u.uid;
  }

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      await requireUser();

      // only deleted lessons
      const qy = query(
        collection(db, "lessons"),
        where("deletedAt", "!=", null),
        orderBy("deletedAt", "desc")
      );

      const snap = await getDocs(qy);
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TrashRow[];
      setItems(rows);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load trash");
    } finally {
      setLoading(false);
    }
  }

  async function restore(lessonId: string) {
    setBusy(lessonId, true);
    setErr(null);

    try {
      await requireUser();
      await updateDoc(doc(db, "lessons", lessonId), {
        deletedAt: null,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Restore failed");
    } finally {
      setBusy(lessonId, false);
    }
  }

  async function permanentDelete(lessonId: string, title?: string) {
    const ok = confirm(
      `PERMANENT DELETE${title ? `: "${title}"` : ""}?\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setBusy(lessonId, true);
    setErr(null);

    try {
      await requireUser();

      // If you also want to remove published snapshot, do it here (best effort)
      try {
        await deleteDoc(doc(db, "published_lessons", lessonId));
      } catch {}

      await deleteDoc(doc(db, "lessons", lessonId));
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Permanent delete failed");
    } finally {
      setBusy(lessonId, false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const n = qText.trim().toLowerCase();
    if (!n) return items;

    return items.filter((x) => {
      const tt = coerceTextType(x);
      const hay = `${x.title ?? ""} ${tt} ${x.level ?? ""} ${x.language ?? ""} ${x.ownerId ?? ""}`
        .toLowerCase()
        .trim();
      return hay.includes(n);
    });
  }, [items, qText]);

  return (
    <main style={{ padding: 20, maxWidth: 1050, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Admin: Trash</h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Deleted lessons (soft-deleted)</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder="Search title/type/owner…"
            style={{
              padding: "10px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              minWidth: 260,
              outline: "none",
            }}
          />

          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: "10px 14px",
              border: "1px solid #ddd",
              borderRadius: 10,
              background: "white",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 16 }}>Loading…</p>
      ) : err ? (
        <div
          style={{
            marginTop: 16,
            border: "1px solid #f3b4b4",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 800 }}>Error</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{err}</pre>
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ marginTop: 16, opacity: 0.75 }}>Trash is empty.</p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {filtered.map((l) => {
            const busy = !!busyById[l.id];
            const tt = coerceTextType(l);

            return (
              <div
                key={l.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 380 }}>
                  <div style={{ fontWeight: 900 }}>{l.title ?? "Untitled"}</div>
                  <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
                    id: {l.id}
                    {l.level ? ` · ${l.level}` : ""}
                    {tt ? ` · ${tt}` : ""}
                    {l.language ? ` · ${l.language}` : ""}
                    {" · "}
                    ownerId: {l.ownerId ?? "—"}
                    {" · "}
                    deletedAt: {formatMaybeDate(l.deletedAt)}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={() => restore(l.id)}
                    disabled={busy}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #111827",
                      borderRadius: 10,
                      background: "#111827",
                      color: "white",
                      cursor: busy ? "not-allowed" : "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Restore
                  </button>

                  <button
                    onClick={() => permanentDelete(l.id, l.title)}
                    disabled={busy}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #ef4444",
                      borderRadius: 10,
                      background: "white",
                      color: "#ef4444",
                      cursor: busy ? "not-allowed" : "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Permanent delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
