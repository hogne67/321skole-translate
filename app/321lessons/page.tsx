// app/321lessons/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { LANGUAGES } from "@/lib/languages";

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
  imageUrl?: string;
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

function tsToMs(ts: any): number | null {
  const s = ts?.seconds;
  if (typeof s === "number") return s * 1000;
  return null;
}

function normLang(code?: string) {
  return (code || "").trim().toLowerCase();
}

// For å tåle gamle data (no) og være litt “snill”:
function langMatches(docLang: string | undefined, selected: string) {
  const d = normLang(docLang);
  const s = normLang(selected);

  if (s === "all") return true;
  if (!d) return false;

  // legacy: "no" -> behandles som bokmål i filter
  if (s === "nb" && d === "no") return true;

  // direkte match (case-insensitive)
  return d === s;
}

export default function LessonsLandingPage() {
  const [all, setAll] = useState<PublishedLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qText, setQText] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [lang, setLang] = useState<string>("all");
  const [topic, setTopic] = useState<string>("all");

  // Map code -> label for visning i kort
  const langLabelByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of LANGUAGES) m.set(normLang(l.code), l.label);
    // legacy fallback
    if (!m.has("no")) m.set("no", "Norsk (Bokmål)");
    return m;
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const q = query(
          collection(db, "published_lessons"),
          where("isActive", "==", true),
          limit(300)
        );

        const snap = await getDocs(q);
        if (!alive) return;

        const rows: PublishedLesson[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        // sort: nyeste først
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
      if (!langMatches(l.language, lang)) return false;
      if (topic !== "all" && !(l.topics || []).includes(topic)) return false;

      if (!qt) return true;

      const hay =
        (l.searchText ||
          `${l.title ?? ""} ${l.description ?? ""} ${(l.topics || []).join(" ")}`).toLowerCase();

      return hay.includes(qt);
    });
  }, [all, qText, level, lang, topic]);

  return (
    <main>
      <style jsx>{`
        .filters {
          margin-top: 12px;
          padding: 14px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 12px;
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 10px;
        }
        @media (max-width: 900px) {
          .filters {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 560px) {
          .filters {
            grid-template-columns: 1fr;
          }
        }

        .cards {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        @media (max-width: 900px) {
          .cards {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 560px) {
          .cards {
            grid-template-columns: 1fr;
          }
        }

        .card {
          text-decoration: none;
          color: inherit;
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 14px;
          overflow: hidden;
          background: white;
          display: flex;
          flex-direction: column;
          min-height: 100%;
        }

        .imgWrap {
          width: 100%;
          aspect-ratio: 3 / 2;
          background: rgba(0, 0, 0, 0.06);
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .badge {
          position: absolute;
          top: 10px;
          left: 10px;
          display: inline-flex;
          gap: 8px;
          align-items: center;
          padding: 7px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 900;
          background: rgba(151, 156, 106, 0.95);
          border: 1px solid rgba(0, 0, 0, 0.12);
          backdrop-filter: blur(4px);
        }

        .content {
          padding: 14px;
        }
        .metaRow {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 8px;
          opacity: 0.75;
        }
      `}</style>

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

      <section className="filters">
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
          {LANGUAGES.map((l) => (
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
        <section
          style={{
            marginTop: 10,
            padding: 14,
            border: "1px dashed rgba(0,0,0,0.25)",
            borderRadius: 12,
          }}
        >
          <p style={{ margin: 0, opacity: 0.8 }}>
            Ingen publiserte oppgaver funnet. Prøv å fjerne filtre eller søke på noe annet.
          </p>
        </section>
      ) : null}

      <section className="cards">
        {!loading &&
          filtered.map((l) => {
            const pubMs = tsToMs(l.publishedAt);
            const isNew = pubMs ? Date.now() - pubMs < 7 * 24 * 60 * 60 * 1000 : false;

            const langCode = normLang(l.language);
            const langLabel = langLabelByCode.get(langCode) || (l.language ? l.language : "");

            return (
              <Link key={l.id} href={`/student/lesson/${l.id}`} className="card">
                <div className="imgWrap">
                  <div className="badge">
                    <span>{(l.level || "—").toUpperCase()}</span>
                    {isNew ? <span style={{ opacity: 0.9 }}>NY</span> : null}
                  </div>

                  {l.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.imageUrl} alt={l.title} className="img" />
                  ) : (
                    <div style={{ fontSize: 13, opacity: 0.6 }}>Bilde</div>
                  )}
                </div>

                <div className="content">
                  <div className="metaRow">
                    {langLabel ? <span>• {langLabel}</span> : null}
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
                </div>
              </Link>
            );
          })}
      </section>
    </main>
  );
}
