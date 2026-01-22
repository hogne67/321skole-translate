"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

// ✅ Editor ligger under /producer/texts/[id]
const EDIT_BASE = "/producer";

type Lesson = {
  id: string;
  title?: string;
  description?: string;
  level?: string;
  language?: string;
  topics?: string[];
  ownerId?: string;
  createdAt?: any;
  updatedAt?: any;
  activePublishedId?: string | null;
  publishedAt?: any;
};

export default function TeacherDashboardPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadLessons(userId: string) {
    setLoading(true);
    setError(null);
    try {
      const qy = query(collection(db, "lessons"), where("ownerId", "==", userId));
      const snap = await getDocs(qy);

      const rows: Lesson[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      // Lokal sort: publishedAt først, ellers updatedAt/createdAt
      rows.sort((a: any, b: any) => {
        const at =
          a?.publishedAt?.seconds ??
          a?.updatedAt?.seconds ??
          a?.createdAt?.seconds ??
          0;
        const bt =
          b?.publishedAt?.seconds ??
          b?.updatedAt?.seconds ??
          b?.createdAt?.seconds ??
          0;
        return bt - at;
      });

      setLessons(rows);
    } catch (e: any) {
      setError(e?.message || "Kunne ikke hente lessons.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await ensureAnonymousUser();
      const user = auth.currentUser;
      if (!user) {
        setError("Ingen bruker funnet etter innlogging.");
        setLoading(false);
        return;
      }
      await loadLessons(user.uid);
    })();
  }, []);

  const publishedLessons = useMemo(
    () => lessons.filter((l) => !!l.activePublishedId),
    [lessons]
  );

  const lastPublished = useMemo(
    () => publishedLessons.slice(0, 3),
    [publishedLessons]
  );

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Teacher</h1>
          <p style={{ marginTop: 8, opacity: 0.75 }}>
            Publiserte lessons: {publishedLessons.length}
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/321lessons" style={{ textDecoration: "none" }}>
            321lessons
          </Link>
          <Link href="/producer/texts" style={{ textDecoration: "none" }}>
            Lessons
          </Link>
          <Link href="/producer/texts/new" style={{ textDecoration: "none" }}>
            New lesson
          </Link>
          
        </div>
      </header>

      {error ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid rgba(200,0,0,0.35)", borderRadius: 12 }}>
          <strong>Feil:</strong> <span style={{ opacity: 0.85 }}>{error}</span>
        </div>
      ) : null}

      <section style={{ marginTop: 16 }}>
        <h2 style={{ margin: "8px 0" }}>Siste publiserte</h2>

        {loading ? (
          <p>Laster…</p>
        ) : publishedLessons.length === 0 ? (
          <p style={{ opacity: 0.8 }}>
            Ingen publiserte lessons ennå. Gå til <strong>Lessons</strong> for å publisere.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {lastPublished.map((l) => (
              <div
                key={l.id}
                style={{
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 14,
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 260 }}>
                  <div style={{ opacity: 0.75, fontSize: 13 }}>
                    ✅ Published
                    {l.level ? ` • ${l.level}` : ""}
                    {l.language ? ` • ${String(l.language).toUpperCase()}` : ""}
                  </div>

                  <div style={{ fontSize: 18, marginTop: 6 }}>
                    <strong>{l.title || "(Uten tittel)"}</strong>
                  </div>

                  {l.description ? (
                    <div style={{ marginTop: 6, opacity: 0.8 }}>
                      {l.description.length > 140 ? l.description.slice(0, 140) + "…" : l.description}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Link href={`${EDIT_BASE}/${l.id}`} style={{ textDecoration: "none" }}>
                    Edit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {publishedLessons.length > 3 ? (
          <p style={{ marginTop: 12, opacity: 0.75 }}>
            Viser 3 av {publishedLessons.length}. Gå til <Link href="/producer/texts">Lessons</Link> for alle.
          </p>
        ) : null}
      </section>
    </main>
  );
}
