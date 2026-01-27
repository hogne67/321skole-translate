// app/321lessons/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { LANGUAGES } from "@/lib/languages";
import { SearchableSelect } from "@/components/SearchableSelect";

type PublishedLesson = {
  id: string;
  title: string;
  description?: string;
  level?: string;
  language?: string;

  // ✅ We filter on this (NOT topic/topics)
  textType?: string;
  texttype?: string; // tolerate casing variant

  // legacy fields (keep for display/search only if you want, but NOT as textType)
  topics?: string[];
  topic?: string;

  isActive?: boolean;
  status?: "published" | "draft";
  publishedAt?: any;
  updatedAt?: any;

  searchText?: string;

  imageUrl?: string;
  coverImageUrl?: string;
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

const LANGUAGE_OPTIONS = [
  { value: "all", label: "Alle språk" },
  ...LANGUAGES.map((l) => ({
    value: l.code,
    label: l.label,
  })),
];

function tsToMs(ts: any): number | null {
  const s = ts?.seconds;
  if (typeof s === "number") return s * 1000;
  return null;
}

function normLang(code?: string) {
  return (code || "").trim().toLowerCase();
}

function langMatches(docLang: string | undefined, selected: string) {
  const d = normLang(docLang);
  const s = normLang(selected);

  if (s === "all") return true;
  if (!d) return false;

  if (s === "nb" && d === "no") return true; // legacy: "no"
  return d === s;
}

function pickImageUrl(l: PublishedLesson): string | null {
  const a = String(l.imageUrl || "").trim();
  if (a) return a;
  const b = String(l.coverImageUrl || "").trim();
  if (b) return b;
  return null;
}

/**
 * ✅ Text type:
 * Only use l.textType / l.texttype.
 * DO NOT fall back to topic/topics, because those are content/topic fields
 * and can be long or equal to title (e.g. "Henrik Ibsen").
 */
function coerceTextType(l: PublishedLesson): string {
  const tt1 = String((l as any)?.textType ?? "").trim();
  if (tt1) return tt1;

  const tt2 = String((l as any)?.texttype ?? "").trim();
  if (tt2) return tt2;

  return "";
}

export default function LessonsLandingPage() {
  const [all, setAll] = useState<PublishedLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qText, setQText] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [lang, setLang] = useState<string>("all");
  const [textType, setTextType] = useState<string>("all");

  const langLabelByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of LANGUAGES) m.set(normLang(l.code), l.label);
    if (!m.has("no")) m.set("no", "Norsk (Bokmål)");
    return m;
  }, []);

  function resetFilters() {
    setQText("");
    setLevel("all");
    setLang("all");
    setTextType("all");
  }

  useEffect(() => {
    setLoading(true);
    setError(null);

    const qy = query(
      collection(db, "published_lessons"),
      where("isActive", "==", true),
      limit(300)
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows: PublishedLesson[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        // Sort: newest first (publishedAt fallback updatedAt)
        rows.sort((a: any, b: any) => {
          const at = a?.publishedAt?.seconds ?? a?.updatedAt?.seconds ?? 0;
          const bt = b?.publishedAt?.seconds ?? b?.updatedAt?.seconds ?? 0;
          return bt - at;
        });

        setAll(rows);
        setLoading(false);
      },
      (e) => {
        setError(e?.message || "Kunne ikke hente publiserte lessons.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const allTextTypes = useMemo(() => {
    const s = new Set<string>();
    for (const l of all) {
      const tt = coerceTextType(l);
      if (tt) s.add(tt);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [all]);

  const filtered = useMemo(() => {
    const qt = qText.trim().toLowerCase();

    return all.filter((l) => {
      if (level !== "all" && (l.level || "").toUpperCase() !== level) return false;
      if (!langMatches(l.language, lang)) return false;

      const tt = coerceTextType(l);
      if (textType !== "all" && tt !== textType) return false;

      if (!qt) return true;

      // Search text includes title/description/textType + level/lang.
      const hay = (
        l.searchText ||
        `${l.title ?? ""} ${l.description ?? ""} ${tt} ${(l.level || "").toUpperCase()} ${l.language || ""}`
      ).toLowerCase();

      return hay.includes(qt);
    });
  }, [all, qText, level, lang, textType]);

  const isResetDisabled = useMemo(() => {
    return qText === "" && level === "all" && lang === "all" && textType === "all";
  }, [qText, level, lang, textType]);

  return (
    <main>
      <style jsx>{`
        .filters {
          margin-top: 12px;
          padding: 14px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 12px;
          display: grid;

          /* ✅ Språk bredere, Text type smalere + reset knapp */
          grid-template-columns: 2fr 0.8fr 1.6fr 0.8fr auto;
          gap: 10px;
          align-items: center;
        }

        @media (max-width: 900px) {
          .filters {
            grid-template-columns: 1fr 1fr;
          }
          .resetBtn {
            grid-column: 1 / -1;
            justify-self: start;
          }
        }

        @media (max-width: 560px) {
          .filters {
            grid-template-columns: 1fr;
          }
          .resetBtn {
            grid-column: auto;
            width: 100%;
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
          placeholder="Søk: tittel, tekst, type…"
          style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
        />

        {/* ✅ Text type */}
        <select
          value={textType}
          onChange={(e) => setTextType(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
        >
          <option value="all">Text type</option>
          {allTextTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* ✅ Språk bredere */}
        <SearchableSelect
          value={lang}
          options={LANGUAGE_OPTIONS}
          onChange={setLang}
          placeholder="Søk språk…"
          fullWidth
        />

        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
        >
          <option value="all">Nivå</option>
          {LEVELS.map((lv) => (
            <option key={lv} value={lv}>
              {lv}
            </option>
          ))}
        </select>

        {/* ✅ Reset */}
        <button
          type="button"
          className="resetBtn"
          onClick={resetFilters}
          disabled={isResetDisabled}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            background: isResetDisabled ? "rgba(0,0,0,0.03)" : "white",
            fontWeight: 700,
            cursor: isResetDisabled ? "default" : "pointer",
            whiteSpace: "nowrap",
            opacity: isResetDisabled ? 0.6 : 1,
          }}
        >
          Nullstill
        </button>
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
            const pubMs = tsToMs(l.publishedAt) ?? tsToMs(l.updatedAt);
            const isNew = pubMs ? Date.now() - pubMs < 7 * 24 * 60 * 60 * 1000 : false;

            const langCode = normLang(l.language);
            const langLabel = langLabelByCode.get(langCode) || (l.language ? l.language : "");

            const img = pickImageUrl(l);

            return (
              <Link key={l.id} href={`/lesson/${l.id}`} className="card">
                <div className="imgWrap">
                  <div className="badge">
                    <span>{(l.level || "—").toUpperCase()}</span>
                    {isNew ? <span style={{ opacity: 0.9 }}>NY</span> : null}
                  </div>

                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={l.title} className="img" />
                  ) : (
                    <div style={{ fontSize: 13, opacity: 0.6 }}>Bilde</div>
                  )}
                </div>

                <div className="content">
                  {/* ✅ Only language (as before) */}
                  <div className="metaRow">{langLabel ? <span>• {langLabel}</span> : null}</div>

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
