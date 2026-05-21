"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";

type ImageTask = {
  id?: string;
  imageUrl?: string;
  instruction?: string;
  supportWords?: unknown[];
  successCriteria?: unknown[];
  printSupportWords?: boolean;
  printSuccessCriteria?: boolean;
};

type Lesson = {
  ownerId?: string;
  title?: string;
  producerName?: string;
  level?: string;
  language?: string;
  status?: string;
  lessonType?: string;
  coverImageUrl?: string;
  imageTasks?: unknown;
};

type PrintLanguage = "nb" | "en" | "pt";

const printCopy = {
  nb: {
    loading: "Laster...",
    noAccess: "Ingen tilgang.",
    notFound: "Fant ikke skriveoppgaven.",
    loadFailed: "Kunne ikke laste skriveoppgaven.",
    back: "Til Mitt innhold",
    content: "Mitt innhold",
    print: "Skriv ut",
    kicker: "321school arbeidsark",
    fallbackTitle: "Skriveoppgave med bilde",
    language: "Språk",
    producer: "Produsent",
    level: "Nivå",
    name: "Navn",
    date: "Dato",
    className: "Klasse",
    imageAlt: "Bildeoppgave",
    task: "Oppgave",
    fallbackInstruction: "Skriv en tekst som passer til bildet.",
    supportWords: "Støtteord",
    successCriteria: "Suksesskriterier",
    answer: "Svar",
  },
  en: {
    loading: "Loading...",
    noAccess: "No access.",
    notFound: "Could not find the writing task.",
    loadFailed: "Could not load the writing task.",
    back: "To My content",
    content: "My content",
    print: "Print",
    kicker: "321school worksheet",
    fallbackTitle: "Image writing task",
    language: "Language",
    producer: "Producer",
    level: "Level",
    name: "Name",
    date: "Date",
    className: "Class",
    imageAlt: "Image task",
    task: "Task",
    fallbackInstruction: "Write a text that fits the picture.",
    supportWords: "Support words",
    successCriteria: "Success criteria",
    answer: "Answer",
  },
  pt: {
    loading: "Carregando...",
    noAccess: "Sem acesso.",
    notFound: "Não foi possível encontrar a tarefa de escrita.",
    loadFailed: "Não foi possível carregar a tarefa de escrita.",
    back: "Ir para Meu conteúdo",
    content: "Meu conteúdo",
    print: "Imprimir",
    kicker: "321school folha de atividade",
    fallbackTitle: "Tarefa de escrita com imagem",
    language: "Idioma",
    producer: "Produtor",
    level: "Nível",
    name: "Nome",
    date: "Data",
    className: "Turma",
    imageAlt: "Tarefa com imagem",
    task: "Tarefa",
    fallbackInstruction: "Escreva um texto que combine com a imagem.",
    supportWords: "Palavras de apoio",
    successCriteria: "Critérios de sucesso",
    answer: "Resposta",
  },
} satisfies Record<PrintLanguage, Record<string, string>>;

function pickPrintLanguage(value: unknown): PrintLanguage {
  return value === "en" || value === "pt" ? value : "nb";
}

function uidNow() {
  return getAuth().currentUser?.uid ?? null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function imageTasks(value: unknown): ImageTask[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => item as ImageTask);
}

