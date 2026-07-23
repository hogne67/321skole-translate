// app/[locale]/(app)/producer/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useLocale, useTranslations } from "next-intl";
import { useUserProfile } from "@/lib/useUserProfile";
import { useUsage } from "@/lib/useUsage";
import { Eye, Save, X } from "lucide-react";
import {
  getBucketLimit,
  getEffectivePlan,
  type AppRole,
  type PlanKey,
} from "@/lib/featureAccess";
import { LANGUAGES } from "@/lib/languages";
import { getTextTypeLabel, normalizeTextTypeKey, TEXT_TYPE_KEYS, type TextTypeKey } from "@/lib/textTypes";

type TaskType = "truefalse" | "mcq" | "open";
type ReleaseMode = "ALL_AT_ONCE" | "TEXT_FIRST";
type AnswerSpace = "short" | "medium" | "long";
type CoverFormat = "16:9";
type LessonStatus = "draft" | "published";
type LevelKey = "A1_START" | "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type TextSize = "normal" | "large" | "xlarge";

type CoverImageSource = "upload" | "ai";
type CoverImageStyle = "illustration" | "realistic";
type CoverImagePromptMode = "custom" | "fromText";

type Task = {
  id: string;
  order?: number;
  type: TaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: string;
  answerSpace?: AnswerSpace;
};

type Lesson = {
  ownerId?: string;
  title?: string;
  level?: string;
  sourceText?: string;
  status?: LessonStatus;
  tasks?: Task[];
  updatedAt?: Timestamp | Date | null;

  tags?: string[];
  topic?: string;
  language?: string;
  estimatedMinutes?: number;
  releaseMode?: ReleaseMode;
  textSize?: TextSize;
  textType?: string;

  producerName?: string;
  coverImageUrl?: string;
  coverImageFormat?: CoverFormat;
  coverImageCredit?: string;

  coverImageSource?: CoverImageSource;
  aiCoverStyle?: CoverImageStyle;
  aiCoverPromptMode?: CoverImagePromptMode;
  aiCoverPrompt?: string;

  activePublishedId?: string | null;

  // Mulige legacy-/generatorfelt som kan ha samme verdi som topic
  prompt?: string;
  generationPrompt?: string;
  sourcePrompt?: string;
  requestPrompt?: string;
  userPrompt?: string;
};

function uidNow() {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) return null;
  if (user.isAnonymous) return null;

  return user.uid;
}

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(2, 6);
}

