"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";

type LessonRow = {
  id: string;
  title?: string;
  level?: string;
  topic?: string;
  tags?: string[];
  language?: string;
  estimatedMinutes?: number;
  releaseMode?: "ALL_AT_ONCE" | "TEXT_FIRST";
  status?: "draft" | "published";
};

function norm(s: string) {
  return (s ?? "").toLowerCase().trim();
}

export default function LearnerLibraryPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lessons, setLessons] = useState<LessonRow[]>([]);

  // Filters
  const [qText, setQText] = useState("");
  const [level, setLevel] = useState<string>("ALL");
  const [topic, setTopic] = useState<string>("ALL");

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      try {
        await ensureAnonymousUser();

        const qy = query(
          collection(db, "lessons"),
          where("status", "==", "published")
        );

        const snap = await getDocs(qy);
        if (!alive) return;

        const data = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as LessonRow[];

        setLessons(data);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Failed to load lessons");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const allLevels = useMemo(() => {
    const s = new Set<string>();
    for (const l of lessons) if (l.level) s.add(l.level);
    return ["ALL", ...Array.from(s).sort()];
  }, [lessons]);

  const allTopics = useMemo(() => {
    const s = new Set<string>();
    for (const l of lessons) if (l.topic) s.add(l.topic);
    return ["ALL", ...Array.from(s).sort()];
  }, [lessons]);

  const filtered = useMemo(() => {
    const q = norm(qText);

    return lessons
      .filter((l) => {
        if (level !== "ALL" && (l.level ?? "") !== level) return false;
        if (topic !== "ALL" && (l.topic ?? "") !== topic) return false;

        if (!q) return true;

        const hay = [
          l.title ?? "",
          l.topic ?? "",
          ...(Array.isArray(l.tags) ? l.tags : []),
        ]
          .join(" ")
          .toLowerCase();

        return hay.includes(q);
      })
      .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
  }, [lessons, qText, level, topic]);

  if (loading) return <main style={{ padding: 20 }}>Loading library…</main>;

  if (err) {
    return (
      <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900 }}>Library</h1>
        <div
          style={{
            marginTop: 12,
            border: "1px solid #f3b4b4",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 800 }}>Error</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{err}</pre>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900 }}>Library</h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {filtered.length} lessons
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder="Search title / topic / tags…"
            style={{ padding: "10px 12px", width: 280 }}
          />

          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            style={{ padding: "10px 12px" }}
          >
            {allLevels.map((lv) => (
              <option key={lv} value={lv}>
                {lv === "ALL" ? "All levels" : lv}
              </option>
            ))}
          </select>

          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            style={{ padding: "10px 12px" }}
          >
            {allTopics.map((t) => (
              <option key={t} value={t}>
                {t === "ALL" ? "All topics" : t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section style={{ marginTop: 16 }}>
        {filtered.length === 0 ? (
          <p style={{ opacity: 0.75 }}>No lessons match your filters.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filtered.map((l) => {
              const tags = Array.isArray(l.tags) ? l.tags : [];
              const minutes =
                typeof l.estimatedMinutes === "number"
                  ? l.estimatedMinutes
                  : null;

              const openHref = `/learner/lesson/${l.id}`;
              const myHref = `/learner/my/${l.id}`;

              return (
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
                  <div style={{ minWidth: 280 }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>
                      {l.title ?? "Untitled"}
                    </div>

                    <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                      {l.level ? `Level: ${l.level}` : "Level: —"}
                      {l.topic ? ` · Topic: ${l.topic}` : ""}
                      {minutes !== null ? ` · ${minutes} min` : ""}
                      {l.releaseMode ? ` · ${l.releaseMode}` : ""}
                    </div>

                    {tags.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                          marginTop: 8,
                        }}
                      >
                        {tags.slice(0, 10).map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 12,
                              opacity: 0.75,
                              border: "1px solid #e5e7eb",
                              borderRadius: 999,
                              padding: "3px 8px",
                            }}
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Link
                      href={myHref}
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
                      My answers
                    </Link>

                    <Link
                      href={openHref}
                      style={{
                        padding: "10px 14px",
                        border: "1px solid #ddd",
                        borderRadius: 10,
                        textDecoration: "none",
                        color: "inherit",
                        fontWeight: 800,
                      }}
                    >
                      Open
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
