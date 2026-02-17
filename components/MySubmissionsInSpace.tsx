// components/MySubmissionsInSpace.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { collectionGroup, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";

type Row = {
  id: string;
  assignmentId: string;
  status: string;
  teacherText?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function firstLine(s: string, max = 140) {
  const t = (s || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function errToText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const maybe = e as { code?: unknown; message?: unknown };
    const code = typeof maybe.code === "string" ? maybe.code : "error";
    const msg = typeof maybe.message === "string" ? maybe.message : "Kunne ikke hente innleveringer";
    return `${code}: ${msg}`;
  }
  return `error: ${String(e)}`;
}

export default function MySubmissionsInSpace() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = params?.spaceId;

  const { user } = useUserProfile();
  const uid = user?.uid ?? null;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!spaceId) return;

      if (!uid) {
        if (!alive) return;
        setLoading(false);
        setRows([]);
        return;
      }

      setLoading(true);
      setErr(null);

      try {
        // NB: kan kreve index (Firestore gir link i console)
        const qy = query(
          collectionGroup(db, "submissions"),
          where("spaceId", "==", spaceId),
          where("uid", "==", uid),
          orderBy("updatedAt", "desc"),
          limit(50)
        );

        const snap = await getDocs(qy);
        if (!alive) return;

        const out: Row[] = snap.docs.map((d) => {
          const data = (d.data() as unknown) as Record<string, unknown>;
          const tf = isRecord(data.teacherFeedback) ? (data.teacherFeedback as Record<string, unknown>) : null;

          return {
            id: d.id,
            assignmentId: asString(data.assignmentId),
            status: asString(data.status) || "submitted",
            teacherText: tf ? asString(tf.text) : "",
          };
        });

        setRows(out);
      } catch (e: unknown) {
        if (!alive) return;
        setErr(errToText(e));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [spaceId, uid]);

  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.assignmentId || "unknown";
      const arr = m.get(key) ?? [];
      arr.push(r);
      m.set(key, arr);
    }
    return Array.from(m.entries()).map(([assignmentId, list]) => ({
      assignmentId,
      latest: list[0],
    }));
  }, [rows]);

  if (!uid) {
    return (
      <section style={card}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Mine innleveringer</div>
        <div style={{ opacity: 0.75 }}>Logg inn for å se innleveringer.</div>
      </section>
    );
  }

  return (
    <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 900 }}>Mine innleveringer</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Siste innlevering per oppgave i denne klassen.</div>
        </div>

        <button type="button" onClick={() => location.reload()} style={btn}>
          Oppdater
        </button>
      </div>

      {loading ? (
        <div style={{ marginTop: 12, opacity: 0.7 }}>Laster…</div>
      ) : err ? (
        <div style={{ marginTop: 12, color: "crimson", whiteSpace: "pre-wrap" }}>{err}</div>
      ) : grouped.length === 0 ? (
        <div style={{ marginTop: 12, opacity: 0.75 }}>Ingen innleveringer her enda.</div>
      ) : (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {grouped.map((g) => {
            const r = g.latest;
            const status = (r.status || "").toLowerCase().trim();
            const href = `/student/spaces/${spaceId}/assignments/${g.assignmentId}?sid=${r.id}`;

            return (
              <div key={g.assignmentId} style={rowCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      Oppgave: <code>{g.assignmentId}</code>
                    </div>
                    <div style={{ opacity: 0.75, marginTop: 4 }}>
                      Status: <code>{status || "submitted"}</code> • Submission: <code>{r.id}</code>
                    </div>
                  </div>

                  <Link
                    href={href}
                    style={{ ...btn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Åpne
                  </Link>
                </div>

                {r.teacherText ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.10)",
                      background: "rgba(0,0,0,0.02)",
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Tilbakemelding fra lærer</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{firstLine(r.teacherText)}</div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, opacity: 0.7 }}>Ingen tilbakemelding enda.</div>
                )}

                {status === "needs_work" ? (
                  <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>✍️ Åpnet for forbedring</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const card: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "white",
};

const rowCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "white",
};

const btn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.15)",
  borderRadius: 10,
  padding: "8px 12px",
  background: "white",
  fontWeight: 900,
  cursor: "pointer",
};