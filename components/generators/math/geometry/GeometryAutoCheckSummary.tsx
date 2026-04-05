// components/generators/math/geometry/GeometryAutoCheckSummary.tsx
"use client";

type CountLike = number | null | undefined;

type GeometryAutoLike = {
  total?: CountLike;
  totalAuto?: CountLike;
  correct?: CountLike;
  correctAuto?: CountLike;
  partial?: CountLike;
  partialAuto?: CountLike;
  wrong?: CountLike;
  wrongAuto?: CountLike;
  unanswered?: CountLike;
  unansweredAuto?: CountLike;
  percent?: CountLike;
  percentAuto?: CountLike;
  byTaskId?: Record<string, unknown>;
  byTask?: Record<string, unknown>;
};

type TFn = (key: string, values?: Record<string, unknown>) => string;

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readTotal(auto: GeometryAutoLike | null | undefined): number {
  return safeNumber(auto?.total ?? auto?.totalAuto);
}

function readCorrect(auto: GeometryAutoLike | null | undefined): number {
  return safeNumber(auto?.correct ?? auto?.correctAuto);
}

function readPartial(auto: GeometryAutoLike | null | undefined): number {
  return safeNumber(auto?.partial ?? auto?.partialAuto);
}

function readWrong(auto: GeometryAutoLike | null | undefined): number {
  return safeNumber(auto?.wrong ?? auto?.wrongAuto);
}

function readUnanswered(auto: GeometryAutoLike | null | undefined): number {
  return safeNumber(auto?.unanswered ?? auto?.unansweredAuto);
}

function readPercent(auto: GeometryAutoLike | null | undefined): number | null {
  const value = auto?.percent ?? auto?.percentAuto;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fallback(label: string, fallbackText: string) {
  return label === fallbackText || label.includes(".") ? fallbackText : label;
}

function Card({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "good" | "bad" | "warn" | "partial";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "bad"
        ? "border-red-200 bg-red-50 text-red-900"
        : tone === "warn"
          ? "border-slate-200 bg-slate-50 text-slate-700"
          : tone === "partial"
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-slate-200 bg-white text-slate-900";

  const subToneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "bad"
        ? "text-red-700"
        : tone === "warn"
          ? "text-slate-500"
          : tone === "partial"
            ? "text-amber-700"
            : "text-slate-500";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${subToneClass}`}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

export default function GeometryAutoCheckSummary({
  auto,
  t,
  title,
}: {
  auto: GeometryAutoLike | null | undefined;
  t?: TFn;
  title?: string;
}) {
  if (!auto) return null;

  const total = readTotal(auto);
  const correct = readCorrect(auto);
  const partial = readPartial(auto);
  const wrong = readWrong(auto);
  const unanswered = readUnanswered(auto);
  const percent = readPercent(auto);

  const heading =
    title ||
    (t ? fallback(t("autoSummaryTitle"), "Auto correction") : "Auto correction");

  const labelScore = t ? fallback(t("score"), "Score") : "Score";
  const labelTasks = t ? fallback(t("tasks"), "Tasks") : "Tasks";
  const labelCorrect = t ? fallback(t("correct"), "Correct") : "Correct";
  const labelPartial = t ? fallback(t("partial"), "Partially correct") : "Partially correct";
  const labelWrong = t ? fallback(t("wrong"), "Wrong") : "Wrong";
  const labelUnanswered = t ? fallback(t("unanswered"), "Unanswered") : "Unanswered";

  const summaryText =
    total > 0
      ? t
        ? fallback(
            t("autoSummaryText", {
              correct,
              partial,
              wrong,
              unanswered,
              total,
            }),
            `${correct} correct, ${partial} partially correct, ${wrong} wrong and ${unanswered} unanswered out of ${total} tasks.`
          )
        : `${correct} correct, ${partial} partially correct, ${wrong} wrong and ${unanswered} unanswered out of ${total} tasks.`
      : t
        ? fallback(t("autoSummaryEmpty"), "No tasks to assess.")
        : "No tasks to assess.";

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900">{heading}</h2>
        <p className="mt-1 text-sm text-slate-600">{summaryText}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Card
          label={labelScore}
          value={percent != null ? `${percent} %` : "—"}
        />
        <Card label={labelTasks} value={total} />
        <Card label={labelCorrect} value={correct} tone="good" />
        <Card label={labelPartial} value={partial} tone="partial" />
        <Card label={labelWrong} value={wrong} tone="bad" />
        <Card label={labelUnanswered} value={unanswered} tone="warn" />
      </div>
    </section>
  );
}