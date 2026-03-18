"use client";

import React, { useMemo, useState } from "react";
import { useLocale } from "next-intl";

type WorksheetLanguage = "no" | "en" | "pt";
type GeometryTopic = "shapes" | "perimeter" | "area" | "mixed";
type Difficulty = "easy" | "medium" | "hard";
type GeometryLevel = "grade_3_4" | "grade_5_7" | "grade_8_10";
type AnswerSpace = "small" | "medium" | "large";

type FigureKind =
  | "rectangle"
  | "square"
  | "triangle"
  | "circle"
  | "trapezoid";

type FigureSpec = {
  kind: FigureKind;
  widthCm?: number;
  heightCm?: number;
  sideCm?: number;
  sides?: number;
  corners?: number;
};

type MathWorksheetTask = {
  id: string;
  type: "shape_name" | "count_sides" | "perimeter" | "area";
  prompt: string;
  figure?: FigureSpec;
  options?: string[];
  answer: string;
  explanation?: string;
  hint?: string;
};

type MathWorksheet = {
  title: string;
  language: WorksheetLanguage;
  level: GeometryLevel;
  topic: GeometryTopic;
  difficulty: Difficulty;
  instructions: string;
  teacherVersion: boolean;
  tasks: MathWorksheetTask[];
};

type GenerateResponse =
  | {
      ok: true;
      worksheet: MathWorksheet;
    }
  | {
      ok: false;
      error: string;
    };

type UIStrings = {
  pageTitle: string;
  pageSubtitle: string;
  builder: string;
  preview: string;
  language: string;
  level: string;
  topic: string;
  difficulty: string;
  taskCount: string;
  hints: string;
  teacherVersion: string;
  answerSpace: string;
  generate: string;
  generating: string;
  print: string;
  studentVersion: string;
  teacherVersionLabel: string;
  worksheetTitle: string;
  instructions: string;
  name: string;
  date: string;
  answer: string;
  explanation: string;
  hint: string;
  shapes: string;
  perimeter: string;
  area: string;
  mixed: string;
  easy: string;
  medium: string;
  hard: string;
  small: string;
  mediumSpace: string;
  large: string;
  yes: string;
  no: string;
  grade34: string;
  grade57: string;
  grade810: string;
  failed: string;
};

