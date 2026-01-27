// app/student/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

type MyLessonRow = {
  id: string; // submissionId (uid_lessonId)
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

function isPermissionDenied(e: any) {
  const code = String(e?.code || "").toLowerCase();
  const msg = String(e?.message || "").toLowerCase();
  return (
    code.includes("permission-denied") ||
    code.includes("permission_denied") ||
    msg.includes("missing or insufficient permissions") ||
    msg.includes("insufficient permissions") ||
    msg.includes("permission-denied")
  );
}

function tsToMs(ts: any): number {
  if (!ts) return 0;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  const s = ts?.seconds;
  if (typeof s === "number") return s * 1000;
  return 0;
}

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

        // 1) Hent mine submissions
        const qMine = query(collection(db, "submissions"), where("uid", "==", user.uid));
        const snap = await getDocs(qMine);
        if (!alive) return;

        let rows: MyLessonRow[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        // 2) Fjern ødelagte submissions (mangler publishedLessonId)
        rows = rows.filter(
          (r) => typeof r.publishedLessonId === "string" && r.publishedLessonId.trim().length > 0
        );

        // 3) Sorter nyeste først
        rows.sort((a, b) => {
          const ta = tsToMs(a.updatedAt) || tsToMs(a.createdAt);
          const tb = tsToMs(b.updatedAt) || tsToMs(b.createdAt);
          return tb - ta;
        });

        // 4) Fyll inn metadata (kun for visning)
        const needMeta = rows.filter((r) => r.publishedLessonId && !r.lessonTitle);

        if (needMeta.length > 0) {
          const metas = await Promise.all(
            needMeta.map(async (r) => {
              try {
                const ps = await getDoc(doc(db, "published_lessons", r.publishedLessonId!));
                if (!ps.exists()) return null;

                const data = ps.data() as any;
                const meta: PublishedMeta = {
                  title: data.title ?? "Lesson",
                  level: data.level,
                  language: data.language,
                };

                return { id: r.publishedLessonId!, meta };
              } catch {
                // Hvis lesson er avpublisert kan rules blokkere; da lar vi det bare være tomt.
                return null;
              }
            })
          );

          const metaMap = new Map<string, PublishedMeta>();
          metas.filter(Boolean).forEach((m: any) => metaMap.set(m.id, m.meta));

          rows = rows.map((r) => {
            if (!r.lessonTitle) {
              const m = metaMap.get(r.publishedLessonId!);
              if (m) {
                return {
                  ...r,
                  lessonTitle: m.title,
                  lessonLevel: m.level,
                  lessonLanguage: m.language,
                };
              }
            }
            return r;
          });
        }

        if (!alive) return;
        setItems(rows);
      } catch (e: any) {
        if (!alive) return;

        if (isPermissionDenied(e)) {
          setErr("Du har ikke tilgang til å lese submissions (rules).");
        } else {
          setErr(e?.message || "Noe gikk galt.");
        }

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
    <main style={{ maxWidth: 900, margin: "10px auto", padding: 10 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Student</h1>

      <hr style={{ margin: "10px 0 14px" }} />

      <p style={{ opacity: 0.75, marginTop: 0 }}>
        Her finner du oppgaver du har startet på (utkast) eller sendt inn for feedback.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <Link
          href="/321lessons"
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: "8px 12px",
            textDecoration: "none",
            color: "inherit",
            background: "white",
            fontWeight: 700,
          }}
        >
          Åpne Library
        </Link>
      </div>

      {err && (
        <div
          style={{
            padding: 12,
            background: "#ffe6e6",
            borderRadius: 8,
            marginTop: 12,
            border: "1px solid rgba(200,0,0,0.25)",
          }}
        >
          <b>Feil:</b> {err}
        </div>
      )}

      {loading ? (
        <p style={{ marginTop: 14 }}>Laster…</p>
      ) : items.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <p>Du har ikke startet noen oppgaver ennå.</p>
          <Link href="/321lessons">Gå til Library og velg en oppgave</Link>
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
                background: "white",
              }}
            >
              <div style={{ fontWeight: 900 }}>{l.lessonTitle || "Lesson"}</div>

              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>
                {l.lessonLevel ? `Nivå: ${l.lessonLevel}` : null}
                {l.lessonLanguage ? ` • ${String(l.lessonLanguage).toUpperCase()}` : null}
                {l.status ? ` • ${l.status}` : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
