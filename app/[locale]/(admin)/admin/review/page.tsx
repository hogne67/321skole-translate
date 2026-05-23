"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { collection, getDocs, limit, orderBy, query, where, type DocumentData } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";

type PendingLesson = {
  id: string;
  title?: string;
  description?: string;
  level?: string;
  language?: string;
  topic?: string;
  topics?: string[];
  textType?: string;
  texttype?: string;
  sourceText?: string;
  text?: string;
  tasks?: unknown;
  coverImageUrl?: string;
  imageUrl?: string;

  publish?: { state?: string };
  moderation?: {
    status?: string;
    riskScore?: number;
    reasons?: string[];
    notes?: string;
    checkedAt?: unknown;
  };

  ownerId?: string;
  updatedAt?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toStringSafe(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function toStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x) => typeof x === "string") as string[];
  return out.length ? out : [];
}

function toNum(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
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

function coercePendingLesson(id: string, data: DocumentData): PendingLesson {
  const obj: Record<string, unknown> = isRecord(data) ? data : {};

  const moderationRaw = obj.moderation;
  const moderation = isRecord(moderationRaw) ? moderationRaw : undefined;

  const publishRaw = obj.publish;
  const publish = isRecord(publishRaw) ? publishRaw : undefined;

  return {
    id,
    title: toStringSafe(obj.title) || undefined,
    description: toStringSafe(obj.description) || undefined,
    level: toStringSafe(obj.level) || undefined,
    language: toStringSafe(obj.language) || undefined,
    topic: toStringSafe(obj.topic) || undefined,
    topics: toStringArray(obj.topics),
    textType: toStringSafe(obj.textType) || undefined,
    texttype: toStringSafe(obj.texttype) || undefined,
    sourceText: toStringSafe(obj.sourceText) || undefined,
    text: toStringSafe(obj.text) || undefined,
    tasks: obj.tasks,
    coverImageUrl: toStringSafe(obj.coverImageUrl) || undefined,
    imageUrl: toStringSafe(obj.imageUrl) || undefined,
    publish: publish
      ? {
          state: toStringSafe(publish.state) || undefined,
        }
      : undefined,
    moderation: moderation
      ? {
          status: toStringSafe(moderation.status) || undefined,
          riskScore: typeof moderation.riskScore === "number" ? moderation.riskScore : undefined,
          reasons: toStringArray(moderation.reasons),
          notes: toStringSafe(moderation.notes) || undefined,
          checkedAt: moderation.checkedAt,
        }
      : undefined,
    ownerId: toStringSafe(obj.ownerId) || undefined,
    updatedAt: obj.updatedAt,
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
  tone?: "neutral" | "amber" | "green" | "red" | "blue";
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
    green: {
      background: "rgba(34,197,94,0.10)",
      border: "1px solid rgba(34,197,94,0.18)",
    },
    red: {
      background: "rgba(239,68,68,0.10)",
      border: "1px solid rgba(239,68,68,0.18)",
    },
    blue: {
      background: "rgba(59,130,246,0.10)",
      border: "1px solid rgba(59,130,246,0.18)",
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

export default function AdminReviewPage() {
  const locale = useLocale();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingLesson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [qText, setQText] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    setMsg(null);

    try {
      const qy = query(
        collection(db, "lessons"),
        where("publish.state", "==", "pending"),
        orderBy("moderation.riskScore", "desc"),
        limit(50)
      );

      const snap = await getDocs(qy);
      const out: PendingLesson[] = snap.docs.map((d) => coercePendingLesson(d.id, d.data()));
      setItems(out);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = qText.trim().toLowerCase();
    if (!q) return items;

    return items.filter((x) => {
      const hay = [
        x.title ?? "",
        x.description ?? "",
        x.language ?? "",
        x.level ?? "",
        x.textType ?? "",
        x.texttype ?? "",
        x.ownerId ?? "",
        ...(x.moderation?.reasons ?? []),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [items, qText]);

  const sorted = useMemo(() => {
    return filtered
      .slice()
      .sort((a, b) => toNum(b.moderation?.riskScore, 0) - toNum(a.moderation?.riskScore, 0));
  }, [filtered]);

  async function approve(item: PendingLesson) {
    setBusyId(item.id);
    setError(null);
    setMsg(null);

    try {
      await authedPost("/api/admin/review/approve", { id: item.id });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setMsg(`Approved (${item.id})`);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(item: PendingLesson) {
    setBusyId(item.id);
    setError(null);
    setMsg(null);

    try {
      await authedPost("/api/admin/review/reject", { id: item.id });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setMsg(`Rejected ❌ (${item.id})`);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

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
            <h2 style={{ margin: "4px 0 0", fontSize: 24 }}>Review queue</h2>
            <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
              Pending lessons flagged by moderation checks.
            </p>
          </div>

          <button
            onClick={load}
            disabled={loading || !!busyId}
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
            placeholder="Search title, language, level, reasons, ownerId..."
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              minWidth: 280,
              flex: "1 1 280px",
            }}
          />

          <Link
            href={`/${locale}/admin`}
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
            Dashboard
          </Link>
        </div>

        <div style={{ marginTop: 12, fontSize: 13, opacity: 0.75 }}>
          Showing <b>{sorted.length}</b> of <b>{items.length}</b> items
        </div>
      </section>

      {error ? (
        <section
          style={{
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(239,68,68,0.20)",
            background: "rgba(239,68,68,0.05)",
          }}
        >
          <b>Error:</b> {error}
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
        {loading ? <div style={{ opacity: 0.75 }}>Loading review queue...</div> : null}

        {!loading && sorted.length === 0 ? (
          <div
            style={{
              padding: 18,
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "white",
            }}
          >
            No pending items.
          </div>
        ) : null}

        {sorted.map((x) => {
          const score = toNum(x.moderation?.riskScore, 0);
          const reasons = Array.isArray(x.moderation?.reasons) ? x.moderation?.reasons : [];
          const disabled = busyId === x.id;

          return (
            <article
              key={x.id}
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
                <div style={{ minWidth: 280, flex: "1 1 420px" }}>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    {x.title || "(untitled)"}
                  </div>

                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Pill text={`score ${score}`} tone={score >= 70 ? "red" : score >= 40 ? "amber" : "blue"} />
                    {x.language ? <Pill text={String(x.language).toUpperCase()} tone="neutral" /> : null}
                    {x.level ? <Pill text={x.level} tone="neutral" /> : null}
                    {x.textType ? <Pill text={x.textType} tone="neutral" /> : null}
                    {!x.textType && x.texttype ? <Pill text={x.texttype} tone="neutral" /> : null}
                    {x.moderation?.status ? <Pill text={x.moderation.status} tone="amber" /> : null}
                  </div>

                  {reasons.length ? (
                    <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
                      Reasons: <b>{reasons.slice(0, 6).join(", ")}</b>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, fontSize: 13, opacity: 0.7 }}>Reasons: (none)</div>
                  )}

                  <div style={{ marginTop: 10, fontSize: 13, opacity: 0.7 }}>
                    ownerId: {x.ownerId || "—"} · updated: {formatDate(x.updatedAt)}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <Link
                    href={`/${locale}/321lessons/${x.id}`}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.14)",
                      textDecoration: "none",
                      color: "inherit",
                      background: "white",
                      fontWeight: 700,
                    }}
                  >
                    Preview
                  </Link>

                  <Link
                    href={`/${locale}/producer/texts/${x.id}`}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.14)",
                      textDecoration: "none",
                      color: "inherit",
                      background: "white",
                      fontWeight: 700,
                    }}
                  >
                    Open draft
                  </Link>

                  <button
                    onClick={() => approve(x)}
                    disabled={!!busyId}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.14)",
                      background: disabled ? "rgba(0,0,0,0.04)" : "rgba(190,247,192,1)",
                      fontWeight: 800,
                      cursor: disabled ? "not-allowed" : "pointer",
                    }}
                  >
                    {disabled ? "Working…" : "Approve"}
                  </button>

                  <button
                    onClick={() => reject(x)}
                    disabled={!!busyId}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.14)",
                      background: disabled ? "rgba(0,0,0,0.04)" : "#fff",
                      fontWeight: 700,
                      cursor: disabled ? "not-allowed" : "pointer",
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", opacity: 0.85 }}>Details</summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    marginTop: 10,
                    fontSize: 12,
                    opacity: 0.85,
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(0,0,0,0.03)",
                    overflowX: "auto",
                  }}
                >
                  {JSON.stringify(
                    {
                      id: x.id,
                      title: x.title,
                      publish: x.publish,
                      moderation: x.moderation,
                      ownerId: x.ownerId,
                    },
                    null,
                    2
                  )}
                </pre>
              </details>
            </article>
          );
        })}
      </section>
    </main>
  );
}