const STRINGS: Record<WorksheetLanguage, UIStrings> = {
  no: {
    pageTitle: "Geometri-generator",
    pageSubtitle: "Lag et enkelt arbeidsark i geometri for utskrift.",
    builder: "Generator",
    preview: "Forhåndsvisning",
    language: "Språk",
    level: "Nivå",
    topic: "Tema",
    difficulty: "Vanskelighetsgrad",
    taskCount: "Antall oppgaver",
    hints: "Med hint",
    teacherVersion: "Vis lærerversjon",
    answerSpace: "Svarplass",
    generate: "Lag arbeidsark",
    generating: "Lager arbeidsark...",
    print: "Skriv ut / lagre som PDF",
    studentVersion: "Elevversjon",
    teacherVersionLabel: "Lærerversjon",
    worksheetTitle: "Tittel",
    instructions: "Instruksjon",
    name: "Navn",
    date: "Dato",
    answer: "Svar",
    explanation: "Forklaring",
    hint: "Hint",
    shapes: "Former",
    perimeter: "Omkrets",
    area: "Areal",
    mixed: "Blandet",
    easy: "Lett",
    medium: "Middels",
    hard: "Utfordrende",
    small: "Liten",
    mediumSpace: "Middels",
    large: "Stor",
    yes: "Ja",
    no: "Nei",
    grade34: "3.–4. trinn",
    grade57: "5.–7. trinn",
    grade810: "8.–10. trinn",
    failed: "Kunne ikke lage arbeidsarket.",
  },
  en: {
    pageTitle: "Geometry worksheet generator",
    pageSubtitle: "Create a simple printable geometry worksheet.",
    builder: "Builder",
    preview: "Preview",
    language: "Language",
    level: "Level",
    topic: "Topic",
    difficulty: "Difficulty",
    taskCount: "Number of tasks",
    hints: "Include hints",
    teacherVersion: "Show teacher version",
    answerSpace: "Answer space",
    generate: "Generate worksheet",
    generating: "Generating worksheet...",
    print: "Print / save as PDF",
    studentVersion: "Student version",
    teacherVersionLabel: "Teacher version",
    worksheetTitle: "Title",
    instructions: "Instructions",
    name: "Name",
    date: "Date",
    answer: "Answer",
    explanation: "Explanation",
    hint: "Hint",
    shapes: "Shapes",
    perimeter: "Perimeter",
    area: "Area",
    mixed: "Mixed",
    easy: "Easy",
    medium: "Medium",
    hard: "Challenging",
    small: "Small",
    mediumSpace: "Medium",
    large: "Large",
    yes: "Yes",
    no: "No",
    grade34: "Grades 3–4",
    grade57: "Grades 5–7",
    grade810: "Grades 8–10",
    failed: "Could not generate worksheet.",
  },
  pt: {
    pageTitle: "Gerador de geometria",
    pageSubtitle: "Crie uma ficha simples de geometria para impressão.",
    builder: "Gerador",
    preview: "Pré-visualização",
    language: "Idioma",
    level: "Nível",
    topic: "Tema",
    difficulty: "Dificuldade",
    taskCount: "Número de tarefas",
    hints: "Com dicas",
    teacherVersion: "Mostrar versão do professor",
    answerSpace: "Espaço para resposta",
    generate: "Gerar ficha",
    generating: "A gerar ficha...",
    print: "Imprimir / guardar em PDF",
    studentVersion: "Versão do aluno",
    teacherVersionLabel: "Versão do professor",
    worksheetTitle: "Título",
    instructions: "Instruções",
    name: "Nome",
    date: "Data",
    answer: "Resposta",
    explanation: "Explicação",
    hint: "Dica",
    shapes: "Formas",
    perimeter: "Perímetro",
    area: "Área",
    mixed: "Misto",
    easy: "Fácil",
    medium: "Médio",
    hard: "Desafiante",
    small: "Pequeno",
    mediumSpace: "Médio",
    large: "Grande",
    yes: "Sim",
    no: "Não",
    grade34: "3.º–4.º ano",
    grade57: "5.º–7.º ano",
    grade810: "8.º–10.º ano",
    failed: "Não foi possível gerar a ficha.",
  },
};

function fallbackWorksheet(language: WorksheetLanguage): MathWorksheet {
  const titles: Record<WorksheetLanguage, string> = {
    no: "Geometri – former, omkrets og areal",
    en: "Geometry – shapes, perimeter and area",
    pt: "Geometria – formas, perímetro e área",
  };

  const instructions: Record<WorksheetLanguage, string> = {
    no: "Svar på oppgavene. Vis utregning der det passer.",
    en: "Answer the questions. Show your work when relevant.",
    pt: "Responde às tarefas. Mostra os cálculos quando fizer sentido.",
  };

  return {
    title: titles[language],
    language,
    level: "grade_5_7",
    topic: "mixed",
    difficulty: "easy",
    instructions: instructions[language],
    teacherVersion: false,
    tasks: [],
  };
}

function answerSpaceClass(answerSpace: AnswerSpace): string {
  if (answerSpace === "small") return "min-h-[40px]";
  if (answerSpace === "large") return "min-h-[92px]";
  return "min-h-[64px]";
}

function getMeasurementLabel(lang: WorksheetLanguage, key: "length" | "width" | "side"): string {
  const labels: Record<WorksheetLanguage, Record<"length" | "width" | "side", string>> = {
    no: { length: "lengde", width: "bredde", side: "side" },
    en: { length: "length", width: "width", side: "side" },
    pt: { length: "comprimento", width: "largura", side: "lado" },
  };
  return labels[lang][key];
}

