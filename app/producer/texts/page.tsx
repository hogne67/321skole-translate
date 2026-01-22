"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { getAuth } from "firebase/auth";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type LessonRow = {
  id: string;
  title?: string;
  level?: string;
  topic?: string;
  status?: "draft" | "published";
  updatedAt?: any;
};

export default function ProducerTextsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [items, setItems] = useState<LessonRow[]>([]);

  async function load() {
    setErr(null);
    setLoading(true);

    try {
      await ensureAnonymousUser();
      const u = getAuth().currentUser?.uid ?? null;
      if (!u) throw new Error("No auth uid");
      setUid(u);

      const qy = query(
        collection(db, "lessons"),
        where("ownerId", "==", u),
        orderBy("updatedAt", "desc")
      );

      const snap = await getDocs(qy);

      const data = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as LessonRow[];

      setItems(data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load lessons");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await load();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
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
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>
            My content
          </h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            uid: {uid ?? "—"}
          </div>
        </div>
        

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/producer" style={{ textDecoration: "none" }}>
            Dashboard
          </Link>
          <Link href="/producer/texts" style={{ textDecoration: "none" }}>
            Lessons
          </Link>
          <Link href="/producer/texts/new" style={{ textDecoration: "none" }}>
            New lesson
          </Link>
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
          <div style={{ marginTop: 10, opacity: 0.8 }}>
            Hvis feilen sier “query requires an index”, klikk lenken og lag indeksen.
          </div>
        </div>
      ) : items.length === 0 ? (
        <p style={{ marginTop: 16, opacity: 0.75 }}>
          No lessons yet. Click “New”.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {items.map((l) => (
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
              <div style={{ minWidth: 320 }}>
                <div style={{ fontWeight: 900 }}>
                  {l.title ?? "Untitled"}
                </div>
                <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
                  {l.status ?? "—"}
                  {l.level ? ` · ${l.level}` : ""}
                  {l.topic ? ` · ${l.topic}` : ""}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Link
                  href={`/producer/${l.id}/preview`}
                  style={{
                    padding: "10px 14px",
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    textDecoration: "none",
                    color: "inherit",
                    fontWeight: 700,
                    opacity: 0.9,
                  }}
                >
                  Preview
                </Link>

                <Link
                  href={`/producer/${l.id}`}
                  style={{
                    padding: "10px 14px",
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    textDecoration: "none",
                    color: "inherit",
                    fontWeight: 800,
                  }}
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
