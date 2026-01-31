// app/(app)/admin/review/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";

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
  tasks?: any;
  coverImageUrl?: string;
  imageUrl?: string;

  publish?: { state?: string };
  moderation?: {
    status?: string;
    riskScore?: number;
    reasons?: string[];
    notes?: string;
    checkedAt?: any;
  };

  ownerId?: string;
  updatedAt?: any;
};

function toNum(v: any, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function AdminReviewPage() {
  const { user, profile, loading: profileLoading } = useUserProfile();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingLesson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const isAdmin = !!profile?.roles?.admin;

  async function load() {
    setLoading(true);
    setError(null);
    setMsg(null);

    try {
      const q = query(
        collection(db, "lessons"),
        where("publish.state", "==", "pending"),
        orderBy("moderation.riskScore", "desc"),
        limit(50)
      );

      const snap = await getDocs(q);
      const out: PendingLesson[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setItems(out);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (profileLoading) return;
    // AuthGate på admin-layout skal allerede ha stoppet ikke-admin,
    // men vi dobbeltsjekker her for å unngå rare states.
    if (!user || !isAdmin) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoading, user?.uid, isAdmin]);

  const sorted = useMemo(() => {
    return items
      .slice()
      .sort((a, b) => toNum(b.moderation?.riskScore, 0) - toNum(a.moderation?.riskScore, 0));
  }, [items]);

  async function approve(item: PendingLesson) {
    setBusyId(item.id);
    setError(null);
    setMsg(null);

    try {
      const id = item.id;

      const title = String(item.title ?? "").trim();
      const sourceText = String(item.sourceText ?? item.text ?? "").trim();
      if (!title) throw new Error("Cannot approve: missing title.");
      if (!sourceText) throw new Error("Cannot approve: missing sourceText.");

      // 1) publish copy
      await setDoc(
        doc(db, "published_lessons", id),
        {
          title,
          description: String(item.description ?? "").trim() || "",
          level: String(item.level ?? "").trim() || "",
          language: String(item.language ?? "").trim() || "",

          topic: String(item.topic ?? "").trim() || "",
          topics: Array.isArray(item.topics) ? item.topics : (item.topic ? [item.topic] : []),

          textType: String(item.textType ?? item.texttype ?? "").trim() || "",
          texttype: String(item.texttype ?? item.textType ?? "").trim() || "",

          sourceText,
          tasks: item.tasks ?? [],

          coverImageUrl: item.coverImageUrl ?? "",
          imageUrl: item.imageUrl ?? "",

          isActive: true,

          publish: { state: "published", visibility: "public" },
          moderation: {
            ...(item.moderation || {}),
            reviewedBy: user?.uid || "",
            reviewedAt: serverTimestamp(),
          },

          status: "published",
          publishedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 2) mark draft
      await updateDoc(doc(db, "lessons", id), {
        "publish.state": "published",
        status: "published",
        "publish.reviewedBy": user?.uid || "",
        "publish.reviewedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setItems((prev) => prev.filter((x) => x.id !== id));
      setMsg(`Approved ✅ (${id})`);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(item: PendingLesson) {
    setBusyId(item.id);
    setError(null);
    setMsg(null);

    try {
      const id = item.id;

      // mark draft rejected
      await updateDoc(doc(db, "lessons", id), {
        "publish.state": "rejected",
        status: "draft",
        "publish.reviewedBy": user?.uid || "",
        "publish.reviewedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // (valgfritt) hvis den noen gang har vært publisert før, kan vi deaktivere kopien:
      await setDoc(
        doc(db, "published_lessons", id),
        {
          isActive: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setItems((prev) => prev.filter((x) => x.id !== id));
      setMsg(`Rejected ❌ (${id})`);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 6px" }}>Admin: Review queue</h1>
          <div style={{ opacity: 0.75 }}>Pending lessons flagged by auto-check</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <button onClick={load} disabled={loading || !!busyId} style={{ padding: "10px 14px" }}>
            Refresh
          </button>
          <Link href="/admin" style={{ padding: "10px 14px", border: "1px solid rgba(0,0,0,0.14)", borderRadius: 12 }}>
            Admin dashboard
          </Link>
        </div>
      </header>

      {profileLoading ? <p style={{ padding: 16 }}>Loading profile…</p> : null}

      {!profileLoading && (!user || !isAdmin) ? (
        <div style={{ padding: 16 }}>
          <p style={{ color: "crimson" }}>Unauthorized.</p>
          <Link href="/student">Go to student</Link>
        </div>
      ) : null}

      {error ? (
        <div style={{ padding: 12, background: "#ffe6e6", borderRadius: 8, marginTop: 12 }}>
          <b>Error:</b> {error}
        </div>
      ) : null}

      {msg ? (
        <div style={{ padding: 12, background: "#e9ffe6", borderRadius: 8, marginTop: 12 }}>
          {msg}
        </div>
      ) : null}

      <section style={{ marginTop: 14 }}>
        {loading ? <p>Loading…</p> : null}

        {!loading && sorted.length === 0 ? (
          <p style={{ opacity: 0.75 }}>No pending items 🎉</p>
        ) : null}

        <div style={{ display: "grid", gap: 12 }}>
          {sorted.map((x) => {
            const score = toNum(x.moderation?.riskScore, 0);
            const reasons = Array.isArray(x.moderation?.reasons) ? x.moderation?.reasons : [];
            const disabled = busyId === x.id;

            return (
              <div
                key={x.id}
                style={{
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 12,
                  padding: 12,
                  background: "white",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{x.title || "(untitled)"}</div>
                    <div style={{ opacity: 0.75, marginTop: 4 }}>
                      Score: <b>{score}</b>
                      {x.language ? ` • ${String(x.language).toUpperCase()}` : ""}
                      {x.level ? ` • ${x.level}` : ""}
                      {x.textType ? ` • ${x.textType}` : x.texttype ? ` • ${x.texttype}` : ""}
                    </div>

                    {reasons.length ? (
                      <div style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>
                        Reasons: <b>{reasons.slice(0, 6).join(", ")}</b>
                      </div>
                    ) : (
                      <div style={{ marginTop: 8, opacity: 0.7, fontSize: 13 }}>Reasons: (none)</div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <Link
                      href={`/321lessons/${x.id}`}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.14)",
                        textDecoration: "none",
                      }}
                    >
                      Preview (published)
                    </Link>

                    <Link
                      href={`/producer/texts/${x.id}`}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.14)",
                        textDecoration: "none",
                      }}
                    >
                      Open draft
                    </Link>

                    <button
                      onClick={() => approve(x)}
                      disabled={!!busyId}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.14)",
                        background: disabled ? "rgba(0,0,0,0.04)" : "rgba(190,247,192,1)",
                        fontWeight: 800,
                      }}
                    >
                      {disabled ? "Working…" : "Approve"}
                    </button>

                    <button
                      onClick={() => reject(x)}
                      disabled={!!busyId}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.14)",
                        background: disabled ? "rgba(0,0,0,0.04)" : "#fff",
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>

                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", opacity: 0.85 }}>Details</summary>
                  <pre style={{ whiteSpace: "pre-wrap", marginTop: 10, fontSize: 12, opacity: 0.85 }}>
{JSON.stringify(
  {
    id: x.id,
    publish: x.publish,
    moderation: x.moderation,
    ownerId: x.ownerId,
  },
  null,
  2
)}
                  </pre>
                </details>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