function GeometryFigure({ figure, language }: { figure?: FigureSpec; language: WorksheetLanguage }) {
  if (!figure) return null;

  const labelClass = "text-[11px] fill-slate-700";

  if (figure.kind === "rectangle") {
    const width = figure.widthCm ?? 8;
    const height = figure.heightCm ?? 5;

    return (
      <svg viewBox="0 0 240 140" className="h-36 w-full max-w-[260px]">
        <rect
          x="40"
          y="25"
          width="160"
          height="90"
          rx="4"
          fill="white"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-700"
        />
        <text x="120" y="18" textAnchor="middle" className={labelClass}>
          {width} cm
        </text>
        <text x="214" y="74" textAnchor="middle" className={labelClass}>
          {height} cm
        </text>
      </svg>
    );
  }

  if (figure.kind === "square") {
    const side = figure.sideCm ?? 6;

    return (
      <svg viewBox="0 0 180 160" className="h-36 w-full max-w-[220px]">
        <rect
          x="40"
          y="30"
          width="90"
          height="90"
          rx="4"
          fill="white"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-700"
        />
        <text x="85" y="20" textAnchor="middle" className={labelClass}>
          {side} cm
        </text>
        <text x="145" y="78" textAnchor="middle" className={labelClass}>
          {side} cm
        </text>
      </svg>
    );
  }

  if (figure.kind === "triangle") {
    return (
      <svg viewBox="0 0 200 150" className="h-36 w-full max-w-[220px]">
        <polygon
          points="100,20 25,125 175,125"
          fill="white"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-700"
        />
        {figure.sides ? (
          <text x="100" y="144" textAnchor="middle" className={labelClass}>
            {figure.sides} {language === "no" ? "sider" : language === "en" ? "sides" : "lados"}
          </text>
        ) : null}
      </svg>
    );
  }

  if (figure.kind === "circle") {
    return (
      <svg viewBox="0 0 180 150" className="h-36 w-full max-w-[220px]">
        <circle
          cx="90"
          cy="72"
          r="44"
          fill="white"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-700"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 220 150" className="h-36 w-full max-w-[240px]">
      <polygon
        points="50,115 75,35 155,35 180,115"
        fill="white"
        stroke="currentColor"
        strokeWidth="2"
        className="text-slate-700"
      />
      {figure.sides ? (
        <text x="115" y="142" textAnchor="middle" className={labelClass}>
          {figure.sides} {language === "no" ? "sider" : language === "en" ? "sides" : "lados"}
        </text>
      ) : null}
    </svg>
  );
}

function FigureMeta({ figure, language }: { figure?: FigureSpec; language: WorksheetLanguage }) {
  if (!figure) return null;

  if (figure.kind === "rectangle" && figure.widthCm && figure.heightCm) {
    return (
      <p className="text-sm text-slate-600">
        {getMeasurementLabel(language, "length")}: {figure.widthCm} cm,{" "}
        {getMeasurementLabel(language, "width")}: {figure.heightCm} cm
      </p>
    );
  }

  if (figure.kind === "square" && figure.sideCm) {
    return (
      <p className="text-sm text-slate-600">
        {getMeasurementLabel(language, "side")}: {figure.sideCm} cm
      </p>
    );
  }

  return null;
}

export default function ProducerMathGeometryPage() {
  const locale = useLocale();
  const initialLanguage: WorksheetLanguage =
    locale === "no" || locale === "en" || locale === "pt" ? locale : "no";

  const [language, setLanguage] = useState<WorksheetLanguage>(initialLanguage);
  const [level, setLevel] = useState<GeometryLevel>("grade_5_7");
  const [topic, setTopic] = useState<GeometryTopic>("mixed");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [taskCount, setTaskCount] = useState<number>(6);
  const [includeHints, setIncludeHints] = useState<boolean>(true);
  const [teacherVersion, setTeacherVersion] = useState<boolean>(false);
  const [answerSpace, setAnswerSpace] = useState<AnswerSpace>("medium");
  const [worksheet, setWorksheet] = useState<MathWorksheet>(() => fallbackWorksheet(initialLanguage));
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const strings = useMemo(() => STRINGS[language], [language]);

  async function handleGenerate() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/generate-math-worksheet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language,
          level,
          topic,
          difficulty,
          taskCount,
          includeHints,
          teacherVersion,
          answerSpace,
        }),
      });

      const data = (await response.json()) as GenerateResponse;

      if (!response.ok || !data.ok) {
        const message = "error" in data && typeof data.error === "string" ? data.error : strings.failed;
        setError(message);
        return;
      }

      setWorksheet(data.worksheet);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.failed);
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <main className="min-h-screen bg-slate-50 print:bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
        <div className="mb-6 print:hidden">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {strings.pageTitle}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">{strings.pageSubtitle}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] print:block">
          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">{strings.builder}</h2>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{strings.language}</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as WorksheetLanguage)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 transition focus:border-slate-400"
                >
                  <option value="no">Norsk</option>
                  <option value="en">English</option>
                  <option value="pt">Português</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{strings.level}</span>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as GeometryLevel)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                >
                  <option value="grade_3_4">{strings.grade34}</option>
                  <option value="grade_5_7">{strings.grade57}</option>
                  <option value="grade_8_10">{strings.grade810}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{strings.topic}</span>
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value as GeometryTopic)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                >
                  <option value="shapes">{strings.shapes}</option>
                  <option value="perimeter">{strings.perimeter}</option>
                  <option value="area">{strings.area}</option>
                  <option value="mixed">{strings.mixed}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{strings.difficulty}</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                >
                  <option value="easy">{strings.easy}</option>
                  <option value="medium">{strings.medium}</option>
                  <option value="hard">{strings.hard}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{strings.taskCount}</span>
                <input
                  type="number"
                  min={4}
                  max={12}
                  value={taskCount}
                  onChange={(e) => setTaskCount(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{strings.answerSpace}</span>
                <select
                  value={answerSpace}
                  onChange={(e) => setAnswerSpace(e.target.value as AnswerSpace)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                >
                  <option value="small">{strings.small}</option>
                  <option value="medium">{strings.mediumSpace}</option>
                  <option value="large">{strings.large}</option>
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2">
                <input
                  type="checkbox"
                  checked={includeHints}
                  onChange={(e) => setIncludeHints(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">{strings.hints}</span>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2">
                <input
                  type="checkbox"
                  checked={teacherVersion}
                  onChange={(e) => setTeacherVersion(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">{strings.teacherVersion}</span>
              </label>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading}
                  className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? strings.generating : strings.generate}
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  {strings.print}
                </button>
              </div>
            </div>
          </aside>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
            <div className="border-b border-slate-200 px-6 py-4 print:hidden">
              <h2 className="text-lg font-semibold text-slate-900">{strings.preview}</h2>
            </div>

            <div className="px-6 py-6 print:px-0 print:py-0">
              <div className="mx-auto max-w-[820px] bg-white text-slate-900 print:max-w-none">
                <div className="mb-6 border-b border-slate-200 pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-2xl font-bold">{worksheet.title}</h3>
                      <p className="mt-2 text-sm text-slate-600">{worksheet.instructions}</p>
                    </div>

                    <div className="shrink-0 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                      {worksheet.teacherVersion ? strings.teacherVersionLabel : strings.studentVersion}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
                      <span className="font-medium">{strings.name}:</span>
                    </div>
                    <div className="rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
                      <span className="font-medium">{strings.date}:</span>
                    </div>
                  </div>
                </div>

                {worksheet.tasks.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                    {strings.generate}
                  </div>
                ) : (
                  <div className="space-y-5">
                    {worksheet.tasks.map((task, idx) => (
                      <article key={task.id} className="rounded-3xl border border-slate-200 p-4 sm:p-5">
                        <div className="mb-3 flex items-start gap-3">
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                            {idx + 1}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-base font-semibold text-slate-900">{task.prompt}</h4>
                            <FigureMeta figure={task.figure} language={worksheet.language} />
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                          <div className="flex items-center justify-center rounded-2xl bg-slate-50 p-3">
                            <GeometryFigure figure={task.figure} language={worksheet.language} />
                          </div>

                          <div className="space-y-3">
                            <div
                              className={`rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-3 ${answerSpaceClass(answerSpace)}`}
                            >
                              <span className="text-sm font-medium text-slate-600">{strings.answer}:</span>
                            </div>

                            {worksheet.teacherVersion ? (
                              <div className="space-y-2 rounded-2xl bg-emerald-50 p-3">
                                <p className="text-sm">
                                  <span className="font-semibold text-slate-900">{strings.answer}:</span>{" "}
                                  <span className="text-slate-800">{task.answer}</span>
                                </p>

                                {task.explanation ? (
                                  <p className="text-sm text-slate-700">
                                    <span className="font-semibold text-slate-900">
                                      {strings.explanation}:
                                    </span>{" "}
                                    {task.explanation}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}

                            {!worksheet.teacherVersion && includeHints && task.hint ? (
                              <div className="rounded-2xl bg-amber-50 p-3 text-sm text-slate-700">
                                <span className="font-semibold text-slate-900">{strings.hint}:</span>{" "}
                                {task.hint}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}