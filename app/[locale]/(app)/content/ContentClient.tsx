// app\[locale]\(app)\content\ContentClient.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import QRCode from "qrcode";

import { db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { loadMyContent, type ContentItem } from "@/lib/contentFeed";
import ActionMenu, { type ActionItem } from "@/components/ActionMenu";
import { authedPost } from "@/lib/authedPost";
import { useLocale, useTranslations } from "next-intl";
import { getOrigin } from "@/lib/url";

type LessonStatus = "draft" | "published";
type FilterType = "all" | "library" | "math" | "lesson" | "submission" | "space";
type SharePreset = "example1" | "example2" | "example3" | "example4" | "example5" | "example6";
type ShareTone = "short" | "professional" | "friendly";

type AssignmentDoc = {
  title?: string;
  status?: string;
  archived?: boolean;
  updatedAt?: unknown;
  level?: string;
  language?: string;
  [k: string]: unknown;
};

type ParentSpaceSubmissionDoc = {
  uid?: string;
  status?: string;
  aiFeedback?: string | null;
  auto?: {
    score?: number;
    maxScore?: number;
    correctCount?: number;
    totalAutoGraded?: number;
  };
  [k: string]: unknown;
};

type ParentSpaceMeta = {
  lessonCount: number;
  submittedCount: number;
  draftCount: number;
  aiFeedbackCount: number;
  reviewCount: number;
  activeLessonTitle: string | null;
  activeSubmissionStatus: string | null;
};

type LooseT = (key: string, values?: Record<string, unknown>) => string;

function fmtDate(d: Date | null | undefined, locale: string) {
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nb-NO", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}


function authorNameFromItem(it: ContentItem): string | null {
  return safeString((it as { authorName?: unknown }).authorName) || null;
}

function buildParentSubmissionId(spaceId: string, assignmentId: string, uid: string) {
  return `${spaceId}_${assignmentId}_${uid}`;
}

function pickVisibility(v: unknown): "public" | "unlisted" | "private" {
  return v === "unlisted" || v === "private" || v === "public" ? v : "public";
}

function StatusPill({
  label,
  variant,
}: {
  label: string;
  variant: "green" | "red" | "gray" | "amber";
}) {
  const dot =
    variant === "green"
      ? "bg-green-500"
      : variant === "red"
        ? "bg-red-500"
        : variant === "amber"
          ? "bg-amber-500"
          : "bg-zinc-400";

  const ring =
    variant === "green"
      ? "border-green-200 bg-green-50 text-green-800"
      : variant === "red"
        ? "border-red-200 bg-red-50 text-red-800"
        : variant === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-zinc-200 bg-zinc-50 text-zinc-800";

  return (
    <span
      className={[
        "inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border px-3 py-1",
        "text-xs font-extrabold",
        "whitespace-normal break-words",
        ring,
      ].join(" ")}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 break-words">{label}</span>
    </span>
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={[
        "inline-flex items-center justify-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-extrabold",
        "bg-white text-slate-800 hover:bg-zinc-50 active:bg-zinc-100",
        "disabled:cursor-not-allowed disabled:opacity-50",
        props.className || "",
      ].join(" ")}
    />
  );
}

function DangerButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <PrimaryButton
      {...props}
      className={[
        "border-red-200 text-red-700 hover:bg-red-50 active:bg-red-100",
        props.className || "",
      ].join(" ")}
    />
  );
}

function SuccessButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <PrimaryButton
      {...props}
      className={[
        "border-green-200 text-green-800 hover:bg-green-50 active:bg-green-100",
        props.className || "",
      ].join(" ")}
    />
  );
}

function GhostLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      className={[
        "inline-flex items-center justify-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-extrabold",
        "bg-white text-slate-800 hover:bg-zinc-50 active:bg-zinc-100",
        props.className || "",
      ].join(" ")}
    />
  );
}

function lastIdBits(id?: string) {
  if (!id) return "";
  return id.length > 6 ? id.slice(-4) : id;
}

function lessonTitleFromMeta(meta?: string[]) {
  if (!meta?.length) return "";
  const m = meta.find((x) => typeof x === "string" && x.startsWith("Lesson: "));
  return m ? m.replace("Lesson: ", "").trim() : "";
}

function getDeletedAt(it: ContentItem): Date | null {
  const anyIt = it as unknown as { deletedAt?: Date | null };
  return anyIt.deletedAt ?? null;
}

function isDeletedItem(it: ContentItem): boolean {
  return !!getDeletedAt(it);
}

function isReadingTestLesson(it: ContentItem) {
  return it.type === "lesson" && (it.meta ?? []).includes("reading_test");
}

function normalizedMetaSet(it: ContentItem) {
  return new Set((it.meta ?? []).map((m) => String(m).trim().toLowerCase()).filter(Boolean));
}

function normalizedLessonSignals(it: ContentItem) {
  if (it.type !== "lesson") return [];

  const lesson = it as Extract<ContentItem, { type: "lesson" }>;

  return [lesson.lessonType, lesson.textType, lesson.texttype]
    .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
    .filter(Boolean);
}

function isMathContent(it: ContentItem) {
  const meta = normalizedMetaSet(it);
  const lessonSignals = normalizedLessonSignals(it);

  const exactMathTags = new Set([
    "math",
    "math_worksheet",
    "math-generator",
    "math_generator",
    "geometry",
    "geometry_worksheet",
    "algebra",
    "fractions",
    "percent",
    "equations",
    "measurement",
  ]);

  for (const tag of meta) {
    if (exactMathTags.has(tag)) return true;
  }

  for (const signal of lessonSignals) {
    if (exactMathTags.has(signal)) return true;
  }

  return false;
}

function isMathArchiveItem(it: ContentItem) {
  return it.type === "lesson" && isMathContent(it);
}

function getMathSubtype(it: ContentItem): string | null {
  const meta = normalizedMetaSet(it);
  const lessonSignals = normalizedLessonSignals(it);
  const all = new Set<string>([...meta, ...lessonSignals]);

  if (all.has("geometry") || all.has("geometry_worksheet")) return "geometry";
  if (all.has("algebra")) return "algebra";
  if (all.has("fractions")) return "fractions";
  if (all.has("percent")) return "percent";
  if (all.has("equations")) return "equations";
  if (all.has("measurement")) return "measurement";
  if (
    all.has("math") ||
    all.has("math_worksheet") ||
    all.has("math-generator") ||
    all.has("math_generator")
  ) {
    return "math";
  }

  return null;
}

type LoadMyContentArgs = {
  db: typeof db;
  uid: string | null;
  isAnon: boolean;
  mode: "student" | "teacher";
};

