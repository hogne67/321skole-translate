// app/(app)/student/page.tsx
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
  type Timestamp,
  type DocumentData,
} from "firebase/firestore";

import { DashboardIntro } from "@/components/DashboardIntro";

type MyLessonRow = {
  id: string; // submissionId (uid_lessonId)
  publishedLessonId?: string;
  status?: "draft" | "submitted";

  // cached (may be missing for older submissions)
  lessonTitle?: string;
  lessonLevel?: string;
  lessonLanguage?: string;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type PublishedMeta = {
  title?: string;
  level?: string;
  language?: string;
};

type SubmissionDoc = {
  uid?: string;
  publishedLessonId?: string;
  status?: "draft" | "submitted";
  lessonTitle?: string;
  lessonLevel?: string;
  lessonLanguage?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type PublishedLessonDoc = {
  title?: string;
  level?: string;
  language?: string;
  isActive?: boolean;
};

function isPermissionDenied(e: unknown) {
  const err = e as { code?: unknown; message?: unknown };
  const code = String(err?.code ?? "").toLowerCase();
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    code.includes("permission-denied") ||
    code.includes("permission_denied") ||
    msg.includes("missing or insufficient permissions") ||
    msg.includes("insufficient permissions") ||
    msg.includes("permission-denied")
  );
}

function tsToMs(ts?: Timestamp): number {
  if (!ts) return 0;
  return ts.toMillis();
}

function asSubmissionDoc(data: DocumentData): SubmissionDoc {
  // lett “type guard-ish” uten any
  const d = data as Partial<SubmissionDoc>;
  return {
    uid: typeof d.uid === "string" ? d.uid : undefined,
    publishedLessonId:
      typeof d.publishedLessonId === "string" ? d.publishedLessonId : undefined,
    status: d.status === "draft" || d.status === "submitted" ? d.status : undefined,
    lessonTitle: typeof d.lessonTitle === "string" ? d.lessonTitle : undefined,
    lessonLevel: typeof d.lessonLevel === "string" ? d.lessonLevel : undefined,
    lessonLanguage:
      typeof d.lessonLanguage === "string" ? d.lessonLanguage : undefined,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function asPublishedLessonDoc(data: DocumentData): PublishedLessonDoc {
  const d = data as Partial<PublishedLessonDoc>;
  return {
    title: typeof d.title === "string" ? d.title : undefined,
    level: typeof d.level === "string" ? d.level : undefined,
    language: typeof d.language === "string" ? d.language : undefined,
    isActive: typeof d.isActive === "boolean" ? d.isActive : undefined,
  };
}

export default function StudentDashboard() {
  const [items, setItems] = useState<MyLessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // ✅ Trengs for DashboardIntro (gjest vs innlogget)
  const [isAnon, setIsAnon] = useState(true);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      setErr("");

      try {
        const user = await ensureAnonymousUser();
        if (!alive) return;

        // ✅ Lagre anon-status så introen kan vise riktig tekst
        setIsAnon(Boolean(user.isAnonymous));

        // 1) Hent mine submissions
        const qMine = query(collection(db, "submissions"), where("uid", "==", user.uid));
        const snap = await getDocs(qMine);
        if (!alive) return;

        let rows: MyLessonRow[] = snap.docs.map((d) => {
          const data = asSubmissionDoc(d.data());
          return {
            id: d.id,
            publishedLessonId: data.publishedLessonId,
            status: data.status,
            lessonTitle: data.lessonTitle,
            lessonLevel: data.lessonLevel,
            lessonLanguage: data.lessonLanguage,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });

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
              const id = r.publishedLessonId!;
              try {
                const ps = await getDoc(doc(db, "published_lessons", id));
                if (!ps.exists()) return null;

                const data = asPublishedLessonDoc(ps.data());
                const meta: PublishedMeta = {
                  title: data.title ?? "Lesson",
                  level: data.level,
                  language: data.language,
                };

                return { id, meta };
              } catch {
                // Avpublisert / rules kan blokkere – ignorer
                return null;
              }
            })
          );

          const metaMap = new Map<string, PublishedMeta>();
          metas
            .filter((m): m is { id: string; meta: PublishedMeta } => m !== null)
            .forEach((m) => {
              metaMap.set(m.id, m.meta);
            });

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
      } catch (e: unknown) {
        if (!alive) return;

        if (isPermissionDenied(e)) {
          setErr("Du har ikke tilgang til å lese submissions (rules).");
        } else {
          const msg = (e as { message?: unknown })?.message;
          setErr(typeof msg === "string" ? msg : "Noe gikk galt.");
        }
        setItems([]);
      }

      // ✅ Ikke finally-return. Sett loading her til slutt.
      if (alive) setLoading(false);
    };

    run();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <main style={{ maxWidth: 900, margin: "10px auto", padding: 10 }}>
      {/* ✅ Ny intro øverst (gir “plass” på mobil) */}
      <DashboardIntro userIsAnon={isAnon} />

      <hr style={{ margin: "10px 0 14px" }} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }} />

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