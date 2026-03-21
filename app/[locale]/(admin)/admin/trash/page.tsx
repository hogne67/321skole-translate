"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { collection, getDocs, orderBy, query, where, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";

type FirestoreTimestampLike =
  | { toDate?: () => Date; seconds?: number }
  | null
  | undefined;

type TrashRow = {
  id: string;
  ownerId?: string;
  title?: string;
  level?: string;
  language?: string;
  textType?: string;
  texttype?: string;
  status?: string;
  deletedAt?: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toStringSafe(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function toTimestampLike(v: unknown): FirestoreTimestampLike {
  if (isRecord(v)) return v as FirestoreTimestampLike;
  if (v instanceof Date) return { toDate: () => v };
  if (typeof v === "number") return { toDate: () => new Date(v) };
  return undefined;
}

function formatMaybeDate(v: unknown) {
  try {
    const d: Date | null =
      isRecord(v) && typeof v.toDate === "function" && v.toDate() instanceof Date
        ? (v.toDate() as Date)
        : v instanceof Date
          ? v
          : typeof v === "number"
            ? new Date(v)
            : null;

    if (!d) return "—";
    return d.toLocaleString("no-NO");
  } catch {
    return "—";
  }
}

function coerceTextType(d: TrashRow): string {
  const a = String(d.textType ?? "").trim();
  if (a) return a;
  const b = String(d.texttype ?? "").trim();
  if (b) return b;
  return "";
}

function coerceTrashRow(id: string, data: DocumentData): TrashRow {
  const obj: Record<string, unknown> = isRecord(data) ? data : {};
  return {
    id,
    ownerId: toStringSafe(obj.ownerId),
    title: toStringSafe(obj.title),
    level: toStringSafe(obj.level),
    language: toStringSafe(obj.language),
    textType: toStringSafe(obj.textType),
    texttype: toStringSafe(obj.texttype),
    status: toStringSafe(obj.status),
    deletedAt: toTimestampLike(obj.deletedAt),
    updatedAt: toTimestampLike(obj.updatedAt),
  };
}

function errorMessage(e: unknown): string {
  if (isRecord(e) && typeof e.message === "string") return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

async function authedPost<T = unknown>(url: string, body: unknown): Promise<T> {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not signed in");

  const token = await user.getIdToken();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg =
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : raw || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return (data ?? {}) as T;
}

function Pill({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "amber" | "red";
}) {
  const tones = {
    neutral: {
      background: "rgba(0,0,0,0.05)",
      border: "1px solid rgba(0,0,0,0.10)",
    },
    amber: {
      background: "rgba(245,158,11,0.12)",
      border: "1px solid rgba(245,158,11,0.18)",
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
        ...tones[tone],
      }}
    >
      {text}
    </span>
  );
}

export default function AdminTrashPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<TrashRow[]>([]);
  const [qText, setQText] = useState("");
  const [busyById, setBusyById] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);

  function setBusy(id: string, v: boolean) {
    setBusyById((m) => ({ ...m, [id]: v }));
  }

  async function requireUser() {
    const u = getAuth().currentUser;
    if (!u) throw new Error("Not signed in");
    return u.uid;
  }

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      if (!db) throw new Error("Firestore db is null.");
      await requireUser();

      const qy = query(
        collection(db, "lessons"),
        where("deletedAt", "!=", null),
        orderBy("deletedAt", "desc")
      );

      const snap = await getDocs(qy);
      const rows: TrashRow[] = snap.docs.map((d) => coerceTrashRow(d.id, d.data()));
      setItems(rows);
    } catch (e: unknown) {
      setErr(errorMessage(e) || "Failed to load trash");
    } finally {
      setLoading(false);
    }
  }, []);

  async function restore(lessonId: string) {
    setBusy(lessonId, true);
    setErr(null);
    setMsg(null);

    try {
      await requireUser();
      await authedPost("/api/admin/trash/restore", { id: lessonId });
      setMsg(`Restored ✅ (${lessonId})`);
      await load();
    } catch (e: unknown) {
      setErr(errorMessage(e) || "Restore failed");
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
    setMsg(null);

    try {
      await requireUser();
      await authedPost("/api/admin/trash/permanent-delete", { id: lessonId });
      setMsg(`Deleted permanently ❌ (${lessonId})`);
      await load();
    } catch (e: unknown) {
      setErr(errorMessage(e) || "Permanent delete failed");
    } finally {
      setBusy(lessonId, false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

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
            <h2 style={{ margin: "4px 0 0", fontSize: 24 }}>Trash</h2>
            <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
              Soft-deleted lessons som kan gjenopprettes eller slettes permanent.
            </p>
          </div>

          <button
            onClick={() => void load()}
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
            {loading ? "Laster…" : "Oppdater"}
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
            placeholder="Søk tittel, type, språk, ownerId…"
            style={{
              padding: "10px 12px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 10,
              minWidth: 280,
              flex: "1 1 280px",
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginTop: 12, fontSize: 13, opacity: 0.75 }}>
          Viser <b>{filtered.length}</b> av <b>{items.length}</b> items
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

      <section style={{ display: "grid", gap: 12 }}>
        {loading ? <div style={{ opacity: 0.75 }}>Laster trash…</div> : null}

        {!loading && filtered.length === 0 ? (
          <div
            style={{
              padding: 18,
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "white",
            }}
          >
            Trash is empty.
          </div>
        ) : null}

        {filtered.map((l) => {
          const busy = !!busyById[l.id];
          const tt = coerceTextType(l);

          return (
            <article
              key={l.id}
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
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 280, flex: "1 1 420px" }}>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    {l.title ?? "Untitled"}
                  </div>

                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {l.level ? <Pill text={l.level} /> : null}
                    {tt ? <Pill text={tt} /> : null}
                    {l.language ? <Pill text={l.language.toUpperCase()} tone="amber" /> : null}
                    <Pill text="deleted" tone="red" />
                  </div>

                  <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
                    id: {l.id}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
                    ownerId: {l.ownerId ?? "—"}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
                    deletedAt: {formatMaybeDate(l.deletedAt)} · updatedAt: {formatMaybeDate(l.updatedAt)}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={() => void restore(l.id)}
                    disabled={busy}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #111827",
                      borderRadius: 10,
                      background: "#111827",
                      color: "white",
                      cursor: busy ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    {busy ? "Working…" : "Restore"}
                  </button>

                  <button
                    onClick={() => void permanentDelete(l.id, l.title)}
                    disabled={busy}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #ef4444",
                      borderRadius: 10,
                      background: "white",
                      color: "#ef4444",
                      cursor: busy ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    {busy ? "Working…" : "Permanent delete"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}