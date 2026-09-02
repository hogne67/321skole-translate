"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";

type Language = "nb" | "en" | "pt";
type TaskType = "describe" | "story" | "dialogue" | "reflection";

type ImageTask = {
  id?: string;
  taskType?: TaskType | string;
  imageUrl?: string;
  instruction?: string;
  supportWords?: unknown;
  successCriteria?: unknown;
  printSupportWords?: boolean;
  printSuccessCriteria?: boolean;
};

type Lesson = {
  ownerId?: string;
  uid?: string;
  title?: string;
  level?: string;
  language?: string;
  status?: string;
  lessonType?: string;
  taskType?: string;
  coverImageUrl?: string;
  imageTasks?: unknown;
};

const copy = {
  nb: {
    loading: "Laster forhåndsvisning...",
    notFound: "Fant ikke skriveoppgaven.",
    noAccess: "Du kan bare forhåndsvise skriveoppgaver du eier.",
    loadFailed: "Kunne ikke laste forhåndsvisningen.",
    back: "Tilbake til redigering",
    badge: "Forhåndsvisning",
    controlTitle: "Kontrollvisning",
    controlBody: "Denne siden kan ikke deles med elever. PDF, deling, lyd, oversettelse og feedback håndteres fra Mitt innhold eller elevsiden etter lagring.",
    imageAlt: "Bilde til skriveoppgaven",
    untitled: "Uten tittel",
    level: "Nivå",
    language: "Språk",
    taskType: "Oppgavetype",
    instruction: "Instruksjon til eleven",
    supportWords: "Støtteord",
    successCriteria: "Suksesskriterier",
    answerSpace: "Skrivefelt",
    short: "Kort utskrift",
    medium: "Middels utskrift",
    long: "Lang utskrift",
    printHelpShort: "Viser bilde, instruksjon og skrivefelt.",
    printHelpMedium: "Viser bilde, instruksjon, støtteord og skrivefelt.",
    printHelpLong: "Viser bilde, instruksjon, støtteord, suksesskriterier og skrivefelt.",
    taskTypes: {
      describe: "Beskriv bildet",
      story: "Skriv en historie",
      dialogue: "Skriv en dialog",
      reflection: "Reflekter",
    },
  },
  en: {
    loading: "Loading preview...",
    notFound: "Could not find the writing task.",
    noAccess: "You can only preview writing tasks you own.",
    loadFailed: "Could not load the preview.",
    back: "Back to editing",
    badge: "Preview",
    controlTitle: "Control view only",
    controlBody: "This page cannot be shared with students. PDF, sharing, audio, translation and feedback are handled from My content or the student page after saving.",
    imageAlt: "Writing task image",
    untitled: "Untitled",
    level: "Level",
    language: "Language",
    taskType: "Task type",
    instruction: "Instruction for the student",
    supportWords: "Support words",
    successCriteria: "Success criteria",
    answerSpace: "Writing space",
    short: "Short printout",
    medium: "Medium printout",
    long: "Long printout",
    printHelpShort: "Shows image, instruction and writing space.",
    printHelpMedium: "Shows image, instruction, support words and writing space.",
    printHelpLong: "Shows image, instruction, support words, success criteria and writing space.",
    taskTypes: {
      describe: "Describe the picture",
      story: "Write a story",
      dialogue: "Write a dialogue",
      reflection: "Reflect",
    },
  },
  pt: {
    loading: "Carregando visualizacao...",
    notFound: "Nao foi possivel encontrar a tarefa de escrita.",
    noAccess: "Voce so pode visualizar tarefas que pertencem a voce.",
    loadFailed: "Nao foi possivel carregar a visualizacao.",
    back: "Voltar para edicao",
    badge: "Visualizacao",
    controlTitle: "Apenas visualizacao de controle",
    controlBody: "Esta pagina nao pode ser compartilhada com estudantes. PDF, compartilhamento, audio, traducao e feedback sao tratados em Meu conteudo ou na pagina do estudante depois de salvar.",
    imageAlt: "Imagem da tarefa de escrita",
    untitled: "Sem titulo",
    level: "Nivel",
    language: "Idioma",
    taskType: "Tipo de tarefa",
    instruction: "Instrucao para o estudante",
    supportWords: "Palavras de apoio",
    successCriteria: "Criterios de sucesso",
    answerSpace: "Espaco para escrever",
    short: "Impressao curta",
    medium: "Impressao media",
    long: "Impressao longa",
    printHelpShort: "Mostra imagem, instrucao e espaco para escrever.",
    printHelpMedium: "Mostra imagem, instrucao, palavras de apoio e espaco para escrever.",
    printHelpLong: "Mostra imagem, instrucao, palavras de apoio, criterios de sucesso e espaco para escrever.",
    taskTypes: {
      describe: "Descrever a imagem",
      story: "Escrever uma historia",
      dialogue: "Escrever um dialogo",
      reflection: "Refletir",
    },
  },
} satisfies Record<Language, {
  loading: string;
  notFound: string;
  noAccess: string;
  loadFailed: string;
  back: string;
  badge: string;
  controlTitle: string;
  controlBody: string;
  imageAlt: string;
  untitled: string;
  level: string;
  language: string;
  taskType: string;
  instruction: string;
  supportWords: string;
  successCriteria: string;
  answerSpace: string;
  short: string;
  medium: string;
  long: string;
  printHelpShort: string;
  printHelpMedium: string;
  printHelpLong: string;
  taskTypes: Record<TaskType, string>;
}>;

