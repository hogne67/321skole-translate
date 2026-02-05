// app/(app)/student/browse/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import type { User } from "firebase/auth";

type LessonRow = {
  id: string; // published lesson id
  title?: string;
  level?: string;
  topic?: string;
  language?: string;
  isActive?: boolean;
};

type SubmissionRow = {
  publishedLessonId?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (isRecord(e) && typeof e.message === "string") return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export default function StudentBrowsePage() {
  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [openedIds, setOpenedIds] = useState<Set<string>>(new Set());
  const [hideOpened, setHideOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const user: User = await ensureAnonymousUser();

        // 1) published library
        const qPub = query(collection(db, "published_lessons"), where("isActive", "==", true));
        const pubSnap = await getDocs(qPub);

        // 2) user's submissions (to mark already opened/hented)
        const qSubs = query(collection(db, "submissions"), where("uid", "==", user.uid));
        const subSnap = await getDocs(qSubs);

        if (!alive) return;

        const rows: LessonRow[] = pubSnap.docs.map((d) => {
          const dataUnknown = d.data() as unknown;
          const data = isRecord(dataUnknown) ? dataUnknown : {};

          return {
            id: d.id,
            title:
              typeof data.title === "string"
                ? data.title
                : typeof data.searchText === "string"
                ? data.searchText
                : "(Untitled)",
            level: typeof data.level === "string" ? data.level : undefined,
            topic: typeof data.topic === "string" ? data.topic : undefined,
            language: typeof data.language === "string" ? data.language : undefined,
            isActive: typeof data.isActive === "boolean" ? data.isActive : undefined,
          };
        });

        rows.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));

        const opened = new Set<string>();
        subSnap.docs.forEach((d) => {
          const dataUnknown = d.data() as unknown;
          const data = isRecord(dataUnknown) ? (dataUnknown as SubmissionRow) : {};
          if (typeof data.publishedLessonId === "string" && data.publishedLessonId) {
            opened.add(data.publishedLessonId);
          }
        });

        setLessons(rows);
        setOpenedIds(opened);
      } catch (e: unknown) {
        if (!alive) return;
        setError(getErrorMessage(e) || "Kunne ikke hente lessons");
        setLessons([]);
        setOpenedIds(new Set());
      } finally {
  if (alive) setLoading(false);
}
    }

    run();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!hideOpened) return lessons;
    return lessons.filter((l) => !openedIds.has(l.id));
  }, [lessons, hideOpened, openedIds]);

  return (
    <main style={{ maxWidth: 900, margin: "10px auto", padding: 10 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>My library</h1>

      <hr style={{ margin: "10px 0 14px" }} />

      <p style={{ opacity: 0.75, marginTop: 0 }}>
        Her ser du publiserte lessons. Du kan skjule eller markere de du allerede har hentet.
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={hideOpened} onChange={(e) => setHideOpened(e.target.checked)} />
          Skjul hentede
        </label>
      </div>

      {error && (
        <div
          style={{
            border: "1px solid #f3b4b4",
            background: "#fff5f5",
            padding: 12,
            borderRadius: 10,
            marginTop: 12,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : filtered.length === 0 ? (
        <p style={{ opacity: 0.75 }}>
          {hideOpened ? "Ingen nye lessons (alle er allerede hentet)." : "Ingen publiserte lessons enda."}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {filtered.map((l) => {
            const opened = openedIds.has(l.id);

            return (
              <Link
                key={l.id}
                href={`/student/lesson/${l.id}`}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 12,
                  textDecoration: "none",
                  color: "inherit",
                  background: opened ? "rgba(0,0,0,0.04)" : "white",
                  opacity: opened ? 0.85 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 800 }}>{l.title || "(Untitled)"}</div>
                  {opened ? (
                    <span
                      style={{
                        fontSize: 12,
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: "1px solid rgba(0,0,0,0.15)",
                        opacity: 0.85,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Hentet
                    </span>
                  ) : null}
                </div>

                <div style={{ opacity: 0.75, fontSize: 13, marginTop: 4 }}>
                  {l.level ? `Level: ${l.level}` : ""}
                  {l.level && l.topic ? " • " : ""}
                  {l.topic ? `Topic: ${l.topic}` : ""}
                  {(l.level || l.topic) && l.language ? " • " : ""}
                  {l.language ? `Language: ${l.language}` : ""}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