function parseTags(text: string) {
  return text
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function countWords(text: string) {
  const t = (text ?? "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function countCharsWithSpaces(text: string) {
  return (text ?? "").length;
}

function countCharsNoSpaces(text: string) {
  return (text ?? "").replace(/\s+/g, "").length;
}

function normalizeStatus(s: unknown): LessonStatus {
  return s === "published" ? "published" : "draft";
}

function normalizeReleaseMode(v: unknown): ReleaseMode {
  return v === "TEXT_FIRST" ? "TEXT_FIRST" : "ALL_AT_ONCE";
}

function normalizeTextSize(v: unknown): TextSize {
  if (v === "large" || v === "xlarge") return v;
  return "normal";
}

function normalizeCoverFormat(v: unknown): CoverFormat {
  void v;
  return "16:9";
}

function normalizeCoverImageSource(v: unknown): CoverImageSource {
  return v === "ai" ? "ai" : "upload";
}

function normalizeCoverImageStyle(v: unknown): CoverImageStyle {
  return v === "realistic" ? "realistic" : "illustration";
}

function normalizeCoverImagePromptMode(v: unknown): CoverImagePromptMode {
  return v === "fromText" ? "fromText" : "custom";
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

function readString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function readUserDisplayName(d: unknown): string {
  if (!d || typeof d !== "object") return "";
  const x = d as Record<string, unknown>;
  return (
    readString(x.producerName).trim() ||
    readString(x.displayName).trim() ||
    readString(x.fullName).trim() ||
    readString(x.name).trim() ||
    readString(x.companyName).trim() ||
    ""
  );
}

function safeRole(role?: string): AppRole {
  if (role === "teacher") return "teacher";
  if (role === "student") return "student";
  if (role === "parent") return "parent";
  if (role === "creator") return "creator";
  if (role === "admin") return "admin";
  return "teacher";
}

function safePlan(plan?: string): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function normalizeTopicFromLesson(data: Lesson): string {
  const rawTopic = readString(data.topic).trim();
  if (!rawTopic) return "";

  const possiblePrompts = [
    readString(data.prompt).trim(),
    readString(data.generationPrompt).trim(),
    readString(data.sourcePrompt).trim(),
    readString(data.requestPrompt).trim(),
    readString(data.userPrompt).trim(),
  ].filter(Boolean);

  if (possiblePrompts.some((p) => p === rawTopic)) {
    return "";
  }

  return rawTopic;
}

type GenerateCoverResponse = {
  imageUrl?: string;
  url?: string;
  error?: string;
  usage?: {
    used?: number;
    limit?: number;
    remaining?: number;
  };
};

const LEVEL_OPTIONS: LevelKey[] = ["A1_START", "A1", "A2", "B1", "B2", "C1", "C2"];

const EDITOR_TEXT_TYPE_KEYS = TEXT_TYPE_KEYS.filter(
  (key) =>
    key !== "reading_test" &&
    key !== "pattern_sentences" &&
    key !== "high_frequency_words" &&
    key !== "sound_reading_ladder"
) as TextTypeKey[];

function levelLabel(level: LevelKey) {
  return level === "A1_START" ? "A1 Start" : level;
}

const LANGUAGE_LABELS_BY_LOCALE: Record<"nb" | "en" | "pt", Record<string, string>> = {
  nb: {
    nb: "Norsk (bokmål)",
    nn: "Norsk (nynorsk)",
    se: "Nordsamisk",
    en: "Engelsk",
    "pt-BR": "Portugisisk (Brasil)",
    "pt-PT": "Portugisisk (Portugal)",
  },
  en: {
    nb: "Norwegian Bokmål",
    nn: "Norwegian Nynorsk",
    se: "Northern Sami",
    en: "English",
    "pt-BR": "Portuguese (Brazil)",
    "pt-PT": "Portuguese (Portugal)",
  },
  pt: {
    nb: "Norueguês bokmål",
    nn: "Norueguês nynorsk",
    se: "Sami do norte",
    en: "Inglês",
    "pt-BR": "Português (Brasil)",
    "pt-PT": "Português (Portugal)",
  },
};

function getLabelLocale(locale: string): "nb" | "en" | "pt" {
  const normalized = locale.toLocaleLowerCase();
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("pt")) return "pt";
  return "nb";
}

function getLanguageDisplayLabel(code: string, label: string, locale: string): string {
  const localizedName = LANGUAGE_LABELS_BY_LOCALE[getLabelLocale(locale)][code] || label.split("–")[0]?.trim() || label;
  return `${code} - ${localizedName}`;
}

function normalizeLevelValue(value: unknown): string {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLocaleUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "A1START") return "A1_START";
  if (LEVEL_OPTIONS.includes(normalized as LevelKey)) return normalized;
  return raw;
}

export default function ProducerLessonEditorPage() {
  const t = useTranslations("editorNewText");
  const locale = useLocale();
  const router = useRouter();

  const params = useParams<{ id: string }>();
  const lessonId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  const { profile } = useUserProfile();
  const { usage, loading: usageLoading, reload: reloadUsage } = useUsage(uid ?? undefined);

  const role = safeRole((profile as { role?: string } | null)?.role);
  const profileForPlan = profile as {
    plan?: string;
    schoolId?: string | null;
    schoolRole?: string | null;
    schoolStatus?: string | null;
  } | null;
  const plan = getEffectivePlan({
    plan: safePlan(profileForPlan?.plan),
    schoolId: profileForPlan?.schoolId ?? null,
    schoolRole: profileForPlan?.schoolRole ?? null,
    schoolStatus: profileForPlan?.schoolStatus ?? null,
  });

  const imagesUsed = usage["image_generation"] ?? 0;
  const imagesLimit = getBucketLimit(role, plan, "image_generation");
  const imagesRemaining = Math.max(0, imagesLimit - imagesUsed);

  const imageLimitReached =
    !usageLoading && imagesLimit > 0 && imagesUsed >= imagesLimit;

  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("");
  const [sourceText, setSourceText] = useState("");

  const [status, setStatus] = useState<LessonStatus>("draft");
  const [tasks, setTasks] = useState<Task[]>([]);

  const [topic, setTopic] = useState("");
  const [textType, setTextType] = useState("");
  const normalizedTextType = normalizeTextTypeKey(textType);
  const textTypeSelectValue =
    normalizedTextType && EDITOR_TEXT_TYPE_KEYS.includes(normalizedTextType)
      ? normalizedTextType
      : "other";
  const [tagsText, setTagsText] = useState("");
  const [language, setLanguage] = useState(t("defaults.language"));
  const languageOptions = useMemo(() => {
    const current = language.trim();
    const hasCurrent = !current || LANGUAGES.some((option) => option.code === current);
    return hasCurrent ? LANGUAGES : [{ code: current, label: current }, ...LANGUAGES];
  }, [language]);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(20);
  const [releaseMode, setReleaseMode] = useState<ReleaseMode>("ALL_AT_ONCE");
  const [textSize, setTextSize] = useState<TextSize>("normal");

  const [producerName, setProducerName] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverImageCredit, setCoverImageCredit] = useState("");
  const [coverImageFormat, setCoverImageFormat] = useState<CoverFormat>("16:9");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  const [coverImageSource, setCoverImageSource] = useState<CoverImageSource>("upload");
  const [aiCoverStyle, setAiCoverStyle] = useState<CoverImageStyle>("illustration");
  const [aiCoverPromptMode, setAiCoverPromptMode] = useState<CoverImagePromptMode>("custom");
  const [aiCoverPrompt, setAiCoverPrompt] = useState("");

  const sortedTasks = useMemo(() => {
    const next = [...tasks];
    next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return next;
  }, [tasks]);

  const wordCount = useMemo(() => countWords(sourceText), [sourceText]);
  const charCountWithSpaces = useMemo(() => countCharsWithSpaces(sourceText), [sourceText]);
  const charCountNoSpaces = useMemo(() => countCharsNoSpaces(sourceText), [sourceText]);

  const previewW = 560;
  const previewH = Math.round((previewW * 9) / 16);

  const localizeError = useCallback(
    (message: string): string => {
      const m = message || "";

      if (m === "No auth uid (anonymous auth not ready).") return t("errors.noAuthUidNotReady");
      if (m === "No auth uid.") return t("errors.noAuthUid");
      if (m === "Fant ikke lesson.") return t("errors.notFound");
      if (m === "Du har ikke tilgang til denne lesson (ownerId mismatch).") return t("errors.noAccessOwnerMismatch");
      if (m === "Kunne ikke laste lesson.") return t("errors.loadFailed");
      if (m === "Velg en bildefil (jpg/png/webp).") return t("errors.chooseImageFile");
      if (m === "Filen er for stor. Maks 8MB.") return t("errors.fileTooLarge");
      if (m === "Upload feilet.") return t("errors.uploadFailed");
      if (m === "Lagring feilet.") return t("errors.saveFailed");
      if (m === "Skriv et prompt for AI-bildet.") return t("errors.writePromptForAiImage");
      if (m === "Teksten er tom. Kan ikke bruke teksten som inspirasjon.") return t("errors.textEmptyForAi");
      if (m === "Bildegenerering feilet.") return t("errors.imageGenerationFailed");
      if (m === "Image generation is not available on your current plan.") return t("errors.imageGenerationNotAvailable");
      if (m === "You have reached your image generation limit for this period.") return t("errors.imageGenerationLimitPeriod");
      if (m === "You have reached your image generation limit.") return t("errors.imageGenerationLimit");
      if (m === "Missing auth token.") return t("errors.missingAuthToken");

      return m;
    },
    [t]
  );

  const backHref = `/${locale}/producer`;
  const myContentHref = `/${locale}/content`;

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), (user) => {
      setUid(user && !user.isAnonymous ? user.uid : null);
      setAuthResolved(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!videoOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVideoOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [videoOpen]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setErr(null);
      setLoading(true);

      try {
        const currentUid = getAuth().currentUser?.uid ?? null;
        const currentUser = getAuth().currentUser;

        if (!currentUid || !currentUser || currentUser.isAnonymous) {
          setErr(t("errors.noAuthUid"));
          setLoading(false);
          return;
        }
        if (!alive) return;

        setUid(currentUid);

        const snap = await getDoc(doc(db, "lessons", lessonId));
        if (!alive) return;

        if (!snap.exists()) {
          setErr(t("errors.notFound"));
          setLoading(false);
          return;
        }

        const data = (snap.data() as Lesson) ?? {};

        if (data.ownerId && data.ownerId !== currentUid) {
          setErr(t("errors.noAccessOwnerMismatch"));
          setLoading(false);
          return;
        }

        setTitle(typeof data.title === "string" ? data.title : "");
        setLevel(normalizeLevelValue(data.level));
        setSourceText(typeof data.sourceText === "string" ? data.sourceText : "");
        setStatus(normalizeStatus(data.status));
        setTasks(Array.isArray(data.tasks) ? (data.tasks as Task[]) : []);

        setTopic(normalizeTopicFromLesson(data));
        setTextType(typeof data.textType === "string" ? data.textType : "");
        setTagsText(Array.isArray(data.tags) ? data.tags.join(", ") : "");
        setLanguage(typeof data.language === "string" ? data.language : t("defaults.language"));
        setEstimatedMinutes(typeof data.estimatedMinutes === "number" ? data.estimatedMinutes : 20);
        setReleaseMode(normalizeReleaseMode(data.releaseMode));
        setTextSize(normalizeTextSize(data.textSize));

        if (typeof data.producerName === "string" && data.producerName.trim()) {
          setProducerName(data.producerName.trim());
        }
        setCoverImageUrl(typeof data.coverImageUrl === "string" ? data.coverImageUrl : "");
        setCoverImageFormat(normalizeCoverFormat(data.coverImageFormat));
        setCoverImageCredit(typeof data.coverImageCredit === "string" ? data.coverImageCredit : "");

        setCoverImageSource(normalizeCoverImageSource(data.coverImageSource));
        setAiCoverStyle(normalizeCoverImageStyle(data.aiCoverStyle));
        setAiCoverPromptMode(normalizeCoverImagePromptMode(data.aiCoverPromptMode));
        setAiCoverPrompt(typeof data.aiCoverPrompt === "string" ? data.aiCoverPrompt : "");

        setLoading(false);
      } catch (e: unknown) {
        if (!alive) return;
        setErr(localizeError(getErrorMessage(e) || t("errors.loadFailed")));
        setLoading(false);
      }
    }

    if (!authResolved) return;
    void load();

    return () => {
      alive = false;
    };
  }, [lessonId, authResolved, t, localizeError]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!uid) return;

      const profileName = readUserDisplayName(profile);
      const authName = readString(getAuth().currentUser?.displayName).trim();

      if (profileName) {
        setProducerName(profileName);
        return;
      }

      if (authName) {
        setProducerName(authName);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (!alive) return;
        const dbName = snap.exists() ? readUserDisplayName(snap.data()) : "";
        if (dbName) setProducerName(dbName);
      } catch (err) {
        console.error("Failed to fetch producer name:", err);
      }
    })();

    return () => {
      alive = false;
    };
  }, [uid, profile]);

  async function uploadCover(file: File) {
    setErr(null);
    setUploadingCover(true);

    try {
      const u = uidNow();

      if (!u) throw new Error("No auth uid.");

      if (!file.type.startsWith("image/")) {
        throw new Error("Velg en bildefil (jpg/png/webp).");
      }

      const maxBytes = 8 * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error("Filen er for stor. Maks 8MB.");
      }

      const safeName = file.name.replaceAll(" ", "_");
      const path = `covers/${u}/${lessonId}/${Date.now()}-${safeName}`;
      const r = ref(storage, path);

      await uploadBytes(r, file, {
        contentType: file.type,
        cacheControl: "public,max-age=31536000",
      });

      const url = await getDownloadURL(r);
      setCoverImageUrl(url);
      setCoverImageSource("upload");
    } catch (e: unknown) {
      setErr(localizeError(getErrorMessage(e) || t("errors.uploadFailed")));
    } finally {
      setUploadingCover(false);
    }
  }

  async function generateAiCover() {
    setErr(null);
    setGeneratingCover(true);

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      const u = user && !user.isAnonymous ? user.uid : null;

      if (!user || !u) {
        throw new Error("No auth uid.");
      }

      if (imageLimitReached) {
        throw new Error("You have reached your image generation limit.");
      }

      const token = await user.getIdToken();
      if (!token) {
        throw new Error("Missing auth token.");
      }

      if (aiCoverPromptMode === "custom" && !aiCoverPrompt.trim()) {
        throw new Error("Skriv et prompt for AI-bildet.");
      }

      if (aiCoverPromptMode === "fromText" && !sourceText.trim()) {
        throw new Error("Teksten er tom. Kan ikke bruke teksten som inspirasjon.");
      }

      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lessonId,
          format: "16:9",
          style: aiCoverStyle,
          promptMode: aiCoverPromptMode,
          customPrompt: aiCoverPrompt.trim(),
          sourceText,
          title: title.trim(),
          level: level.trim(),
          language: language.trim(),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as GenerateCoverResponse;

      if (!res.ok) {
        throw new Error(data.error || "Bildegenerering feilet.");
      }

      const url =
        typeof data.imageUrl === "string"
          ? data.imageUrl
          : typeof data.url === "string"
            ? data.url
            : "";

      if (!url) throw new Error("Bildegenerering feilet.");

      setCoverImageUrl(url);
      setCoverImageSource("ai");
      await reloadUsage();
    } catch (e: unknown) {
      setErr(localizeError(getErrorMessage(e) || t("errors.imageGenerationFailed")));
    } finally {
      setGeneratingCover(false);
    }
  }

  async function persistLesson(destination: "stay" | "myContent" | "preview" = "stay") {
    setErr(null);
    setSaving(true);

    try {
      const currentUser = getAuth().currentUser;
      const currentUid = currentUser?.uid ?? null;

      if (!currentUid || !currentUser || currentUser.isAnonymous) {
        throw new Error("No auth uid.");
      }

      const tags = parseTags(tagsText);

      const normalized = sortedTasks.map((task, idx) => ({
        ...task,
        order: idx + 1,
      }));

      await setDoc(
        doc(db, "lessons", lessonId),
        {
          ownerId: currentUid,

          title: title.trim(),
          level: level.trim(),
          sourceText,
          status,
          tasks: normalized,

          topic: topic.trim(),
          textType: textType.trim(),
          tags,
          language: language.trim(),
          estimatedMinutes: Number.isFinite(estimatedMinutes) ? Number(estimatedMinutes) : 20,
          releaseMode,
          textSize,

          producerName: producerName.trim(),
          coverImageUrl: coverImageUrl.trim(),
          coverImageCredit: coverImageCredit.trim(),
          coverImageFormat,

          coverImageSource,
          aiCoverStyle,
          aiCoverPromptMode,
          aiCoverPrompt: aiCoverPrompt.trim(),

          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setTasks(normalized);

      if (destination === "myContent") {
        router.push(myContentHref);
      } else if (destination === "preview") {
        router.push(`/${locale}/producer/${lessonId}/preview`);
      }
    } catch (e: unknown) {
      setErr(localizeError(getErrorMessage(e) || t("errors.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function saveAndGoToMyContent() {
    await persistLesson("myContent");
  }

  async function saveAndPreview() {
    await persistLesson("preview");
  }

  function addTask(type: TaskType) {
    const id = newId();
    const nextOrder = (sortedTasks[sortedTasks.length - 1]?.order ?? sortedTasks.length) + 1;

    const base: Task = {
      id,
      order: nextOrder,
      type,
      prompt: "",
    };

    if (type === "truefalse") base.correctAnswer = "true";
    if (type === "mcq") {
      base.options = [
        t("tasks.defaults.optionA"),
        t("tasks.defaults.optionB"),
        t("tasks.defaults.optionC"),
        t("tasks.defaults.optionD"),
      ];
      base.correctAnswer = t("tasks.defaults.optionA");
    }
    if (type === "open") base.answerSpace = "medium";

    setTasks((prev) => [...prev, base]);
  }

  function removeTask(taskId: string) {
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  }

  function moveTask(taskId: string, dir: -1 | 1) {
    const next = [...sortedTasks];
    const idx = next.findIndex((x) => x.id === taskId);
    if (idx === -1) return;

    const j = idx + dir;
    if (j < 0 || j >= next.length) return;

    const tmp = next[idx];
    next[idx] = next[j];
    next[j] = tmp;

    const reordered = next.map((x, i) => ({ ...x, order: i + 1 }));
    setTasks(reordered);
  }

  function updateTask(taskId: string, patch: Partial<Task>) {
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...patch } : task)));
  }

  const sectionStyle: React.CSSProperties = {
    marginTop: 16,
    border: "1px solid #cbd2e1ce",
    borderRadius: 16,
    padding: 16,
    background: "#e3edf1e9",
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.04)",
  };

  const fieldStyle: React.CSSProperties = {
    padding: "10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 12,
    width: "100%",
    boxSizing: "border-box",
    background: "#f3f6e7f6",
  };

  const smallHelpStyle: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.72,
  };

  const heroHeaderStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "stretch",
    gap: 16,
    flexWrap: "wrap",
    border: "1px solid #dbeafe",
    borderRadius: 24,
    background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 56%, #eef6ff 100%)",
    padding: 22,
    boxShadow: "0 18px 45px rgba(15,23,42,0.07)",
  };

  const quietBackLinkStyle: React.CSSProperties = {
    display: "inline-flex",
    width: "fit-content",
    color: "#475569",
    fontSize: 13,
    fontWeight: 800,
    textDecoration: "none",
  };

  const videoPlaceholderStyle: React.CSSProperties = {
    minWidth: 250,
    flex: "0 1 320px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#bfdbfe",
    borderRadius: 20,
    background: "rgba(255,255,255,0.88)",
    padding: 10,
    display: "flex",
    alignItems: "center",
    gap: 12,
    color: "inherit",
    boxShadow: "0 10px 24px rgba(37,99,235,0.09)",
    cursor: "pointer",
    textAlign: "left",
  };

  const videoThumbStyle: React.CSSProperties = {
    position: "relative",
    width: 92,
    aspectRatio: "16 / 9",
    borderRadius: 14,
    overflow: "hidden",
    background: "linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)",
    flex: "0 0 auto",
  };

  const playCircleStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: 36,
    height: 36,
    borderRadius: 999,
    background: "#2563eb",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 8px 18px rgba(37,99,235,0.22)",
  };

  const playTriangleStyle: React.CSSProperties = {
    width: 0,
    height: 0,
    borderTop: "8px solid transparent",
    borderBottom: "8px solid transparent",
    borderLeft: "12px solid #ffffff",
    marginLeft: 3,
  };

  const videoOverlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 80,
    display: "grid",
    placeItems: "center",
    background: "rgba(15,23,42,0.72)",
    padding: 16,
  };

  const videoModalStyle: React.CSSProperties = {
    width: "min(960px, 100%)",
    overflow: "hidden",
    borderRadius: 22,
    background: "#ffffff",
    boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
  };

  const videoModalHeaderStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#e2e8f0",
    padding: "16px 18px",
  };

  const closeVideoButtonStyle: React.CSSProperties = {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    borderRadius: 12,
    background: "#ffffff",
    color: "#334155",
    width: 38,
    height: 38,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  };

  const videoFrameShellStyle: React.CSSProperties = {
    aspectRatio: "16 / 9",
    background: "#000000",
  };

  const videoFrameStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    border: 0,
  };

  function getTextSizeButtonStyle(value: TextSize): React.CSSProperties {
    const active = textSize === value;
    return {
      minHeight: 48,
      padding: "10px 14px",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: active ? "#2563eb" : "#cbd5e1",
      borderRadius: 14,
      background: active ? "#eff6ff" : "rgba(255,255,255,0.72)",
      color: active ? "#1d4ed8" : "#0f172a",
      fontWeight: 900,
      cursor: "pointer",
      boxShadow: active ? "0 0 0 3px rgba(37,99,235,0.12)" : "none",
      textAlign: "left",
    };
  }

  if (loading) {
    return (
      <main
        style={{
          paddingTop: 20,
          paddingRight: 20,
          paddingBottom: 110,
          paddingLeft: 20,
        }}
      >
        {t("states.loading")}
      </main>
    );
  }

  if (err) {
    return (
      <main
        style={{
          paddingTop: 20,
          paddingRight: 20,
          paddingBottom: 110,
          paddingLeft: 20,
          maxWidth: 980,
          margin: "0 auto",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>{t("pageTitle")}</h1>
        <div style={{ marginTop: 12, border: "1px solid #f3b4b4", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800 }}>{t("errors.title")}</div>
          <pre style={{ whiteSpace: "pre-wrap" }}>{err}</pre>
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href={backHref}>{t("nav.back")}</Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <main
        style={{
          paddingTop: 20,
          paddingRight: 20,
          paddingBottom: 110,
          paddingLeft: 20,
          maxWidth: 980,
          margin: "0 auto",
        }}
      >
        <div style={heroHeaderStyle}>
          <div style={{ minWidth: 0, flex: "1 1 520px" }}>
            <Link href={backHref} style={quietBackLinkStyle}>{t("nav.back")}</Link>
            <h1 style={{ fontSize: 30, lineHeight: 1.08, fontWeight: 950, margin: "12px 0 0", color: "#0f172a" }}>
              {t("pageTitle")}
            </h1>
            <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.5, marginTop: 10, maxWidth: 620 }}>
              {t("intro.finishLesson")}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setVideoOpen(true)}
            style={videoPlaceholderStyle}
            aria-label={t("intro.videoTitle")}
          >
            <div style={videoThumbStyle} aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://img.youtube.com/vi/jKj6wIqcAuA/mqdefault.jpg"
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <div style={playCircleStyle}>
                <span style={playTriangleStyle} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>{t("intro.videoTitle")}</div>
              <div style={{ marginTop: 3, fontSize: 13, color: "#64748b" }}>{t("intro.videoPlaceholder")}</div>
            </div>
          </button>
        </div>

        {videoOpen ? (
          <div
            style={videoOverlayStyle}
            role="dialog"
            aria-modal="true"
            aria-label={t("intro.videoTitle")}
            onClick={() => setVideoOpen(false)}
          >
            <div style={videoModalStyle} onClick={(event) => event.stopPropagation()}>
              <div style={videoModalHeaderStyle}>
                <div style={{ fontSize: 18, fontWeight: 950, color: "#0f172a" }}>{t("intro.videoTitle")}</div>
                <button
                  type="button"
                  onClick={() => setVideoOpen(false)}
                  style={closeVideoButtonStyle}
                  aria-label={t("intro.closeVideo")}
                >
                  <X size={18} strokeWidth={2.5} />
                </button>
              </div>
              <div style={videoFrameShellStyle}>
                <iframe
                  src="https://www.youtube-nocookie.com/embed/jKj6wIqcAuA?autoplay=1&rel=0&modestbranding=1"
                  title={t("intro.videoTitle")}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  style={videoFrameStyle}
                />
              </div>
            </div>
          </div>
        ) : null}

        <section
          style={{
            ...sectionStyle,
            background: "#eef6ff",
            border: "1px solid #dbeafe",
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fff" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {t("summary.title")}
              </div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>{title || "—"}</div>
            </div>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fff" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {t("summary.tasks")}
              </div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>{sortedTasks.length}</div>
            </div>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fff" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {t("summary.words")}
              </div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>{wordCount}</div>
            </div>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fff" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {t("summary.status")}
              </div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>{t(`statuses.${status}`)}</div>
            </div>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fff" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {t("summary.imageGeneration")}
              </div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>
                {imagesUsed} / {imagesLimit}
              </div>
            </div>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>
              {t("sections.basicInfoTitle")}
            </h2>
            <div style={{ marginTop: 6, ...smallHelpStyle }}>
              {t("sections.basicInfoHelp")}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.title")} *</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={fieldStyle}
                placeholder={t("placeholders.title")}
              />
            </label>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 800 }}>{t("fields.levelOptional")} *</div>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  style={fieldStyle}
                >
                  {LEVEL_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {levelLabel(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 800 }}>{t("fields.language")}</div>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={fieldStyle}
                >
                  {languageOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {getLanguageDisplayLabel(option.code, option.label, locale)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.producerName")}</div>
              <input
                value={producerName}
                disabled
                readOnly
                style={{
                  ...fieldStyle,
                  background: "#f4f4f5",
                }}
                placeholder={t("placeholdersExtra.producerName")}
                title={t("help.producerName", { uid: uid ?? "uid" })}
              />
              <div style={smallHelpStyle}>
                {t("help.producerName", { uid: uid ?? "uid" })}
              </div>
              <label style={{ display: "grid", gap: 6, maxWidth: 560 }}>
                <div style={{ fontWeight: 800 }}>{t("fields.coverImageCredit")}</div>
                <input
                  value={coverImageCredit}
                  onChange={(e) => setCoverImageCredit(e.target.value)}
                  style={fieldStyle}
                  placeholder={t("placeholders.coverImageCredit")}
                />
                <div style={smallHelpStyle}>{t("help.coverImageCredit")}</div>
              </label>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>
                {t("fieldsExtra.textType")}
              </div>
              <select
                value={textTypeSelectValue}
                onChange={(e) => {
                  const next = e.target.value as TextTypeKey;
                  setTextType(next === "other" ? "" : next);
                }}
                style={fieldStyle}
              >
                {EDITOR_TEXT_TYPE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {getTextTypeLabel(key, locale)}
                  </option>
                ))}
              </select>
              {textTypeSelectValue === "other" ? (
                <input
                  value={textType}
                  onChange={(e) => setTextType(e.target.value)}
                  style={fieldStyle}
                  placeholder={t("placeholdersExtra.textType")}
                />
              ) : null}
              <div style={smallHelpStyle}>
                {t("fieldsExtra.textTypeHelp")}
              </div>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.topic")}</div>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                style={fieldStyle}
                placeholder={t("placeholdersExtra.topic")}
              />
              <div style={smallHelpStyle}>{t("fields.topicHelp")}</div>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.tags")}</div>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                style={fieldStyle}
                placeholder={t("placeholders.tags")}
              />
              <div style={smallHelpStyle}>{t("fields.tagsHelp")}</div>
            </label>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>
              {t("sections.coverTitle")}
            </h2>
            <div style={{ marginTop: 6, ...smallHelpStyle }}>
              {t("sections.coverHelp")}
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setCoverImageSource("upload")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: coverImageSource === "upload" ? "2px solid #2563eb" : "1px solid #d1d5db",
                  background: "#fff",
                  fontWeight: 700,
                }}
              >
                {t("cover.uploadImage")}
              </button>

              <button
                type="button"
                onClick={() => setCoverImageSource("ai")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: coverImageSource === "ai" ? "2px solid #2563eb" : "1px solid #d1d5db",
                  background: "#fff",
                  fontWeight: 700,
                }}
              >
                {t("cover.generateAiImage")}
              </button>
            </div>

            <div style={{ display: "grid", gap: 6, maxWidth: 240 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {t("fieldsExtra.format")}
              </div>
              <select
                value={coverImageFormat}
                onChange={(e) => setCoverImageFormat(normalizeCoverFormat(e.target.value))}
                style={{ ...fieldStyle, background: "#f4f4f5" }}
                disabled
              >
                <option value="16:9">16:9</option>
              </select>
              <div style={smallHelpStyle}>
                {t("fieldsExtra.formatHelp")}
              </div>
            </div>

            {coverImageSource === "upload" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <label
                    style={{
                      padding: "10px 12px",
                      border: "1px solid #ddd",
                      borderRadius: 10,
                      cursor: uploadingCover ? "not-allowed" : "pointer",
                      opacity: uploadingCover ? 0.6 : 1,
                      display: "inline-block",
                      background: "#fff",
                      fontWeight: 700,
                    }}
                  >
                    {uploadingCover ? t("cover.uploading") : t("cover.uploadImage")}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={uploadingCover}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadCover(f);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setCoverImageUrl("");
                      setCoverImageCredit("");
                    }}
                    style={{
                      padding: "10px 12px",
                      border: "1px solid #ddd",
                      borderRadius: 10,
                      background: "#fff",
                      fontWeight: 700,
                    }}
                    disabled={uploadingCover || !coverImageUrl}
                  >
                    {t("cover.removeImage")}
                  </button>
                </div>

                <div style={smallHelpStyle}>
                  {t("help.uploadImage")}
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {t("fieldsExtra.imageStyle")}
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setAiCoverStyle("illustration")}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: aiCoverStyle === "illustration" ? "2px solid #2563eb" : "1px solid #d1d5db",
                        background: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      {t("cover.illustration")}
                    </button>

                    <button
                      type="button"
                      onClick={() => setAiCoverStyle("realistic")}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: aiCoverStyle === "realistic" ? "2px solid #2563eb" : "1px solid #d1d5db",
                        background: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      {t("cover.realistic")}
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {t("fieldsExtra.promptSource")}
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setAiCoverPromptMode("custom")}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: aiCoverPromptMode === "custom" ? "2px solid #2563eb" : "1px solid #d1d5db",
                        background: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      {t("cover.writePrompt")}
                    </button>

                    <button
                      type="button"
                      onClick={() => setAiCoverPromptMode("fromText")}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: aiCoverPromptMode === "fromText" ? "2px solid #2563eb" : "1px solid #d1d5db",
                        background: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      {t("cover.useTextAsInspiration")}
                    </button>
                  </div>
                </div>

                {aiCoverPromptMode === "custom" ? (
                  <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 800 }}>
                      {t("fieldsExtra.prompt")}
                    </div>
                    <textarea
                      value={aiCoverPrompt}
                      onChange={(e) => setAiCoverPrompt(e.target.value)}
                      rows={4}
                      style={fieldStyle}
                      placeholder={t("placeholdersExtra.customPrompt")}
                    />
                  </label>
                ) : (
                  <div
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 12,
                      background: "#fff",
                      fontSize: 14,
                    }}
                  >
                    {t("help.fromTextPrompt")}
                  </div>
                )}

                <div
                  style={{
                    fontSize: 13,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: imageLimitReached ? "#fff7ed" : "#f8fafc",
                  }}
                >
                  {t("help.imageLimit", {
                    used: imagesUsed,
                    limit: imagesLimit,
                    remaining: imagesRemaining,
                  })}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={generateAiCover}
                    disabled={generatingCover || imageLimitReached}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #c7d2fe",
                      background: "#2563eb",
                      color: "#fff",
                      fontWeight: 800,
                      cursor: generatingCover || imageLimitReached ? "not-allowed" : "pointer",
                      opacity: generatingCover || imageLimitReached ? 0.7 : 1,
                    }}
                  >
                    {generatingCover
                      ? t("cover.generating")
                      : imageLimitReached
                        ? t("cover.limitReached")
                        : t("cover.generateImage")}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCoverImageUrl("");
                      setCoverImageCredit("");
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "#fff",
                      fontWeight: 700,
                    }}
                    disabled={generatingCover || !coverImageUrl}
                  >
                    {t("cover.removeImage")}
                  </button>
                </div>

                <div style={smallHelpStyle}>
                  {t("help.generatedLandscape")}
                </div>
              </div>
            )}

            <div style={smallHelpStyle}>
              {t("help.rememberSaveImage")}
            </div>

            {coverImageUrl?.trim() ? (
              <div style={{ marginTop: 4 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverImageUrl}
                  alt={t("cover.previewAlt")}
                  style={{
                    width: "100%",
                    maxWidth: previewW,
                    height: previewH,
                    objectFit: "cover",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    display: "block",
                  }}
                />
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                  {t("cover.previewCaption", {
                    format: coverImageFormat,
                    source:
                      coverImageSource === "ai"
                        ? t("cover.previewSourceAi")
                        : t("cover.previewSourceUpload"),
                  })}
                </div>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 4,
                  width: "100%",
                  maxWidth: previewW,
                  height: previewH,
                  border: "1px dashed #bbb",
                  borderRadius: 12,
                  display: "grid",
                  placeItems: "center",
                  color: "#777",
                  fontSize: 12,
                  background: "#fff",
                }}
              >
                {t("cover.noImageYet")}
              </div>
            )}
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>
              {t("sections.textSettingsTitle")}
            </h2>
            <div style={{ marginTop: 6, ...smallHelpStyle }}>
              {t("sections.textSettingsHelp")}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.estimatedMinutes")}</div>
              <input
                type="number"
                min={1}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                style={fieldStyle}
              />
            </label>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.textSize")}</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 10,
                }}
              >
                {(["normal", "large", "xlarge"] as TextSize[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTextSize(value)}
                    style={getTextSizeButtonStyle(value)}
                  >
                    {t(`textSizes.${value}`)}
                  </button>
                ))}
              </div>
              <div style={smallHelpStyle}>{t("fields.textSizeHelp")}</div>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.text")}</div>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={10}
                style={fieldStyle}
                placeholder={t("placeholders.sourceText")}
              />
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {t("counts", {
                  words: wordCount,
                  charsNoSpaces: charCountNoSpaces,
                  charsWithSpaces: charCountWithSpaces,
                })}
              </div>
            </label>
          </div>
        </section>

        <section style={sectionStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>{t("tasks.title")}</h2>
              <div style={{ marginTop: 6, ...smallHelpStyle }}>
                {t("tasksIntro.help")}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => addTask("truefalse")} style={{ padding: "8px 10px" }}>
                {t("tasks.add.trueFalse")}
              </button>
              <button type="button" onClick={() => addTask("mcq")} style={{ padding: "8px 10px" }}>
                {t("tasks.add.mcq")}
              </button>
              <button type="button" onClick={() => addTask("open")} style={{ padding: "8px 10px" }}>
                {t("tasks.add.open")}
              </button>
            </div>
          </div>

          {sortedTasks.length === 0 ? (
            <p style={{ opacity: 0.7, marginTop: 12 }}>{t("tasks.empty")}</p>
          ) : (
            <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
              {sortedTasks.map((task, idx) => (
                <div key={task.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {t("tasks.headerLine", { n: idx + 1, type: task.type.toUpperCase(), id: task.id })}
                      </div>
                      <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" onClick={() => moveTask(task.id, -1)} disabled={idx === 0}>
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTask(task.id, +1)}
                          disabled={idx === sortedTasks.length - 1}
                        >
                          ↓
                        </button>
                        <button type="button" onClick={() => removeTask(task.id)} title={t("tasks.deleteTitle")}>
                          {t("tasks.delete")}
                        </button>
                      </div>
                    </div>

                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{t("tasks.type")}</div>
                      <select
                        value={task.type}
                        onChange={(e) => updateTask(task.id, { type: e.target.value as TaskType })}
                      >
                        <option value="truefalse">{t("taskTypes.truefalse")}</option>
                        <option value="mcq">{t("taskTypes.mcq")}</option>
                        <option value="open">{t("taskTypes.open")}</option>
                      </select>
                    </label>
                  </div>

                  <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
                    <div style={{ fontWeight: 800 }}>{t("tasks.prompt")}</div>
                    <textarea
                      value={task.prompt}
                      onChange={(e) => updateTask(task.id, { prompt: e.target.value })}
                      rows={3}
                      style={fieldStyle}
                      placeholder={t("placeholders.taskPrompt")}
                    />
                  </label>

                  {task.type === "mcq" && (
                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 800 }}>{t("mcq.optionsOnePerLine")}</div>
                        <textarea
                          value={(task.options ?? []).join("\n")}
                          onChange={(e) =>
                            updateTask(task.id, {
                              options: e.target.value
                                .split("\n")
                                .map((x) => x.trim())
                                .filter(Boolean),
                            })
                          }
                          rows={5}
                          style={fieldStyle}
                        />
                      </label>

                      <label style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 800 }}>{t("mcq.correctAnswer")}</div>
                        <input
                          value={typeof task.correctAnswer === "string" ? task.correctAnswer : ""}
                          onChange={(e) => updateTask(task.id, { correctAnswer: e.target.value })}
                          style={fieldStyle}
                          placeholder={t("placeholders.mcqCorrectAnswer")}
                        />
                      </label>
                    </div>
                  )}

                  {task.type === "truefalse" && (
                    <div style={{ marginTop: 10 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 800 }}>{t("tf.correctAnswer")}</div>
                        <select
                          value={task.correctAnswer ?? "true"}
                          onChange={(e) => updateTask(task.id, { correctAnswer: e.target.value })}
                          style={fieldStyle}
                        >
                          <option value="true">{t("answers.true")}</option>
                          <option value="false">{t("answers.false")}</option>
                        </select>
                        <div style={smallHelpStyle}>{t("tf.tip")}</div>
                      </label>
                    </div>
                  )}

                  {task.type === "open" && (
                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      <label style={{ display: "grid", gap: 6, maxWidth: 280 }}>
                        <div style={{ fontWeight: 800 }}>{t("open.answerSpace")}</div>
                        <select
                          value={task.answerSpace ?? "medium"}
                          onChange={(e) => updateTask(task.id, { answerSpace: e.target.value as AnswerSpace })}
                          style={fieldStyle}
                        >
                          <option value="short">{t("answerSpace.short")}</option>
                          <option value="medium">{t("answerSpace.medium")}</option>
                          <option value="long">{t("answerSpace.long")}</option>
                        </select>
                        <div style={smallHelpStyle}>{t("open.answerSpaceHelp")}</div>
                      </label>

                      <div style={{ fontSize: 13, opacity: 0.75 }}>{t("open.hint")}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14, opacity: 0.75 }}>
            {t("footerRemember")} <b>{t("buttons.save")}</b>.
          </div>
        </section>
      </main>

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          borderTop: "1px solid #bfdbfe",
          background: "rgba(255,255,255,0.95)",
          padding: "12px 16px",
          boxShadow: "0 -10px 30px rgba(15,23,42,0.12)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div
          style={{
            maxWidth: 980,
            margin: "0 auto",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 240, flex: "1 1 420px" }}>
            <div style={{ fontSize: 14, fontWeight: 950, color: "#0f172a" }}>{t("sticky.title")}</div>
            <div style={{ marginTop: 2, fontSize: 13, fontWeight: 650, color: "#475569", lineHeight: 1.35 }}>
              {t("sticky.body")}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={saveAndPreview}
              disabled={saving}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                minHeight: 40,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "#cbd5e1",
                borderRadius: 12,
                background: "#ffffff",
                color: "#0f172a",
                padding: "9px 13px",
                fontSize: 13,
                fontWeight: 900,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.82 : 1,
              }}
              title={t("buttons.saveAndPreview")}
            >
              <Eye size={16} strokeWidth={2.4} aria-hidden="true" />
              {saving ? t("buttons.saving") : t("buttons.saveAndPreview")}
            </button>

            <button
              type="button"
              onClick={saveAndGoToMyContent}
              disabled={saving}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                minHeight: 40,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "#0f172a",
                borderRadius: 12,
                background: "#0f172a",
                color: "#ffffff",
                padding: "9px 14px",
                fontSize: 13,
                fontWeight: 950,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.82 : 1,
                boxShadow: "0 10px 24px rgba(15,23,42,0.22)",
                whiteSpace: "nowrap",
              }}
              title={t("buttons.saveToMyContent")}
            >
              <Save size={16} strokeWidth={2.4} aria-hidden="true" />
              {saving ? t("buttons.saving") : t("buttons.saveToMyContent")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}  
