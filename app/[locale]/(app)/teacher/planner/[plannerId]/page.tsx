"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Eye,
  PlayCircle,
  Plus,
  Printer,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useLocale } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import {
  normalizePlanner,
  type Planner,
  type PlannerActivity,
  type CurriculumSource,
  type CurriculumSourceType,
  type PlannerAiLevel,
  type PlannerConcreteLearningGoal,
  type PlannerDocument,
  type PlannerFrame,
  type PlannerIndividualDetails,
  type PlannerPeriod,
  type PlannerPeriodStatus,
  type PlannerReflectionEntry,
  type PlannerStatus,
  type PlannerType,
  type PlannerWeekPlan,
} from "@/lib/planner/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { PlannerWorkspaceNav } from "./PlannerWorkspaceNav";

type ActiveKey = "overview" | "annual" | "semesters" | "periods" | "activities" | "reflections" | "print" | "settings";

const COUNTRIES = ["Norge", "England", "Brasil", "Egendefinert"];
const SCHOOL_TYPES = [
  "Barnehage",
  "Barneskole",
  "Ungdomsskole",
  "Videregående",
  "Voksenopplæring",
  "Universitet",
  "Arbeidsrettet opplæring",
];
const AI_LEVELS: Array<{ value: PlannerAiLevel; label: string }> = [
  { value: "short", label: "Kort" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Detaljert" },
];
const CURRICULUM_TYPES: Array<{ value: CurriculumSourceType; label: string }> = [
  { value: "official", label: "Offisiell læreplan" },
  { value: "custom", label: "Egen tekst" },
  { value: "upload", label: "Last opp dokument" },
];
const PERIOD_STATUSES: Array<{ value: PlannerPeriodStatus; label: string }> = [
  { value: "planned", label: "Planlagt" },
  { value: "active", label: "Pågår" },
  { value: "completed", label: "Fullført" },
];

type PlannerBackup = {
  savedAt: string;
  planner: Pick<Planner, "status" | "frame" | "curriculum" | "document">;
};

export default function PlannerDashboardPage() {
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ plannerId?: string }>();
  const searchParams = useSearchParams();
  const { user } = useUserProfile();
  const plannerId = typeof params?.plannerId === "string" ? params.plannerId : "";
  const section = searchParams.get("section") || "Oversikt";
  const [planner, setPlanner] = useState<Planner | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [generatingSection, setGeneratingSection] = useState<
    "annual" | "periods" | "activities" | "studentGoals" | "goalLinks" | ""
  >("");
  const [summarizingReflections, setSummarizingReflections] = useState(false);
  const [generatingWeekIndex, setGeneratingWeekIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [localBackup, setLocalBackup] = useState<PlannerBackup | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<PlannerBackup | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const backupKey = plannerId ? `321planner-draft-${plannerId}` : "";

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
        if (!cancelled) {
          const loadedPlanner = normalizePlanner(data.planner.id || plannerId, data.planner);
          setPlanner(loadedPlanner);
          setLastSavedAt(loadedPlanner.updatedAt?.toDate() ?? loadedPlanner.createdAt?.toDate() ?? null);
          setDirty(false);

          const backup = readPlannerBackup(`321planner-draft-${loadedPlanner.id}`);
          const backupDate = backup ? new Date(backup.savedAt) : null;
          const serverDate = loadedPlanner.updatedAt?.toDate() ?? loadedPlanner.createdAt?.toDate() ?? null;
          setLocalBackup(
            backup && backupDate && (!serverDate || backupDate.getTime() > serverDate.getTime())
              ? backup
              : null
          );
        }
      } catch (err) {
        console.error("Failed to load planner", err);
        if (!cancelled) setError("Planen kunne ikke lastes akkurat nå.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPlanner();
    return () => {
      cancelled = true;
    };
  }, [plannerId, user]);

  useEffect(() => {
    if (!backupKey || !planner || !dirty) return;

    const backup: PlannerBackup = {
      savedAt: new Date().toISOString(),
      planner: {
        status: planner.status,
        frame: planner.frame,
        curriculum: planner.curriculum,
        document: planner.document,
      },
    };

    try {
      window.localStorage.setItem(backupKey, JSON.stringify(backup));
    } catch {
      // Local backup is best-effort; server save remains the source of truth.
    }
  }, [backupKey, dirty, planner]);

  useEffect(() => {
    if (!dirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const savePlanner = useCallback(async () => {
    if (!user || !planner || saving) return;

    try {
      setSaving(true);
      setError("");
      setMessage("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/planner/${planner.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: planner.status,
          frame: planner.frame,
          curriculum: planner.curriculum,
          document: planner.document,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save planner");
      setDirty(false);
      setLastSavedAt(new Date());
      setLocalBackup(null);
      setUndoSnapshot(null);
      if (backupKey) window.localStorage.removeItem(backupKey);
      setMessage("Planen er lagret.");
      window.setTimeout(() => setMessage(""), 1800);
    } catch (err) {
      console.error("Failed to save planner", err);
      setError("Planen kunne ikke lagres akkurat nå.");
    } finally {
      setSaving(false);
    }
  }, [backupKey, planner, saving, user]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && !saving) void savePlanner();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dirty, savePlanner, saving]);

  async function duplicatePlanner() {
    if (!user || !planner || copying) return;

    try {
      setCopying(true);
      setError("");
      setMessage("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/planner/${planner.id}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        plannerId?: string;
        schoolYear?: string;
        error?: string;
      };
      if (!res.ok || !data.plannerId) throw new Error(data.error || "Could not duplicate planner");
      router.push(`/${locale}/teacher/planner/${data.plannerId}`);
    } catch (err) {
      console.error("Failed to duplicate planner", err);
      setError("Planen kunne ikke kopieres akkurat nå.");
      setCopying(false);
    }
  }

  function restoreLocalBackup() {
    if (!planner || !localBackup) return;

    setPlanner({
      ...planner,
      status: localBackup.planner.status,
      frame: localBackup.planner.frame,
      curriculum: localBackup.planner.curriculum,
      document: localBackup.planner.document,
    });
    setDirty(true);
    setLocalBackup(null);
    setUndoSnapshot(null);
    setMessage("Lokalt utkast er hentet tilbake. Lagre planen hvis du vil beholde det.");
    window.setTimeout(() => setMessage(""), 2400);
  }

  function restoreUndoSnapshot() {
    if (!planner || !undoSnapshot) return;

    setPlanner({
      ...planner,
      status: undoSnapshot.planner.status,
      frame: undoSnapshot.planner.frame,
      curriculum: undoSnapshot.planner.curriculum,
      document: undoSnapshot.planner.document,
    });
    setDirty(true);
    setUndoSnapshot(null);
    setMessage("Siste AI-endring er angret. Lagre planen hvis du vil beholde dette.");
    window.setTimeout(() => setMessage(""), 2400);
  }

  function discardLocalBackup() {
    if (backupKey) window.localStorage.removeItem(backupKey);
    setLocalBackup(null);
  }

  function updateDocument<K extends keyof PlannerDocument>(key: K, value: PlannerDocument[K]) {
    setDirty(true);
    setPlanner((prev) => (prev ? { ...prev, document: { ...prev.document, [key]: value } } : prev));
  }

  function updateIndividualDetails<K extends keyof PlannerIndividualDetails>(
    key: K,
    value: PlannerIndividualDetails[K]
  ) {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              individualDetails: {
                ...prev.document.individualDetails,
                [key]: value,
              },
            },
          }
        : prev
    );
  }

  function updateFrame<K extends keyof PlannerFrame>(key: K, value: PlannerFrame[K]) {
    setDirty(true);
    setPlanner((prev) => (prev ? { ...prev, frame: { ...prev.frame, [key]: value } } : prev));
  }

  function updateCurriculum<K extends keyof CurriculumSource>(key: K, value: CurriculumSource[K]) {
    setDirty(true);
    setPlanner((prev) =>
      prev ? { ...prev, curriculum: { ...prev.curriculum, [key]: value } } : prev
    );
  }

  function updateStatus(status: PlannerStatus) {
    setDirty(true);
    setPlanner((prev) => (prev ? { ...prev, status } : prev));
  }

  function updatePeriod(index: number, patch: Partial<PlannerPeriod>) {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              periods: prev.document.periods.map((period, periodIndex) =>
                periodIndex === index ? { ...period, ...patch } : period
              ),
            },
          }
        : prev
    );
  }

  function activatePeriod(index: number) {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              periods: prev.document.periods.map((period, currentIndex) => {
                if (currentIndex === index) return { ...period, status: "active" };
                if (period.status === "active") return { ...period, status: "planned" };
                return period;
              }),
            },
          }
        : prev
    );
  }

  function completeActivePeriod() {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              periods: prev.document.periods.map((period) =>
                period.status === "active" ? { ...period, status: "completed" } : period
              ),
            },
          }
        : prev
    );
  }

  function addPeriod() {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              periods: [
                ...prev.document.periods,
                {
                  id: `period-${Date.now()}`,
                  status: "planned",
                  title: "Ny periode",
                  weeks: "",
                  linkedGoalIds: [],
                  goals: "",
                  content: "",
                  methods: "",
                  assessment: "",
                  reflection: "",
                  weekPlans: [],
                },
              ],
            },
          }
        : prev
    );
  }

  function removePeriod(index: number) {
    const period = planner?.document.periods[index];
    const hasContent = period
      ? [
          period.title,
          period.weeks,
          period.goals,
          period.content,
          period.methods,
          period.assessment,
          period.reflection,
        ].some((value) => value.trim().length > 0) || period.weekPlans.length > 0
      : false;
    if (hasContent && !window.confirm("Denne perioden har innhold. Vil du slette den?")) return;

    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              periods: prev.document.periods.filter((_, periodIndex) => periodIndex !== index),
            },
          }
        : prev
    );
  }

  function duplicatePeriod(index: number) {
    setDirty(true);
    setPlanner((prev) => {
      if (!prev) return prev;
      const source = prev.document.periods[index];
      if (!source) return prev;

      const duplicate: PlannerPeriod = {
        ...source,
        id: `period-${Date.now()}`,
        status: "planned",
        title: `${source.title || "Periode"} (kopi)`,
        weekPlans: source.weekPlans.map((weekPlan, weekIndex) => ({
          ...weekPlan,
          id: `week-${Date.now()}-${weekIndex}`,
        })),
      };
      const periods = [...prev.document.periods];
      periods.splice(index + 1, 0, duplicate);

      return {
        ...prev,
        document: {
          ...prev.document,
          periods,
        },
      };
    });
  }

  function movePeriod(index: number, direction: -1 | 1) {
    setDirty(true);
    setPlanner((prev) => {
      if (!prev) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.document.periods.length) return prev;

      const periods = [...prev.document.periods];
      const [period] = periods.splice(index, 1);
      periods.splice(nextIndex, 0, period);

      return {
        ...prev,
        document: {
          ...prev.document,
          periods,
        },
      };
    });
  }

  function updateWeekPlan(periodIndex: number, weekIndex: number, patch: Partial<PlannerWeekPlan>) {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              periods: prev.document.periods.map((period, currentPeriodIndex) =>
                currentPeriodIndex === periodIndex
                  ? {
                      ...period,
                      weekPlans: period.weekPlans.map((weekPlan, currentWeekIndex) =>
                        currentWeekIndex === weekIndex ? { ...weekPlan, ...patch } : weekPlan
                      ),
                    }
                  : period
              ),
            },
          }
        : prev
    );
  }

  function addWeekPlan(periodIndex: number) {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              periods: prev.document.periods.map((period, currentPeriodIndex) =>
                currentPeriodIndex === periodIndex
                  ? {
                      ...period,
                      weekPlans: [
                        ...period.weekPlans,
                        {
                          id: `week-${Date.now()}`,
                          week: "",
                          title: "Ny ukeplan",
                          linkedGoalIds: [],
                          goals: "",
                          activities: "",
                          assessment: "",
                          notes: "",
                        },
                      ],
                    }
                  : period
              ),
            },
          }
        : prev
    );
  }

  function removeWeekPlan(periodIndex: number, weekIndex: number) {
    const weekPlan = planner?.document.periods[periodIndex]?.weekPlans[weekIndex];
    const hasContent = weekPlan
      ? [weekPlan.week, weekPlan.title, weekPlan.goals, weekPlan.activities, weekPlan.assessment, weekPlan.notes].some(
          (value) => value.trim().length > 0
        )
      : false;
    if (hasContent && !window.confirm("Denne ukeplanen har innhold. Vil du slette den?")) return;

    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              periods: prev.document.periods.map((period, currentPeriodIndex) =>
                currentPeriodIndex === periodIndex
                  ? {
                      ...period,
                      weekPlans: period.weekPlans.filter((_, currentWeekIndex) => currentWeekIndex !== weekIndex),
                    }
                  : period
              ),
            },
          }
        : prev
    );
  }

  function duplicateWeekPlan(periodIndex: number, weekIndex: number) {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              periods: prev.document.periods.map((period, currentPeriodIndex) => {
                if (currentPeriodIndex !== periodIndex) return period;
                const source = period.weekPlans[weekIndex];
                if (!source) return period;
                const weekPlans = [...period.weekPlans];
                weekPlans.splice(weekIndex + 1, 0, {
                  ...source,
                  id: `week-${Date.now()}`,
                  title: `${source.title || "Ukeplan"} (kopi)`,
                });
                return { ...period, weekPlans };
              }),
            },
          }
        : prev
    );
  }

  function moveWeekPlan(periodIndex: number, weekIndex: number, direction: -1 | 1) {
    setDirty(true);
    setPlanner((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        document: {
          ...prev.document,
          periods: prev.document.periods.map((period, currentPeriodIndex) => {
            if (currentPeriodIndex !== periodIndex) return period;
            const nextIndex = weekIndex + direction;
            if (nextIndex < 0 || nextIndex >= period.weekPlans.length) return period;

            const weekPlans = [...period.weekPlans];
            const [weekPlan] = weekPlans.splice(weekIndex, 1);
            weekPlans.splice(nextIndex, 0, weekPlan);
            return { ...period, weekPlans };
          }),
        },
      };
    });
  }

  function updateActivity(index: number, patch: Partial<PlannerActivity>) {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              activities: prev.document.activities.map((activity, activityIndex) =>
                activityIndex === index ? { ...activity, ...patch } : activity
              ),
            },
          }
        : prev
    );
  }

  function updateConcreteLearningGoal(index: number, patch: Partial<PlannerConcreteLearningGoal>) {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              concreteLearningGoals: prev.document.concreteLearningGoals.map((goal, goalIndex) =>
                goalIndex === index ? { ...goal, ...patch } : goal
              ),
            },
          }
        : prev
    );
  }

  function addConcreteLearningGoal() {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              concreteLearningGoals: [
                ...prev.document.concreteLearningGoals,
                {
                  id: `concrete-goal-${Date.now()}`,
                  goal: "Nytt konkret læringsmål",
                  studentLanguage: "",
                  evidence: "",
                },
              ],
            },
          }
        : prev
    );
  }

  function removeConcreteLearningGoal(index: number) {
    const goal = planner?.document.concreteLearningGoals[index];
    const hasContent = goal
      ? [goal.goal, goal.studentLanguage, goal.evidence].some((value) => value.trim().length > 0)
      : false;
    if (hasContent && !window.confirm("Dette læringsmålet har innhold. Vil du slette det?")) return;

    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              concreteLearningGoals: prev.document.concreteLearningGoals.filter(
                (_, goalIndex) => goalIndex !== index
              ),
              periods: goal
                ? prev.document.periods.map((period) => ({
                    ...period,
                    linkedGoalIds: period.linkedGoalIds.filter((goalId) => goalId !== goal.id),
                    weekPlans: period.weekPlans.map((weekPlan) => ({
                      ...weekPlan,
                      linkedGoalIds: weekPlan.linkedGoalIds.filter((goalId) => goalId !== goal.id),
                    })),
                  }))
                : prev.document.periods,
            },
          }
        : prev
    );
  }

  function addActivity() {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              activities: [
                ...prev.document.activities,
                {
                  id: `activity-${Date.now()}`,
                  title: "Ny aktivitet",
                  period: "",
                  description: "",
                  method: "",
                  assessment: "",
                },
              ],
            },
          }
        : prev
    );
  }

  function removeActivity(index: number) {
    const activity = planner?.document.activities[index];
    const hasContent = activity
      ? [activity.title, activity.period, activity.description, activity.method, activity.assessment].some(
          (value) => value.trim().length > 0
        )
      : false;
    if (hasContent && !window.confirm("Denne aktiviteten har innhold. Vil du slette den?")) return;

    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              activities: prev.document.activities.filter((_, activityIndex) => activityIndex !== index),
            },
          }
        : prev
    );
  }

  function duplicateActivity(index: number) {
    setDirty(true);
    setPlanner((prev) => {
      if (!prev) return prev;
      const source = prev.document.activities[index];
      if (!source) return prev;

      const activities = [...prev.document.activities];
      activities.splice(index + 1, 0, {
        ...source,
        id: `activity-${Date.now()}`,
        title: `${source.title || "Aktivitet"} (kopi)`,
      });

      return {
        ...prev,
        document: {
          ...prev.document,
          activities,
        },
      };
    });
  }

  function moveActivity(index: number, direction: -1 | 1) {
    setDirty(true);
    setPlanner((prev) => {
      if (!prev) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.document.activities.length) return prev;

      const activities = [...prev.document.activities];
      const [activity] = activities.splice(index, 1);
      activities.splice(nextIndex, 0, activity);

      return {
        ...prev,
        document: {
          ...prev.document,
          activities,
        },
      };
    });
  }

  function updateReflectionEntry(index: number, patch: Partial<PlannerReflectionEntry>) {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              reflectionLog: prev.document.reflectionLog.map((entry, entryIndex) =>
                entryIndex === index ? { ...entry, ...patch } : entry
              ),
            },
          }
        : prev
    );
  }

  function addReflectionEntry() {
    const today = new Date().toISOString().slice(0, 10);
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              reflectionLog: [
                {
                  id: `reflection-${Date.now()}`,
                  date: today,
                  title: "Ny refleksjon",
                  period: prev.document.periods.find((period) => period.status === "active")?.title ?? "",
                  whatWorked: "",
                  whatToAdjust: "",
                  nextStep: "",
                },
                ...prev.document.reflectionLog,
              ],
            },
          }
        : prev
    );
  }

  function removeReflectionEntry(index: number) {
    setDirty(true);
    setPlanner((prev) =>
      prev
        ? {
            ...prev,
            document: {
              ...prev.document,
              reflectionLog: prev.document.reflectionLog.filter((_, entryIndex) => entryIndex !== index),
            },
          }
        : prev
    );
  }

  async function generatePlannerSection(
    kind: "annual" | "periods" | "activities" | "studentGoals" | "goalLinks"
  ) {
    if (!user || !planner || generatingSection) return;

    const hasAnnualContent = [
      planner.document.description,
      planner.document.subjectRelevance,
      planner.document.coreValues,
      planner.document.learningGoals,
      planner.document.annualOverview,
    ].some((value) => value.trim().length > 0);
    const confirmationMessages: Partial<Record<typeof kind, string>> = {
      annual: "AI forbedrer årsplandelen og kan erstatte tekst du allerede har skrevet. Perioder, aktiviteter og refleksjoner beholdes. Vil du fortsette?",
      periods: "AI lager nye periodeforslag og erstatter periodene som ligger her nå. Vil du fortsette?",
      activities: "AI lager nye aktivitetsforslag og erstatter aktivitetene som ligger her nå. Vil du fortsette?",
      studentGoals:
        "AI lager nye konkrete læringsmål og erstatter målene som ligger her nå. Vil du fortsette?",
      goalLinks:
        "AI foreslår målkoblinger og kan erstatte koblingene som allerede ligger på perioder og ukeplaner. Vil du fortsette?",
    };
    const shouldConfirm =
      (kind === "annual" && hasAnnualContent) ||
      (kind === "periods" && planner.document.periods.length > 0) ||
      (kind === "activities" && planner.document.activities.length > 0) ||
      (kind === "studentGoals" && planner.document.concreteLearningGoals.length > 0) ||
      (kind === "goalLinks" &&
        planner.document.periods.some(
          (period) =>
            period.linkedGoalIds.length > 0 ||
            period.weekPlans.some((weekPlan) => weekPlan.linkedGoalIds.length > 0)
        ));

    if (shouldConfirm && !window.confirm(confirmationMessages[kind])) return;

    if (kind === "goalLinks") {
      if (planner.document.concreteLearningGoals.length === 0) {
        setError("Lag konkrete læringsmål før du foreslår målkoblinger.");
        return;
      }
      if (planner.document.periods.length === 0) {
        setError("Legg inn perioder før du foreslår målkoblinger.");
        return;
      }
    }

    try {
      setGeneratingSection(kind);
      setError("");
      setMessage("");
      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/planner/generate-section", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind,
          frame: planner.frame,
          curriculum: planner.curriculum,
          document: planner.document,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        periods?: PlannerPeriod[];
        activities?: PlannerActivity[];
        concreteLearningGoals?: PlannerConcreteLearningGoal[];
        periodLinks?: Array<{ periodId: string; linkedGoalIds: string[] }>;
        weekLinks?: Array<{ periodId: string; weekPlanId: string; linkedGoalIds: string[] }>;
        document?: PlannerDocument;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not generate planner section");
      const previousPlanner = createPlannerBackup(planner);

      if (kind === "annual" && data.document) {
        setUndoSnapshot(previousPlanner);
        setDirty(true);
        setPlanner((prev) =>
          prev
            ? {
                ...prev,
                document: {
                  ...prev.document,
                  title: data.document?.title ?? prev.document.title,
                  description: data.document?.description ?? prev.document.description,
                  subjectRelevance: data.document?.subjectRelevance ?? prev.document.subjectRelevance,
                  coreValues: data.document?.coreValues ?? prev.document.coreValues,
                  coreElements: data.document?.coreElements ?? prev.document.coreElements,
                  interdisciplinaryThemes:
                    data.document?.interdisciplinaryThemes ?? prev.document.interdisciplinaryThemes,
                  basicSkills: data.document?.basicSkills ?? prev.document.basicSkills,
                  learningGoals: data.document?.learningGoals ?? prev.document.learningGoals,
                  assessmentForms: data.document?.assessmentForms ?? prev.document.assessmentForms,
                  workMethods: data.document?.workMethods ?? prev.document.workMethods,
                  annualOverview: data.document?.annualOverview ?? prev.document.annualOverview,
                  reflection: data.document?.reflection ?? prev.document.reflection,
                },
              }
            : prev
        );
        setMessage("Årsplandelen er forbedret. Perioder og aktiviteter er beholdt.");
      } else if (kind === "periods" && data.periods?.length) {
        setUndoSnapshot(previousPlanner);
        setDirty(true);
        setPlanner((prev) =>
          prev ? { ...prev, document: { ...prev.document, periods: data.periods ?? [] } } : prev
        );
        setMessage("Nye periodeforslag er lagt inn. Husk å lagre hvis du vil beholde dem.");
      } else if (kind === "activities" && data.activities?.length) {
        setUndoSnapshot(previousPlanner);
        setDirty(true);
        setPlanner((prev) =>
          prev ? { ...prev, document: { ...prev.document, activities: data.activities ?? [] } } : prev
        );
        setMessage("Nye aktivitetsforslag er lagt inn. Husk å lagre hvis du vil beholde dem.");
      } else if (kind === "studentGoals" && data.concreteLearningGoals?.length) {
        setUndoSnapshot(previousPlanner);
        setDirty(true);
        setPlanner((prev) =>
          prev
            ? {
                ...prev,
                document: {
                  ...prev.document,
                  concreteLearningGoals: data.concreteLearningGoals ?? [],
                },
              }
            : prev
        );
        setMessage("Konkrete læringsmål er lagt inn. Husk å lagre hvis du vil beholde dem.");
      } else if (kind === "goalLinks" && (data.periodLinks?.length || data.weekLinks?.length)) {
        const validGoalIds = new Set(planner.document.concreteLearningGoals.map((goal) => goal.id));
        const periodLinkMap = new Map(
          (data.periodLinks ?? []).map((link) => [
            link.periodId,
            link.linkedGoalIds.filter((goalId) => validGoalIds.has(goalId)),
          ])
        );
        const weekLinkMap = new Map(
          (data.weekLinks ?? []).map((link) => [
            `${link.periodId}:${link.weekPlanId}`,
            link.linkedGoalIds.filter((goalId) => validGoalIds.has(goalId)),
          ])
        );
        setUndoSnapshot(previousPlanner);
        setDirty(true);
        setPlanner((prev) =>
          prev
            ? {
                ...prev,
                document: {
                  ...prev.document,
                  periods: prev.document.periods.map((period) => ({
                    ...period,
                    linkedGoalIds: periodLinkMap.get(period.id) ?? period.linkedGoalIds,
                    weekPlans: period.weekPlans.map((weekPlan) => ({
                      ...weekPlan,
                      linkedGoalIds:
                        weekLinkMap.get(`${period.id}:${weekPlan.id}`) ?? weekPlan.linkedGoalIds,
                    })),
                  })),
                },
              }
            : prev
        );
        setMessage("Målkoblinger er foreslått. Husk å lagre hvis du vil beholde dem.");
      } else {
        throw new Error("AI returned no suggestions");
      }
    } catch (err) {
      console.error("Failed to generate planner section", err);
      setError(
        kind === "annual"
          ? "Kunne ikke forbedre årsplanen akkurat nå."
          : kind === "periods"
            ? "Kunne ikke generere perioder akkurat nå."
            : kind === "activities"
              ? "Kunne ikke generere aktiviteter akkurat nå."
              : kind === "studentGoals"
                ? "Kunne ikke generere konkrete læringsmål akkurat nå."
                : "Kunne ikke foreslå målkoblinger akkurat nå."
      );
    } finally {
      setGeneratingSection("");
    }
  }

  async function generateWeekPlans(periodIndex: number) {
    if (!user || !planner || generatingWeekIndex !== null) return;

    const period = planner.document.periods[periodIndex];
    if (!period) return;

    if (
      period.weekPlans.length > 0 &&
      !window.confirm("AI lager nye ukeplaner og erstatter ukeplanene som ligger i denne perioden nå. Vil du fortsette?")
    ) {
      return;
    }

    try {
      setGeneratingWeekIndex(periodIndex);
      setError("");
      setMessage("");
      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/planner/generate-section", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: "weeks",
          periodIndex,
          frame: planner.frame,
          curriculum: planner.curriculum,
          document: planner.document,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        weekPlans?: PlannerWeekPlan[];
        error?: string;
      };
      if (!res.ok || !data.weekPlans?.length) throw new Error(data.error || "Could not generate week plans");

      setUndoSnapshot(createPlannerBackup(planner));
      setDirty(true);
      setPlanner((prev) =>
        prev
          ? {
              ...prev,
              document: {
                ...prev.document,
                periods: prev.document.periods.map((period, currentPeriodIndex) =>
                  currentPeriodIndex === periodIndex
                    ? { ...period, weekPlans: data.weekPlans ?? [] }
                    : period
                ),
              },
            }
          : prev
      );
      setMessage("Ukeplaner er lagt inn for perioden. Husk å lagre hvis du vil beholde dem.");
    } catch (err) {
      console.error("Failed to generate week plans", err);
      setError("Kunne ikke generere ukeplaner akkurat nå.");
    } finally {
      setGeneratingWeekIndex(null);
    }
  }

  async function summarizeReflections() {
    if (!user || !planner || summarizingReflections) return;

    try {
      setSummarizingReflections(true);
      setError("");
      setMessage("");
      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/planner/generate-section", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: "reflectionSummary",
          frame: planner.frame,
          curriculum: planner.curriculum,
          document: planner.document,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        yearEndSummary?: string;
        nextYearNotes?: string;
        error?: string;
      };
      if (!res.ok || (!data.yearEndSummary && !data.nextYearNotes)) {
        throw new Error(data.error || "Could not summarize reflections");
      }
      setUndoSnapshot(createPlannerBackup(planner));
      setDirty(true);
      setPlanner((prev) =>
        prev
          ? {
              ...prev,
              document: {
                ...prev.document,
                yearEndSummary: data.yearEndSummary ?? prev.document.yearEndSummary,
                nextYearNotes: data.nextYearNotes ?? prev.document.nextYearNotes,
              },
            }
          : prev
      );
      setMessage("Årsoppsummering er laget. Husk å lagre hvis du vil beholde den.");
    } catch (err) {
      console.error("Failed to summarize reflections", err);
      setError("Kunne ikke oppsummere refleksjonene akkurat nå.");
    } finally {
      setSummarizingReflections(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-4 text-sm text-slate-500">
        Laster plan...
      </div>
    );
  }

  if (error && !planner) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;
  }

  if (!planner) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Planen finnes ikke.</div>;
  }

  const active: ActiveKey =
    section === "Årsplan" || section === "Annual Plan"
      ? "annual"
      : section === "Semesterplaner" || section === "Semester Plans"
        ? "semesters"
        : section === "Periodeplaner" || section === "Period Plans"
          ? "periods"
          : section === "Aktiviteter" || section === "Activities"
            ? "activities"
            : section === "Refleksjon" || section === "Reflection"
              ? "reflections"
            : section === "Innstillinger" || section === "Settings"
              ? "settings"
              : "overview";

  return (
    <main className="mx-auto grid max-w-5xl gap-5">
      <PlannerWorkspaceNav
        locale={locale}
        plannerId={planner.id}
        title={planner.document.title}
        status={planner.status}
        active={active}
        hasUnsavedChanges={dirty}
      />

      {dirty ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          Du har ulagrede endringer.
        </div>
      ) : null}

      {localBackup ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div>
            <div className="font-black">Lokalt utkast funnet</div>
            <div className="mt-1 font-semibold">
              Lagret lokalt {formatSavedTime(new Date(localBackup.savedAt))}. Dette kan være nyere enn serverversjonen.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={restoreLocalBackup}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-700 bg-amber-700 px-3 text-sm font-bold text-white hover:bg-amber-800"
            >
              Hent utkast
            </button>
            <button
              type="button"
              onClick={discardLocalBackup}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 text-sm font-bold text-amber-950 hover:bg-amber-50"
            >
              Forkast
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          {message}
        </div>
      ) : null}

      {undoSnapshot ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <div>
            <div className="font-black text-slate-950">AI-endring kan angres</div>
            <div className="mt-1 font-semibold">
              Du kan hente tilbake planen slik den var før siste AI-forslag.
            </div>
          </div>
          <button
            type="button"
            onClick={restoreUndoSnapshot}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
          >
            Angre AI-endring
          </button>
        </div>
      ) : null}

        <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
        {active === "overview" ? (
          <Overview
            planner={planner}
            locale={locale}
            copying={copying}
            generatingGoalLinks={generatingSection === "goalLinks"}
            onDuplicate={duplicatePlanner}
            onActivatePeriod={activatePeriod}
            onCompleteActivePeriod={completeActivePeriod}
            onGenerateGoalLinks={() => void generatePlannerSection("goalLinks")}
          />
        ) : active === "annual" ? (
          <AnnualPlanEditor
            planner={planner}
            generating={generatingSection === "annual"}
            generatingStudentGoals={generatingSection === "studentGoals"}
            updateDocument={updateDocument}
            updateIndividualDetails={updateIndividualDetails}
            onGenerateStudentGoals={() => void generatePlannerSection("studentGoals")}
            onAddConcreteGoal={addConcreteLearningGoal}
            onUpdateConcreteGoal={updateConcreteLearningGoal}
            onRemoveConcreteGoal={removeConcreteLearningGoal}
            onGenerate={() => void generatePlannerSection("annual")}
          />
        ) : active === "semesters" ? (
          <SemesterPlansPanel planner={planner} />
        ) : active === "periods" ? (
          <PeriodEditor
            locale={locale}
            plannerId={planner.id}
            periods={planner.document.periods}
            concreteGoals={planner.document.concreteLearningGoals}
            generating={generatingSection === "periods"}
            generatingWeekIndex={generatingWeekIndex}
            onGenerate={() => void generatePlannerSection("periods")}
            onGenerateWeeks={(periodIndex) => void generateWeekPlans(periodIndex)}
            onAdd={addPeriod}
            onUpdate={updatePeriod}
            onMove={movePeriod}
            onDuplicate={duplicatePeriod}
            onRemove={removePeriod}
            onAddWeekPlan={addWeekPlan}
            onUpdateWeekPlan={updateWeekPlan}
            onMoveWeekPlan={moveWeekPlan}
            onDuplicateWeekPlan={duplicateWeekPlan}
            onRemoveWeekPlan={removeWeekPlan}
          />
        ) : active === "activities" ? (
          <ActivityEditor
            activities={planner.document.activities}
            generating={generatingSection === "activities"}
            onGenerate={() => void generatePlannerSection("activities")}
            onAdd={addActivity}
            onUpdate={updateActivity}
            onMove={moveActivity}
            onDuplicate={duplicateActivity}
            onRemove={removeActivity}
          />
        ) : active === "reflections" ? (
          <ReflectionLogEditor
            entries={planner.document.reflectionLog}
            yearEndSummary={planner.document.yearEndSummary}
            nextYearNotes={planner.document.nextYearNotes}
            summarizing={summarizingReflections}
            periods={planner.document.periods}
            onAdd={addReflectionEntry}
            onUpdate={updateReflectionEntry}
            onRemove={removeReflectionEntry}
            onSummarize={() => void summarizeReflections()}
            onUpdateSummary={(patch) => {
              setDirty(true);
              setPlanner((prev) =>
                prev
                  ? {
                      ...prev,
                      document: {
                        ...prev.document,
                        ...patch,
                      },
                    }
                  : prev
              );
            }}
          />
        ) : active === "settings" ? (
          <SettingsEditor
            planner={planner}
            updateFrame={updateFrame}
            updateCurriculum={updateCurriculum}
            updateStatus={updateStatus}
          />
        ) : null}
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <div className="mr-auto flex items-center text-sm font-semibold text-slate-500">
          {dirty ? "Ikke lagret ennå" : `Sist lagret: ${formatSavedTime(lastSavedAt)}`}
        </div>
        <Link
          href={`/${locale}/teacher/planner/${planner.id}/preview`}
          onClick={(event) => {
            if (
              dirty &&
              !window.confirm("Du har ulagrede endringer. Forhåndsvisningen viser sist lagrede versjon. Vil du gå videre?")
            ) {
              event.preventDefault();
            }
          }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Forhåndsvisning
        </Link>
        <Button type="button" variant="primary" disabled={saving || !dirty} onClick={() => void savePlanner()}>
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          {saving ? "Lagrer..." : dirty ? "Lagre ulagrede endringer" : "Lagret"}
        </Button>
      </div>
    </main>
  );
}

