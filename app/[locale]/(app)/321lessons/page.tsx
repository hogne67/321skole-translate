// app/[locale]/(app)/321lessons/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  query,
  where,
  limit,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { LANGUAGES } from "@/lib/languages";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useLocale, useTranslations } from "next-intl";

type FirestoreTimestampLike = { seconds?: number } | null | undefined;

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

  // Firestore timestamps (we only need seconds)
  publishedAt?: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;

  searchText?: string;

  imageUrl?: string;
  coverImageUrl?: string;
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const PAGE_SIZES = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toStringSafe(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

/**
 * ✅ Text type:
 * Only use l.textType / l.texttype.
 * DO NOT fall back to topic/topics.
 */
function coerceTextType(l: PublishedLesson): string {
  const tt1 = String(l.textType ?? "").trim();
  if (tt1) return tt1;

  const tt2 = String(l.texttype ?? "").trim();
  if (tt2) return tt2;

  return "";
}

function coercePublishedLesson(id: string, data: DocumentData): PublishedLesson {
  const obj: Record<string, unknown> = isRecord(data) ? data : {};

  const title = toStringSafe(obj.title) || "Untitled";

  const publishedAt = isRecord(obj.publishedAt)
    ? (obj.publishedAt as FirestoreTimestampLike)
    : undefined;
  const updatedAt = isRecord(obj.updatedAt)
    ? (obj.updatedAt as FirestoreTimestampLike)
    : undefined;

  return {
    id,
    title,
    description: toStringSafe(obj.description) || undefined,
    level: toStringSafe(obj.level) || undefined,
    language: toStringSafe(obj.language) || undefined,

    textType: toStringSafe(obj.textType) || undefined,
    texttype: toStringSafe(obj.texttype) || undefined,

    topics: Array.isArray(obj.topics)
      ? obj.topics.filter((x) => typeof x === "string")
      : undefined,
    topic: toStringSafe(obj.topic) || undefined,

    isActive: typeof obj.isActive === "boolean" ? obj.isActive : undefined,
    status:
      obj.status === "published" || obj.status === "draft"
        ? (obj.status as "published" | "draft")
        : undefined,

    publishedAt,
    updatedAt,

    searchText: toStringSafe(obj.searchText) || undefined,

    imageUrl: toStringSafe(obj.imageUrl) || undefined,
    coverImageUrl: toStringSafe(obj.coverImageUrl) || undefined,
  };
}

type LoadState =
  | { status: "loading"; error: null }
  | { status: "ready"; error: null }
  | { status: "error"; error: string };

type LooseT = (key: string, values?: Record<string, unknown>) => string;

export default function LessonsLandingPage() {
  const t = useTranslations("lessonsLanding");
  const tLoose = t as unknown as LooseT; // avoids `any`, but lets us safely request optional keys
  const locale = useLocale();

  const [all, setAll] = useState<PublishedLesson[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    error: null,
  });

  const [qText, setQText] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [lang, setLang] = useState<string>("all");
  const [textType, setTextType] = useState<string>("all");

  // ✅ pagination state
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState<number>(1); // 1-based

  // Safe lookup for optional i18n keys (prevents runtime crash if key missing)
  function safeMsg(key: string, fallback: string, values?: Record<string, unknown>) {
    try {
      return tLoose(key, values);
    } catch {
      return fallback;
    }
  }

  // Når filter endres → hopp tilbake til side 1
  useEffect(() => {
    setPage(1);
  }, [qText, level, lang, textType, pageSize]);

  const langLabelByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of LANGUAGES) m.set(normLang(l.code), l.label);
    if (!m.has("no")) m.set("no", t("languages.norwegianBokmal"));
    return m;
  }, [t]);

  const LANGUAGE_OPTIONS = useMemo(() => {
    return [
      { value: "all", label: t("languages.all") },
      ...LANGUAGES.map((l) => ({
        value: l.code,
        label: l.label,
      })),
    ];
  }, [t]);

  function resetFilters() {
    setQText("");
    setLevel("all");
    setLang("all");
    setTextType("all");
    setPage(1);
  }

  useEffect(() => {
    setLoadState({ status: "loading", error: null });

    const qy = query(
      collection(db, "published_lessons"),
      where("isActive", "==", true),
      limit(300)
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows: PublishedLesson[] = snap.docs.map((d) =>
          coercePublishedLesson(d.id, d.data())
        );

        // Sort: newest first (publishedAt fallback updatedAt)
        rows.sort((a, b) => {
          const at = a.publishedAt?.seconds ?? a.updatedAt?.seconds ?? 0;
          const bt = b.publishedAt?.seconds ?? b.updatedAt?.seconds ?? 0;
          return bt - at;
        });

        setAll(rows);
        setLoadState({ status: "ready", error: null });
      },
      (e) => {
        setLoadState({
          status: "error",
          error: e?.message || t("errors.fetchFailed"),
        });
      }
    );

    return () => unsub();
  }, [t]);

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

      const hay = (
        l.searchText ||
        `${l.title ?? ""} ${l.description ?? ""} ${tt} ${(l.level || "").toUpperCase()} ${
          l.language || ""
        }`
      ).toLowerCase();

      return hay.includes(qt);
    });
  }, [all, qText, level, lang, textType]);

  // ✅ pagination derived
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filtered.length / pageSize));
  }, [filtered.length, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  const pageSlice = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const isResetDisabled = useMemo(() => {
    return qText === "" && level === "all" && lang === "all" && textType === "all";
  }, [qText, level, lang, textType]);

  const loading = loadState.status === "loading";
  const error = loadState.status === "error" ? loadState.error : null;

  const shownFrom = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const shownTo = Math.min(page * pageSize, filtered.length);

  return (
    <main>
      <style jsx>{`
        .filters {
          margin-top: 12px;
          padding: 14px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 12px;
          display: grid;
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

        /* ✅ Make the whole card clickable, but NEVER look like a link */
        .cardLink,
        .cardLink:link,
        .cardLink:visited,
        .cardLink:hover,
        .cardLink:active {
          text-decoration: none !important;
          color: inherit !important;
        }
        .cardLink * {
          text-decoration: none !important;
          color: inherit !important;
        }

        .card {
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 14px;
          overflow: hidden;
          background: white;
          display: flex;
          flex-direction: column;
          min-height: 100%;
          transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease,
            background 140ms ease;
        }

        /* subtle life */
        .cardLink:hover .card {
          transform: translateY(-2px);
          box-shadow: 0 12px 26px rgba(0, 0, 0, 0.08);
          border-color: rgba(0, 0, 0, 0.18);
          background: rgba(0, 0, 0, 0.01);
        }
        .cardLink:focus-visible .card {
          outline: 3px solid rgba(0, 0, 0, 0.25);
          outline-offset: 3px;
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
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        /* Title first */
        .title {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          line-height: 1.2;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* Meta smaller + calmer */
        .meta {
          font-size: 13px;
          opacity: 0.72;
          display: flex;
          gap: 6px;
          align-items: center;
          flex-wrap: wrap;
        }
        .dot {
          opacity: 0.55;
        }

        .desc {
          margin: 4px 0 0;
          opacity: 0.82;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .footer {
          margin-top: 12px;
          display: flex;
          justify-content: flex-end;
        }

        /* visual “open” hint — not a real button */
        .openPill {
          display: inline-flex;
          align-items: center;
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.16);
          background: rgba(0, 0, 0, 0.03);
          font-weight: 800;
          font-size: 13px;
          opacity: 0.92;
        }
        .cardLink:hover .openPill {
          background: rgba(0, 0, 0, 0.06);
          border-color: rgba(0, 0, 0, 0.22);
        }

        .pagerRow {
          margin-top: 14px;
          padding: 12px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .pagerBtn {
          padding: 8px 12px;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.2);
          background: white;
          font-weight: 800;
          cursor: pointer;
        }
        .pagerBtn:disabled {
          opacity: 0.55;
          cursor: default;
          background: rgba(0, 0, 0, 0.03);
        }

        .pageSizeSelect {
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.2);
          background: white;
          font-weight: 700;
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
          <strong>{t("errors.label")}:</strong>{" "}
          <span style={{ opacity: 0.85 }}>{error}</span>
        </section>
      ) : null}

      <section className="filters">
        <input
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          placeholder={t("filters.searchPlaceholder")}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
          }}
        />

        <select
          value={textType}
          onChange={(e) => setTextType(e.target.value)}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
          }}
        >
          <option value="all">{t("filters.textTypeAll")}</option>
          {allTextTypes.map((tt) => (
            <option key={tt} value={tt}>
              {tt}
            </option>
          ))}
        </select>

        <SearchableSelect
          value={lang}
          options={LANGUAGE_OPTIONS}
          onChange={setLang}
          placeholder={t("filters.languagePlaceholder")}
          fullWidth
        />

        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
          }}
        >
          <option value="all">{t("filters.levelAll")}</option>
          {LEVELS.map((lv) => (
            <option key={lv} value={lv}>
              {lv}
            </option>
          ))}
        </select>

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
          {t("filters.reset")}
        </button>
      </section>

      <section style={{ marginTop: 14, opacity: 0.75 }}>
        {loading ? (
          <p>{t("status.loading")}</p>
        ) : (
          <p>
            {t("status.showingCount", { shown: filtered.length, total: all.length })}{" "}
            {filtered.length > 0 ? (
              <span style={{ marginLeft: 8 }}>
                ({shownFrom}–{shownTo})
              </span>
            ) : null}
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
          <p style={{ margin: 0, opacity: 0.8 }}>{t("empty.noResults")}</p>
        </section>
      ) : null}

      <section className="cards">
        {!loading &&
          pageSlice.map((l) => {
            const langCode = normLang(l.language);
            const langLabel = langLabelByCode.get(langCode) || (l.language ? l.language : "");
            const tt = coerceTextType(l);
            const img = pickImageUrl(l);

            // ✅ Link til lesson innen samme locale
            const lessonHref = `/${locale}/lesson/${l.id}`;

            return (
              <Link key={l.id} href={lessonHref} className="cardLink" aria-label={l.title}>
                <div className="card">
                  <div className="imgWrap">
                    <div className="badge">
                      <span>{(l.level || "—").toUpperCase()}</span>
                    </div>

                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={l.title} className="img" />
                    ) : (
                      <div style={{ fontSize: 13, opacity: 0.6 }}>{t("card.imageFallback")}</div>
                    )}
                  </div>

                  <div className="content">
                    <h3 className="title">{l.title}</h3>

                    <div className="meta">
                      {langLabel ? <span>{langLabel}</span> : null}
                      {langLabel && tt ? <span className="dot">•</span> : null}
                      {tt ? <span>{tt}</span> : null}
                    </div>

                    {l.description ? <p className="desc">{l.description}</p> : null}

                    <div className="footer">
                      <span className="openPill">{safeMsg("card.open", "Åpne")}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
      </section>

      {!loading && filtered.length > 0 ? (
        <div className="pagerRow">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="pagerBtn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              {safeMsg("pagination.prev", "Previous")}
            </button>

            <div style={{ fontWeight: 800, opacity: 0.85 }}>
              {safeMsg("pagination.page", "Page")} {page} / {totalPages}
            </div>

            <button
              type="button"
              className="pagerBtn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              {safeMsg("pagination.next", "Next")}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 800, opacity: 0.8 }}>
              {safeMsg("pagination.perPage", "Per page")}
            </span>
            <select
              className="pageSizeSelect"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
    </main>
  );
}