export default function ImageWritingPrintPage() {
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const lessonId = params.id;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErr(null);

      try {
        await ensureAnonymousUser();
        const uid = uidNow();
        if (!uid) throw new Error(printCopy.nb.noAccess);

        let loaded: Lesson | null = null;
        const ownSnap = await getDoc(doc(db, "lessons", lessonId));
        if (ownSnap.exists()) {
          const data = ownSnap.data() as Lesson;
          if (!data.ownerId || data.ownerId === uid || data.status === "published") {
            loaded = data;
          }
        }

        if (!loaded) {
          const publishedSnap = await getDoc(doc(db, "published_lessons", lessonId));
          if (publishedSnap.exists()) loaded = publishedSnap.data() as Lesson;
        }

        if (!alive) return;

        if (!loaded || loaded.lessonType !== "image_writing") {
          setLesson(null);
          setErr(printCopy.nb.notFound);
          return;
        }

        setLesson(loaded);
      } catch (error: unknown) {
        if (!alive) return;
        setErr(error instanceof Error ? error.message : printCopy.nb.loadFailed);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [lessonId]);

  const task = useMemo(() => imageTasks(lesson?.imageTasks)[0] ?? null, [lesson?.imageTasks]);
  const supportWords = stringList(task?.supportWords);
  const successCriteria = stringList(task?.successCriteria);
  const showSupportWordsOnPrint = task?.printSupportWords === true;
  const showSuccessCriteriaOnPrint = task?.printSuccessCriteria === true;
  const imageUrl = String(task?.imageUrl || lesson?.coverImageUrl || "").trim();
  const text = printCopy[pickPrintLanguage(lesson?.language)];

  if (loading) return <main style={{ padding: 20 }}>{printCopy.nb.loading}</main>;

  if (err || !lesson || !task) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
        <p style={{ color: "crimson" }}>{err || printCopy.nb.notFound}</p>
        <Link href={`/${locale}/content`}>{printCopy.nb.back}</Link>
      </main>
    );
  }

  return (
    <main className="image-writing-print-root" style={{ maxWidth: 900, margin: "0 auto", padding: 20, color: "#111827" }}>
      <style>{`
        @page {
          size: A4;
          margin: 15mm;
        }

        .pdf-page {
          max-width: 980px;
          margin: 0 auto;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          color: #111;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 18mm 16mm;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
        }

        .pdf-topline {
          height: 5px;
          width: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #111827 0%, #374151 45%, #9ca3af 100%);
          margin: 0 0 8mm 0;
        }

        .pdf-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .pdf-headerMain {
          flex: 1;
          min-width: 0;
        }

        .pdf-kicker {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #6b7280;
          margin-bottom: 2mm;
        }

        .pdf-title {
          font-size: 24px;
          font-weight: 900;
          line-height: 1.08;
          margin: 0;
        }

        .pdf-metaRow {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 3mm;
        }

        .pdf-meta {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          font-size: 11px;
          color: #374151;
          background: #f9fafb;
        }

        .pdf-brandBlock {
          width: 120px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }

        .pdf-logo {
          width: 72px;
          height: auto;
          object-fit: contain;
        }

        .pdf-brandText {
          font-size: 9px;
          font-weight: 700;
          color: #6b7280;
        }

        .pdf-identity {
          margin-top: 9mm;
          margin-bottom: 8mm;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8mm;
          font-size: 12px;
        }

        .pdf-identity .line {
          display: flex;
          gap: 6px;
          align-items: baseline;
          padding: 6px 8px 4px 8px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #fcfcfc;
        }

        .pdf-identity .blank {
          flex: 1;
          border-bottom: 1px solid #111;
          transform: translateY(-1px);
        }

        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .image-writing-print-root,
          .image-writing-print-root * {
            visibility: visible !important;
          }

          .image-writing-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: unset !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          .pdf-page {
            max-width: unset !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }

          a {
            color: inherit !important;
            text-decoration: none !important;
          }
        }
      `}</style>

      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <Link href={`/${locale}/content`}>{text.content}</Link>
        <button type="button" onClick={() => window.print()} style={buttonStyle}>
          {text.print}
        </button>
      </div>

      <div className="pdf-page">
        <div className="pdf-topline" />

        <header className="pdf-header">
          <div className="pdf-headerMain">
            <div className="pdf-kicker">{text.kicker}</div>
            <h1 className="pdf-title">{lesson.title || text.fallbackTitle}</h1>

            <div className="pdf-metaRow">
              {lesson.language?.trim() ? (
                <div className="pdf-meta">{text.language}: {lesson.language.trim().toUpperCase()}</div>
              ) : null}
              {lesson.producerName?.trim() ? (
                <div className="pdf-meta">{text.producer}: {lesson.producerName.trim()}</div>
              ) : null}
              {lesson.level?.trim() ? <div className="pdf-meta">{text.level}: {lesson.level.trim()}</div> : null}
            </div>
          </div>

          <div className="pdf-brandBlock">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo321ny.png"
              alt="321school"
              className="pdf-logo"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <div className="pdf-brandText">321school.com</div>
          </div>
        </header>

        <div className="pdf-identity">
          <div className="line">
            <span>{text.name}:</span> <span className="blank" />
          </div>
          <div className="line">
            <span>{text.date}:</span> <span className="blank" />
          </div>
          <div className="line">
            <span>{text.className}:</span> <span className="blank" />
          </div>
        </div>

      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={lesson.title || text.imageAlt}
          style={{
            width: "100%",
            maxHeight: 420,
            objectFit: "contain",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            marginBottom: 16,
          }}
        />
      ) : null}

      <section style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{text.task}</h2>
        <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {task.instruction || text.fallbackInstruction}
        </p>
      </section>

      {showSupportWordsOnPrint && supportWords.length > 0 ? (
        <section style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>{text.supportWords}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {supportWords.map((word) => (
              <span key={word} style={pillStyle}>
                {word}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {showSuccessCriteriaOnPrint && successCriteria.length > 0 ? (
        <section style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>{text.successCriteria}</h2>
          <ul style={{ margin: 0, paddingLeft: 22, lineHeight: 1.5 }}>
            {successCriteria.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>{text.answer}</h2>
        <div style={{ display: "grid", gap: 18 }}>
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} style={{ borderBottom: "1px solid #9ca3af", height: 22 }} />
          ))}
        </div>
      </section>
      </div>
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 12px",
  background: "white",
  fontWeight: 800,
};

const pillStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 999,
  padding: "5px 9px",
  fontWeight: 700,
  background: "#f8fafc",
};
