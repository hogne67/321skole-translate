// app\[locale]\(app)\producer\texts\new\page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";
import { LANGUAGES } from "@/lib/languages";
import type { CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getFeatureStatusFromProfile,
  type FeatureStatus,
} from "@/lib/featureGuard";
import type { BillingSnapshot, PlanKey } from "@/lib/featureAccess";
import { useUserProfile } from "@/lib/useUserProfile";
import { trackCreateLesson } from "@/lib/analytics";
import { trackEvent } from "@/lib/trackEvent";

type MCQ = {
  q: string;
  options: [string, string, string, string];
  answerIndex: 0 | 1 | 2 | 3;
};
type TF = { statement: string; answer: boolean };

type ContentPack = {
  title: string;
  level: string;
  language: string;
  topic: string;
  text: string;
  tasks: {
    multipleChoice: MCQ[];
    trueFalse: TF[];
    writeFacts: string[];
    reflectionQuestions: string[];
  };
};

type TaskType = "truefalse" | "mcq" | "open";
type LessonTask = {
  id: string;
  order?: number;
  type: TaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: unknown;
};

type GenerateTextResp = {
  title?: string;
  text?: string;
  error?: string;
  raw?: string;
};
type GenerateTasksResp = {
  ok?: boolean;
  tasks?: ContentPack["tasks"];
  error?: string;
  raw?: string;
  quota?: {
    feature?: string;
    bucket?: string;
    limit?: number;
    used?: number;
    remaining?: number;
  };
};

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(2, 6);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

const TEXT_TYPE_KEYS = [
  "everydayStory",
  "factual",
  "fiction",
  "article",
  "dialogue",
  "news",
  "biography",
  "letterEmail",
  "opinion",
  "howto",
  "other",
] as const;
type TextTypeKey = (typeof TEXT_TYPE_KEYS)[number];

type LevelKey = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

const LEVEL_DEFAULTS: Record<
  LevelKey,
  { textLength: number; trueFalse: number; mcq: number; facts: number; reflection: number }
> = {
  A1: { textLength: 80, trueFalse: 3, mcq: 3, facts: 2, reflection: 1 },
  A2: { textLength: 140, trueFalse: 6, mcq: 4, facts: 3, reflection: 1 },
  B1: { textLength: 200, trueFalse: 8, mcq: 6, facts: 3, reflection: 2 },
  B2: { textLength: 260, trueFalse: 10, mcq: 6, facts: 6, reflection: 2 },
  C1: { textLength: 300, trueFalse: 10, mcq: 8, facts: 6, reflection: 3 },
  C2: { textLength: 300, trueFalse: 10, mcq: 8, facts: 6, reflection: 3 },
};

function safePlan(plan: unknown): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function resolveRoleFromProfile(profile: unknown): string {
  if (!profile || typeof profile !== "object") return "anonymous";

  const p = profile as Record<string, unknown>;

  if (p.role === "teacher" || p.role === "student" || p.role === "parent") {
    return p.role;
  }

  if (p.mode === "teacher" || p.mode === "student" || p.mode === "parent") {
    return p.mode;
  }

  if (p.org && typeof p.org === "object") {
    const orgRole = (p.org as Record<string, unknown>).role;
    if (orgRole === "teacher" || orgRole === "student" || orgRole === "parent") {
      return orgRole;
    }
  }

  if (p.roles && typeof p.roles === "object") {
    const roles = p.roles as Record<string, unknown>;
    if (roles.teacher === true) return "teacher";
    if (roles.parent === true) return "parent";
    if (roles.student === true) return "student";
  }

  return "anonymous";
}

function getBillingSnapshot(profile: unknown): BillingSnapshot | null {
  if (!profile || typeof profile !== "object") return null;

  const p = profile as Record<string, unknown>;
  const billing = p.billing;

  if (!billing || typeof billing !== "object") return null;

  const b = billing as Record<string, unknown>;

  return {
    plan: typeof b.plan === "string" ? b.plan : null,
    status: typeof b.status === "string" ? b.status : null,
  };
}