function languageFromLocale(locale: string): Language {
  if (locale === "en" || locale === "pt") return locale;
  return "nb";
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(/\r?\n|,/g).map((item) => item.trim()).filter(Boolean);
}

function imageTasks(value: unknown): ImageTask[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object").map((item) => item as ImageTask);
}

function normalizeTaskType(value: unknown): TaskType {
  return value === "story" || value === "dialogue" || value === "reflection" || value === "describe"
    ? value
    : "describe";
}

function printMode(task: ImageTask | null) {
  if (task?.printSuccessCriteria === true) return "long";
  if (task?.printSupportWords === true) return "medium";
  return "short";
}

function uidNow() {
  return getAuth().currentUser?.uid ?? null;
}

export default function ImageWritingPreviewPage() {
  const locale = useLocale();
  const text = copy[languageFromLocale(locale)];
  const params = useParams<{ id: string }>();
  const lessonId = params.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        await ensureAnonymousUser();
        const uid = uidNow();
        if (!uid) throw new Error(text.noAccess);

        const snap = await getDoc(doc(db, "lessons", lessonId));
        if (!alive) return;

        if (!snap.exists()) throw new Error(text.notFound);

        const data = snap.data() as Lesson;
        const ownerId = data.ownerId || data.uid;
        if (ownerId && ownerId !== uid) throw new Error(text.noAccess);
        if (data.lessonType !== "image_writing") throw new Error(text.notFound);

        setLesson(data);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : text.loadFailed);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [lessonId, text.loadFailed, text.noAccess, text.notFound]);

  const task = useMemo(() => imageTasks(lesson?.imageTasks)[0] ?? null, [lesson?.imageTasks]);
  const supportWords = stringList(task?.supportWords);
  const successCriteria = stringList(task?.successCriteria);
  const mode = printMode(task);
  const taskType = normalizeTaskType(task?.taskType ?? lesson?.taskType);
  const imageUrl = String(task?.imageUrl || lesson?.coverImageUrl || "").trim();
  const printLabel = mode === "long" ? text.long : mode === "medium" ? text.medium : text.short;
  const printHelp = mode === "long" ? text.printHelpLong : mode === "medium" ? text.printHelpMedium : text.printHelpShort;
  const answerLineCount = mode === "long" ? 14 : mode === "medium" ? 10 : 6;
  const answerSpaceStyle: React.CSSProperties = {
    ...answerSpace,
    height: answerLineCount * 34 + 2,
  };

  if (loading) return <main style={page}>{text.loading}</main>;

  if (error || !lesson || !task) {
    return (
      <main style={page}>
        <section style={card}>
          <p style={{ color: "#b91c1c", fontWeight: 900 }}>{error || text.notFound}</p>
          <Link href={`/${locale}/producer/image-writing?edit=${lessonId}`}>{text.back}</Link>
        </section>
      </main>
    );
  }

  return (
    <main style={page}>
      <header style={hero}>
        <div style={{ minWidth: 0, flex: "1 1 520px" }}>
          <div style={badge}>{text.badge}</div>
          <h1 style={title}>{lesson.title || text.untitled}</h1>
          <div style={metaRow}>
            <span>{text.level}: {lesson.level || "-"}</span>
            <span>{text.language}: {lesson.language || "-"}</span>
            <span>{text.taskType}: {text.taskTypes[taskType]}</span>
          </div>
        </div>

        <aside style={noticeCard}>
          <div style={{ fontWeight: 950, color: "#0f172a" }}>{text.controlTitle}</div>
          <div style={{ marginTop: 8, color: "#475569", fontSize: 14, lineHeight: 1.45 }}>
            {text.controlBody}
          </div>
        </aside>
      </header>

      <section style={card}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={text.imageAlt} style={imageStyle} />
        ) : null}

        <div style={{ marginTop: imageUrl ? 18 : 0 }}>
          <div style={sectionLabel}>{text.instruction}</div>
          <div style={instructionBox}>{task.instruction}</div>
        </div>
      </section>

      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={sectionLabel}>{printLabel}</div>
            <p style={{ margin: "5px 0 0", color: "#475569", fontWeight: 700 }}>{printHelp}</p>
          </div>
        </div>

        {mode !== "short" && supportWords.length ? (
          <div style={{ marginTop: 18 }}>
            <div style={sectionLabel}>{text.supportWords}</div>
            <p style={supportLine}>{supportWords.join(" · ")}</p>
          </div>
        ) : null}

        {mode === "long" && successCriteria.length ? (
          <div style={{ marginTop: 18 }}>
            <div style={sectionLabel}>{text.successCriteria}</div>
            <ul style={criteriaList}>
              {successCriteria.map((criterion) => (
                <li key={criterion}>{criterion}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div style={{ marginTop: 18 }}>
          <div style={sectionLabel}>{text.answerSpace}</div>
          <div style={answerSpaceStyle} />
        </div>
      </section>

      <div style={stickyShell}>
        <div style={stickyInner}>
          <div style={{ minWidth: 260, flex: "1 1 560px" }}>
            <div style={{ fontSize: 14, fontWeight: 950, color: "#0f172a" }}>{text.controlTitle}</div>
            <div style={{ marginTop: 2, fontSize: 13, fontWeight: 700, color: "#475569" }}>
              {text.controlBody}
            </div>
          </div>
          <Link href={`/${locale}/producer/image-writing?edit=${lessonId}`} style={backButton}>
            {text.back}
          </Link>
        </div>
      </div>
    </main>
  );
}

const page: React.CSSProperties = {
  width: "100%",
  maxWidth: 1040,
  margin: "0 auto",
  padding: "28px 14px 128px",
  color: "#0f172a",
};

const hero: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  border: "1px solid #dbeafe",
  borderRadius: 24,
  padding: 22,
  background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 58%, #eef6ff 100%)",
  boxShadow: "0 18px 45px rgba(15,23,42,0.07)",
};

const badge: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "5px 9px",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 12,
  fontWeight: 950,
};

const title: React.CSSProperties = {
  fontSize: 34,
  lineHeight: 1.08,
  fontWeight: 950,
  margin: "12px 0 0",
};

const metaRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
  color: "#475569",
  fontSize: 14,
  fontWeight: 750,
};

