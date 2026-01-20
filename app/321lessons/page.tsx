"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";

type PublishedLesson = {
  id: string;
  title: string;
  description?: string;
  level?: string;
  language?: string;
  topics?: string[];
  isActive?: boolean;
  status?: "published" | "draft";
  publishedAt?: any;
  searchText?: string;
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const LANGS: { code: string; label: string }[] = [
  { code: "no", label: "Norsk" },
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
  { code: "es", label: "Español" },
  { code: "uk", label: "Українська" },
  { code: "ar", label: "العربية" },
];

export default function LessonsLandingPage() {
  const [all, setAll] = useState<PublishedLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qText, setQText] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [lang, setLang] = useState<string>("all");
  const [topic, setTopic] = useState<string>("all");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const q = query(
          collection(db, "published_lessons"),
          where("isActive", "==", true),
          // Hvis du IKKE har status i published_lessons, kommenter ut linjen under:
          // where("status", "==", "published"),
          limit(300)
        );

        const snap = await getDocs(q);
        if (!alive) return;

        const rows: PublishedLesson[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        rows.sort((a: any, b: any) => {
          const at = a?.publishedAt?.seconds ?? 0;
          const bt = b?.publishedAt?.seconds ?? 0;
          return bt - at;
        });

        setAll(rows);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Kunne ikke hente publiserte lessons.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const allTopics = useMemo(() => {
    const s = new Set<string>();
    for (const l of all) (l.topics || []).forEach((t) => s.add(t));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [all]);

  const filtered = useMemo(() => {
    const qt = qText.trim().toLowerCase();

    return all.filter((l) => {
      if (level !== "all" && (l.level || "").toUpperCase() !== level) return false;
      if (lang !== "all" && (l.language || "").toLowerCase() !== lang) return false;
      if (topic !== "all" && !(l.topics || []).includes(topic)) return false;

      if (!qt) return true;

      const hay =
        (l.searchText ||
          `${l.title ?? ""} ${l.description ?? ""} ${(l.topics || []).join(" ")}`).toLowerCase();

      return hay.includes(qt);
    });
  }, [all, qText, level, lang, topic]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 34, margin: 0 }}>321lessons</h1>
          <p style={{ marginTop: 8, opacity: 0.75 }}>Finn publiserte oppgaver på nivå, språk og tema.</p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/producer" style={{ textDecoration: "none" }}>
            Producer
          </Link>
          <Link href="/learner" style={{ textDecoration: "none" }}>
            Learner
          </Link>
        </div>
      </header>

      {error ? (
        <section
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid rgba(200,0,0,0.35)",
            borderRadius: 12,
          }}
        >
          <strong>Feil:</strong> <span style={{ opacity: 0.85 }}>{error}</span>
        </section>
      ) : null}

      <section
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          gap: 10,
        }}
      >
        <input
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          placeholder="Søk: tittel, tekst, tema..."
          style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
        />

        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
        >
          <option value="all">Alle tema</option>
          {allTopics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
        >
          <option value="all">Alle språk</option>
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>

        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
        >
          <option value="all">Alle nivå</option>
          {LEVELS.map((lv) => (
            <option key={lv} value={lv}>
              {lv}
            </option>
          ))}
        </select>
      </section>

      <section style={{ marginTop: 14, opacity: 0.75 }}>
        {loading ? (
          <p>Laster publiserte oppgaver…</p>
        ) : (
          <p>
            Viser {filtered.length} av {all.length}
          </p>
        )}
      </section>

      {!loading && filtered.length === 0 ? (
        <section style={{ marginTop: 10, padding: 14, border: "1px dashed rgba(0,0,0,0.25)", borderRadius: 12 }}>
          <p style={{ margin: 0, opacity: 0.8 }}>
            Ingen publiserte oppgaver funnet. Prøv å fjerne filtre eller søke på noe annet.
          </p>
        </section>
      ) : null}

      <section
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {!loading &&
          filtered.map((l) => (
            <Link
              key={l.id}
              href={`/student/lesson/${l.id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, opacity: 0.75 }}>
                {l.level ? <span>{l.level}</span> : null}
                {l.language ? <span>• {l.language.toUpperCase()}</span> : null}
                {(l.topics || []).slice(0, 2).map((t) => (
                  <span key={t}>• {t}</span>
                ))}
              </div>

              <h3 style={{ margin: "6px 0 8px", fontSize: 18 }}>{l.title}</h3>
              {l.description ? (
                <p style={{ margin: 0, opacity: 0.8, lineHeight: 1.4 }}>
                  {l.description.length > 120 ? l.description.slice(0, 120) + "…" : l.description}
                </p>
              ) : (
                <p style={{ margin: 0, opacity: 0.6 }}>Åpne for detaljer</p>
              )}
            </Link>
          ))}
      </section>
    </main>
  );
}