export default function ContentClient() {
  const router = useRouter();
  const { user, profile } = useUserProfile();

  const isAuthReady = user !== undefined;
  const isAnon = !!user?.isAnonymous;
  const uid = user?.uid ?? null;

  type AppRole = "student" | "teacher" | "parent" | "admin" | "creator";
  const role: AppRole = isAnon ? "student" : (profile?.role as AppRole) || "student";
  const isTeacher = role === "teacher";
  const isParent = role === "parent";
  const isStudent = role === "student";

  const contentMode: "student" | "teacher" = isTeacher ? "teacher" : "student";
  const isTeacherApproved = isTeacher;

  const t = useTranslations("content");
  const tLoose = t as unknown as LooseT;
  const locale = useLocale();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [busyByKey, setBusyByKey] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [showDeleted, setShowDeleted] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareTitle, setShareTitle] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareText, setShareText] = useState("");
  const [shareTone, setShareTone] = useState<ShareTone>("professional");
  const [sharePreset, setSharePreset] = useState<SharePreset>("example1");
  const [shareKind, setShareKind] = useState<"lesson" | "space" | "generic">("generic");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiVariants, setAiVariants] = useState<string[]>([]);

  const [pickSpaceOpen, setPickSpaceOpen] = useState(false);
  const [pickLesson, setPickLesson] = useState<{
    lessonId: string;
    title: string;
    sourceType: "myContent" | "library";
    sourceId: string;
  } | null>(null);

  const [parentSpaceMeta, setParentSpaceMeta] = useState<Record<string, ParentSpaceMeta>>({});

  const mySpaces = useMemo(() => items.filter((x) => x.type === "space"), [items]);

  function safeMsg(key: string, fallback: string, values?: Record<string, unknown>) {
    try {
      return tLoose(key, values);
    } catch {
      return fallback;
    }
  }

  function getSharePresetText(preset: SharePreset) {
    return safeMsg(`share.examples.${preset}.text`, "");
  }

  function getSharePresetLabel(preset: SharePreset) {
    return safeMsg(`share.examples.${preset}.label`, preset);
  }

  function applySharePreset(preset: SharePreset) {
    setSharePreset(preset);
    setShareText(getSharePresetText(preset));
  }

  function setBusy(key: string, v: boolean) {
    setBusyByKey((m) => ({ ...m, [key]: v }));
  }

  function stripLeadingLocale(path: string) {
    const m = path.match(/^\/([a-z]{2})(\/|$)/i);
    if (!m) return path;
    return path.replace(/^\/[a-z]{2}(?=\/|$)/i, "");
  }

  function normalizeInternalHref(href: string) {
    if (/^https?:\/\//i.test(href)) return href;
    if (!href.startsWith("/")) href = `/${href}`;
    const noLocale = stripLeadingLocale(href);
    return `/${locale}${noLocale}`;
  }

  function readingTestPlayHref(lessonId: string) {
    return `/${locale}/reading-tests/${lessonId}`;
  }

  function lessonOpenHref(it: Extract<ContentItem, { type: "lesson" }>) {
    if (isReadingTestLesson(it)) {
      return readingTestPlayHref(it.id);
    }
    const pid = it.activePublishedId || it.id;
    return `/${locale}/student/lesson/${pid}`;
  }

  function lessonEditHref(it: Extract<ContentItem, { type: "lesson" }>) {
    if (isReadingTestLesson(it)) {
      return `/${locale}/producer/reading-tests/${it.id}`;
    }
    return `/${locale}/producer/${it.id}`;
  }

  function spaceBoardHref(spaceId: string) {
    if (role === "teacher") return `/${locale}/teacher/spaces/${spaceId}/board`;
    return `/${locale}/student/spaces/${spaceId}/board`;
  }

  function itemOpenHref(it: ContentItem) {
    switch (it.type) {
      case "lesson":
        return lessonOpenHref(it);
      case "submission":
        return normalizeInternalHref(it.href);
      case "space":
        if (role === "teacher") return `/${locale}/teacher/spaces/${it.id}`;
        if (role === "parent") return `/${locale}/parent/spaces/${it.id}`;
        return `/${locale}/student/spaces/${it.id}`;
      default: {
        const anyIt = it as unknown as { href?: string };
        return normalizeInternalHref(anyIt.href || `/${locale}/content`);
      }
    }
  }

  function isLibraryPractice(it: ContentItem) {
    return it.type === "submission" && (it.meta ?? []).includes("practice");
  }

  function isTeacherSpaceSubmission(it: ContentItem) {
    if (it.type !== "submission") return false;
    const s = it as Extract<ContentItem, { type: "submission" }>;
    return !!s.spaceId || (s.meta ?? []).some((m) => typeof m === "string" && m.startsWith("space:"));
  }

  function mathSubtypeLabel(subtype: string | null) {
    if (!subtype) return null;
    return t(`math.subtypes.${subtype}`);
  }

  function cardTypeLabel(it: ContentItem): string {
    if (it.type === "space") return safeMsg("cardTypes.space", "Space");

    if (it.type === "submission") {
      if (isLibraryPractice(it)) return safeMsg("cardTypes.fromLibrary", "Fra bibliotek");
      if (isTeacherSpaceSubmission(it)) return safeMsg("cardTypes.spaceSubmission", "Innsendt i space");
      return safeMsg("cardTypes.submission", "Innsendt oppgave");
    }

    if (it.type === "lesson") {
      if (isMathContent(it)) return safeMsg("cardTypes.mathWorksheet", "Matteoppgave");
      if (isReadingTestLesson(it)) return safeMsg("cardTypes.readingTest", "Lesetest");
      return safeMsg("cardTypes.ownGenerated", "Egen generert");
    }

    return safeMsg("cardTypes.content", "Innhold");
  }

  function parentChildProgressLabel(status: string | null) {
    const s = String(status ?? "").trim().toLowerCase();

    if (s === "submitted" || s === "reviewed" || s === "approved") {
      return t("parentSpace.progress.completed");
    }

    if (s === "draft" || s === "needs_work") {
      return t("parentSpace.progress.started");
    }

    return t("parentSpace.progress.notStarted");
  }

  function parentChildProgressVariant(status: string | null): "green" | "amber" | "gray" {
    const s = String(status ?? "").trim().toLowerCase();

    if (s === "submitted" || s === "reviewed" || s === "approved") return "green";
    if (s === "draft" || s === "needs_work") return "amber";
    return "gray";
  }

  const titleForCard = useCallback(
    (it: ContentItem) => {
      const raw = (it.title || "").trim();
      if (raw && raw.toLowerCase() !== "untitled") return raw;

      if (it.type === "submission") {
        const s = it as Extract<ContentItem, { type: "submission" }>;
        const lt = lessonTitleFromMeta(s.meta);
        if (lt) return t("titles.submissionWithLesson", { lessonTitle: lt });
        if (s.lessonId) return t("titles.submissionWithId", { id: lastIdBits(s.lessonId) });
        return t("titles.submission");
      }

      if (it.type === "space") return t("titles.space");
      return t("titles.lesson");
    },
    [t]
  );

  function buildSpaceShareText(it: Extract<ContentItem, { type: "space" }>) {
    const title = titleForCard(it);
    const code = it.joinCode ? it.joinCode.trim() : "";

    if (locale === "nb") {
      return code
        ? `Bli med i "${title}".\n\nBruk koden: ${code}`
        : `Bli med i "${title}".`;
    }

    if (locale === "pt") {
      return code
        ? `Entre em "${title}".\n\nUse o código: ${code}`
        : `Entre em "${title}".`;
    }

    return code ? `Join "${title}".\n\nUse code: ${code}` : `Join "${title}".`;
  }

  async function refresh() {
    if (!uid) {
      setItems([]);
      setNotes([]);
      setWarnings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setWarnings([]);
    setErr(null);

    try {
      const args: LoadMyContentArgs = { db, mode: contentMode, uid, isAnon };
      const res = await loadMyContent(args as unknown as Parameters<typeof loadMyContent>[0]);
      setItems(res.items);
      setNotes(res.notes);
      setWarnings(res.warnings);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthReady, uid, isAnon, role]);

  useEffect(() => {
    if (!isParent || !uid || mySpaces.length === 0) {
      setParentSpaceMeta({});
      return;
    }

    const allUnsubs: Array<() => void> = [];

    for (const s of mySpaces) {
      const spaceId = s.id;
      const lessonState: Record<string, { status: string | null; hasAi: boolean }> = {};
      const reviewState: Record<string, boolean> = {};
      const innerUnsubs: Array<() => void> = [];

      const push = (
        lessonCount: number,
        activeLessonTitle: string | null,
        activeLessonId: string | null
      ) => {
        const submittedCount = Object.values(lessonState).filter((x) => {
          const st = String(x.status ?? "").toLowerCase();
          return st === "submitted" || st === "reviewed" || st === "approved";
        }).length;

        const draftCount = Object.values(lessonState).filter((x) => {
          const st = String(x.status ?? "").toLowerCase();
          return st === "draft" || st === "needs_work";
        }).length;

        const aiFeedbackCount = Object.values(lessonState).filter((x) => x.hasAi).length;
        const reviewCount = Object.values(reviewState).filter(Boolean).length;
        const activeSubmissionStatus = activeLessonId ? lessonState[activeLessonId]?.status ?? null : null;

        setParentSpaceMeta((old) => ({
          ...old,
          [spaceId]: {
            lessonCount,
            submittedCount,
            draftCount,
            aiFeedbackCount,
            reviewCount,
            activeLessonTitle,
            activeSubmissionStatus,
          },
        }));
      };

      const lessonsQuery = query(
        collection(db, "spaces", spaceId, "lessons"),
        orderBy("updatedAt", "desc")
      );

      const unsubLessons = onSnapshot(
        lessonsQuery,
        (snap) => {
          innerUnsubs.forEach((u) => u());
          innerUnsubs.length = 0;

          Object.keys(lessonState).forEach((k) => delete lessonState[k]);
          Object.keys(reviewState).forEach((k) => delete reviewState[k]);

          const lessons: Array<{ id: string; data: AssignmentDoc }> = [];
          snap.forEach((d) => {
            lessons.push({ id: d.id, data: d.data() as AssignmentDoc });
          });

          const activeLessonId =
            ((s as unknown as { activeLessonId?: string }).activeLessonId ?? null) || null;

          const activeLessonTitle =
            ((s as unknown as { activeLessonTitle?: string }).activeLessonTitle ?? null) ||
            (activeLessonId ? lessons.find((x) => x.id === activeLessonId)?.data.title ?? null : null);

          push(lessons.length, activeLessonTitle, activeLessonId);

          for (const lesson of lessons) {
            const submissionId = buildParentSubmissionId(spaceId, lesson.id, uid);

            const unsubSubmission = onSnapshot(
              doc(db, "spaces", spaceId, "lessons", lesson.id, "submissions", submissionId),
              (submissionSnap) => {
                if (!submissionSnap.exists()) {
                  lessonState[lesson.id] = { status: null, hasAi: false };
                } else {
                  const data = submissionSnap.data() as ParentSpaceSubmissionDoc;
                  lessonState[lesson.id] = {
                    status: safeString(data.status),
                    hasAi: !!safeString(data.aiFeedback),
                  };
                }

                push(lessons.length, activeLessonTitle, activeLessonId);
              },
              () => { }
            );

            const unsubReview = onSnapshot(
              doc(db, "spaces", spaceId, "lessons", lesson.id, "parentReviews", uid),
              (reviewSnap) => {
                reviewState[lesson.id] = reviewSnap.exists();
                push(lessons.length, activeLessonTitle, activeLessonId);
              },
              () => { }
            );

            innerUnsubs.push(unsubSubmission, unsubReview);
          }
        },
        () => { }
      );

      allUnsubs.push(unsubLessons);
      allUnsubs.push(() => innerUnsubs.forEach((u) => u()));
    }

    return () => {
      allUnsubs.forEach((u) => u());
    };
  }, [isParent, uid, mySpaces, t]);

  const emptyHint = useMemo(() => {
    if (isAnon) {
      return (
        <>
          <p className="opacity-85">{t("empty.guest.line1")}</p>
          <p className="opacity-85">
            {t.rich("empty.guest.line2", {
              join: (chunks) => (
                <Link href={`/${locale}/join`} className="underline">
                  {chunks}
                </Link>
              ),
              login: (chunks) => (
                <Link href={`/${locale}/login`} className="underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </>
      );
    }
    return <p className="opacity-85">{t("empty.authed")}</p>;
  }, [isAnon, t, locale]);

  async function openShareModal(opts: {
    title: string;
    url: string;
    text?: string;
    kind?: "lesson" | "space" | "generic";
    lesson?: Extract<ContentItem, { type: "lesson" }> | null;
    tone?: ShareTone;
  }) {
    const defaultPreset: SharePreset = "example1";

    setCopied(false);
    setCopiedText(false);
    setQrDataUrl("");
    setShareTitle(opts.title);
    setShareUrl(opts.url);
    setShareText(opts.text || getSharePresetText(defaultPreset));
    setShareKind(opts.kind || "generic");
    setShareTone(opts.tone || "professional");
    setSharePreset(defaultPreset);
    setAiBusy(false);
    setAiError(null);
    setAiVariants([]);
    setShareOpen(true);

    try {
      const dataUrl = await QRCode.toDataURL(opts.url, {
        margin: 1,
        scale: 7,
        errorCorrectionLevel: "M",
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl("");
    }
  }

  function closeShare() {
    setShareOpen(false);
    setShareTitle("");
    setShareUrl("");
    setShareText("");
    setShareTone("professional");
    setSharePreset("example1");
    setShareKind("generic");
    setQrDataUrl("");
    setCopied(false);
    setCopiedText(false);
    setAiBusy(false);
    setAiError(null);
    setAiVariants([]);
  }

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 1200);
    } catch {
      setCopiedText(false);
    }
  }

  async function generateShareTextAI() {
    if (!shareTitle) return;

    setAiBusy(true);
    setAiError(null);

    try {
      const res = await authedPost<{ variants?: string[] }>("/api/ai/share-text", {
        title: shareTitle,
        tone: shareTone,
        locale,
        kind: shareKind,
        url: shareUrl,
      });

      if (res?.variants?.length) {
        setAiVariants(res.variants);
        setShareText(res.variants[0]);
      } else {
        throw new Error("No variants returned");
      }
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : safeMsg("errors.aiShareFailed", "AI failed"));
    } finally {
      setAiBusy(false);
    }
  }

  const facebookShareHref = useMemo(() => {
    return shareUrl
      ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
      : "#";
  }, [shareUrl]);

  const linkedInShareHref = useMemo(() => {
    return shareUrl
      ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
      : "#";
  }, [shareUrl]);

  async function openShareForLesson(it: Extract<ContentItem, { type: "lesson" }>) {
    let url = "";
    const title = titleForCard(it);

    if (isReadingTestLesson(it)) {
      url = `${getOrigin()}/${locale}/reading-tests/${it.id}`;
    } else {
      let pid = it.activePublishedId || it.id;

      if (!it.activePublishedId) {
        try {
          const snap = await getDoc(doc(db, "lessons", it.id));
          const dUnknown = snap.data() as unknown;
          const d = isRecord(dUnknown) ? dUnknown : {};
          if (typeof d.activePublishedId === "string" && d.activePublishedId) {
            pid = d.activePublishedId;
          }
        } catch {
          // ignore
        }
      }

      url = `${getOrigin()}/${locale}/share/lesson/${pid}`;
    }

    await openShareModal({
      title,
      url,
      text: getSharePresetText("example1"),
      kind: "lesson",
      lesson: it,
      tone: "professional",
    });
  }

  async function openShareForSpace(it: Extract<ContentItem, { type: "space" }>) {
    const code = it.joinCode ? encodeURIComponent(it.joinCode) : "";
    const url = code
      ? `${getOrigin()}/${locale}/join?code=${code}`
      : `${getOrigin()}${itemOpenHref(it)}`;

    await openShareModal({
      title: titleForCard(it),
      url,
      text: buildSpaceShareText(it),
      kind: "space",
      lesson: null,
      tone: "professional",
    });
  }

  function openPickSpace(opts: {
    lessonId: string;
    title: string;
    sourceType: "myContent" | "library";
    sourceId: string;
  }) {
    setPickLesson(opts);
    setPickSpaceOpen(true);
  }

  function closePickSpace() {
    setPickSpaceOpen(false);
    setPickLesson(null);
  }

  async function assignLessonToSpace(spaceId: string) {
    if (!pickLesson) return;

    const key = `shareToSpace:${spaceId}:${pickLesson.sourceType}:${pickLesson.sourceId}`;
    setErr(null);
    setBusy(key, true);

    try {
      const apiPath =
        role === "parent"
          ? `/api/parent/spaces/${spaceId}/assign`
          : `/api/teacher/spaces/${spaceId}/assign`;

      await authedPost(apiPath, {
        sourceType: pickLesson.sourceType,
        sourceId: pickLesson.sourceId,
        title: pickLesson.title || t("fallback.untitledTask"),
      });

      closePickSpace();

      if (role === "parent") {
        router.push(`/${locale}/parent/spaces/${spaceId}`);
      } else {
        router.push(`/${locale}/teacher/spaces/${spaceId}`);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("errors.assignFailed"));
    } finally {
      setBusy(key, false);
    }
  }

  async function setPublished(lessonId: string, nextPublished: boolean) {
    const key = `lesson:${lessonId}`;
    setErr(null);
    setBusy(key, true);

    try {
      const lessonRef = doc(db, "lessons", lessonId);
      const lessonSnap = await getDoc(lessonRef);
      if (!lessonSnap.exists()) throw new Error(t("errors.lessonNotFound"));

      const dataUnknown = lessonSnap.data() as unknown;
      const data = isRecord(dataUnknown) ? dataUnknown : {};

      if ((data as { deletedAt?: unknown }).deletedAt) {
        throw new Error(t("errors.cannotPublishDeleted"));
      }

      if (nextPublished) {
        const publishObj = isRecord((data as { publish?: unknown }).publish)
          ? (data as { publish?: Record<string, unknown> }).publish
          : undefined;
        const vis = pickVisibility(publishObj?.visibility);

        const resp = await authedPost<{
          publishedId?: string;
          publishedLessonId?: string;
          id?: string;
        }>("/api/publish", {
          id: lessonId,
          visibility: vis,
        });

        const publishedId = resp.publishedId || resp.publishedLessonId || resp.id || lessonId;

        await updateDoc(lessonRef, {
          status: "published",
          activePublishedId: publishedId,
          updatedAt: serverTimestamp(),
        });
      } else {
        const publishedId =
          typeof (data as { activePublishedId?: unknown }).activePublishedId === "string" &&
            (data as { activePublishedId?: string }).activePublishedId
            ? (data as { activePublishedId?: string }).activePublishedId!
            : lessonId;

        await authedPost("/api/unpublish", { id: publishedId, draftId: lessonId });

        await updateDoc(lessonRef, {
          status: "draft",
          activePublishedId: null,
          updatedAt: serverTimestamp(),
        });
      }

      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("errors.publishFailed"));
      await refresh();
    } finally {
      setBusy(key, false);
    }
  }

  async function deleteLessonSoft(lessonId: string, title: string) {
    const msg = t("confirm.deleteLesson", { title: title ? `: "${title}"` : "" });
    const ok = confirm(msg);
    if (!ok) return;

    const key = `lesson:${lessonId}`;
    setErr(null);
    setBusy(key, true);

    try {
      try {
        const snap = await getDoc(doc(db, "lessons", lessonId));
        const dUnknown = snap.data() as unknown;
        const d = isRecord(dUnknown) ? dUnknown : {};
        const publishedId =
          typeof (d as { activePublishedId?: unknown }).activePublishedId === "string" &&
            (d as { activePublishedId?: string }).activePublishedId
            ? (d as { activePublishedId?: string }).activePublishedId!
            : lessonId;

        await authedPost("/api/unpublish", { id: publishedId, draftId: lessonId });
      } catch {
        // ignore
      }

      await updateDoc(doc(db, "lessons", lessonId), {
        status: "draft",
        activePublishedId: null,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("errors.deleteFailed"));
    } finally {
      setBusy(key, false);
    }
  }


  async function deleteSubmissionFromArchive(submissionId: string, title: string) {
    const msg = t("confirm.deleteSubmission", {
      title: title ? `: "${title}"` : "",
    });

    const ok = confirm(msg);
    if (!ok) return;

    const key = `submission:${submissionId}`;

    setErr(null);
    setBusy(key, true);

    try {
      await authedPost("/api/content/archive-submission", {
        submissionId,
      });

      await refresh();
    } catch (e: unknown) {
      setErr(
        e instanceof Error
          ? e.message
          : t("errors.deleteSubmissionFailed")
      );
    } finally {
      setBusy(key, false);
    }
  }

  async function restoreLesson(lessonId: string, title: string) {
    const msg = t("confirm.restoreLesson", { title: title ? `: "${title}"` : "" });
    const ok = confirm(msg);
    if (!ok) return;

    const key = `lesson:${lessonId}`;
    setErr(null);
    setBusy(key, true);

    try {
      await updateDoc(doc(db, "lessons", lessonId), {
        deletedAt: null,
        updatedAt: serverTimestamp(),
      });
      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("errors.restoreFailed"));
    } finally {
      setBusy(key, false);
    }
  }

  async function copyText(txt: string) {
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      // ignore
    }
  }

  async function openMathAttemptFromLesson(lessonId: string) {
    const key = `openMath:${lessonId}`;
    setErr(null);
    setBusy(key, true);

    try {
      const snap = await getDoc(doc(db, "lessons", lessonId));
      if (!snap.exists()) throw new Error("Math worksheet not found");

      const rawUnknown = snap.data() as unknown;
      const raw = isRecord(rawUnknown) ? rawUnknown : {};

      const mathType =
        safeString(raw.mathType) ||
        safeString(raw.contentType) ||
        "";

      const isFractionWorksheet =
        mathType === "fractions" ||
        mathType === "fraction_worksheet" ||
        isRecord(raw.fractionWorksheet);

      const worksheet = isFractionWorksheet
        ? raw.fractionWorksheet ?? raw.mathWorksheet
        : raw.mathWorksheet;

      if (!worksheet || typeof worksheet !== "object") {
        throw new Error("Missing math worksheet");
      }

      if (isFractionWorksheet) {
        router.push(`/${locale}/student/lesson/${lessonId}`);
        return;
      }

      const res = await authedPost<{ ok?: boolean; id?: string }>(
        "/api/math/geometry/save-attempt",
        {
          worksheet,
          answersByTaskId: {},
          auto: null,
          aiFeedback: null,
        }
      );

      if (!res?.id) {
        throw new Error("Attempt was created without id");
      }

      router.push(`/${locale}/math/geometry/attempts/${res.id}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to open math attempt");
    } finally {
      setBusy(key, false);
    }
  }

  function cleanMetaForCard(it: ContentItem): string {
    const meta = it.meta?.filter(Boolean) ?? [];
    const hasLessonTitle = meta.some((m) => typeof m === "string" && m.startsWith("Lesson: "));
    const mathUiTags = new Set([
      "math",
      "math_worksheet",
      "math-generator",
      "math_generator",
      "geometry",
      "geometry_worksheet",
      "algebra",
      "fractions",
      "percent",
      "equations",
      "measurement",
      "reading_test",
      "practice",
    ]);

    const filteredMeta = meta.filter((m) => {
      if (typeof m !== "string") return false;
      if (hasLessonTitle && m.startsWith("lesson:")) return false;
      if (m.startsWith("space:")) return false;
      if (mathUiTags.has(m.trim().toLowerCase())) return false;
      return true;
    });

    return filteredMeta.join(" · ");
  }

  function submissionPdfHref(ss: Extract<ContentItem, { type: "submission" }>) {
    const lessonId =
      typeof (ss as { lessonId?: unknown }).lessonId === "string"
        ? (ss as { lessonId?: string }).lessonId
        : "";

    const sourceId =
      typeof (ss as { sourceId?: unknown }).sourceId === "string"
        ? (ss as { sourceId?: string }).sourceId
        : "";

    const publishedLessonId =
      typeof (ss as { publishedLessonId?: unknown }).publishedLessonId === "string"
        ? (ss as { publishedLessonId?: string }).publishedLessonId
        : "";

    const id = lessonId || sourceId || publishedLessonId;

    if (!id) return itemOpenHref(ss);

    const isMath = isMathContent(ss);

    return isMath
      ? `/${locale}/producer/math/${id}/print`
      : `/${locale}/producer/${id}/print`;
  }

  function buildActions(it: ContentItem): ActionItem[] {
    const key = `${it.type}:${it.id}`;
    const busy = !!busyByKey[key];

    if (isAnon) {
      return [
        {
          key: "open",
          label: t("actions.open"),
          disabled: busy,
          onClick: () => router.push(itemOpenHref(it)),
        },
      ];
    }

    if (it.type === "submission") {
      const ss = it as Extract<ContentItem, { type: "submission" }>;

      const status = (ss.status ?? "").toLowerCase();
      const isReviewed =
        status === "reviewed" || status === "approved";

      const canEditSubmission =
        role === "student" &&
        !isReviewed &&
        !isTeacherSpaceSubmission(ss);

      const canShareSubmissionToSpace =
        (isTeacher || isParent) &&
        mySpaces.length > 0 &&
        !!ss.lessonId &&
        !isTeacherSpaceSubmission(ss);

      const publishedShareId =
        typeof (ss as { publishedLessonId?: unknown }).publishedLessonId === "string" &&
          (ss as { publishedLessonId?: string }).publishedLessonId
          ? (ss as { publishedLessonId?: string }).publishedLessonId!
          : typeof (ss as { sourceId?: unknown }).sourceId === "string" &&
            (ss as { sourceId?: string }).sourceId
            ? (ss as { sourceId?: string }).sourceId!
            : ss.lessonId || "";

      const canShareSubmissionPublic =
        isTeacher &&
        isLibraryPractice(ss) &&
        !!publishedShareId;

      const canShowEditDisabled =
        isTeacher && isLibraryPractice(ss);
      const canPdfSubmission = true;
      const pdfHref = submissionPdfHref(ss);

      return [
        {
          key: "open",
          label: t("actions.open"),
          disabled: busy,
          onClick: () => router.push(itemOpenHref(ss)),
        },
        ...(canPdfSubmission
          ? [
            {
              key: "pdf",
              label: t("actions.pdf"),
              disabled: busy,
              onClick: () => router.push(pdfHref),
            },
          ]
          : []),

        ...(canEditSubmission
          ? [
            {
              key: "edit",
              label: t("actions.editAnswers"),
              disabled: busy,
              onClick: () => router.push(itemOpenHref(ss)),
            },
          ]
          : canShowEditDisabled
            ? [
              {
                key: "edit",
                label: t("actions.edit"),
                disabled: true,
                onClick: () => { },
              },
            ]
            : []),

        ...(canShareSubmissionPublic
          ? [
            {
              key: "share",
              label: t("actions.share"),
              disabled: busy,
              onClick: () =>
                openShareModal({
                  title: titleForCard(ss),
                  url: `${getOrigin()}/${locale}/share/lesson/${publishedShareId}`,
                  text: getSharePresetText("example1"),
                  kind: "lesson",
                  tone: "professional",
                }),
            },
          ]
          : []),

        ...(canShareSubmissionToSpace
          ? [
            {
              key: "shareToSpace",
              label: t("actions.shareToSpace"),
              disabled: busy,
              onClick: () =>
                openPickSpace({
                  lessonId: ss.lessonId || "",
                  title: titleForCard(ss),
                  sourceType: isLibraryPractice(ss)
                    ? "library"
                    : "myContent",
                  sourceId: ss.lessonId || "",
                }),
            },
          ]
          : []),

        {
          key: "deleteFromArchive",
          label: t("actions.deleteFromArchive"),
          danger: true,
          disabled: busy,
          onClick: () =>
            deleteSubmissionFromArchive(
              ss.id,
              titleForCard(ss)
            ),
        },
      ];
    }

    if (it.type === "space") {
      const sp = it as Extract<ContentItem, { type: "space" }>;
      const code = sp.joinCode || "";
      const joinUrl = code ? `${getOrigin()}/${locale}/join?code=${encodeURIComponent(code)}` : "";

      const canShareSpace = role === "teacher";

      return [
        {
          key: "open",
          label: t("actions.open"),
          disabled: busy,
          onClick: () => router.push(itemOpenHref(sp)),
        },
        ...(!isParent
          ? [
            {
              key: "board",
              label: t("actions.board"),
              disabled: busy,
              onClick: () => router.push(spaceBoardHref(sp.id)),
            },
          ]
          : []),
        ...(canShareSpace && code
          ? [
            {
              key: "copyCode",
              label: t("actions.copyJoinCode"),
              disabled: busy,
              onClick: () => copyText(code),
            },
          ]
          : []),
        ...(canShareSpace
          ? [
            {
              key: "share",
              label: t("actions.shareLinkQr"),
              disabled: busy,
              onClick: () => openShareForSpace(sp),
            },
          ]
          : []),
        ...(canShareSpace && joinUrl
          ? [
            {
              key: "copyJoinLink",
              label: t("actions.copyJoinLink"),
              disabled: busy,
              onClick: () => copyText(joinUrl),
            },
          ]
          : []),
      ];
    }

    const ls = it as Extract<ContentItem, { type: "lesson" }>;
    const status = (ls.status ?? "draft") as LessonStatus;
    const isPublished = status === "published";
    const isDeleted = isDeletedItem(ls);
    const isReadingTest = isReadingTestLesson(ls);
    const isMath = isMathContent(ls);
    const mathSubtype = getMathSubtype(ls);
    const mathSubtypeText = mathSubtypeLabel(mathSubtype);

    const canPublish = isTeacherApproved && !isDeleted && !isReadingTest;
    const canDelete = (isTeacher || isParent || isStudent) && !busy;
    const canShareToSpace = mySpaces.length > 0 && (isTeacher || isParent) && !isDeleted;
    const canEdit = (isTeacher || isParent || isStudent) && !isDeleted;
    const canShareReadingTest = !isDeleted && isReadingTest && (isTeacher || isParent || isStudent);
    const canSharePublic = isTeacher && isPublished && !isDeleted && !isReadingTest;
    const canPdf = isTeacher && !isDeleted && !isReadingTest;

    const editHref = lessonEditHref(ls);
    const pdfHref = isMath
      ? `/${locale}/producer/math/${ls.id}/print`
      : `/${locale}/producer/${ls.id}/print`;
    const isMathArchive = isMathArchiveItem(ls);

    const restoreAction: ActionItem[] =
      showDeleted && isDeleted && (isTeacher || isParent)
        ? [
          {
            key: "restore",
            label: t("actions.restore"),
            disabled: busy,
            onClick: () => restoreLesson(ls.id, titleForCard(ls)),
          },
        ]
        : [];

    if (isMathArchive) {
      return [
        ...restoreAction,
        {
          key: "openMath",
          label: t("math.openDigital"),
          disabled: busy,
          onClick: () => openMathAttemptFromLesson(ls.id),
        },
        ...(canPdf
          ? [
            {
              key: "pdf",
              label:
                mathSubtypeText && mathSubtype !== "math"
                  ? `${mathSubtypeText}-PDF`
                  : t("math.pdf"),
              disabled: busy,
              onClick: () => router.push(pdfHref),
            },
          ]
          : []),
        {
          key: "delete",
          label: t("actions.delete"),
          danger: true,
          disabled: busy || !canDelete,
          onClick: () => deleteLessonSoft(ls.id, titleForCard(ls)),
        },
      ];
    }

    return [
      ...restoreAction,
      {
        key: "open",
        label: t("actions.open"),
        disabled: busy,
        onClick: () => router.push(itemOpenHref(ls)),
      },

      ...(canEdit
        ? [
          {
            key: "edit",
            label: t("actions.edit"),
            disabled: busy,
            onClick: () => router.push(editHref),
          },
        ]
        : []),

      ...(isTeacher
        ? [
          {
            key: isPublished ? "unpublish" : "publish",
            label: busy
              ? t("actions.working")
              : isPublished
                ? t("actions.unpublish")
                : t("actions.publish"),
            disabled: busy || !canPublish,
            onClick: () => setPublished(ls.id, !isPublished),
          },
        ]
        : []),

      ...((canSharePublic || canShareReadingTest)
        ? [
          {
            key: "share",
            label: t("actions.share"),
            disabled: busy,
            onClick: () => openShareForLesson(ls),
          },
        ]
        : []),

      {
        key: "shareToSpace",
        label: t("actions.shareToSpace"),
        disabled: busy || !canShareToSpace,
        onClick: () =>
          openPickSpace({
            lessonId: ls.id,
            title: titleForCard(ls),
            sourceType: "myContent",
            sourceId: ls.id,
          }),
      },

      ...(isTeacher
        ? [
          {
            key: "pdf",
            label: isMath
              ? mathSubtypeText && mathSubtype !== "math"
                ? `${mathSubtypeText}-PDF`
                : t("math.pdf")
              : t("actions.pdf"),
            disabled: busy || !canPdf,
            onClick: () => router.push(pdfHref),
          },
        ]
        : []),

      {
        key: "delete",
        label: t("actions.delete"),
        danger: true,
        disabled: busy || !canDelete,
        onClick: () => deleteLessonSoft(ls.id, titleForCard(ls)),
      },
    ];
  }

  function visibleDesktopActionKeys(it: ContentItem): string[] {
    if (it.type === "submission") {
      return [
        "open",
        "edit",
        "pdf",
        "share",
        "shareToSpace",
        "deleteFromArchive",
      ];
    }
    if (it.type === "space") return ["open", "board", "copyCode", "share", "copyJoinLink"];
    if (isMathArchiveItem(it)) return ["openMath", "pdf", "delete", "restore"];
    return ["open", "edit", "publish", "unpublish", "share", "shareToSpace", "pdf", "delete", "restore"];
  }

  function desktopActions(it: ContentItem, actions: ActionItem[]) {
    const visible = visibleDesktopActionKeys(it);
    return actions.filter((a) => visible.includes(a.key)).slice(0, 6);
  }

  function desktopOverflowActions(it: ContentItem, actions: ActionItem[]) {
    const visible = new Set(desktopActions(it, actions).map((a) => a.key));
    return actions.filter((a) => !visible.has(a.key));
  }

  const counts = useMemo(() => {
    const c = { lesson: 0, submission: 0, space: 0, library: 0, math: 0 };

    for (const it of items) {
      if (it.type === "lesson") c.lesson += 1;
      else if (it.type === "submission") {
        c.submission += 1;
        if (isLibraryPractice(it)) c.library += 1;
      } else if (it.type === "space") {
        c.space += 1;
      }

      if (isMathContent(it)) c.math += 1;
    }

    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return items
      .filter((it) => {
        if (showDeleted) return true;

        if (it.type === "submission") {
          const archived =
            (it as { archived?: boolean }).archived === true;

          if (archived) return false;
        }

        return !isDeletedItem(it);
      })
      .filter((it) => {
        if (filter === "all") return true;
        if (filter === "library") return isLibraryPractice(it);
        if (filter === "math") return isMathContent(it);
        if (filter === "lesson") return it.type === "lesson";
        if (filter === "submission") return it.type === "submission";
        if (filter === "space") return it.type === "space";
        return true;
      })
      .filter((it) => {
        if (!qq) return true;
        const tt = titleForCard(it).toLowerCase();
        const meta = (it.meta || []).join(" ").toLowerCase();
        const st = (it.status || "").toLowerCase();
        const author = authorNameFromItem(it)?.toLowerCase() || "";

        return (
          tt.includes(qq) ||
          meta.includes(qq) ||
          st.includes(qq) ||
          author.includes(qq)
        );
      })
      .slice()
      .sort((a, b) => {
        const aa = (a.updatedAt?.getTime?.() ?? 0) || 0;
        const bb = (b.updatedAt?.getTime?.() ?? 0) || 0;
        return bb - aa;
      });
  }, [items, q, filter, showDeleted, titleForCard]);

  const deletedLabel = t("labels.deleted");
  const showDeletedLabel = t("toggles.showDeleted");
  const deletedAtLabel = t("labels.deletedAt");

  function labelWithCount(ft: FilterType) {
    const label =
      ft === "all"
        ? (t("filters.all") as string)
        : ft === "library"
          ? (t("filters.library") as string)
          : ft === "math"
            ? (t("filters.math") as string)
            : ft === "lesson"
              ? (t("filters.lessons") as string)
              : ft === "submission"
                ? (t("filters.submissions") as string)
                : (t("filters.spaces") as string);

    if (ft === "lesson") return `${label} (${counts.lesson})`;
    if (ft === "submission") return `${label} (${counts.submission})`;
    if (ft === "space") return `${label} (${counts.space})`;
    if (ft === "library") return `${label} (${counts.library})`;
    if (ft === "math") return `${label} (${counts.math})`;

    return `${label} (${counts.lesson + counts.submission + counts.space})`;
  }

  const mobileFilterActions: ActionItem[] = [
    ...(["library", "math", "lesson", "submission", "space"] as const).map((ft) => ({
      key: `mobile-filter-${ft}`,
      label: labelWithCount(ft),
      onClick: () => setFilter(ft),
    })),
    {
      key: "toggle-deleted",
      label: showDeleted ? t("toggles.hideDeleted") : showDeletedLabel,
      onClick: () => setShowDeleted((v) => !v),
    },
  ];

  return (
    <main className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-4">
      <section className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="min-w-0">
            <h1 className="m-0 break-words text-2xl font-semibold text-slate-900">
              {isParent ? t("parent.title") : t("title")}
            </h1>
            <p className="mt-2 break-words text-sm text-slate-600">
              {isParent ? t("parent.subtitle") : t("subtitle")}
            </p>
          </div>
        </div>
      </section>

      <section className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-md sm:p-5">
        <div className="min-w-0">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={isParent ? t("search.parentPlaceholder") : t("search.placeholder")}
            className="block w-full max-w-full box-border rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none"
          />

          <div className="mt-3 hidden flex-wrap items-center justify-between gap-2 sm:flex">
            <div className="flex flex-wrap gap-2">
              {(["all", "library", "math", "lesson", "submission", "space"] as const).map((ft) => (
                <button
                  key={ft}
                  onClick={() => setFilter(ft)}
                  className={[
                    "rounded-full border px-3 py-2 text-sm font-extrabold",
                    filter === ft
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
                  ].join(" ")}
                  title={
                    ft === "library"
                      ? t("filterHints.library")
                      : ft === "math"
                        ? t("filterHints.math")
                        : undefined
                  }
                >
                  {labelWithCount(ft)}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-extrabold text-slate-800">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
                className="h-4 w-4"
              />
              {showDeletedLabel}
            </label>
          </div>

          <div className="mt-3 flex min-w-0 max-w-full items-center gap-2 sm:hidden">
            <button
              onClick={() => setFilter("all")}
              className={[
                "min-w-0 max-w-full flex-1 rounded-xl border px-4 py-3 text-sm font-extrabold transition-colors",
                filter === "all"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
              ].join(" ")}
            >
              <span className="truncate">{labelWithCount("all")}</span>
            </button>

            <div className="shrink-0">
              <ActionMenu items={mobileFilterActions} />
            </div>
          </div>
        </div>
      </section>

      {err ? (
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          <div className="mb-1 font-black">{t("errors.label")}</div>
          <div className="whitespace-pre-wrap">{err}</div>
        </div>
      ) : null}

      {notes.length > 0 ? (
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
          {notes.map((n) => (
            <div key={n} className="text-sm text-slate-700">
              • {n}
            </div>
          ))}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
          {warnings.map((w) => (
            <div key={w} className="text-sm text-amber-900">
              • {w}
            </div>
          ))}
        </div>
      ) : null}

      <section className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-200 p-4 shadow-md sm:p-5">
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-900">
            {isParent ? t("parent.contentTitle") : t("title")}
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {filtered.length} {t("labels.items")}
          </div>
        </div>

        <div className="mt-4 grid min-w-0 max-w-full gap-3">
          {loading ? <div className="text-sm text-slate-600">{t("states.loadingContent")}</div> : null}

          {!loading && filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-600 shadow-sm">
              {emptyHint}
            </div>
          ) : null}

          {!loading
            ? filtered.map((it) => {
              const key = `${it.type}:${it.id}`;
              const actions = buildActions(it);
              console.log("CONTENT CARD", {
                id: it.id,
                type: it.type,
                title: titleForCard(it),
                status: it.status,
                meta: it.meta,
                actions: actions.map((a) => a.key),
              });
              const desktopMainActions = desktopActions(it, actions);
              const desktopExtraActions = desktopOverflowActions(it, actions);

              const title = titleForCard(it);
              const deletedAt = getDeletedAt(it);
              const mathItem = isMathContent(it);
              const mathSubtype = getMathSubtype(it);
              const mathSubtypeText = mathSubtypeLabel(mathSubtype);

              let pill: React.ReactNode = null;

              const extraPill =
                it.type === "submission"
                  ? isLibraryPractice(it)
                    ? <StatusPill label={t("pills.library")} variant="gray" />
                    : isTeacherSpaceSubmission(it)
                      ? <StatusPill label={t("pills.teacherSubmission")} variant="gray" />
                      : null
                  : null;

              if (isDeletedItem(it)) {
                pill = <StatusPill label={deletedLabel} variant="amber" />;
              } else if (it.type === "lesson") {
                if (isReadingTestLesson(it)) {
                  pill = <StatusPill label={t("pills.readingTest")} variant="gray" />;
                } else if (isParent) {
                  pill = <StatusPill label={t("parent.shareReady")} variant="green" />;
                } else if (isMathArchiveItem(it)) {
                  pill = <StatusPill label={t("pills.readyForPdf")} variant="green" />;
                } else {
                  const s =
                    ((it.status ?? "draft") as LessonStatus) === "published"
                      ? "published"
                      : "unpublished";
                  pill =
                    s === "published" ? (
                      <StatusPill label={t("pills.published")} variant="green" />
                    ) : (
                      <StatusPill label={t("pills.unpublished")} variant="red" />
                    );
                }
              } else if (it.status) {
                pill = <StatusPill label={it.status} variant="gray" />;
              }

              const metaLine = cleanMetaForCard(it);
              const authorName = authorNameFromItem(it);
              const parentMeta = isParent && it.type === "space" ? parentSpaceMeta[it.id] : null;
              const mathHint = mathItem && it.type === "lesson" ? t("math.hint") : null;

              const cardType = cardTypeLabel(it);

              return (
                <div
                  key={key}
                  className="box-border block w-full max-w-full min-w-0 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"
                >
                  <div className="flex min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 max-w-full flex-1">
                      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                        <div className="min-w-0 max-w-full break-words text-base font-black leading-tight text-slate-900">
                          {title}
                        </div>

                        {pill}
                        {extraPill}

                        {mathItem ? (
                          <StatusPill label={t("pills.mathGenerator")} variant="amber" />
                        ) : null}

                        {mathItem && mathSubtypeText && mathSubtype !== "math" ? (
                          <StatusPill label={mathSubtypeText} variant="gray" />
                        ) : null}
                      </div>

                      <div className="mt-2 text-xs font-black uppercase tracking-wide text-slate-500">
                        {cardType}
                      </div>

                      <div className="mt-2 flex min-w-0 max-w-full flex-wrap items-center gap-2 text-xs text-slate-500">
                        {it.updatedAt ? <span>{fmtDate(it.updatedAt, locale)}</span> : null}

                        {authorName ? (
                          <>
                            <span className="opacity-60">•</span>
                            <span className="min-w-0 max-w-full break-words">
                              {t("labels.author")}: {authorName}
                            </span>
                          </>
                        ) : null}

                        {deletedAt ? (
                          <>
                            <span className="opacity-60">•</span>
                            <span>
                              {deletedAtLabel}: {fmtDate(deletedAt, locale)}
                            </span>
                          </>
                        ) : null}

                        {metaLine ? <span className="opacity-60">•</span> : null}
                        {metaLine ? <span className="min-w-0 max-w-full break-words">{metaLine}</span> : null}
                      </div>

                      {mathHint ? (
                        <div className="mt-2 text-xs font-semibold text-amber-700">{mathHint}</div>
                      ) : null}

                      {isParent && it.type === "lesson" && !isMathArchiveItem(it) ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <StatusPill label={t("parent.canShareToChildren")} variant="gray" />
                        </div>
                      ) : null}

                      {parentMeta ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <StatusPill
                            label={t("parentSpace.tasksCount", { count: parentMeta.lessonCount })}
                            variant="gray"
                          />
                          {parentMeta.activeLessonTitle ? (
                            <StatusPill
                              label={t("parentSpace.active", { title: parentMeta.activeLessonTitle })}
                              variant="gray"
                            />
                          ) : null}
                          <StatusPill
                            label={parentChildProgressLabel(parentMeta.activeSubmissionStatus)}
                            variant={parentChildProgressVariant(parentMeta.activeSubmissionStatus)}
                          />
                          {parentMeta.submittedCount > 0 ? (
                            <StatusPill
                              label={t("parentSpace.submittedCount", { count: parentMeta.submittedCount })}
                              variant="green"
                            />
                          ) : null}
                          {parentMeta.draftCount > 0 ? (
                            <StatusPill
                              label={t("parentSpace.draftCount", { count: parentMeta.draftCount })}
                              variant="amber"
                            />
                          ) : null}
                          {parentMeta.aiFeedbackCount > 0 ? (
                            <StatusPill
                              label={t("parentSpace.aiFeedbackCount", { count: parentMeta.aiFeedbackCount })}
                              variant="green"
                            />
                          ) : null}
                          {parentMeta.reviewCount > 0 ? (
                            <StatusPill
                              label={t("parentSpace.reviewCount", { count: parentMeta.reviewCount })}
                              variant="green"
                            />
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-3 hidden flex-wrap gap-2 sm:flex">
                        {desktopMainActions.map((a) => {
                          if (a.key === "delete" || a.key === "deleteFromArchive") {
                            return (
                              <DangerButton key={a.key} onClick={a.onClick} disabled={a.disabled}>
                                {a.label}
                              </DangerButton>
                            );
                          }

                          if (a.key === "restore") {
                            return (
                              <SuccessButton key={a.key} onClick={a.onClick} disabled={a.disabled}>
                                {a.label}
                              </SuccessButton>
                            );
                          }

                          return (
                            <PrimaryButton key={a.key} onClick={a.onClick} disabled={a.disabled}>
                              {a.label}
                            </PrimaryButton>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex min-w-0 w-full justify-end sm:w-auto">
                      <div className="ml-2 shrink-0 sm:hidden">
                        <ActionMenu items={actions} />
                      </div>

                      <div className="ml-2 hidden shrink-0 sm:block">
                        {desktopExtraActions.length > 0 ? <ActionMenu items={desktopExtraActions} /> : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
            : null}
        </div>
      </section>

      <div className="mt-2 text-sm text-slate-600">
        <Link href={`/${locale}/join`} className="mr-4 underline">
          {t("footer.joinViaCode")}
        </Link>
        <Link href={`/${locale}/tools`} className="underline">
          {t("footer.tools")}
        </Link>
      </div>

      {shareOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeShare}
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div className="min-w-0">
                <div className="font-black text-slate-900">{safeMsg("share.title", "Share")}</div>
                <div className="truncate text-sm text-slate-600">{shareTitle}</div>
              </div>
              <button
                onClick={closeShare}
                className="rounded-xl border border-slate-300 px-3 py-2 font-black text-slate-800 hover:bg-zinc-50"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-[1.3fr_0.7fr]">
              <div>
                <div className="mb-2 text-sm font-black text-slate-900">
                  {safeMsg("share.shareTextLabel", "Share text")}
                </div>

                {shareKind === "lesson" ? (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {(
                      ["example1", "example2", "example3", "example4", "example5", "example6"] as SharePreset[]
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => applySharePreset(preset)}
                        className={[
                          "rounded-full border px-3 py-2 text-xs font-extrabold",
                          sharePreset === preset
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white text-slate-800 hover:bg-zinc-50",
                        ].join(" ")}
                      >
                        {getSharePresetLabel(preset)}
                      </button>
                    ))}
                  </div>
                ) : null}

                <textarea
                  value={shareText}
                  onChange={(e) => setShareText(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-slate-300 px-3 py-3 font-semibold text-slate-900"
                  style={{ resize: "vertical" }}
                />

                <div className="mt-2 flex flex-wrap gap-2">
                  <PrimaryButton onClick={generateShareTextAI} disabled={aiBusy}>
                    {aiBusy
                      ? safeMsg("share.aiLoading", "Generating...")
                      : safeMsg("share.aiGenerate", "✨ Generate with AI")}
                  </PrimaryButton>
                </div>

                {aiError ? (
                  <div className="mt-2 text-xs text-red-600">{aiError}</div>
                ) : null}

                {aiVariants.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {aiVariants.map((variant, i) => (
                      <button
                        key={`${i}-${variant.slice(0, 24)}`}
                        type="button"
                        onClick={() => setShareText(variant)}
                        className="rounded-xl border border-slate-300 bg-white p-3 text-left text-sm text-slate-800 hover:bg-slate-50"
                      >
                        {variant}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <PrimaryButton onClick={copyShareText}>
                    {copiedText
                      ? safeMsg("share.copiedText", "Text copied")
                      : safeMsg("share.copyText", "Copy text")}
                  </PrimaryButton>

                  <GhostLink href={facebookShareHref} target="_blank" rel="noreferrer">
                    {safeMsg("share.facebook", "Facebook")}
                  </GhostLink>

                  <GhostLink href={linkedInShareHref} target="_blank" rel="noreferrer">
                    {safeMsg("share.linkedin", "LinkedIn")}
                  </GhostLink>
                </div>

                <div className="mt-5 mb-2 text-sm font-black text-slate-900">
                  {safeMsg("share.linkLabel", "Share link")}
                </div>

                <input
                  value={shareUrl}
                  readOnly
                  className="w-full rounded-xl border border-slate-300 px-3 py-3 font-semibold text-slate-900"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <PrimaryButton onClick={copyShareUrl}>
                    {copied
                      ? safeMsg("share.copied", "Copied")
                      : safeMsg("share.copyLink", "Copy link")}
                  </PrimaryButton>

                  <GhostLink href={shareUrl} target="_blank" rel="noreferrer">
                    {safeMsg("share.openLink", "Open link")}
                  </GhostLink>
                </div>

                <div className="mt-3 text-sm text-slate-500">
                  {safeMsg(
                    "share.tipExtended",
                    "Tip: copy the text first, then share the link in social media."
                  )}
                </div>
              </div>

              <div className="grid place-items-start sm:place-items-center">
                <div className="mb-2 w-full text-left text-sm font-black text-slate-900">
                  {safeMsg("share.qrLabel", "QR code")}
                </div>
                <div className="grid h-56 w-56 place-items-center overflow-hidden rounded-2xl border border-slate-300 bg-white">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrDataUrl}
                      alt={safeMsg("share.qrAlt", "QR code")}
                      style={{ width: "100%", height: "100%" }}
                    />
                  ) : (
                    <div className="p-3 text-center text-sm text-slate-500">
                      {safeMsg("share.qrNotReady", "QR code is being prepared")}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
              {safeMsg("share.shareUrlLabel", "Share URL")}{" "}
              <code className="break-all">{shareUrl}</code>
            </div>
          </div>
        </div>
      ) : null}

      {pickSpaceOpen && pickLesson ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closePickSpace}
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div className="min-w-0">
                <div className="font-black text-slate-900">{t("shareToSpace.title")}</div>
                <div className="truncate text-sm text-slate-600">{pickLesson.title}</div>
              </div>
              <button
                onClick={closePickSpace}
                className="rounded-xl border border-slate-300 px-3 py-2 font-black text-slate-800 hover:bg-zinc-50"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              {mySpaces.length === 0 ? (
                <div className="text-sm text-slate-600">{t("shareToSpace.noSpaces")}</div>
              ) : (
                <div className="grid gap-2">
                  {mySpaces.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => assignLessonToSpace(s.id)}
                      className="rounded-2xl border border-slate-300 bg-white p-4 text-left font-black text-slate-900 hover:bg-zinc-50"
                    >
                      {(s.title || t("titles.space")).trim() || t("titles.space")}
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        {(s.meta?.join(" · ") ?? "").trim()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
              {t("shareToSpace.createsLabel")}{" "}
              <code>{`spaces/{spaceId}/lessons/${pickLesson.lessonId}`}</code>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}