function formatSavedTime(value: Date | null): string {
  if (!value) return "-";
  return value.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readPlannerBackup(key: string): PlannerBackup | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlannerBackup>;
    if (!parsed.savedAt || !parsed.planner) return null;
    if (Number.isNaN(new Date(parsed.savedAt).getTime())) return null;
    return parsed as PlannerBackup;
  } catch {
    return null;
  }
}

function createPlannerBackup(planner: Planner): PlannerBackup {
  return {
    savedAt: new Date().toISOString(),
    planner: {
      status: planner.status,
      frame: planner.frame,
      curriculum: planner.curriculum,
      document: planner.document,
    },
  };
}

function plannerDocumentHref(
  locale: string,
  plannerId: string,
  target: "preview" | "print",
  options: { audience?: "student"; periodId?: string | undefined } = {}
) {
  const params = new URLSearchParams();
  if (options.audience === "student") params.set("audience", "student");
  if (options.periodId) params.set("periodId", options.periodId);
  const query = params.toString();
  return `/${locale}/teacher/planner/${plannerId}/${target}${query ? `?${query}` : ""}`;
}

function Overview({
  planner,
  locale,
  copying,
  generatingGoalLinks,
  onDuplicate,
  onActivatePeriod,
  onCompleteActivePeriod,
  onGenerateGoalLinks,
}: {
  planner: Planner;
  locale: string;
  copying: boolean;
  generatingGoalLinks: boolean;
  onDuplicate: () => void;
  onActivatePeriod: (index: number) => void;
  onCompleteActivePeriod: () => void;
  onGenerateGoalLinks: () => void;
}) {
  const reflectionCount = planner.document.periods.filter((period) => period.reflection.trim()).length;
  const activePeriodIndex = planner.document.periods.findIndex((period) => period.status === "active");
  const activePeriod = activePeriodIndex >= 0 ? planner.document.periods[activePeriodIndex] : undefined;
  const nextPeriodIndex =
    activePeriodIndex >= 0
      ? planner.document.periods.findIndex((period, index) => index > activePeriodIndex && period.status !== "completed")
      : planner.document.periods.findIndex((period) => period.status !== "completed");
  const nextPeriod = nextPeriodIndex >= 0 ? planner.document.periods[nextPeriodIndex] : undefined;
  const completedPeriods = planner.document.periods.filter((period) => period.status === "completed").length;
  const progressPercent =
    planner.document.periods.length > 0 ? Math.round((completedPeriods / planner.document.periods.length) * 100) : 0;
  const weekPlanCount = planner.document.periods.reduce((sum, period) => sum + period.weekPlans.length, 0);
  const readiness = getPlannerReadiness(planner);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-black text-slate-950">Oversikt</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {planner.document.description || "Planen er klar til videre redigering."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={copying}
            onClick={onDuplicate}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copying ? "Kopierer..." : "Kopier til neste skoleår"}
          </button>
          <Link
            href={`/${locale}/teacher/planner/${planner.id}/print`}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-sm font-bold text-white no-underline hover:bg-slate-800"
          >
            Åpne utskrift
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-7">
        <Stat label="Perioder" value={String(planner.document.periods.length)} />
        <Stat label="Ukeplaner" value={String(weekPlanCount)} />
        <Stat label="Aktiviteter" value={String(planner.document.activities.length)} />
        <Stat label="Logg" value={String(planner.document.reflectionLog.length)} />
        <Stat label="Uker" value={String(planner.frame.teachingWeeks)} />
        <Stat label="Timer" value={String(planner.frame.totalHours)} />
        <Stat label="Refleksjoner" value={String(reflectionCount)} />
      </div>

      <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-emerald-800">Nå i planen</div>
            <h3 className="m-0 mt-1 text-lg font-black text-emerald-950">
              {activePeriod?.title || "Ingen aktiv periode valgt"}
            </h3>
            <p className="mt-1 text-sm leading-6 text-emerald-900">
              {activePeriod
                ? activePeriod.goals || activePeriod.content || "Perioden er markert som pågående."
                : "Marker en periode som pågår for å bruke Planner mer aktivt gjennom skoleåret."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {activePeriod ? (
                <button
                  type="button"
                  onClick={onCompleteActivePeriod}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Fullfør periode
                </button>
              ) : null}
              {activePeriod ? (
                <>
                  <Link
                    href={plannerDocumentHref(locale, planner.id, "preview", {
                      audience: "student",
                      periodId: activePeriod.id,
                    })}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-bold text-emerald-950 no-underline hover:bg-emerald-50"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Elevpreview
                  </Link>
                  <Link
                    href={plannerDocumentHref(locale, planner.id, "print", {
                      audience: "student",
                      periodId: activePeriod.id,
                    })}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-bold text-emerald-950 no-underline hover:bg-emerald-50"
                  >
                    <Printer className="h-4 w-4" aria-hidden="true" />
                    Elevutskrift
                  </Link>
                </>
              ) : null}
              {nextPeriod ? (
                <button
                  type="button"
                  onClick={() => onActivatePeriod(nextPeriodIndex)}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-bold text-emerald-950 hover:bg-emerald-50"
                >
                  <PlayCircle className="h-4 w-4" aria-hidden="true" />
                  {activePeriod ? "Start neste periode" : "Start første periode"}
                </button>
              ) : null}
            </div>
          </div>
          <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-900">
            {completedPeriods}/{planner.document.periods.length || 0} fullført
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-emerald-100">
          <div className="h-full rounded-full bg-emerald-700" style={{ width: `${progressPercent}%` }} />
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <Info label="Fag" value={planner.frame.subject} />
        <Info label="Nivå" value={planner.frame.level} />
        <Info label="Skoleår" value={planner.frame.schoolYear} />
      </div>

      <GoalCoveragePanel
        planner={planner}
        locale={locale}
        generating={generatingGoalLinks}
        onGenerateGoalLinks={onGenerateGoalLinks}
      />

      <PlannerWorkflowPanel planner={planner} locale={locale} />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-base font-black text-slate-950">Planstatus</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {readiness.missing.length === 0
                ? "Planen har de viktigste delene på plass og er klar for preview eller utskrift."
                : "Dette er de viktigste tingene å fylle ut før planen deles eller skrives ut."}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-bold ${
              readiness.missing.length === 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {readiness.score}/{readiness.total}
          </span>
        </div>
        {readiness.missing.length > 0 ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {readiness.missing.map((item) => (
              <Link
                key={item.label}
                href={`/${locale}/teacher/planner/${planner.id}${item.href}`}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 no-underline hover:bg-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function getPlannerReadiness(planner: Planner) {
  const checks = [
    {
      ok: Boolean(planner.document.title.trim() && planner.document.description.trim()),
      label: "Skriv tittel og beskrivelse",
      href: "?section=%C3%85rsplan",
    },
    {
      ok: Boolean(planner.document.learningGoals.trim()),
      label: "Fyll ut læringsmål",
      href: "?section=%C3%85rsplan",
    },
    {
      ok: planner.document.concreteLearningGoals.length > 0,
      label: "Bryt ned læringsmål for elever",
      href: "?section=%C3%85rsplan",
    },
    {
      ok:
        planner.document.concreteLearningGoals.length === 0 ||
        planner.document.periods.some((period) => period.linkedGoalIds.length > 0),
      label: "Knytt konkrete mål til perioder",
      href: "?section=Periodeplaner",
    },
    {
      ok: Boolean(planner.document.assessmentForms.trim()),
      label: "Beskriv vurderingsformer",
      href: "?section=%C3%85rsplan",
    },
    {
      ok: planner.document.periods.length > 0,
      label: "Legg inn perioder",
      href: "?section=Periodeplaner",
    },
    {
      ok: planner.document.activities.length > 0,
      label: "Legg inn aktiviteter",
      href: "?section=Aktiviteter",
    },
    {
      ok: Boolean(planner.curriculum.framework.trim()),
      label: "Sjekk læreplangrunnlag",
      href: "?section=Innstillinger",
    },
  ];

  if (planner.frame.planType === "individual") {
    checks.push(
      {
        ok: Boolean(planner.document.individualDetails.progression.trim()),
        label: "Beskriv individuell progresjon",
        href: "?section=%C3%85rsplan",
      },
      {
        ok: Boolean(planner.document.individualDetails.adaptations.trim()),
        label: "Beskriv tilrettelegging",
        href: "?section=%C3%85rsplan",
      }
    );
  }

  return {
    total: checks.length,
    score: checks.filter((check) => check.ok).length,
    missing: checks.filter((check) => !check.ok),
  };
}

function GoalCoveragePanel({
  planner,
  locale,
  generating,
  onGenerateGoalLinks,
}: {
  planner: Planner;
  locale: string;
  generating: boolean;
  onGenerateGoalLinks: () => void;
}) {
  const goals = planner.document.concreteLearningGoals;
  if (goals.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-base font-black text-slate-950">Måldekning</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Lag konkrete læringsmål først, så kan Planner vise hvor de brukes i perioder og ukeplaner.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/${locale}/teacher/planner/${planner.id}?section=%C3%85rsplan`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
            >
              Åpne læringsmål
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const coverage = goals.map((goal) => {
    const periodLinks = planner.document.periods.filter((period) => period.linkedGoalIds.includes(goal.id));
    const weekLinks = planner.document.periods.flatMap((period) =>
      period.weekPlans
        .filter((weekPlan) => weekPlan.linkedGoalIds.includes(goal.id))
        .map((weekPlan) => ({ period, weekPlan }))
    );

    return {
      goal,
      periodLinks,
      weekLinks,
      covered: periodLinks.length > 0 || weekLinks.length > 0,
    };
  });
  const coveredCount = coverage.filter((item) => item.covered).length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-base font-black text-slate-950">Måldekning</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Se om de konkrete læringsmålene faktisk er koblet til perioder og ukeplaner.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-bold ${
              coveredCount === goals.length
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {coveredCount}/{goals.length} dekket
          </span>
          {planner.document.periods.length > 0 ? (
            <div className="grid justify-items-end gap-1">
              <button
                type="button"
                disabled={generating}
                onClick={onGenerateGoalLinks}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                title="Foreslår hvilke konkrete læringsmål som passer til perioder og ukeplaner."
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {generating ? "Foreslår..." : "Foreslå koblinger"}
              </button>
              <span className="text-right text-xs font-semibold text-slate-500">Endrer bare koblinger, ikke tekst.</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {coverage.map((item, index) => (
          <div key={item.goal.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Mål {index + 1}</div>
                <p className="m-0 mt-1 text-sm font-bold leading-6 text-slate-900">
                  {item.goal.studentLanguage || item.goal.goal || "Uten måltekst"}
                </p>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                  item.covered
                    ? "border-emerald-200 bg-white text-emerald-800"
                    : "border-amber-200 bg-white text-amber-900"
                }`}
              >
                {item.covered ? "Dekket" : "Ikke koblet"}
              </span>
            </div>
            {item.covered ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                {item.periodLinks.length > 0 ? <span>{item.periodLinks.length} perioder</span> : null}
                {item.weekLinks.length > 0 ? <span>{item.weekLinks.length} ukeplaner</span> : null}
              </div>
            ) : (
              <Link
                href={`/${locale}/teacher/planner/${planner.id}?section=Periodeplaner`}
                className="mt-2 inline-flex text-sm font-bold text-amber-900 no-underline hover:underline"
              >
                Knytt målet til en periode
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function PlannerWorkflowPanel({ planner, locale }: { planner: Planner; locale: string }) {
  const hasAnnualPlan = Boolean(planner.document.title.trim() && planner.document.description.trim());
  const hasConcreteGoals = planner.document.concreteLearningGoals.length > 0;
  const hasPeriods = planner.document.periods.length > 0;
  const hasGoalLinks =
    !hasConcreteGoals ||
    planner.document.periods.some(
      (period) => period.linkedGoalIds.length > 0 || period.weekPlans.some((weekPlan) => weekPlan.linkedGoalIds.length > 0)
    );
  const hasActivities = planner.document.activities.length > 0;
  const hasStudentReady = hasConcreteGoals && hasPeriods && hasGoalLinks;
  const activePeriod = planner.document.periods.find((period) => period.status === "active");

  const steps = [
    {
      label: "1. Lag førsteutkast",
      done: hasAnnualPlan,
      href: `/${locale}/teacher/planner/${planner.id}?section=%C3%85rsplan`,
      detail: hasAnnualPlan ? "Årsplandelen har innhold." : "Fyll ut eller forbedre årsplandelen.",
    },
    {
      label: "2. Gjør målene elevnære",
      done: hasConcreteGoals,
      href: `/${locale}/teacher/planner/${planner.id}?section=%C3%85rsplan`,
      detail: hasConcreteGoals ? "Konkrete mål finnes." : "Lag 3-4 konkrete mål i elevspråk.",
    },
    {
      label: "3. Bygg perioder",
      done: hasPeriods,
      href: `/${locale}/teacher/planner/${planner.id}?section=Periodeplaner`,
      detail: hasPeriods ? "Perioder er lagt inn." : "Generer eller legg inn perioder.",
    },
    {
      label: "4. Koble mål til undervisning",
      done: hasGoalLinks,
      href: `/${locale}/teacher/planner/${planner.id}?section=Oversikt`,
      detail: hasGoalLinks ? "Mål er koblet til perioder eller ukeplaner." : "Bruk måldekning eller velg mål manuelt.",
    },
    {
      label: "5. Legg inn aktiviteter",
      done: hasActivities,
      href: `/${locale}/teacher/planner/${planner.id}?section=Aktiviteter`,
      detail: hasActivities ? "Aktiviteter er lagt inn." : "Legg inn praktiske arbeidsmåter og vurdering.",
    },
    {
      label: "6. Se lærer- og elevversjon",
      done: hasStudentReady,
      href: plannerDocumentHref(locale, planner.id, "preview", {
        audience: "student",
        periodId: activePeriod?.id,
      }),
      detail: hasStudentReady ? "Elevversjonen er klar til kontroll." : "Elevversjonen blir best når mål og perioder er koblet.",
    },
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-base font-black text-slate-950">Anbefalt arbeidsflyt</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            En praktisk løype fra førsteutkast til dokumenter som kan brukes med elever og deltakere.
          </p>
        </div>
        <Link
          href={plannerDocumentHref(locale, planner.id, "print", {
            audience: hasStudentReady ? "student" : undefined,
            periodId: activePeriod?.id,
          })}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-3 text-sm font-bold text-white no-underline hover:bg-slate-800"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          Test utskrift
        </Link>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {steps.map((step) => (
          <Link
            key={step.label}
            href={step.href}
            className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-800 no-underline hover:bg-white"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-black text-slate-950">{step.label}</div>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                  step.done
                    ? "border-emerald-200 bg-white text-emerald-800"
                    : "border-amber-200 bg-white text-amber-900"
                }`}
              >
                {step.done ? "Klar" : "Neste"}
              </span>
            </div>
            <p className="m-0 mt-1 text-sm leading-6 text-slate-600">{step.detail}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SemesterPlansPanel({ planner }: { planner: Planner }) {
  const periods = planner.document.periods;
  const midpoint = Math.ceil(periods.length / 2);
  const semesters = [
    { title: "Semester 1", periods: periods.slice(0, midpoint) },
    { title: "Semester 2", periods: periods.slice(midpoint) },
  ];

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="m-0 text-xl font-black text-slate-950">Semesterplaner</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Semesterplanene arver periodene fra årsplanen. Juster periodene for å endre denne oversikten.
        </p>
      </div>

      {periods.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          Legg inn perioder først, så får du semesteroversikten her.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {semesters.map((semester) => (
            <section key={semester.title} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="m-0 text-lg font-black text-slate-950">{semester.title}</h3>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                  {semester.periods.length} perioder
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                {semester.periods.length === 0 ? (
                  <p className="m-0 text-sm text-slate-600">Ingen perioder i dette semesteret ennå.</p>
                ) : (
                  semester.periods.map((period) => (
                    <div key={period.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h4 className="m-0 text-sm font-black text-slate-950">{period.title || "Uten tittel"}</h4>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
                            {formatPeriodStatus(period.status)}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
                            {period.weeks || "Uker ikke satt"}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {period.goals || period.content || "Ingen mål eller innhold er skrevet inn ennå."}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                        <span>{period.weekPlans.length} ukeplaner</span>
                        {period.reflection.trim() ? <span>Refleksjon lagt inn</span> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function AnnualPlanEditor({
  planner,
  generating,
  generatingStudentGoals,
  updateDocument,
  updateIndividualDetails,
  onGenerateStudentGoals,
  onAddConcreteGoal,
  onUpdateConcreteGoal,
  onRemoveConcreteGoal,
  onGenerate,
}: {
  planner: Planner;
  generating: boolean;
  generatingStudentGoals: boolean;
  updateDocument: <K extends keyof PlannerDocument>(key: K, value: PlannerDocument[K]) => void;
  updateIndividualDetails: <K extends keyof PlannerIndividualDetails>(
    key: K,
    value: PlannerIndividualDetails[K]
  ) => void;
  onGenerateStudentGoals: () => void;
  onAddConcreteGoal: () => void;
  onUpdateConcreteGoal: (index: number, patch: Partial<PlannerConcreteLearningGoal>) => void;
  onRemoveConcreteGoal: (index: number) => void;
  onGenerate: () => void;
}) {
  const document = planner.document;
  const individual = document.individualDetails;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-black text-slate-950">Årsplan</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Rediger årsplandelen, eller la AI rydde og forbedre teksten du allerede har.
          </p>
        </div>
        <Button type="button" variant="primary" disabled={generating} onClick={onGenerate}>
          <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
          {generating ? "Forbedrer..." : "Forbedre med AI"}
        </Button>
      </div>
      <p className="m-0 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
        Forbedre med AI rydder og skriver om årsplandelen. Perioder, aktiviteter, ukeplaner og refleksjoner beholdes,
        og endringen kan angres før du lagrer.
      </p>
      <Field label="Tittel">
        <Input value={document.title} onChange={(event) => updateDocument("title", event.target.value)} />
      </Field>
      <Field label="Beskrivelse">
        <Textarea value={document.description} onChange={(event) => updateDocument("description", event.target.value)} rows={4} />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Fagets relevans">
          <Textarea value={document.subjectRelevance} onChange={(event) => updateDocument("subjectRelevance", event.target.value)} rows={5} />
        </Field>
        <Field label="Sentrale verdier">
          <Textarea value={document.coreValues} onChange={(event) => updateDocument("coreValues", event.target.value)} rows={5} />
        </Field>
        <Field label="Kjerneelementer">
          <Textarea value={document.coreElements} onChange={(event) => updateDocument("coreElements", event.target.value)} rows={5} />
        </Field>
        <Field label="Tverrfaglige temaer">
          <Textarea value={document.interdisciplinaryThemes} onChange={(event) => updateDocument("interdisciplinaryThemes", event.target.value)} rows={5} />
        </Field>
        <Field label="Grunnleggende ferdigheter">
          <Textarea value={document.basicSkills} onChange={(event) => updateDocument("basicSkills", event.target.value)} rows={5} />
        </Field>
        <Field label="Læringsmål">
          <Textarea value={document.learningGoals} onChange={(event) => updateDocument("learningGoals", event.target.value)} rows={5} />
        </Field>
        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="m-0 text-base font-black text-slate-950">Konkrete læringsmål for elever og deltakere</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Bryt ned overordnede mål til 3-4 mål som er enklere å forstå, jobbe mot og vurdere.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onAddConcreteGoal}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Legg til mål
              </button>
              <button
                type="button"
                disabled={generatingStudentGoals}
                onClick={onGenerateStudentGoals}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                title="Lager inntil fire konkrete læringsmål i elevspråk basert på årsplanen."
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {generatingStudentGoals ? "Lager..." : "Lag konkrete mål"}
              </button>
            </div>
          </div>
          <p className="m-0 text-sm font-semibold text-slate-500">
            AI-forslaget erstatter listen med konkrete mål. Du kan angre endringen før du lagrer.
          </p>
          {document.concreteLearningGoals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              Ingen konkrete mål er lagt inn ennå.
            </div>
          ) : (
            <div className="grid gap-3">
              {document.concreteLearningGoals.map((goal, index) => (
                <div key={goal.id} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => onRemoveConcreteGoal(index)}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-rose-200 bg-white px-2 text-rose-700"
                      title="Slett mål"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <Field label="Konkret læringsmål">
                    <Textarea
                      value={goal.goal}
                      onChange={(event) => onUpdateConcreteGoal(index, { goal: event.target.value })}
                      rows={2}
                    />
                  </Field>
                  <Field label="Elevspråk">
                    <Textarea
                      value={goal.studentLanguage}
                      onChange={(event) => onUpdateConcreteGoal(index, { studentLanguage: event.target.value })}
                      rows={2}
                    />
                  </Field>
                  <Field label="Slik kan eleven vise det">
                    <Textarea
                      value={goal.evidence}
                      onChange={(event) => onUpdateConcreteGoal(index, { evidence: event.target.value })}
                      rows={2}
                    />
                  </Field>
                </div>
              ))}
            </div>
          )}
        </section>
        <Field label="Vurderingsformer">
          <Textarea value={document.assessmentForms} onChange={(event) => updateDocument("assessmentForms", event.target.value)} rows={5} />
        </Field>
        <Field label="Arbeidsmåter">
          <Textarea value={document.workMethods} onChange={(event) => updateDocument("workMethods", event.target.value)} rows={5} />
        </Field>
      </div>
      <Field label="Årsoversikt">
        <Textarea value={document.annualOverview} onChange={(event) => updateDocument("annualOverview", event.target.value)} rows={6} />
      </Field>
      {planner.frame.planType === "individual" ? (
        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4">
          <div>
            <h3 className="m-0 text-base font-black text-slate-950">Individuell plan</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Brukes når planen gjelder én elev eller deltaker med tilpasset progresjon.
            </p>
          </div>
          <Field label="Elev / deltaker">
            <Input
              value={individual.learnerName}
              onChange={(event) => updateIndividualDetails("learnerName", event.target.value)}
            />
          </Field>
          <Field label="Utgangspunkt og kontekst">
            <Textarea
              value={individual.learnerContext}
              onChange={(event) => updateIndividualDetails("learnerContext", event.target.value)}
              rows={3}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Behov for støtte">
              <Textarea
                value={individual.supportNeeds}
                onChange={(event) => updateIndividualDetails("supportNeeds", event.target.value)}
                rows={4}
              />
            </Field>
            <Field label="Tilrettelegging">
              <Textarea
                value={individual.adaptations}
                onChange={(event) => updateIndividualDetails("adaptations", event.target.value)}
                rows={4}
              />
            </Field>
            <Field label="Individuell progresjon">
              <Textarea
                value={individual.progression}
                onChange={(event) => updateIndividualDetails("progression", event.target.value)}
                rows={4}
              />
            </Field>
            <Field label="Samarbeid">
              <Textarea
                value={individual.collaboration}
                onChange={(event) => updateIndividualDetails("collaboration", event.target.value)}
                rows={4}
              />
            </Field>
          </div>
          <Field label="Evaluering og justering">
            <Textarea
              value={individual.evaluation}
              onChange={(event) => updateIndividualDetails("evaluation", event.target.value)}
              rows={3}
            />
          </Field>
        </section>
      ) : null}
      <Field label="Refleksjonsfelt">
        <Textarea value={document.reflection} onChange={(event) => updateDocument("reflection", event.target.value)} rows={4} />
      </Field>
    </div>
  );
}

function PeriodEditor({
  locale,
  plannerId,
  periods,
  concreteGoals,
  generating,
  generatingWeekIndex,
  onGenerate,
  onGenerateWeeks,
  onAdd,
  onUpdate,
  onMove,
  onDuplicate,
  onRemove,
  onAddWeekPlan,
  onUpdateWeekPlan,
  onMoveWeekPlan,
  onDuplicateWeekPlan,
  onRemoveWeekPlan,
}: {
  locale: string;
  plannerId: string;
  periods: PlannerPeriod[];
  concreteGoals: PlannerConcreteLearningGoal[];
  generating: boolean;
  generatingWeekIndex: number | null;
  onGenerate: () => void;
  onGenerateWeeks: (periodIndex: number) => void;
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<PlannerPeriod>) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  onAddWeekPlan: (periodIndex: number) => void;
  onUpdateWeekPlan: (periodIndex: number, weekIndex: number, patch: Partial<PlannerWeekPlan>) => void;
  onMoveWeekPlan: (periodIndex: number, weekIndex: number, direction: -1 | 1) => void;
  onDuplicateWeekPlan: (periodIndex: number, weekIndex: number) => void;
  onRemoveWeekPlan: (periodIndex: number, weekIndex: number) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-black text-slate-950">Periodeplaner</h2>
          <p className="mt-1 text-sm text-slate-600">Bygg årsplanen videre ned i perioder.</p>
        </div>
        <Button type="button" variant="secondary" onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Legg til periode
        </Button>
        <Button type="button" variant="primary" disabled={generating} onClick={onGenerate}>
          <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
          {generating ? "Lager forslag..." : "Lag nye periodeforslag"}
        </Button>
      </div>
      <p className="m-0 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
        Nye periodeforslag erstatter periodelisten som ligger her nå. Du kan angre AI-endringen før du lagrer.
      </p>
      {periods.length === 0 ? (
        <div className="grid gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          <p className="m-0">
            Ingen perioder er lagt inn ennå. Start med AI-forslag, eller legg inn perioder manuelt hvis du allerede har en struktur.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" disabled={generating} onClick={onGenerate}>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              {generating ? "Lager forslag..." : "Lag periodeforslag"}
            </Button>
            <Button type="button" variant="secondary" onClick={onAdd}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Legg til periode
            </Button>
          </div>
        </div>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3">
            {periods.map((period, index) => (
              <a
                key={period.id}
                href={`#planner-period-${period.id}`}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-800 no-underline hover:bg-white"
              >
                {index + 1}. {period.title || "Uten tittel"}
              </a>
            ))}
          </nav>
          {periods.map((period, index) => (
          <div
            key={period.id}
            id={`planner-period-${period.id}`}
            className="scroll-mt-36 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex flex-wrap justify-end gap-2">
              <Link
                href={plannerDocumentHref(locale, plannerId, "preview", {
                  audience: "student",
                  periodId: period.id,
                })}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-700 no-underline"
                title="Elevpreview for periode"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href={plannerDocumentHref(locale, plannerId, "print", {
                  audience: "student",
                  periodId: period.id,
                })}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-700 no-underline"
                title="Elevutskrift for periode"
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
              </Link>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMove(index, -1)}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-700 disabled:opacity-40"
                title="Flytt opp"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={index === periods.length - 1}
                onClick={() => onMove(index, 1)}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-700 disabled:opacity-40"
                title="Flytt ned"
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onDuplicate(index)}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-700"
                title="Dupliser periode"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => onRemove(index)} className="inline-flex h-8 items-center justify-center rounded-lg border border-rose-200 bg-white px-2 text-rose-700">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Tittel">
                <Input value={period.title} onChange={(event) => onUpdate(index, { title: event.target.value })} />
              </Field>
            <Field label="Uker">
              <Input value={period.weeks} onChange={(event) => onUpdate(index, { weeks: event.target.value })} />
            </Field>
            <Field label="Status">
              <Select
                value={period.status}
                onChange={(event) => onUpdate(index, { status: event.target.value as PlannerPeriodStatus })}
              >
                {PERIOD_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
            {concreteGoals.length > 0 ? (
              <GoalLinkSelector
                goals={concreteGoals}
                selectedIds={period.linkedGoalIds}
                onChange={(linkedGoalIds) => onUpdate(index, { linkedGoalIds })}
              />
            ) : null}
            <Field label="Mål">
              <Textarea value={period.goals} onChange={(event) => onUpdate(index, { goals: event.target.value })} rows={3} />
            </Field>
            <Field label="Innhold">
              <Textarea value={period.content} onChange={(event) => onUpdate(index, { content: event.target.value })} rows={3} />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Arbeidsmåter">
                <Textarea value={period.methods} onChange={(event) => onUpdate(index, { methods: event.target.value })} rows={3} />
              </Field>
              <Field label="Vurdering">
                <Textarea value={period.assessment} onChange={(event) => onUpdate(index, { assessment: event.target.value })} rows={3} />
              </Field>
            </div>
            <Field label="Refleksjon">
              <Textarea value={period.reflection} onChange={(event) => onUpdate(index, { reflection: event.target.value })} rows={2} />
            </Field>
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="m-0 text-base font-black text-slate-950">Ukeplaner</h3>
                  <p className="mt-1 text-sm text-slate-600">Bryt perioden ned i praktiske ukeplaner.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onAddWeekPlan(index)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Legg til uke
                  </button>
                  <button
                    type="button"
                    disabled={generatingWeekIndex !== null}
                    onClick={() => onGenerateWeeks(index)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                    title="Lager ukeplaner for denne perioden og erstatter ukeplanene som ligger her nå."
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    {generatingWeekIndex === index ? "Lager..." : "Lag nye ukeplaner"}
                  </button>
                </div>
              </div>
              <p className="m-0 text-sm font-semibold text-slate-500">
                Nye ukeplaner erstatter ukeplanene i denne perioden. Du kan angre AI-endringen før du lagrer.
              </p>
              {period.weekPlans.length === 0 ? (
                <div className="grid gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="m-0">
                    Ingen ukeplaner er lagt inn for denne perioden ennå. Lag et AI-forslag eller legg inn første uke selv.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={generatingWeekIndex !== null}
                      onClick={() => onGenerateWeeks(index)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      {generatingWeekIndex === index ? "Lager..." : "Lag ukeplaner"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddWeekPlan(index)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Legg til uke
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  {period.weekPlans.map((weekPlan, weekIndex) => (
                    <div key={weekPlan.id} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={weekIndex === 0}
                          onClick={() => onMoveWeekPlan(index, weekIndex, -1)}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-700 disabled:opacity-40"
                          title="Flytt opp"
                        >
                          <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={weekIndex === period.weekPlans.length - 1}
                          onClick={() => onMoveWeekPlan(index, weekIndex, 1)}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-700 disabled:opacity-40"
                          title="Flytt ned"
                        >
                          <ArrowDown className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateWeekPlan(index, weekIndex)}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-700"
                          title="Dupliser ukeplan"
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveWeekPlan(index, weekIndex)}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-rose-200 bg-white px-2 text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Uke">
                          <Input
                            value={weekPlan.week}
                            onChange={(event) => onUpdateWeekPlan(index, weekIndex, { week: event.target.value })}
                          />
                        </Field>
                        <Field label="Tittel">
                          <Input
                            value={weekPlan.title}
                            onChange={(event) => onUpdateWeekPlan(index, weekIndex, { title: event.target.value })}
                          />
                        </Field>
                      </div>
                      {concreteGoals.length > 0 ? (
                        <GoalLinkSelector
                          goals={concreteGoals}
                          selectedIds={weekPlan.linkedGoalIds}
                          onChange={(linkedGoalIds) => onUpdateWeekPlan(index, weekIndex, { linkedGoalIds })}
                          compact
                        />
                      ) : null}
                      <Field label="Mål">
                        <Textarea
                          value={weekPlan.goals}
                          onChange={(event) => onUpdateWeekPlan(index, weekIndex, { goals: event.target.value })}
                          rows={2}
                        />
                      </Field>
                      <Field label="Aktiviteter">
                        <Textarea
                          value={weekPlan.activities}
                          onChange={(event) => onUpdateWeekPlan(index, weekIndex, { activities: event.target.value })}
                          rows={2}
                        />
                      </Field>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Vurdering">
                          <Textarea
                            value={weekPlan.assessment}
                            onChange={(event) => onUpdateWeekPlan(index, weekIndex, { assessment: event.target.value })}
                            rows={2}
                          />
                        </Field>
                        <Field label="Notater">
                          <Textarea
                            value={weekPlan.notes}
                            onChange={(event) => onUpdateWeekPlan(index, weekIndex, { notes: event.target.value })}
                            rows={2}
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          ))}
        </>
      )}
    </div>
  );
}

function ActivityEditor({
  activities,
  generating,
  onGenerate,
  onAdd,
  onUpdate,
  onMove,
  onDuplicate,
  onRemove,
}: {
  activities: PlannerActivity[];
  generating: boolean;
  onGenerate: () => void;
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<PlannerActivity>) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-black text-slate-950">Aktiviteter</h2>
          <p className="mt-1 text-sm text-slate-600">Forslag til arbeidsmåter og aktiviteter som hører til planen.</p>
        </div>
        <Button type="button" variant="secondary" onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Legg til aktivitet
        </Button>
        <Button type="button" variant="primary" disabled={generating} onClick={onGenerate}>
          <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
          {generating ? "Lager forslag..." : "Lag nye aktivitetsforslag"}
        </Button>
      </div>
      <p className="m-0 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
        Nye aktivitetsforslag erstatter aktivitetslisten som ligger her nå. Du kan angre AI-endringen før du lagrer.
      </p>
      {activities.length === 0 ? (
        <div className="grid gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          <p className="m-0">
            Ingen aktiviteter er lagt inn ennå. Lag forslag til arbeidsmåter og vurdering, eller legg inn en aktivitet manuelt.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" disabled={generating} onClick={onGenerate}>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              {generating ? "Lager forslag..." : "Lag aktivitetsforslag"}
            </Button>
            <Button type="button" variant="secondary" onClick={onAdd}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Legg til aktivitet
            </Button>
          </div>
        </div>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3">
            {activities.map((activity, index) => (
              <a
                key={activity.id}
                href={`#planner-activity-${activity.id}`}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-800 no-underline hover:bg-white"
              >
                {index + 1}. {activity.title || "Uten tittel"}
              </a>
            ))}
          </nav>
          {activities.map((activity, index) => (
          <div
            key={activity.id}
            id={`planner-activity-${activity.id}`}
            className="scroll-mt-36 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMove(index, -1)}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-700 disabled:opacity-40"
                title="Flytt opp"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={index === activities.length - 1}
                onClick={() => onMove(index, 1)}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-700 disabled:opacity-40"
                title="Flytt ned"
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onDuplicate(index)}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-700"
                title="Dupliser aktivitet"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => onRemove(index)} className="inline-flex h-8 items-center justify-center rounded-lg border border-rose-200 bg-white px-2 text-rose-700">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Tittel">
                <Input value={activity.title} onChange={(event) => onUpdate(index, { title: event.target.value })} />
              </Field>
              <Field label="Periode">
                <Input value={activity.period} onChange={(event) => onUpdate(index, { period: event.target.value })} />
              </Field>
            </div>
            <Field label="Beskrivelse">
              <Textarea value={activity.description} onChange={(event) => onUpdate(index, { description: event.target.value })} rows={3} />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Metode">
                <Textarea value={activity.method} onChange={(event) => onUpdate(index, { method: event.target.value })} rows={3} />
              </Field>
              <Field label="Vurdering">
                <Textarea value={activity.assessment} onChange={(event) => onUpdate(index, { assessment: event.target.value })} rows={3} />
              </Field>
            </div>
          </div>
          ))}
        </>
      )}
    </div>
  );
}

function GoalLinkSelector({
  goals,
  selectedIds,
  onChange,
  compact = false,
}: {
  goals: PlannerConcreteLearningGoal[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  compact?: boolean;
}) {
  function toggleGoal(goalId: string) {
    onChange(selectedIds.includes(goalId) ? selectedIds.filter((id) => id !== goalId) : [...selectedIds, goalId]);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
        {compact ? "Koblede mål" : "Knytt til konkrete læringsmål"}
      </div>
      <div className="mt-2 grid gap-2">
        {goals.map((goal, index) => (
          <label
            key={goal.id}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm leading-5 text-slate-700 hover:bg-white"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(goal.id)}
              onChange={() => toggleGoal(goal.id)}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="font-black text-slate-950">Mål {index + 1}: </span>
              {goal.studentLanguage || goal.goal || "Uten måltekst"}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function ReflectionLogEditor({
  entries,
  yearEndSummary,
  nextYearNotes,
  summarizing,
  periods,
  onAdd,
  onUpdate,
  onRemove,
  onSummarize,
  onUpdateSummary,
}: {
  entries: PlannerReflectionEntry[];
  yearEndSummary: string;
  nextYearNotes: string;
  summarizing: boolean;
  periods: PlannerPeriod[];
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<PlannerReflectionEntry>) => void;
  onRemove: (index: number) => void;
  onSummarize: () => void;
  onUpdateSummary: (patch: Pick<Partial<PlannerDocument>, "yearEndSummary" | "nextYearNotes">) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-black text-slate-950">Refleksjon</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Loggfør hva som fungerte, hva som bør justeres, og hva du vil ta videre.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onAdd}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Legg til refleksjon
          </Button>
          <Button type="button" variant="primary" disabled={summarizing} onClick={onSummarize}>
            <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
            {summarizing ? "Oppsummerer..." : "Oppsummer med AI"}
          </Button>
        </div>
      </div>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <h3 className="m-0 text-base font-black text-slate-950">Årsoppsummering</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Brukes som profesjonelt notat ved evaluering eller når planen kopieres til neste skoleår.
          </p>
        </div>
        <Field label="Oppsummering av året">
          <Textarea
            value={yearEndSummary}
            onChange={(event) => onUpdateSummary({ yearEndSummary: event.target.value })}
            rows={4}
          />
        </Field>
        <Field label="Notater til neste skoleår">
          <Textarea
            value={nextYearNotes}
            onChange={(event) => onUpdateSummary({ nextYearNotes: event.target.value })}
            rows={4}
          />
        </Field>
      </section>

      {entries.length === 0 ? (
        <div className="grid gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          <p className="m-0">
            Ingen refleksjoner er lagt inn ennå. Legg inn korte notater underveis, så kan Planner senere oppsummere året.
          </p>
          <div>
            <Button type="button" variant="secondary" onClick={onAdd}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Legg til refleksjon
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {entries.map((entry, index) => (
            <div key={entry.id} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-rose-200 bg-white px-2 text-rose-700"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr]">
                <Field label="Dato">
                  <Input
                    type="date"
                    value={entry.date}
                    onChange={(event) => onUpdate(index, { date: event.target.value })}
                  />
                </Field>
                <Field label="Tittel">
                  <Input value={entry.title} onChange={(event) => onUpdate(index, { title: event.target.value })} />
                </Field>
                <Field label="Periode">
                  <Select value={entry.period} onChange={(event) => onUpdate(index, { period: event.target.value })}>
                    <option value="">Ingen periode</option>
                    {periods.map((period) => (
                      <option key={period.id} value={period.title}>
                        {period.title || "Uten tittel"}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Hva fungerte?">
                  <Textarea
                    value={entry.whatWorked}
                    onChange={(event) => onUpdate(index, { whatWorked: event.target.value })}
                    rows={4}
                  />
                </Field>
                <Field label="Hva bør justeres?">
                  <Textarea
                    value={entry.whatToAdjust}
                    onChange={(event) => onUpdate(index, { whatToAdjust: event.target.value })}
                    rows={4}
                  />
                </Field>
                <Field label="Neste steg">
                  <Textarea
                    value={entry.nextStep}
                    onChange={(event) => onUpdate(index, { nextStep: event.target.value })}
                    rows={4}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsEditor({
  planner,
  updateFrame,
  updateCurriculum,
  updateStatus,
}: {
  planner: Planner;
  updateFrame: <K extends keyof PlannerFrame>(key: K, value: PlannerFrame[K]) => void;
  updateCurriculum: <K extends keyof CurriculumSource>(key: K, value: CurriculumSource[K]) => void;
  updateStatus: (status: PlannerStatus) => void;
}) {
  return (
    <div className="grid gap-4">
      <h2 className="m-0 text-xl font-black text-slate-950">Innstillinger</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Status">
          <Select value={planner.status} onChange={(event) => updateStatus(event.target.value as PlannerStatus)}>
            <option value="draft">Draft</option>
            <option value="active">Aktiv</option>
            <option value="archived">Arkivert</option>
          </Select>
        </Field>
        <Field label="Plantype">
          <Select value={planner.frame.planType} onChange={(event) => updateFrame("planType", event.target.value as PlannerType)}>
            <option value="annual">Årsplan</option>
            <option value="individual">Individuell plan</option>
          </Select>
        </Field>
        <Field label="Land">
          <Select value={planner.frame.country} onChange={(event) => updateFrame("country", event.target.value)}>
            {COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Skoleslag">
          <Select value={planner.frame.schoolType} onChange={(event) => updateFrame("schoolType", event.target.value)}>
            {SCHOOL_TYPES.map((schoolType) => (
              <option key={schoolType} value={schoolType}>
                {schoolType}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Skoleår">
          <Input value={planner.frame.schoolYear} onChange={(event) => updateFrame("schoolYear", event.target.value)} />
        </Field>
        <Field label="Fag">
          <Input value={planner.frame.subject} onChange={(event) => updateFrame("subject", event.target.value)} />
        </Field>
        <Field label="Nivå">
          <Input value={planner.frame.level} onChange={(event) => updateFrame("level", event.target.value)} />
        </Field>
        <Field label="Språk">
          <Input value={planner.frame.language} onChange={(event) => updateFrame("language", event.target.value)} />
        </Field>
        <Field label="Undervisningsuker">
          <Input type="number" value={planner.frame.teachingWeeks} onChange={(event) => updateFrame("teachingWeeks", Number(event.target.value))} />
        </Field>
        <Field label="Timer">
          <Input type="number" value={planner.frame.totalHours} onChange={(event) => updateFrame("totalHours", Number(event.target.value))} />
        </Field>
        <Field label="AI-nivå">
          <Select value={planner.frame.aiLevel} onChange={(event) => updateFrame("aiLevel", event.target.value as PlannerAiLevel)}>
            {AI_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Tema eller fokusområde">
        <Textarea value={planner.frame.focusArea} onChange={(event) => updateFrame("focusArea", event.target.value)} rows={3} />
      </Field>
      <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="m-0 text-base font-black text-slate-950">Faglig grunnlag</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Kilde">
            <Select
              value={planner.curriculum.type}
              onChange={(event) => updateCurriculum("type", event.target.value as CurriculumSourceType)}
            >
              {CURRICULUM_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rammeverk">
            <Input
              value={planner.curriculum.framework}
              onChange={(event) => updateCurriculum("framework", event.target.value)}
            />
          </Field>
        </div>
        {planner.curriculum.type === "custom" ? (
          <Field label="Egen læreplantekst">
            <Textarea
              value={planner.curriculum.customText}
              onChange={(event) => updateCurriculum("customText", event.target.value)}
              rows={5}
            />
          </Field>
        ) : null}
        {planner.curriculum.type === "upload" ? (
          <Field label="Dokumentnavn">
            <Input
              value={planner.curriculum.uploadName}
              onChange={(event) => updateCurriculum("uploadName", event.target.value)}
            />
          </Field>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 font-bold text-slate-950">{value || "-"}</div>
    </div>
  );
}

function formatPeriodStatus(status: PlannerPeriodStatus): string {
  if (status === "active") return "Pågår";
  if (status === "completed") return "Fullført";
  return "Planlagt";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}