const noticeCard: React.CSSProperties = {
  flex: "0 1 360px",
  border: "1px solid #bfdbfe",
  borderRadius: 18,
  background: "#ffffff",
  padding: 14,
};

const card: React.CSSProperties = {
  marginTop: 18,
  border: "1px solid #dbe3f0",
  borderRadius: 20,
  padding: 18,
  background: "#ffffff",
  boxShadow: "0 12px 28px rgba(15,23,42,0.05)",
};

const imageStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  aspectRatio: "16 / 9",
  objectFit: "cover",
  border: "1px solid #dbe3f0",
  borderRadius: 16,
  background: "#f8fafc",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#0f172a",
};

const instructionBox: React.CSSProperties = {
  marginTop: 8,
  border: "1px solid #dbe3f0",
  borderRadius: 16,
  padding: 14,
  background: "#f8fafc",
  color: "#0f172a",
  fontSize: 18,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
};

const supportLine: React.CSSProperties = {
  margin: "7px 0 0",
  color: "#475569",
  fontSize: 13,
  fontWeight: 750,
  lineHeight: 1.5,
};

const criteriaList: React.CSSProperties = {
  margin: "10px 0 0",
  paddingLeft: 22,
  color: "#334155",
  lineHeight: 1.6,
  fontWeight: 700,
};

const answerSpace: React.CSSProperties = {
  marginTop: 10,
  border: "1px dashed #cbd5e1",
  borderRadius: 16,
  background: "repeating-linear-gradient(#ffffff, #ffffff 33px, #e2e8f0 34px)",
  overflow: "hidden",
};

const stickyShell: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 50,
  borderTop: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.96)",
  padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
  boxShadow: "0 -10px 30px rgba(15,23,42,0.10)",
  backdropFilter: "blur(8px)",
};

const stickyInner: React.CSSProperties = {
  width: "100%",
  maxWidth: 1040,
  margin: "0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
};

const backButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginLeft: "auto",
  minHeight: 42,
  border: "1px solid #0f172a",
  borderRadius: 12,
  background: "#0f172a",
  color: "#ffffff",
  padding: "10px 14px",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 950,
  whiteSpace: "nowrap",
  boxShadow: "0 10px 24px rgba(15,23,42,0.22)",
};
