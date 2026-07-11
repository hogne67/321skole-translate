"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Clipboard, Download, Printer, Share2 } from "lucide-react";
import { useLocale } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import { copyTextToClipboard, downloadPlannerMarkdown } from "@/lib/planner/clientExport";
import { plannerToMarkdown, plannerToStudentMarkdown } from "@/lib/planner/export";
import { normalizePlanner, type Planner } from "@/lib/planner/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { CompactPlannerDocumentView, PlannerDocumentView, StudentPlannerDocumentView } from "../../PlannerDocumentView";

export default function PlannerPrintPage() {
  const locale = useLocale();
  const params = useParams<{ plannerId?: string }>();
  const searchParams = useSearchParams();
  const plannerId = typeof params?.plannerId === "string" ? params.plannerId : "";
  const { user } = useUserProfile();
  const [planner, setPlanner] = useState<Planner | null>(null);
  const [documentMode, setDocumentMode] = useState<"teacher" | "student">(
    searchParams.get("audience") === "student" ? "student" : "teacher"
  );
  const [selectedPeriodId, setSelectedPeriodId] = useState(searchParams.get("periodId") || "");
  const [teacherPrintMode, setTeacherPrintMode] = useState<"short" | "full">("short");
  const [showWeekPlans, setShowWeekPlans] = useState(true);
  const [showReflectionLog, setShowReflectionLog] = useState(true);
  const [showYearEndSummary, setShowYearEndSummary] = useState(true);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPlanner() {
      if (!user || !plannerId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const token = await user.getIdToken();
        const res = await fetch(`/api/teacher/planner/${plannerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          planner?: Record<string, unknown> & { id?: string };
          error?: string;
        };
        if (!res.ok || !data.planner) throw new Error(data.error || "Could not load planner");
        if (!cancelled) setPlanner(normalizePlanner(data.planner.id || plannerId, data.planner));
      } catch (err) {
        console.error("Failed to load planner print", err);
        if (!cancelled) setError("Utskriftssiden kunne ikke lastes akkurat nå.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPlanner();
    return () => {
      cancelled = true;
    };
  }, [plannerId, user]);

  if (loading) return <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-4 text-sm text-slate-500">Laster utskrift...</div>;
  if (error || !planner) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error || "Planen finnes ikke."}</div>;

  async function copyMarkdown() {
    if (!planner) return;
    await copyTextToClipboard(
      documentMode === "student"
        ? plannerToStudentMarkdown(planner, { periodId: selectedPeriodId || undefined })
        : getMarkdownExport(
            planner,
            teacherPrintMode,
            showWeekPlans,
            showReflectionLog,
            showYearEndSummary,
            selectedPeriodId
          )
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareMarkdown() {
    if (!planner) return;
    const text =
      documentMode === "student"
        ? plannerToStudentMarkdown(planner, { periodId: selectedPeriodId || undefined })
        : getMarkdownExport(
            planner,
            teacherPrintMode,
            showWeekPlans,
            showReflectionLog,
            showYearEndSummary,
            selectedPeriodId
          );

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: planner.document.title || "321Planner", text });
        return;
      } catch {
        // Fall back to copying below.
      }
    }

    await copyTextToClipboard(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadMarkdown() {
    if (!planner) return;
    downloadPlannerMarkdown(
      planner,
      documentMode === "student"
        ? plannerToStudentMarkdown(planner, { periodId: selectedPeriodId || undefined })
        : getMarkdownExport(
            planner,
            teacherPrintMode,
            showWeekPlans,
            showReflectionLog,
            showYearEndSummary,
            selectedPeriodId
          )
    );
  }

  return (
    <main className="planner-print-page mx-auto grid max-w-5xl gap-5">
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }

          body * {
            visibility: hidden;
          }

          .planner-print-content,
          .planner-print-content * {
            visibility: visible;
          }

          .planner-print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            background: white;
          }

          .planner-print-actions {
            display: none !important;
          }

          .planner-document {
            border: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
      <section className="planner-print-actions grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/${locale}/teacher/planner/${planner.id}`}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Tilbake
          </Link>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-lg border border-slate-300 bg-white p-1">
              <button
                type="button"
                onClick={() => setDocumentMode("teacher")}
                className={`h-8 rounded-md px-3 text-sm font-bold ${
                  documentMode === "teacher" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Lærer
              </button>
              <button
                type="button"
                onClick={() => setDocumentMode("student")}
                className={`h-8 rounded-md px-3 text-sm font-bold ${
                  documentMode === "student" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Elev
              </button>
            </div>
            <button
              type="button"
              onClick={() => void copyMarkdown()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
            >
              <Clipboard className="h-4 w-4" aria-hidden="true" />
              {copied ? "Kopiert" : "Kopier tekst"}
            </button>
            <button
              type="button"
              onClick={() => void shareMarkdown()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Del
            </button>
            <button
              type="button"
              onClick={downloadMarkdown}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Last ned tekst
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-3 text-sm font-bold text-white hover:bg-slate-800"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Skriv ut / lag PDF
            </button>
          </div>
        </div>
        {planner.document.periods.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <label className="grid gap-1 text-sm font-bold text-slate-800 md:max-w-md">
              Omfang
              <select
                value={selectedPeriodId}
                onChange={(event) => setSelectedPeriodId(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
              >
                <option value="">Hele planen</option>
                {planner.document.periods.map((period, index) => (
                  <option key={period.id} value={period.id}>
                    {index + 1}. {period.title || "Uten tittel"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {documentMode === "teacher" ? (
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm font-bold text-slate-800">
            <div className="grid gap-2 sm:grid-cols-2">
              <PrintModeButton
                active={teacherPrintMode === "short"}
                title="Kort utskrift"
                description="Kun kort planoversikt med skolerute, lokale rammer og periodemål."
                onClick={() => setTeacherPrintMode("short")}
              />
              <PrintModeButton
                active={teacherPrintMode === "full"}
                title="Full plan"
                description="Hele årsplanen med valgte detaljer."
                onClick={() => setTeacherPrintMode("full")}
              />
            </div>
            {teacherPrintMode === "full" ? (
              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                <ToggleButton active={showWeekPlans} label="Ukeplaner" onClick={() => setShowWeekPlans((value) => !value)} />
                <ToggleButton active={showReflectionLog} label="Refleksjonslogg" onClick={() => setShowReflectionLog((value) => !value)} />
                <ToggleButton active={showYearEndSummary} label="Årsoppsummering" onClick={() => setShowYearEndSummary((value) => !value)} />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      <div className="planner-print-content">
        {documentMode === "student" ? (
          <StudentPlannerDocumentView planner={planner} options={{ periodId: selectedPeriodId || undefined }} />
        ) : teacherPrintMode === "short" ? (
          <CompactPlannerDocumentView planner={planner} options={{ periodId: selectedPeriodId || undefined }} />
        ) : (
          <PlannerDocumentView
            planner={planner}
            options={{
              showCompactOverview: false,
              showWeekPlans,
              showReflectionLog,
              showYearEndSummary,
              periodId: selectedPeriodId || undefined,
            }}
          />
        )}
      </div>
    </main>
  );
}

function getMarkdownExport(
  planner: Planner,
  teacherPrintMode: "short" | "full",
  showWeekPlans: boolean,
  showReflectionLog: boolean,
  showYearEndSummary: boolean,
  periodId: string
) {
  return plannerToMarkdown(planner, {
    compactOnly: teacherPrintMode === "short",
    showCompactOverview: teacherPrintMode === "short",
    showWeekPlans,
    showReflectionLog,
    showYearEndSummary,
    periodId: periodId || undefined,
  });
}

function PrintModeButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-20 items-start gap-3 rounded-lg border p-3 text-left transition ${
        active
          ? "border-emerald-700 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-700"
          : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
      }`}
    >
      <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
        active ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white"
      }`}>
        {active ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      </span>
      <span>
        <span className="block font-black">{title}</span>
        <span className="mt-1 block text-sm font-semibold leading-5 text-slate-600">{description}</span>
      </span>
    </button>
  );
}

function ToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-black transition ${
        active
          ? "border-emerald-700 bg-emerald-700 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
        active ? "border-white bg-white text-emerald-700" : "border-slate-300 bg-white"
      }`}>
        {active ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
      </span>
      {label}
    </button>
  );
}
