"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, Copy, FileText, Plus, Search, RotateCcw } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import TrainingVideoPlayer from "@/components/TrainingVideoPlayer";
import { normalizePlanner, type Planner, type PlannerStatus } from "@/lib/planner/types";
import { useUserProfile } from "@/lib/useUserProfile";

type SortKey = "updated" | "newest" | "oldest" | "title";

function withLocale(locale: string, href: string) {
  return `/${locale}${href}`;
}

export default function TeacherPlannerPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user } = useUserProfile();
  const [planners, setPlanners] = useState<Planner[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [loading, setLoading] = useState(true);
  const [busyPlannerId, setBusyPlannerId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPlanners() {
      if (!user) {
        setPlanners([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const token = await user.getIdToken();
        const res = await fetch("/api/teacher/planner", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          planners?: Array<Record<string, unknown> & { id?: string }>;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Could not load planners");
        if (!cancelled) {
          setPlanners((data.planners ?? []).map((item) => normalizePlanner(item.id || "", item)));
        }
      } catch (err) {
        console.error("Failed to load planners", err);
        if (!cancelled) setError("Planene kunne ikke lastes akkurat nå.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPlanners();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const visiblePlanners = useMemo(() => {
    const query = search.trim().toLowerCase();
    return planners
      .filter((planner) => statusFilter === "all" || planner.status === statusFilter)
      .filter((planner) => {
        if (!query) return true;
        return [
          planner.document.title,
          planner.frame.subject,
          planner.frame.level,
          planner.frame.schoolYear,
          planner.frame.country,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        if (sortKey === "title") return a.document.title.localeCompare(b.document.title, "nb");
        if (sortKey === "updated") {
          const aTime = a.updatedAt?.toDate().getTime() ?? a.createdAt?.toDate().getTime() ?? 0;
          const bTime = b.updatedAt?.toDate().getTime() ?? b.createdAt?.toDate().getTime() ?? 0;
          return bTime - aTime;
        }
        const aTime = a.createdAt?.toDate().getTime() ?? 0;
        const bTime = b.createdAt?.toDate().getTime() ?? 0;
        return sortKey === "newest" ? bTime - aTime : aTime - bTime;
      });
  }, [planners, search, sortKey, statusFilter]);

  const plannerCounts = useMemo(
    () => ({
      all: planners.length,
      draft: planners.filter((planner) => planner.status === "draft").length,
      active: planners.filter((planner) => planner.status === "active").length,
      archived: planners.filter((planner) => planner.status === "archived").length,
    }),
    [planners]
  );

  async function updatePlannerStatus(planner: Planner, action: "archive" | "activate" | "draft") {
    if (!user || busyPlannerId) return;

    try {
      setBusyPlannerId(planner.id);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/planner/${planner.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: PlannerStatus;
        error?: string;
      };
      if (!res.ok || !data.status) throw new Error(data.error || "Could not update planner");
      setPlanners((prev) =>
        prev.map((item) => (item.id === planner.id ? { ...item, status: data.status as PlannerStatus } : item))
      );
    } catch (err) {
      console.error("Failed to update planner status", err);
      setError("Status kunne ikke oppdateres akkurat nå.");
    } finally {
      setBusyPlannerId("");
    }
  }

  async function duplicatePlanner(planner: Planner) {
    if (!user || busyPlannerId) return;

    try {
      setBusyPlannerId(planner.id);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/planner/${planner.id}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        plannerId?: string;
        error?: string;
      };
      if (!res.ok || !data.plannerId) throw new Error(data.error || "Could not duplicate planner");
      router.push(withLocale(locale, `/teacher/planner/${data.plannerId}`));
    } catch (err) {
      console.error("Failed to duplicate planner", err);
      setError("Planen kunne ikke kopieres akkurat nå.");
      setBusyPlannerId("");
    }
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-5">
      <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-800">
              321Planner MVP
            </div>
            <h1 className="m-0 mt-3 text-2xl font-black text-slate-950">Mine planer</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Lag, rediger, lagre og skriv ut årsplaner som kan brukes videre gjennom skoleåret.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TrainingVideoPlayer
              title="Slik lager du en plan i 321Planner"
              videoUrl="https://youtu.be/jhzmYK11m1U"
              buttonLabel="Se introduksjonsvideo"
              buttonTitle="Se instruksjonsvideo for 321Planner"
              closeLabel="Lukk"
              description="En kort gjennomgang av 321Planner og de viktigste valgene."
              thumbnail
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <SummaryButton label="Alle" value={plannerCounts.all} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
          <SummaryButton label="Draft" value={plannerCounts.draft} active={statusFilter === "draft"} onClick={() => setStatusFilter("draft")} />
          <SummaryButton label="Aktive" value={plannerCounts.active} active={statusFilter === "active"} onClick={() => setStatusFilter("active")} />
          <SummaryButton label="Arkiv" value={plannerCounts.archived} active={statusFilter === "archived"} onClick={() => setStatusFilter("archived")} />
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-950">Oversikt</h2>
            <p className="mt-1 text-sm text-slate-600">{visiblePlanners.length} planer vises</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
              {planners.length} totalt
            </span>
            <Link
              href={withLocale(locale, "/teacher/planner/new")}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 px-4 text-sm font-bold text-white no-underline hover:bg-emerald-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Lag ny plan
            </Link>
          </div>
        </div>

        <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_auto_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Søk etter fag, nivå eller skoleår"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
          >
            <option value="all">Alle statuser</option>
            <option value="draft">Draft</option>
            <option value="active">Aktiv</option>
            <option value="archived">Arkivert</option>
          </select>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
          >
            <option value="updated">Sist oppdatert</option>
            <option value="newest">Nyeste først</option>
            <option value="oldest">Eldste først</option>
            <option value="title">Tittel A-Å</option>
          </select>
        </div>

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Laster planer...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        ) : visiblePlanners.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
            <h3 className="m-0 text-base font-extrabold text-slate-900">Ingen planer ennå</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Start med en AI-generert årsplan, rediger den og lagre som arbeidsdokument.
            </p>
            <Link
              href={withLocale(locale, "/teacher/planner/new")}
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 px-4 text-sm font-bold text-white no-underline hover:bg-emerald-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Lag ny plan
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 rounded-lg bg-sky-50 p-3">
            {visiblePlanners.map((planner) => (
              <article
                key={planner.id}
                className="rounded-lg border border-sky-100 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                      <h3 className="m-0 break-words text-base font-extrabold text-slate-950">
                        {planner.document.title || "Uten tittel"}
                      </h3>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold capitalize text-slate-600">
                        {planner.status}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                      {planner.document.description || "Ingen beskrivelse ennå."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{planner.frame.subject}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{planner.frame.level}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{planner.frame.schoolYear}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                        {planner.document.periods.length} perioder
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                        {planner.document.periods.reduce((sum, period) => sum + period.weekPlans.length, 0)} ukeplaner
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                        {planner.document.reflectionLog.length} refleksjoner
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                        {planner.frame.teachingWeeks} uker
                      </span>
                    </div>
                    <div className="mt-3 text-xs font-semibold text-slate-500">
                      Sist oppdatert: {formatPlannerDate(planner.updatedAt?.toDate() ?? planner.createdAt?.toDate() ?? null)}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {planner.status === "archived" ? (
                      <button
                        type="button"
                        disabled={busyPlannerId === planner.id}
                        onClick={() => void updatePlannerStatus(planner, "activate")}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Aktiver
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyPlannerId === planner.id}
                        onClick={() => void updatePlannerStatus(planner, "archive")}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                      >
                        <Archive className="h-4 w-4" aria-hidden="true" />
                        Arkiver
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyPlannerId === planner.id}
                      onClick={() => void duplicatePlanner(planner)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Kopier
                    </button>
                    <Link
                      href={withLocale(locale, `/teacher/planner/${planner.id}`)}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-xs font-bold text-white no-underline hover:bg-slate-800"
                    >
                      Åpne plan
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function formatPlannerDate(date: Date | null): string {
  if (!date) return "-";
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function SummaryButton({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
        active
          ? "border-emerald-700 bg-emerald-700 text-white"
          : "border-slate-200 bg-white text-slate-950"
      }`}
    >
      <div className="text-xs font-black uppercase tracking-wide opacity-75">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </button>
  );
}
