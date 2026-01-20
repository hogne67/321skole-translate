// app/student/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

type MyLessonRow = {
  id: string; // submissionId
  publishedLessonId?: string;
  status?: "draft" | "submitted";

  // cached (may be missing for older submissions)
  lessonTitle?: string;
  lessonLevel?: string;
  lessonLanguage?: string;

  createdAt?: any;
  updatedAt?: any;
};

type PublishedMeta = {
  title?: string;
  level?: string;
  language?: string;
};

export default function StudentDashboard() {
  const [items, setItems] = useState<MyLessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr("");

      try {
        const user = await ensureAnonymousUser();
        if (!alive) return;

        /* ----------------------------
           1) Hent mine submissions
        ---------------------------- */
        const qMine = query(
          collection(db, "submissions"),
          where("uid", "==", user.uid)
        );
        const snap = await getDocs(qMine);
        if (!alive) return;

        let rows: MyLessonRow[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        /* ----------------------------
           2) Fjern ødelagte submissions
              (mangler publishedLessonId)
        ---------------------------- */
        rows = rows.filter(
          (r) =>
            typeof r.publishedLessonId === "string" &&
            r.publishedLessonId.trim().length > 0
        );

        /* ----------------------------
           3) Sorter lokalt (nyeste først)
        ---------------------------- */
        rows.sort((a: any, b: any) => {
          const ta =
            a?.updatedAt?.toMillis?.() ??
            a?.createdAt?.toMillis?.() ??
            0;
          const tb =
            b?.updatedAt?.toMillis?.() ??
            b?.createdAt?.toMillis?.() ??
            0;
          return tb - ta;
        });

        /* ----------------------------
           4) Fyll inn metadata ved behov
              (kun UI, ingen writes)
        ---------------------------- */
        const needMeta = rows.filter(
          (r) => r.publishedLessonId && !r.lessonTitle
        );

        if (needMeta.length > 0) {
          const metas = await Promise.all(
            needMeta.map(async (r) => {
              try {
                const ps = await getDoc(
                  doc(db, "published_lessons", r.publishedLessonId!)
                );
                if (!ps.exists()) return null;

                const data = ps.data() as any;
                const meta: PublishedMeta = {
                  title: data.title ?? data.searchText ?? "Lesson",
                  level: data.level,
                  language: data.language,
                };

                return { id: r.publishedLessonId!, meta };
              } catch {
                return null;
              }
            })
          );

          const metaMap = new Map<string, PublishedMeta>();
          metas.filter(Boolean).forEach((m: any) =>
            metaMap.set(m.id, m.meta)
          );

          rows.forEach((r) => {
            if (!r.lessonTitle) {
              const m = metaMap.get(r.publishedLessonId!);
              if (m) {
                r.lessonTitle = m.title;
                r.lessonLevel = m.level;
                r.lessonLanguage = m.language;
              }
            }
          });
        }

        if (!alive) return;
        setItems(rows);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Missing or insufficient permissions.");
        setItems([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
        Student dashboard
      </h1>

      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Her ser du lessons du har hentet eller arbeider med.
      </p>

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <Link href="/student/browse" style={{ textDecoration: "none" }}>
          Browse publiserte lessons →
        </Link>
      </div>

      {err && (
        <div
          style={{
            padding: 12,
            background: "#ffe6e6",
            borderRadius: 8,
            marginTop: 12,
          }}
        >
          <b>Feil:</b> {err}
        </div>
      )}

      {loading ? (
        <p>Laster…</p>
      ) : items.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <p>Du har ikke hentet noen lessons ennå.</p>
          <Link href="/student/browse">
            Gå til Browse og velg en lesson
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {items.map((l) => (
            <Link
              key={l.id}
              href={`/student/lesson/${l.publishedLessonId}`}
              style={{
                display: "block",
                padding: 12,
                border: "1px solid #e5e5e5",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontWeight: 800 }}>
                {l.lessonTitle || "Lesson"}
              </div>

              <div style={{ opacity: 0.7, fontSize: 13 }}>
                {l.lessonLevel ? `Nivå: ${l.lessonLevel}` : null}
                {l.lessonLanguage ? ` • ${l.lessonLanguage}` : null}
                {l.status ? ` • ${l.status}` : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
