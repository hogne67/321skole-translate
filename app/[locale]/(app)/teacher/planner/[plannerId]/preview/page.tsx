"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Clipboard, Download, Printer } from "lucide-react";
import { useLocale } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import { copyTextToClipboard, downloadPlannerMarkdown } from "@/lib/planner/clientExport";
import { plannerToMarkdown, plannerToStudentMarkdown } from "@/lib/planner/export";
import { normalizePlanner, type Planner } from "@/lib/planner/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { PlannerDocumentView, StudentPlannerDocumentView } from "../../PlannerDocumentView";

export default function PlannerPreviewPage() {
  const locale = useLocale();
  const params = useParams<{ plannerId?: string }>();
  const searchParams = useSearchParams();
  const plannerId = typeof params?.plannerId === "string" ? params.plannerId : "";
  const { user } = useUserProfile();
  const [planner, setPlanner] = useState<Planner | null>(null);
  const [loading, setLoading] = useState(true);
  const [documentMode, setDocumentMode] = useState<"teacher" | "student">(
    searchParams.get("audience") === "student" ? "student" : "teacher"
  );
  const [selectedPeriodId, setSelectedPeriodId] = useState(searchParams.get("periodId") || "");
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
        console.error("Failed to load planner preview", err);
        if (!cancelled) setError("Forhåndsvisningen kunne ikke lastes akkurat nå.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPlanner();
    return () => {
      cancelled = true;
    };
  }, [plannerId, user]);

  if (loading) return <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-4 text-sm text-slate-500">Laster forhåndsvisning...</div>;
  if (error || !planner) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error || "Planen finnes ikke."}</div>;

  async function copyMarkdown() {
    if (!planner) return;
    await copyTextToClipboard(
      documentMode === "student"
        ? plannerToStudentMarkdown(planner, { periodId: selectedPeriodId || undefined })
        : plannerToMarkdown(planner, { periodId: selectedPeriodId || undefined })
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadMarkdown() {
    if (!planner) return;
    downloadPlannerMarkdown(
      planner,
      documentMode === "student"
        ? plannerToStudentMarkdown(planner, { periodId: selectedPeriodId || undefined })
        : plannerToMarkdown(planner, { periodId: selectedPeriodId || undefined })
    );
  }

  const printHref = `/${locale}/teacher/planner/${planner.id}/print${buildDocumentQuery(
    documentMode,
    selectedPeriodId
  )}`;

  return (
    <main className="mx-auto grid max-w-5xl gap-5">
      <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-4 shadow-sm">
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
            onClick={downloadMarkdown}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Last ned tekst
          </button>
          <Link
            href={printHref}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-3 text-sm font-bold text-white no-underline hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Utskrift / PDF
          </Link>
          </div>
        </div>
        {planner.document.periods.length > 0 ? (
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
        ) : null}
      </section>
      {documentMode === "student" ? (
        <StudentPlannerDocumentView planner={planner} options={{ periodId: selectedPeriodId || undefined }} />
      ) : (
        <PlannerDocumentView planner={planner} options={{ periodId: selectedPeriodId || undefined }} />
      )}
    </main>
  );
}

function buildDocumentQuery(documentMode: "teacher" | "student", periodId: string) {
  const params = new URLSearchParams();
  if (documentMode === "student") params.set("audience", "student");
  if (periodId) params.set("periodId", periodId);
  const query = params.toString();
  return query ? `?${query}` : "";
}