export default function NewTextPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("generateNewText");
  const { profile } = useUserProfile();

  useEffect(() => {
    trackEvent("lesson_generator_open", {
      source: "text",
    });
  }, []);

  const fieldStyle: CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    padding: 10,
    marginTop: 6,
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    background: "#ffffffef",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
    outline: "none",
    fontSize: 14,
  };

  const fieldStyleCompact: CSSProperties = {
    ...fieldStyle,
    padding: 8,
  };

  const cardStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: 20,
    background: "#e6eef0f1",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.10)",
    padding: 18,
  };

  const mutedCardStyle: CSSProperties = {
    ...cardStyle,
    opacity: 0.68,
    background: "#e3e4d8f3",
  };

  const sectionTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  };

  const buttonPrimary: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #0f172a",
    background: "#214db4",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

  const buttonSuccess: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #14532d",
    background: "#15803d",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

  const buttonSecondary: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
  };

  const buttonSmall: CSSProperties = {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
  };

  const stepBadgeStyle = (active: boolean, done: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28,
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 800,
    border: "1px solid #cbd5e1",
    background: done ? "#deede3" : active ? "#dbeafe" : "#f8fafc",
    color: "#0f172a",
  });

  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [level, setLevel] = useState<LevelKey>("A2");
  const [language, setLanguage] = useState("nb");
  const [languageSearch, setLanguageSearch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [textTypePreset, setTextTypePreset] = useState<TextTypeKey>("everydayStory");
  const [textTypeOther, setTextTypeOther] = useState("");
  const textTypeLabel = useMemo(() => {
    if (textTypePreset === "other") {
      return (textTypeOther || t("textTypes.other")).trim() || t("textTypes.other");
    }
    return t(`textTypes.${textTypePreset}`);
  }, [textTypePreset, textTypeOther, t]);

  const [textLength, setTextLength] = useState<number>(LEVEL_DEFAULTS.A2.textLength);
  const [mcqCount, setMcqCount] = useState<number>(LEVEL_DEFAULTS.A2.mcq);
  const [trueFalseCount, setTrueFalseCount] = useState<number>(LEVEL_DEFAULTS.A2.trueFalse);
  const [factsCount, setFactsCount] = useState<number>(LEVEL_DEFAULTS.A2.facts);
  const [reflectionCount, setReflectionCount] = useState<number>(LEVEL_DEFAULTS.A2.reflection);

  const [title, setTitle] = useState<string>("");
  const [sourceText, setSourceText] = useState<string>("");
  const [lessonTasks, setLessonTasks] = useState<LessonTask[]>([]);
  const [pack, setPack] = useState<ContentPack | null>(null);

  const [loadingText, setLoadingText] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [tasksDirty, setTasksDirty] = useState(false);
  const [taskUsageMessage, setTaskUsageMessage] = useState<string | null>(null);

  const [featureStatus, setFeatureStatus] = useState<FeatureStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const busy = loadingText || loadingTasks || saving;

  const profileUid =
    profile && typeof profile === "object" && "uid" in profile
      ? (profile as { uid?: string }).uid
      : undefined;

  const planValue =
    profile && typeof profile === "object" && "plan" in profile
      ? (profile as { plan?: string }).plan
      : undefined;

  const role = useMemo(() => resolveRoleFromProfile(profile), [profile]);
  const plan = useMemo(() => safePlan(planValue), [planValue]);
  const billing = useMemo(() => getBillingSnapshot(profile), [profile]);
  const partnerAccess = profile?.partnerAccess === true;
  const partnerStatus = profile?.partnerStatus ?? null;
  const schoolId = profile?.schoolId ?? null;
  const schoolRole = profile?.schoolRole ?? null;
  const schoolStatus = profile?.schoolStatus ?? null;

  const sourceWordCount = useMemo(() => {
    return sourceText
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }, [sourceText]);

  useEffect(() => {
    const d = LEVEL_DEFAULTS[level];
    setTextLength(d.textLength);
    setTrueFalseCount(d.trueFalse);
    setMcqCount(d.mcq);
    setFactsCount(Math.max(0, Math.min(10, d.facts)));
    setReflectionCount(d.reflection);
  }, [level]);

  const filteredLanguages = useMemo(() => {
    const q = languageSearch.trim().toLowerCase();
    if (!q) return LANGUAGES;

    return LANGUAGES.filter((l) => {
      const hay = `${l.label} ${l.code}`.toLowerCase();
      return hay.includes(q);
    });
  }, [languageSearch]);

  async function refreshFeatureStatus(currentUid?: string) {
    const uid = currentUid ?? getAuth().currentUser?.uid ?? profileUid;
    if (!uid) {
      setFeatureStatus(null);
      setStatusLoading(false);
      return;
    }

    try {
      const status = await getFeatureStatusFromProfile({
        uid,
        role,
        plan,
        billing,
        partnerAccess,
        partnerStatus,
        schoolId,
        schoolRole,
        schoolStatus,
        feature: "producer_create_lesson",
      });
      setFeatureStatus(status);
    } catch {
      setFeatureStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      const uid = getAuth().currentUser?.uid ?? profileUid;

      if (!uid) {
        if (active) {
          setFeatureStatus(null);
          setStatusLoading(false);
        }
        return;
      }

      setStatusLoading(true);

      try {
        const status = await getFeatureStatusFromProfile({
          uid,
          role,
          plan,
          billing,
          partnerAccess,
          partnerStatus,
          schoolId,
          schoolRole,
          schoolStatus,
          feature: "producer_create_lesson",
        });

        if (active) {
          setFeatureStatus(status);
        }
      } catch {
        if (active) {
          setFeatureStatus(null);
        }
      } finally {
        if (active) {
          setStatusLoading(false);
        }
      }
    }

    void loadStatus();

    return () => {
      active = false;
    };
  }, [
    profileUid,
    role,
    plan,
    billing,
    partnerAccess,
    partnerStatus,
    schoolId,
    schoolRole,
    schoolStatus,
  ]);

  function buildFactsPrompt(count: number) {
    if (count <= 0) return "";
    return t("tasks.factsPrompt", { count });
  }

  function packToLessonTasks(p: ContentPack): LessonTask[] {
    const tasks: LessonTask[] = [];
    let order = 1;

    for (const ttf of p.tasks?.trueFalse ?? []) {
      tasks.push({
        id: newId(),
        order: order++,
        type: "truefalse",
        prompt: ttf.statement,
        correctAnswer: ttf.answer ? "true" : "false",
      });
    }

    for (const q of p.tasks?.multipleChoice ?? []) {
      const opts = (q.options ?? []).map((x) => String(x));
      const correct = opts[q.answerIndex] ?? opts[0] ?? "";
      tasks.push({
        id: newId(),
        order: order++,
        type: "mcq",
        prompt: q.q,
        options: opts,
        correctAnswer: correct,
      });
    }
    const factsN = Math.max(0, Math.min(10, factsCount));
    if (factsN > 0) {
      tasks.push({
        id: newId(),
        order: order++,
        type: "open",
        prompt: buildFactsPrompt(factsN),
      });
    }

    for (const rq of p.tasks?.reflectionQuestions ?? []) {
      tasks.push({
        id: newId(),
        order: order++,
        type: "open",
        prompt: rq,
      });
    }

    return tasks;
  }

  function renumberOrders(tasks: LessonTask[]) {
    return tasks.map((ttt, idx) => ({ ...ttt, order: idx + 1 }));
  }

  function addTask(type: TaskType) {
    setLessonTasks((prev) => {
      const next: LessonTask[] = [
        ...prev,
        type === "mcq"
          ? {
            id: newId(),
            type: "mcq",
            prompt: t("tasks.defaults.mcqPrompt"),
            options: [
              t("tasks.defaults.option1"),
              t("tasks.defaults.option2"),
              t("tasks.defaults.option3"),
              t("tasks.defaults.option4"),
            ],
            correctAnswer: t("tasks.defaults.option1"),
          }
          : type === "truefalse"
            ? {
              id: newId(),
              type: "truefalse",
              prompt: t("tasks.defaults.tfPrompt"),
              correctAnswer: "true",
            }
            : { id: newId(), type: "open", prompt: t("tasks.defaults.openPrompt") },
      ];
      return renumberOrders(next);
    });
  }

  function deleteTask(index: number) {
    setLessonTasks((prev) => renumberOrders(prev.filter((_, i) => i !== index)));
  }

  function moveTask(index: number, dir: -1 | 1) {
    setLessonTasks((prev) => {
      const to = index + dir;
      if (to < 0 || to >= prev.length) return prev;
      const copy = [...prev];
      const tmp = copy[index];
      copy[index] = copy[to];
      copy[to] = tmp;
      return renumberOrders(copy);
    });
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function localizeError(message: string): string {
    const m = message || "";
    if (m === "Generate or write text first.") return t("errors.generateOrWriteTextFirst");
    if (m === "Missing text in response.") return t("errors.missingTextInResponse");
    if (m === "Title is required.") return t("errors.titleRequired");
    if (m === "Source text is empty.") return t("errors.sourceTextEmpty");
    if (m === "Not signed in. Please log in as teacher/producer.") return t("errors.notSignedIn");
    if (m === "Not signed in.") return t("errors.notSignedIn");
    if (m.startsWith("Empty response from server.")) return t("errors.emptyResponseFromServer");
    if (m.startsWith("Not JSON.")) return t("errors.notJsonFromServer");
    if (m === "Missing id from server.") return t("errors.missingIdFromServer");
    if (m.startsWith("Limit reached:")) return m;
    return m;
  }

  async function generateTextOnly() {
    setLoadingText(true);
    setError(null);
    setSavedId(null);

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in.");

      const token = await user.getIdToken();

      const res = await fetch("/api/producer/generate-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          level,
          language,
          topic: prompt.trim(),
          textType: textTypeLabel,
          textLength,
        }),
      });

      const raw = await res.text();
      if (!raw) throw new Error(`Empty response from server. HTTP ${res.status}`);

      let data: GenerateTextResp & {
        quota?: {
          feature?: string;
          limit?: number;
          used?: number;
          remaining?: number;
        };
      };

      try {
        data = JSON.parse(raw) as GenerateTextResp & {
          quota?: {
            feature?: string;
            limit?: number;
            used?: number;
            remaining?: number;
          };
        };
      } catch {
        throw new Error(`Not JSON. HTTP ${res.status}. First chars: ${raw.slice(0, 200)}`);
      }

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      trackEvent("ai_generate_text", {
        source: "text",
        level,
        language,
        textType: textTypeLabel,
      });

      const nextTitle = String(data.title || "").trim();
      const nextText = String(data.text || "").trim();
      if (!nextText) throw new Error("Missing text in response.");

      setTitle(nextTitle);
      setSourceText(nextText);
      setLessonTasks([]);
      setPack(null);
      setTasksDirty(false);

      await refreshFeatureStatus(user.uid);
    } catch (e: unknown) {
      setError(localizeError(getErrorMessage(e)));
    } finally {
      setLoadingText(false);
    }
  }

  async function generateTasksOnly() {
    setLoadingTasks(true);
    setError(null);
    setSavedId(null);
    setTaskUsageMessage(null);

    try {
      if (!sourceText.trim()) throw new Error("Generate or write text first.");

      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in.");

      const token = await user.getIdToken();

      const res = await fetch("/api/producer/generate-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          level,
          language,
          topic: prompt.trim(),
          textType: textTypeLabel,
          text: sourceText,
          tasks: {
            mcq: mcqCount,
            trueFalse: trueFalseCount,
            facts: factsCount,
            reflection: reflectionCount,
          },
        }),
      });

      const raw = await res.text();
      if (!raw) throw new Error(`Empty response from server. HTTP ${res.status}`);

      let data: GenerateTasksResp;
      try {
        data = JSON.parse(raw) as GenerateTasksResp;
      } catch {
        throw new Error(`Not JSON. HTTP ${res.status}. First chars: ${raw.slice(0, 200)}`);
      }

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (!data?.tasks) throw new Error(t("errors.missingTasksInResponse"));

      const fakePack: ContentPack = {
        title: title || t("defaults.title"),
        level,
        language,
        topic: prompt,
        text: sourceText,
        tasks: data.tasks,
      };

      setLessonTasks(packToLessonTasks(fakePack));
      setPack(fakePack);
      setTasksDirty(false);

      if (data.quota) {
        setFeatureStatus((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            used: typeof data.quota?.used === "number" ? data.quota.used : prev.used,
            limit: typeof data.quota?.limit === "number" ? data.quota.limit : prev.limit,
            remaining:
              typeof data.quota?.remaining === "number" ? data.quota.remaining : prev.remaining,
          };
        });

        if (
          typeof data.quota.used === "number" &&
          typeof data.quota.limit === "number"
        ) {
          setTaskUsageMessage(
            t("status.tasksGeneratedQuotaUsed", {
              used: data.quota.used,
              limit: data.quota.limit,
            })
          );
        } else {
          setTaskUsageMessage(t("status.tasksGeneratedUsageUpdated"));
        }
      } else {
        setTaskUsageMessage(t("status.tasksGeneratedUsageUpdated"));
      }
    } catch (e: unknown) {
      setError(localizeError(getErrorMessage(e)));
    } finally {
      setLoadingTasks(false);
    }
  }

  async function saveLesson(): Promise<string> {
    if (!sourceText.trim()) throw new Error("Source text is empty.");

    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in. Please log in as teacher/producer.");

    if (featureStatus && !featureStatus.allowed) {
      throw new Error(
        featureStatus.reason === "limit_reached"
          ? t("status.quotaExceeded", {
            used: featureStatus.used,
            limit: featureStatus.limit,
          })
          : t("status.featureUnavailable")
      );
    }

    const token = await user.getIdToken();

    const res = await fetch("/api/producer/create-lesson", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: title.trim() || t("defaults.title"),
        level,
        language,
        prompt: prompt.trim(),
        topic: prompt.trim(),
        textType: textTypeLabel,
        sourceText: sourceText || "",
        tasks: renumberOrders(lessonTasks),
      }),
    });
    if (!res.ok) {
      throw new Error("Could not create lesson");
    }

    trackCreateLesson("text");
    trackEvent("lesson_created", {
      source: "text",
      level,
      language,
      textType: textTypeLabel,
    });

    const raw = await res.text();

    let data: unknown = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      // ignore invalid JSON
    }

    const anyData: Record<string, unknown> = isRecord(data) ? data : {};

    if (!res.ok) {
      const msg = typeof anyData["error"] === "string" ? anyData["error"] : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const id = typeof anyData["id"] === "string" ? anyData["id"].trim() : "";
    if (!id) throw new Error("Missing id from server.");

    setSavedId(id);
    await refreshFeatureStatus(user.uid);

    return id;
  }

  async function saveDraftOnly() {
    setSaving(true);
    setError(null);
    setSavedId(null);

    try {
      const id = await saveLesson();
      router.push(`/${locale}/producer/${id}`);
    } catch (e: unknown) {
      setError(localizeError(getErrorMessage(e)));
    } finally {
      setSaving(false);
    }
  }

  async function goToFinishing() {
    setSaving(true);
    setError(null);
    setSavedId(null);

    try {
      const id = await saveLesson();
      router.push(`/${locale}/producer/${id}`);
    } catch (e: unknown) {
      setError(localizeError(getErrorMessage(e)));
    } finally {
      setSaving(false);
    }
  }

  const quotaBlocked = featureStatus ? !featureStatus.allowed : false;
  const quotaBadgeText = featureStatus
    ? t("status.quotaUsed", { used: featureStatus.used, limit: featureStatus.limit })
    : null;

  const hasText = sourceText.trim().length > 0;
  const hasTasks = lessonTasks.length > 0;
  const step1Done = hasText;
  const step2Active = hasText;
  const step2Done = hasTasks;
  const step3Active = hasText && hasTasks;

  const stepStatus = !hasText
    ? {
      title: t("stepStatus.step1Title"),
      body: t("stepStatus.step1Body"),
      tone: "#eff6ff",
      border: "#bfdbfe",
    }
    : !hasTasks
      ? {
        title: t("stepStatus.textReadyTitle"),
        body: t("stepStatus.textReadyBody"),
        tone: "#fffbeb",
        border: "#fde68a",
      }
      : {
        title: t("stepStatus.tasksReadyTitle"),
        body: t("stepStatus.tasksReadyBody"),
        tone: "#ecfdf5",
        border: "#86efac",
      };

  return (
    <main
      className="pageWrap"
      style={{
        width: "100%",
        maxWidth: 1180,
        margin: "0 auto",
        padding: "8px 12px 60px",
        boxSizing: "border-box",
      }}
    >
      <div className="pageCard" style={{ ...cardStyle, padding: 20 }}>
        <h1 style={{ marginTop: 0, marginBottom: 6, fontSize: 26, fontWeight: 800 }}>
          {t("title")}
        </h1>
        <p style={{ marginTop: 0, marginBottom: 10, opacity: 0.8 }}>{t("subtitle")}</p>

        <section
          style={{
            ...cardStyle,
            marginBottom: 16,
            background: "#eaedf1f3",
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr" : "repeat(3, 1fr)",
              gap: 10,
            }}
          >
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: 12,
                background: "#eaeddbf2",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                <span style={stepBadgeStyle(!step1Done, step1Done)}>1</span>
                <strong>{t("steps.text")}</strong>
              </div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {step1Done ? t("steps.ready") : t("steps.generateOrPasteText")}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: 12,
                background: "#eee4e4f4",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                <span style={stepBadgeStyle(step2Active && !step2Done, step2Done)}>2</span>
                <strong>{t("steps.tasks")}</strong>
              </div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {step2Done
                  ? t("steps.ready")
                  : step2Active
                    ? t("steps.nextStep")
                    : t("steps.lockedUntilTextReady")}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: 12,
                background: "#e5e6eff5",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                <span style={stepBadgeStyle(step3Active, false)}>3</span>
                <strong>{t("steps.finishing")}</strong>
              </div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {step3Active ? t("steps.readyForFinalSetup") : t("steps.lockedUntilTasksReady")}
              </div>
            </div>
          </div>

          <div
            style={{
              border: `1px solid ${stepStatus.border}`,
              background: stepStatus.tone,
              borderRadius: 16,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{stepStatus.title}</div>
            <div style={{ fontSize: 14, opacity: 0.9 }}>{stepStatus.body}</div>
          </div>
        </section>

        <section style={{ marginTop: 14 }}>
          <div style={{ ...cardStyle }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
              <span style={stepBadgeStyle(!step1Done, step1Done)}>1</span>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                  {t("sections.generateOrPasteTextTitle")}
                </h2>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  {t("sections.generateOrPasteTextBody")}
                </div>
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: 14,
                background: "#e2e8eef8",
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>
                {t("fields.sharedSettingsTitle")}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isNarrow ? "1fr" : "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <label>
                  {t("fields.level")}
                  <select value={level} onChange={(e) => setLevel(e.target.value as LevelKey)} style={fieldStyle}>
                    <option value="A1">A1</option>
                    <option value="A2">A2</option>
                    <option value="B1">B1</option>
                    <option value="B2">B2</option>
                    <option value="C1">C1</option>
                    <option value="C2">C2</option>
                  </select>
                </label>

                <label>
                  {t("fields.language")}
                  <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
                    <input
                      value={languageSearch}
                      onChange={(e) => setLanguageSearch(e.target.value)}
                      placeholder={t("fields.languageSearchPlaceholder")}
                      style={fieldStyleCompact}
                    />
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} style={fieldStyle}>
                      {filteredLanguages.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label} ({l.code})
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {t("fields.languageCount", { count: filteredLanguages.length })}
                    </div>
                  </div>
                </label>

                <label>
                  {t("fields.textType")}
                  <select
                    value={textTypePreset}
                    onChange={(e) => setTextTypePreset(e.target.value as TextTypeKey)}
                    style={fieldStyle}
                  >
                    {TEXT_TYPE_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {t(`textTypes.${k}`)}
                      </option>
                    ))}
                  </select>

                  {textTypePreset === "other" && (
                    <input
                      value={textTypeOther}
                      onChange={(e) => setTextTypeOther(e.target.value)}
                      placeholder={t("fields.textTypeOtherPlaceholder")}
                      style={{ ...fieldStyle, marginTop: 8 }}
                    />
                  )}
                </label>

                <label>
                  {t("fields.textLength")}
                  <input
                    type="number"
                    value={textLength}
                    onChange={(e) => setTextLength(Number(e.target.value))}
                    style={fieldStyle}
                    min={60}
                    max={900}
                  />
                </label>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
                gap: 14,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  border: "1px solid #dbeafe",
                  borderRadius: 16,
                  padding: 14,
                  background: "#f8fbff",
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 16, fontWeight: 800 }}>
                  {t("buttons.generateText")}
                </h3>

                <label>
                  {t("fields.prompt")}
                  <textarea
                    value={prompt}
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      autoGrow(e.currentTarget);
                    }}
                    onInput={(e) => autoGrow(e.currentTarget as HTMLTextAreaElement)}
                    rows={5}
                    placeholder={t("defaults.prompt")}
                    style={{
                      ...fieldStyle,
                      resize: "vertical",
                      minHeight: 110,
                      lineHeight: 1.35,
                      fontFamily: "inherit",
                    }}
                  />
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                    {t("fields.promptTip")}
                  </div>
                </label>

                <div style={{ marginTop: 12 }}>
                  <button
                    className="actionBtn"
                    onClick={generateTextOnly}
                    disabled={busy}
                    style={{
                      ...buttonPrimary,
                      width: isNarrow ? "100%" : "auto",
                      opacity: busy ? 0.7 : 1,
                      cursor: busy ? "not-allowed" : "pointer",
                    }}
                  >
                    {loadingText ? t("buttons.generatingText") : t("buttons.generateText")}
                  </button>
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 16,
                  padding: 14,
                  background: "#fff",
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 16, fontWeight: 800 }}>
                  {t("builder.text")}
                </h3>

                <label style={{ display: "block" }}>
                  {t("builder.lessonTitle")}
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("defaults.title")}
                    style={fieldStyle}
                  />
                </label>

                <label style={{ display: "block", marginTop: 10 }}>
                  {t("builder.textbox")}
                  <textarea
                    value={sourceText}
                    onChange={(e) => {
                      setSourceText(e.target.value);
                      if (lessonTasks.length > 0) setTasksDirty(true);
                    }}
                    rows={14}
                    style={{ ...fieldStyle, resize: "vertical" }}
                  />
                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      fontSize: 12,
                      opacity: 0.75,
                    }}
                  >
                    <span>{t("builder.textHelp")}</span>
                    <span>{t("builder.wordCount", { count: sourceWordCount })}</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 16 }}>
          <div style={{ ...(hasText ? cardStyle : mutedCardStyle) }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <span style={stepBadgeStyle(step2Active && !step2Done, step2Done)}>2</span>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                  {t("sections.generateTasksTitle")}
                </h2>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  {t("sections.generateTasksBody")}
                </div>
              </div>
            </div>

            {!hasText && (
              <div
                style={{
                  border: "1px dashed #cbd5e1",
                  borderRadius: 14,
                  padding: 14,
                  background: "#fff",
                  fontSize: 14,
                  opacity: 0.8,
                }}
              >
                {t("sections.enableTaskGeneratorFirst")}
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isNarrow ? "1fr 1fr" : "repeat(4, 1fr)",
                gap: 10,
                marginTop: hasText ? 10 : 14,
              }}
            >
              <label>
                {t("tasks.mcq")}
                <input
                  type="number"
                  value={mcqCount}
                  onChange={(e) => setMcqCount(Number(e.target.value))}
                  style={fieldStyle}
                  min={0}
                  max={20}
                  disabled={!hasText}
                />
              </label>
              <label>
                {t("tasks.trueFalse")}
                <input
                  type="number"
                  value={trueFalseCount}
                  onChange={(e) => setTrueFalseCount(Number(e.target.value))}
                  style={fieldStyle}
                  min={0}
                  max={30}
                  disabled={!hasText}
                />
              </label>
              <label>
                {t("tasks.facts")}
                <input
                  type="number"
                  value={factsCount}
                  onChange={(e) => setFactsCount(Math.max(0, Math.min(10, Number(e.target.value))))}
                  style={fieldStyle}
                  min={0}
                  max={10}
                  disabled={!hasText}
                />
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                  {t("tasks.factsSingleBoxHelp")}
                </div>
              </label>
              <label>
                {t("tasks.reflection")}
                <input
                  type="number"
                  value={reflectionCount}
                  onChange={(e) => setReflectionCount(Number(e.target.value))}
                  style={fieldStyle}
                  min={0}
                  max={20}
                  disabled={!hasText}
                />
              </label>
            </div>

            {hasText && (
              <div
                className="actionRow"
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginTop: 14,
                }}
              >
                <button
                  className="actionBtn"
                  onClick={generateTasksOnly}
                  disabled={busy || !sourceText.trim()}
                  style={{
                    ...buttonPrimary,
                    opacity: busy || !sourceText.trim() ? 0.55 : 1,
                    cursor: busy || !sourceText.trim() ? "not-allowed" : "pointer",
                  }}
                  title={!sourceText.trim() ? t("hints.generateTextFirst") : t("hints.generateTasks")}
                >
                  {loadingTasks ? t("buttons.generatingTasks") : t("buttons.generateTasks")}
                </button>

                {tasksDirty && sourceText.trim() && (
                  <span style={{ color: "#b45309", fontWeight: 700 }}>
                    {t("warnings.checkTextBeforeTasks")}
                  </span>
                )}

                {taskUsageMessage && (
                  <span style={{ color: "#15803d", fontWeight: 700 }}>
                    {taskUsageMessage}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {(hasTasks || hasText) && (
          <section style={{ marginTop: 22 }}>
            <div style={{ ...(hasTasks ? cardStyle : mutedCardStyle) }}>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={stepBadgeStyle(step3Active, false)}>3</span>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                      {t("sections.goToFinishingTitle")}
                    </h2>
                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                      {t("sections.goToFinishingBody")}
                    </div>
                  </div>
                </div>

                {hasTasks && (
                  <button
                    className="actionBtn"
                    onClick={goToFinishing}
                    disabled={busy || statusLoading || quotaBlocked}
                    style={{
                      ...buttonSuccess,
                      opacity: busy || statusLoading || quotaBlocked ? 0.55 : 1,
                      cursor: busy || statusLoading || quotaBlocked ? "not-allowed" : "pointer",
                    }}
                    title={
                      quotaBlocked && featureStatus
                        ? t("status.quotaUsed", {
                          used: featureStatus.used,
                          limit: featureStatus.limit,
                        })
                        : t("buttons.saveAndGoToFinishing")
                    }
                  >
                    {saving ? t("buttons.saving") : t("buttons.goToFinishing")}
                  </button>
                )}
              </div>

              {!hasTasks && (
                <div
                  style={{
                    border: "1px dashed #cbd5e1",
                    borderRadius: 14,
                    padding: 14,
                    background: "#fff",
                    fontSize: 14,
                    opacity: 0.8,
                  }}
                >
                  {t("sections.readyToFinishBody")}
                </div>
              )}
            </div>
          </section>
        )}

        {hasTasks && (
          <section style={{ marginTop: 22 }}>
            <h2 style={sectionTitleStyle}>{t("editor.title")}</h2>

            <div style={{ marginTop: 12, ...cardStyle }}>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                }}
              >
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                  {t("editor.editBeforeFinishing")}
                </h3>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => addTask("mcq")} style={buttonSmall}>
                    {t("editor.addMcq")}
                  </button>
                  <button onClick={() => addTask("truefalse")} style={buttonSmall}>
                    {t("editor.addTf")}
                  </button>
                  <button onClick={() => addTask("open")} style={buttonSmall}>
                    {t("editor.addOpen")}
                  </button>
                </div>
              </div>

              {lessonTasks.length === 0 ? (
                <p style={{ opacity: 0.75, marginTop: 10 }}>{t("editor.empty")}</p>
              ) : (
                <div style={{ marginTop: 12 }}>
                  {lessonTasks.map((task, idx) => (
                    <div
                      key={task.id}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 14,
                        padding: 12,
                        marginBottom: 10,
                        background: "#fff",
                        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <strong style={{ minWidth: 110 }}>
                            {idx + 1}. {task.type.toUpperCase()}
                          </strong>
                          <span style={{ opacity: 0.7, fontSize: 13 }}>
                            {t("editor.taskId", { id: task.id })}
                          </span>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => moveTask(idx, -1)}
                            disabled={idx === 0}
                            style={{
                              ...buttonSmall,
                              opacity: idx === 0 ? 0.5 : 1,
                              cursor: idx === 0 ? "not-allowed" : "pointer",
                            }}
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveTask(idx, 1)}
                            disabled={idx === lessonTasks.length - 1}
                            style={{
                              ...buttonSmall,
                              opacity: idx === lessonTasks.length - 1 ? 0.5 : 1,
                              cursor: idx === lessonTasks.length - 1 ? "not-allowed" : "pointer",
                            }}
                          >
                            ↓
                          </button>
                          <button onClick={() => deleteTask(idx)} style={buttonSmall}>
                            {t("editor.delete")}
                          </button>
                        </div>
                      </div>

                      <label style={{ display: "block", marginTop: 10 }}>
                        {t("editor.prompt")}
                        <input
                          value={task.prompt}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLessonTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, prompt: v } : x)));
                          }}
                          style={fieldStyle}
                        />
                      </label>

                      {task.type === "truefalse" && (
                        <label style={{ display: "block", marginTop: 10 }}>
                          {t("editor.correctAnswer")}
                          <select
                            value={String(task.correctAnswer ?? "true")}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLessonTasks((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, correctAnswer: v } : x))
                              );
                            }}
                            style={fieldStyle}
                          >
                            <option value="true">{t("answers.true")}</option>
                            <option value="false">{t("answers.false")}</option>
                          </select>
                        </label>
                      )}

                      {task.type === "mcq" && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>{t("editor.options")}</div>

                          {(task.options ?? []).map((opt, oIdx) => (
                            <input
                              key={oIdx}
                              value={opt}
                              onChange={(e) => {
                                const v = e.target.value;
                                setLessonTasks((prev) =>
                                  prev.map((x, i) => {
                                    if (i !== idx) return x;
                                    const opts = [...(x.options ?? [])];
                                    opts[oIdx] = v;

                                    const correct =
                                      typeof x.correctAnswer === "string" && opts.includes(x.correctAnswer as string)
                                        ? (x.correctAnswer as string)
                                        : opts[0] ?? "";

                                    return { ...x, options: opts, correctAnswer: correct };
                                  })
                                );
                              }}
                              style={{ ...fieldStyle, marginTop: 8 }}
                            />
                          ))}

                          <label style={{ display: "block", marginTop: 10 }}>
                            {t("editor.correctAnswerHint")}
                            <input
                              value={typeof task.correctAnswer === "string" ? task.correctAnswer : ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setLessonTasks((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, correctAnswer: v } : x))
                                );
                              }}
                              style={fieldStyle}
                            />
                          </label>
                        </div>
                      )}

                      {task.type === "open" && (
                        <p style={{ marginTop: 10, opacity: 0.75, marginBottom: 0 }}>
                          {t("editor.openHint")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <section style={{ marginTop: 20 }}>
          <div
            className="actionRow"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              className="actionBtn"
              onClick={saveDraftOnly}
              disabled={busy || statusLoading || quotaBlocked || !hasText}
              style={{
                ...buttonSecondary,
                opacity: busy || statusLoading || quotaBlocked || !hasText ? 0.55 : 1,
                cursor: busy || statusLoading || quotaBlocked || !hasText ? "not-allowed" : "pointer",
              }}
              title={
                !hasText
                  ? t("hints.enterTextFirst")
                  : quotaBlocked && featureStatus
                    ? t("status.quotaUsed", {
                      used: featureStatus.used,
                      limit: featureStatus.limit,
                    })
                    : tasksDirty
                      ? t("hints.tasksDirty")
                      : t("hints.saveDraft")
              }
            >
              {saving ? t("buttons.saving") : t("buttons.saveDraft")}
            </button>

            {statusLoading && <span style={{ opacity: 0.75 }}>{t("status.loadingQuota")}</span>}

            {featureStatus && quotaBadgeText && (
              <span
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #e2e8f0",
                  background:
                    featureStatus.remaining <= 0
                      ? "#fff1f2"
                      : featureStatus.remaining <= 2
                        ? "#fffbeb"
                        : "#f0fdf4",
                  color: "#0f172a",
                  fontWeight: 700,
                }}
              >
                {quotaBadgeText}
                {featureStatus.remaining <= 2 && featureStatus.remaining > 0
                  ? ` ${t("warnings.soonEmpty")}`
                  : ""}
              </span>
            )}

            {savedId && <span style={{ color: "green" }}>{t("status.saved", { id: savedId })}</span>}
            {error && <span style={{ color: "crimson" }}>{error}</span>}
          </div>
        </section>

        {pack && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer" }}>{t("debug.title")}</summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "#ead9d9ed",
                border: "1px solid #eee",
                borderRadius: 10,
                padding: 12,
                marginTop: 10,
                overflowX: "auto",
              }}
            >
              {JSON.stringify(pack, null, 2)}
            </pre>
          </details>
        )}

        <style jsx>{`
          @media (max-width: 560px) {
            .actionRow {
              flex-direction: column !important;
              align-items: stretch !important;
              flex-wrap: nowrap !important;
              margin-top: 0 !important;
            }

            .actionBtn {
              width: 100% !important;
            }

            .pageWrap {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 0 0 60px !important;
              overflow-x: hidden !important;
              box-sizing: border-box !important;
            }

            .pageCard {
              width: 100% !important;
              padding: 12px 10px !important;
              border-radius: 0 !important;
              border-left: 0 !important;
              border-right: 0 !important;
              box-sizing: border-box !important;
            }
          }
        `}</style>
      </div>
    </main>
  );
}
