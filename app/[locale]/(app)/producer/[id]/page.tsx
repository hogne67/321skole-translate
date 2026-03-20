// app/[locale]/(app)/producer/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { getAuth } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useLocale, useTranslations } from "next-intl";
import { useUserProfile } from "@/lib/useUserProfile";
import { useUsage } from "@/lib/useUsage";
import { getBucketLimit, type AppRole, type PlanKey } from "@/lib/featureAccess";

type TaskType = "truefalse" | "mcq" | "open";
type ReleaseMode = "ALL_AT_ONCE" | "TEXT_FIRST";
type AnswerSpace = "short" | "medium" | "long";
type CoverFormat = "16:9";
type LessonStatus = "draft" | "published";

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
  textType?: string;

  producerName?: string;
  coverImageUrl?: string;
  coverImageFormat?: CoverFormat;

  coverImageSource?: CoverImageSource;
  aiCoverStyle?: CoverImageStyle;
  aiCoverPromptMode?: CoverImagePromptMode;
  aiCoverPrompt?: string;

  activePublishedId?: string | null;
};

function uidNow() {
  return getAuth().currentUser?.uid ?? null;
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
    readString(x.displayName).trim() ||
    readString(x.fullName).trim() ||
    readString(x.name).trim() ||
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

export default function ProducerLessonEditorPage() {
  const t = useTranslations("producer.editor");
  const locale = useLocale();
  const router = useRouter();

  const params = useParams<{ id: string }>();
  const lessonId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  const { profile } = useUserProfile();
  const { usage, loading: usageLoading, reload: reloadUsage } = useUsage(uid ?? undefined);

  const role = safeRole((profile as { role?: string } | null)?.role);
  const plan = safePlan((profile as { plan?: string } | null)?.plan);

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
  const [tagsText, setTagsText] = useState("");
  const [language, setLanguage] = useState(t("defaults.language"));
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(20);
  const [releaseMode, setReleaseMode] = useState<ReleaseMode>("ALL_AT_ONCE");

  const [producerName, setProducerName] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverImageFormat, setCoverImageFormat] = useState<CoverFormat>("16:9");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [generatingCover, setGeneratingCover] = useState(false);

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
      if (m === "Skriv et prompt for AI-bildet.") {
        return locale === "en" ? "Write a prompt for the AI image." : "Skriv et prompt for AI-bildet.";
      }
      if (m === "Teksten er tom. Kan ikke bruke teksten som inspirasjon.") {
        return locale === "en"
          ? "The text is empty. Cannot use the text as inspiration."
          : "Teksten er tom. Kan ikke bruke teksten som inspirasjon.";
      }
      if (m === "Bildegenerering feilet.") {
        return locale === "en" ? "Image generation failed." : "Bildegenerering feilet.";
      }
      if (m === "Image generation is not available on your current plan.") {
        return locale === "en"
          ? "Image generation is not available on your current plan."
          : "Bildegenerering er ikke tilgjengelig på abonnementet ditt.";
      }
      if (m === "You have reached your image generation limit for this period.") {
        return locale === "en"
          ? "You have reached your image generation limit for this period."
          : "Du har nådd grensen for bildegenerering i denne perioden.";
      }
      if (m === "You have reached your image generation limit.") {
        return locale === "en"
          ? "You have reached your image generation limit."
          : "Du har nådd grensen for bildegenerering.";
      }

      return m;
    },
    [t, locale]
  );

  const backHref = `/${locale}/producer`;
  const myContentHref = `/${locale}/content`;

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      try {
        await ensureAnonymousUser();
        const u = uidNow();
        if (!u) throw new Error("No auth uid (anonymous auth not ready).");
        if (!alive) return;

        setUid(u);

        const snap = await getDoc(doc(db, "lessons", lessonId));
        if (!alive) return;

        if (!snap.exists()) {
          setErr(t("errors.notFound"));
          setLoading(false);
          return;
        }

        const data = (snap.data() as Lesson) ?? {};

        if (data.ownerId && data.ownerId !== u) {
          setErr(t("errors.noAccessOwnerMismatch"));
          setLoading(false);
          return;
        }

        setTitle(typeof data.title === "string" ? data.title : "");
        setLevel(typeof data.level === "string" ? data.level : "");
        setSourceText(typeof data.sourceText === "string" ? data.sourceText : "");
        setStatus(normalizeStatus(data.status));
        setTasks(Array.isArray(data.tasks) ? (data.tasks as Task[]) : []);

        setTopic(typeof data.topic === "string" ? data.topic : "");
        setTextType(typeof data.textType === "string" ? data.textType : "");
        setTagsText(Array.isArray(data.tags) ? data.tags.join(", ") : "");
        setLanguage(typeof data.language === "string" ? data.language : t("defaults.language"));
        setEstimatedMinutes(typeof data.estimatedMinutes === "number" ? data.estimatedMinutes : 20);
        setReleaseMode(normalizeReleaseMode(data.releaseMode));

        setProducerName(typeof data.producerName === "string" ? data.producerName : "");
        setCoverImageUrl(typeof data.coverImageUrl === "string" ? data.coverImageUrl : "");
        setCoverImageFormat(normalizeCoverFormat(data.coverImageFormat));

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
    })();

    return () => {
      alive = false;
    };
  }, [lessonId, t, localizeError]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!uid) return;

      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (!alive) return;
        const name = snap.exists() ? readUserDisplayName(snap.data()) : "";
        if (name) setProducerName(name);
      } catch {
        // ignore
      }
    })();

    return () => {
      alive = false;
    };
  }, [uid]);

  async function uploadCover(file: File) {
    setErr(null);
    setUploadingCover(true);

    try {
      await ensureAnonymousUser();
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
      await ensureAnonymousUser();

      const auth = getAuth();
      const user = auth.currentUser;
      const u = user?.uid ?? null;

      if (!user || !u) {
        throw new Error("No auth uid.");
      }

      if (imageLimitReached) {
        throw new Error(
          locale === "en"
            ? "You have reached your image generation limit."
            : "Du har nådd grensen for bildegenerering."
        );
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
      setErr(localizeError(getErrorMessage(e) || "Bildegenerering feilet."));
    } finally {
      setGeneratingCover(false);
    }
  }

  async function saveAndGoToMyContent() {
    setErr(null);
    setSaving(true);

    try {
      await ensureAnonymousUser();
      const u = uidNow();
      if (!u) throw new Error("No auth uid.");

      const tags = parseTags(tagsText);

      const normalized = sortedTasks.map((task, idx) => ({
        ...task,
        order: idx + 1,
      }));

      await updateDoc(doc(db, "lessons", lessonId), {
        ownerId: u,

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

        producerName: producerName.trim(),
        coverImageUrl: coverImageUrl.trim(),
        coverImageFormat,

        coverImageSource,
        aiCoverStyle,
        aiCoverPromptMode,
        aiCoverPrompt: aiCoverPrompt.trim(),

        updatedAt: serverTimestamp(),
      });

      setTasks(normalized);
      router.push(myContentHref);
    } catch (e: unknown) {
      setErr(localizeError(getErrorMessage(e) || t("errors.saveFailed")));
    } finally {
      setSaving(false);
    }
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <Link href={backHref}>{t("nav.back")}</Link>
            <h1 style={{ fontSize: 24, fontWeight: 900, marginTop: 10 }}>{t("pageTitle")}</h1>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              {t("metaLine", { id: lessonId, uid: uid ?? "—", status })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={saveAndGoToMyContent}
              disabled={saving}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #86efac",
                background: "#16a34a",
                color: "white",
                fontWeight: 900,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
                whiteSpace: "nowrap",
              }}
              title={t("buttons.saveToMyContent")}
            >
              {saving ? t("buttons.saving") : t("buttons.saveToMyContent")}
            </button>
          </div>
        </div>

        <section style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.title")} *</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ padding: "10px 12px" }}
                placeholder={t("placeholders.title")}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.levelOptional")} *</div>
              <input
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                style={{ padding: "10px 12px" }}
                placeholder={t("placeholders.level")}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.producerName")}</div>
              <input
                value={producerName}
                disabled
                readOnly
                style={{
                  padding: "10px 12px",
                  background: "#f4f4f5",
                  border: "1px solid #e5e7eb",
                  color: "#111827",
                }}
                placeholder={locale === "en" ? "Your name (from profile)" : "Ditt navn (fra profil)"}
                title={locale === "en" ? "Pulled from your user profile" : "Hentes fra brukerprofil"}
              />
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {locale === "en"
                  ? "This is taken from your profile (users/{uid})."
                  : "Dette hentes fra profilen din (users/{uid})."}
              </div>
            </label>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>
                {locale === "en" ? "Cover image" : "Forsidebilde"}
              </div>

              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  display: "grid",
                  gap: 12,
                  background: "#fafafa",
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {locale === "en" ? "Choose image source" : "Velg bildekilde"}
                  </div>
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
                      {locale === "en" ? "Upload image" : "Last opp bilde"}
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
                      {locale === "en" ? "Generate AI image" : "Generer AI-bilde"}
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 6, maxWidth: 240 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {locale === "en" ? "Format" : "Format"}
                  </div>
                  <select
                    value={coverImageFormat}
                    onChange={(e) => setCoverImageFormat(normalizeCoverFormat(e.target.value))}
                    style={{ padding: "10px 12px", background: "#f4f4f5" }}
                    disabled
                  >
                    <option value="16:9">16:9</option>
                  </select>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {locale === "en" ? "Only 16:9 is allowed." : "Kun 16:9 er tillatt."}
                  </div>
                </div>

                {coverImageSource === "upload" ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <label
                        style={{
                          padding: "8px 12px",
                          border: "1px solid #ddd",
                          borderRadius: 10,
                          cursor: uploadingCover ? "not-allowed" : "pointer",
                          opacity: uploadingCover ? 0.6 : 1,
                          display: "inline-block",
                          background: "#fff",
                        }}
                      >
                        {uploadingCover
                          ? locale === "en"
                            ? "Uploading..."
                            : "Laster opp..."
                          : locale === "en"
                            ? "Upload image"
                            : "Last opp bilde"}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          disabled={uploadingCover}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadCover(f);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setCoverImageUrl("")}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid #ddd",
                          borderRadius: 10,
                          background: "#fff",
                        }}
                        disabled={uploadingCover || !coverImageUrl}
                      >
                        {locale === "en" ? "Remove image" : "Fjern bilde"}
                      </button>
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {locale === "en"
                        ? "Upload jpg, png or webp. Image will be used in 16:9 format."
                        : "Last opp jpg, png eller webp. Bildet brukes i 16:9-format."}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {locale === "en" ? "Image style" : "Bildestil"}
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
                          {locale === "en" ? "Illustration" : "Illustrasjon"}
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
                          {locale === "en" ? "Realistic" : "Realistisk"}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {locale === "en" ? "Prompt source" : "Prompt-kilde"}
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
                          {locale === "en" ? "Write prompt" : "Skriv prompt"}
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
                          {locale === "en" ? "Use text as inspiration" : "Bruk teksten som inspirasjon"}
                        </button>
                      </div>
                    </div>

                    {aiCoverPromptMode === "custom" ? (
                      <label style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 800 }}>
                          {locale === "en" ? "Prompt" : "Prompt"}
                        </div>
                        <textarea
                          value={aiCoverPrompt}
                          onChange={(e) => setAiCoverPrompt(e.target.value)}
                          rows={4}
                          style={{ padding: "10px 12px", width: "100%" }}
                          placeholder={
                            locale === "en"
                              ? "Example: A calm classroom scene with students reading, warm light, detailed, clean composition"
                              : "Eksempel: Et rolig klasserom med elever som leser, varmt lys, detaljer, ren komposisjon"
                          }
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
                        {locale === "en"
                          ? "The system will use the lesson title and text as inspiration for the image."
                          : "Systemet vil bruke tittel og tekst som inspirasjon for bildet."}
                      </div>
                    )}

                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {locale === "en"
                        ? `Image generation: ${imagesUsed} / ${imagesLimit} used • ${imagesRemaining} left`
                        : `Bildegenerering: ${imagesUsed} / ${imagesLimit} brukt • ${imagesRemaining} igjen`}
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
                          ? locale === "en"
                            ? "Generating..."
                            : "Genererer..."
                          : imageLimitReached
                            ? locale === "en"
                              ? "Limit reached"
                              : "Grense nådd"
                            : locale === "en"
                              ? "Generate image"
                              : "Generer bilde"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setCoverImageUrl("")}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: "#fff",
                        }}
                        disabled={generatingCover || !coverImageUrl}
                      >
                        {locale === "en" ? "Remove image" : "Fjern bilde"}
                      </button>
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {locale === "en"
                        ? "The generated image should be landscape in 16:9."
                        : "Det genererte bildet skal være liggende i 16:9."}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {locale === "en"
                    ? "Remember to save the lesson after selecting or generating an image."
                    : "Husk å lagre oppgaven etter at du har valgt eller generert bilde."}
                </div>

                {coverImageUrl?.trim() ? (
                  <div style={{ marginTop: 10 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={coverImageUrl}
                      alt={locale === "en" ? "Cover preview" : "Forhåndsvisning av forside"}
                      style={{
                        width: "100%",
                        maxWidth: previewW,
                        height: previewH,
                        objectFit: "cover",
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        display: "block",
                      }}
                    />
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                      {locale === "en"
                        ? `Preview in ${coverImageFormat}. Source: ${coverImageSource === "ai" ? "AI" : "upload"}.`
                        : `Forhåndsvisning i ${coverImageFormat}. Kilde: ${coverImageSource === "ai" ? "AI" : "opplasting"}.`}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 10,
                      width: "100%",
                      maxWidth: previewW,
                      height: previewH,
                      border: "1px dashed #bbb",
                      borderRadius: 10,
                      display: "grid",
                      placeItems: "center",
                      color: "#777",
                      fontSize: 12,
                      background: "#fff",
                    }}
                  >
                    {locale === "en" ? "No image selected yet (16:9)." : "Ingen bilde valgt ennå (16:9)."}
                  </div>
                )}
              </div>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>
                {locale === "en" ? "Text type" : "Teksttype"}
              </div>
              <input
                value={textType}
                onChange={(e) => setTextType(e.target.value)}
                style={{ padding: "10px 12px" }}
                placeholder={locale === "en" ? "e.g. article, email, dialogue…" : "f.eks. artikkel, e-post, dialog…"}
              />
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {locale === "en"
                  ? "Used for metadata and library filtering. Keep topic separate."
                  : "Brukes som metadata (filtrering i bibliotek). Hold topic separat."}
              </div>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.topic")}</div>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                style={{ padding: "10px 12px" }}
                placeholder={
                  locale === "en"
                    ? "Optional. Leave empty to avoid showing the AI prompt."
                    : "Valgfritt. La stå tomt for å unngå at KI-prompt vises."
                }
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.tags")}</div>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                style={{ padding: "10px 12px" }}
                placeholder={t("placeholders.tags")}
              />
              <div style={{ fontSize: 12, opacity: 0.7 }}>{t("fields.tagsHelp")}</div>
            </label>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 800 }}>{t("fields.language")}</div>
                <input
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={{ padding: "10px 12px" }}
                  placeholder={t("placeholders.language")}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 800 }}>{t("fields.estimatedMinutes")}</div>
                <input
                  type="number"
                  min={1}
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                  style={{ padding: "10px 12px" }}
                />
              </label>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.releaseMode")}</div>
              <select
                value={releaseMode}
                onChange={(e) => setReleaseMode(normalizeReleaseMode(e.target.value))}
                style={{ padding: "10px 12px" }}
              >
                <option value="ALL_AT_ONCE">{t("releaseModes.allAtOnce")}</option>
                <option value="TEXT_FIRST">{t("releaseModes.textFirst")}</option>
              </select>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{t("fields.releaseModeHelp")}</div>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.status")}</div>
              <select
                value={status}
                onChange={(e) => setStatus(normalizeStatus(e.target.value))}
                style={{ padding: "10px 12px" }}
              >
                <option value="draft">{t("statuses.draft")}</option>
                <option value="published">{t("statuses.published")}</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.text")}</div>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={10}
                style={{ padding: "10px 12px", width: "100%" }}
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

        <section style={{ marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 900 }}>{t("tasks.title")}</h2>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => addTask("truefalse")} style={{ padding: "8px 10px" }}>
                {t("tasks.add.trueFalse")}
              </button>
              <button onClick={() => addTask("mcq")} style={{ padding: "8px 10px" }}>
                {t("tasks.add.mcq")}
              </button>
              <button onClick={() => addTask("open")} style={{ padding: "8px 10px" }}>
                {t("tasks.add.open")}
              </button>
            </div>
          </div>

          {sortedTasks.length === 0 ? (
            <p style={{ opacity: 0.7, marginTop: 8 }}>{t("tasks.empty")}</p>
          ) : (
            <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
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
                        <button onClick={() => moveTask(task.id, -1)} disabled={idx === 0}>
                          ↑
                        </button>
                        <button onClick={() => moveTask(task.id, +1)} disabled={idx === sortedTasks.length - 1}>
                          ↓
                        </button>
                        <button onClick={() => removeTask(task.id)} title={t("tasks.deleteTitle")}>
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
                      style={{ padding: "10px 12px", width: "100%" }}
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
                          style={{ padding: "10px 12px", width: "100%" }}
                        />
                      </label>

                      <label style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 800 }}>{t("mcq.correctAnswer")}</div>
                        <input
                          value={typeof task.correctAnswer === "string" ? task.correctAnswer : ""}
                          onChange={(e) => updateTask(task.id, { correctAnswer: e.target.value })}
                          style={{ padding: "10px 12px" }}
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
                          style={{ padding: "10px 12px" }}
                        >
                          <option value="true">{t("answers.true")}</option>
                          <option value="false">{t("answers.false")}</option>
                        </select>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{t("tf.tip")}</div>
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
                          style={{ padding: "10px 12px" }}
                        >
                          <option value="short">{t("answerSpace.short")}</option>
                          <option value="medium">{t("answerSpace.medium")}</option>
                          <option value="long">{t("answerSpace.long")}</option>
                        </select>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{t("open.answerSpaceHelp")}</div>
                      </label>

                      <div style={{ fontSize: 13, opacity: 0.75 }}>{t("open.hint")}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 12, opacity: 0.75 }}>
            {t("footerRemember")} <b>{t("buttons.save")}</b>.
          </div>
        </section>
      </main>

      <div
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 16,
          zIndex: 1000,
          pointerEvents: "none",
        }}
      >
        <button
          onClick={saveAndGoToMyContent}
          disabled={saving}
          style={{
            pointerEvents: "auto",
            padding: "12px 16px",
            borderRadius: 14,
            border: "1px solid #86efac",
            background: "#9db9a7",
            color: "white",
            fontWeight: 900,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.92 : 1,
            boxShadow: "0 10px 24px rgba(22,163,74,0.28)",
            whiteSpace: "nowrap",
          }}
          title={t("buttons.saveToMyContent")}
        >
          {saving ? t("buttons.saving") : t("buttons.saveToMyContent")}
        </button>
      </div>
    </>
  );
}