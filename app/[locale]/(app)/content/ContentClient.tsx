// app/[locale]/(app)/content/ContentClient.tsx
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

type LessonStatus = "draft" | "published";
type FilterType = "all" | "library" | "teacher" | "lesson" | "submission" | "space";

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

function getOrigin() {
  return typeof window !== "undefined" ? window.location.origin : "";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function buildParentSubmissionId(spaceId: string, assignmentId: string, uid: string) {
  return `${spaceId}_${assignmentId}_${uid}`;
}

function pickVisibility(v: unknown): "public" | "unlisted" | "private" {
  return v === "unlisted" || v === "private" || v === "public" ? v : "public";
}

function parentChildProgressLabel(status: string | null, locale: string) {
  const s = String(status ?? "").trim().toLowerCase();

  if (s === "submitted" || s === "reviewed" || s === "approved") {
    return locale === "en" ? "🟢 Completed by child" : "🟢 Fullført av barn";
  }

  if (s === "draft" || s === "needs_work") {
    return locale === "en" ? "🟡 Started" : "🟡 Påbegynt";
  }

  return locale === "en" ? "⚪ Not started" : "⚪ Ikke startet";
}

function parentChildProgressVariant(status: string | null): "green" | "amber" | "gray" {
  const s = String(status ?? "").trim().toLowerCase();

  if (s === "submitted" || s === "reviewed" || s === "approved") return "green";
  if (s === "draft" || s === "needs_work") return "amber";
  return "gray";
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
    <span className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-xs font-extrabold ${ring}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={[
        "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-extrabold",
        "bg-white hover:bg-zinc-50 active:bg-zinc-100",
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
      className={["border-red-200 text-red-700 hover:bg-red-50 active:bg-red-100", props.className || ""].join(" ")}
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
        "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-extrabold",
        "bg-white hover:bg-zinc-50 active:bg-zinc-100",
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

type LoadMyContentArgs = {
  db: typeof db;
  uid: string | null;
  isAnon: boolean;
  mode: "student" | "teacher";
};

export default function ContentClient() {
  const router = useRouter();
  const { user, profile } = useUserProfile();

  const isAnon = !!user?.isAnonymous;
  const uid = user?.uid ?? null;

  type AppRole = "student" | "teacher" | "parent" | "admin" | "creator";
  const role: AppRole = isAnon ? "student" : (profile?.role as AppRole) || "student";
  const isTeacher = role === "teacher";
  const isParent = role === "parent";

  const contentMode: "student" | "teacher" = isTeacher ? "teacher" : "student";
  const isTeacherApproved = isTeacher;

  const t = useTranslations("content");
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
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const [pickSpaceOpen, setPickSpaceOpen] = useState(false);
  const [pickLesson, setPickLesson] = useState<{ lessonId: string; title: string } | null>(null);

  const [parentSpaceMeta, setParentSpaceMeta] = useState<Record<string, ParentSpaceMeta>>({});

  const mySpaces = useMemo(() => items.filter((x) => x.type === "space"), [items]);

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

  function lessonOpenHref(it: Extract<ContentItem, { type: "lesson" }>) {
    const pid = it.activePublishedId || it.id;
    return `/${locale}/student/lesson/${pid}`;
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

  async function refresh() {
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
  }, [uid, isAnon, role]);

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
              () => {}
            );

            const unsubReview = onSnapshot(
              doc(db, "spaces", spaceId, "lessons", lesson.id, "parentReviews", uid),
              (reviewSnap) => {
                reviewState[lesson.id] = reviewSnap.exists();
                push(lessons.length, activeLessonTitle, activeLessonId);
              },
              () => {}
            );

            innerUnsubs.push(unsubSubmission, unsubReview);
          }
        },
        () => {}
      );

      allUnsubs.push(unsubLessons);
      allUnsubs.push(() => innerUnsubs.forEach((u) => u()));
    }

    return () => {
      allUnsubs.forEach((u) => u());
    };
  }, [isParent, uid, mySpaces]);

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

  async function openShareModal(title: string, url: string) {
    setCopied(false);
    setQrDataUrl("");
    setShareTitle(title);
    setShareUrl(url);
    setShareOpen(true);

    try {
      const dataUrl = await QRCode.toDataURL(url, { margin: 1, scale: 7, errorCorrectionLevel: "M" });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl("");
    }
  }

  function closeShare() {
    setShareOpen(false);
    setShareTitle("");
    setShareUrl("");
    setQrDataUrl("");
    setCopied(false);
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

  async function openShareForLesson(it: Extract<ContentItem, { type: "lesson" }>) {
    let pid = it.activePublishedId || it.id;

    if (!it.activePublishedId) {
      try {
        const snap = await getDoc(doc(db, "lessons", it.id));
        const dUnknown = snap.data() as unknown;
        const d = isRecord(dUnknown) ? dUnknown : {};
        if (typeof d.activePublishedId === "string" && d.activePublishedId) pid = d.activePublishedId;
      } catch {
        // ignore
      }
    }

    const url = `${getOrigin()}/${locale}/lesson/${pid}`;
    await openShareModal(titleForCard(it), url);
  }

  async function openShareForSpace(it: Extract<ContentItem, { type: "space" }>) {
    const code = it.joinCode ? encodeURIComponent(it.joinCode) : "";
    const url = code ? `${getOrigin()}/${locale}/join?code=${code}` : `${getOrigin()}${itemOpenHref(it)}`;
    await openShareModal(titleForCard(it), url);
  }

  function openPickSpace(lessonId: string, title: string) {
    setPickLesson({ lessonId, title });
    setPickSpaceOpen(true);
  }

  function closePickSpace() {
    setPickSpaceOpen(false);
    setPickLesson(null);
  }

  async function assignLessonToSpace(spaceId: string) {
    if (!pickLesson) return;

    const lessonId = pickLesson.lessonId;
    const key = `shareToSpace:${spaceId}:${lessonId}`;
    setErr(null);
    setBusy(key, true);

    try {
      const apiPath =
        role === "parent"
          ? `/api/parent/spaces/${spaceId}/assign`
          : `/api/teacher/spaces/${spaceId}/assign`;

      await authedPost(apiPath, {
        sourceType: "myContent",
        sourceId: lessonId,
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

      if ((data as { deletedAt?: unknown }).deletedAt) throw new Error(t("errors.cannotPublishDeleted"));

      if (nextPublished) {
        const publishObj = isRecord((data as { publish?: unknown }).publish)
          ? (data as { publish?: Record<string, unknown> }).publish
          : undefined;
        const vis = pickVisibility(publishObj?.visibility);

        const resp = await authedPost<{ publishedId?: string; publishedLessonId?: string; id?: string }>(
          "/api/publish",
          { id: lessonId, visibility: vis }
        );

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

  async function restoreLesson(lessonId: string, title: string) {
    const msg =
      locale === "en"
        ? `Restore lesson${title ? `: "${title}"` : ""}?`
        : `Gjenopprette oppgaven${title ? `: "${title}"` : ""}?`;

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
      setErr(e instanceof Error ? e.message : locale === "en" ? "Could not restore." : "Kunne ikke gjenopprette.");
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

  function cleanMetaForCard(it: ContentItem): string {
    const meta = it.meta?.filter(Boolean) ?? [];
    const hasLessonTitle = meta.some((m) => typeof m === "string" && m.startsWith("Lesson: "));
    const filteredMeta = meta.filter((m) => {
      if (typeof m !== "string") return false;
      if (hasLessonTitle && m.startsWith("lesson:")) return false;
      return true;
    });
    return filteredMeta.join(" · ");
  }

  function buildActions(it: ContentItem): ActionItem[] {
    const key = `${it.type}:${it.id}`;
    const busy = !!busyByKey[key];

    if (isAnon) {
      return [{ key: "open", label: t("actions.open"), disabled: busy, onClick: () => router.push(itemOpenHref(it)) }];
    }

    if (it.type === "submission") {
      const ss = it as Extract<ContentItem, { type: "submission" }>;
      const status = (ss.status ?? "").toLowerCase();
      const isReviewed = status === "reviewed" || status === "approved";

      const canEditSubmission = role === "student" && !isReviewed && !isTeacherSpaceSubmission(ss);

      const canShareSubmissionToSpace =
        (isTeacher || isParent) &&
        mySpaces.length > 0 &&
        !!ss.lessonId &&
        !isTeacherSpaceSubmission(ss);

      return [
        {
          key: "open",
          label: t("actions.open"),
          disabled: busy,
          onClick: () => router.push(itemOpenHref(ss)),
        },
        ...(canEditSubmission
          ? [
              {
                key: "edit",
                label: t("actions.editAnswers"),
                disabled: busy,
                onClick: () => router.push(itemOpenHref(ss)),
              },
            ]
          : []),
        ...(canShareSubmissionToSpace
          ? [
              {
                key: "shareToSpace",
                label: t("actions.shareToSpace"),
                disabled: busy,
                onClick: () => openPickSpace(ss.lessonId!, titleForCard(ss)),
              },
            ]
          : []),
      ];
    }

    if (it.type === "space") {
      const sp = it as Extract<ContentItem, { type: "space" }>;
      const code = sp.joinCode || "";
      const joinUrl = code ? `${getOrigin()}/${locale}/join?code=${encodeURIComponent(code)}` : "";

      const canShareSpace = role === "teacher";

      return [
        { key: "open", label: t("actions.open"), disabled: busy, onClick: () => router.push(itemOpenHref(sp)) },
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
          ? [{ key: "copyCode", label: t("actions.copyJoinCode"), disabled: busy, onClick: () => copyText(code) }]
          : []),
        ...(canShareSpace
          ? [{ key: "share", label: t("actions.shareLinkQr"), disabled: busy, onClick: () => openShareForSpace(sp) }]
          : []),
        ...(canShareSpace && joinUrl
          ? [{ key: "copyJoinLink", label: t("actions.copyJoinLink"), disabled: busy, onClick: () => copyText(joinUrl) }]
          : []),
      ];
    }

    const ls = it as Extract<ContentItem, { type: "lesson" }>;
    const status = (ls.status ?? "draft") as LessonStatus;
    const isPublished = status === "published";
    const isDeleted = isDeletedItem(ls);

    const canPublish = isTeacherApproved && !isDeleted;
    const canDelete = (isTeacher || isParent) && !busy;
    const canShareToSpace = mySpaces.length > 0 && (isTeacher || isParent) && !isDeleted;
    const canEdit = isTeacher && !isDeleted;
    const canSharePublic = isTeacher && isPublished && !isDeleted;
    const canPdf = isTeacher && !isDeleted;

    const editHref = `/${locale}/producer/${ls.id}`;
    const pdfHref = `/${locale}/producer/${ls.id}/print`;

    const restoreAction: ActionItem[] =
      showDeleted && isDeleted && (isTeacher || isParent)
        ? [
            {
              key: "restore",
              label: locale === "en" ? "Restore" : "Gjenopprett",
              disabled: busy,
              onClick: () => restoreLesson(ls.id, titleForCard(ls)),
            },
          ]
        : [];

    return [
      ...restoreAction,
      { key: "open", label: t("actions.open"), disabled: busy, onClick: () => router.push(itemOpenHref(ls)) },
      ...(isTeacher
        ? [
            {
              key: "edit",
              label: t("actions.edit"),
              disabled: busy || !canEdit,
              onClick: () => router.push(editHref),
            },
            {
              key: isPublished ? "unpublish" : "publish",
              label: busy ? t("actions.working") : isPublished ? t("actions.unpublish") : t("actions.publish"),
              disabled: busy || !canPublish,
              onClick: () => setPublished(ls.id, !isPublished),
            },
            {
              key: "share",
              label: t("actions.share"),
              disabled: busy || !canSharePublic,
              onClick: () => openShareForLesson(ls),
            },
          ]
        : []),
      {
        key: "shareToSpace",
        label: t("actions.shareToSpace"),
        disabled: busy || !canShareToSpace,
        onClick: () => openPickSpace(ls.id, titleForCard(ls)),
      },
      ...(isTeacher
        ? [
            {
              key: "pdf",
              label: t("actions.pdf"),
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

  const counts = useMemo(() => {
    const c = { lesson: 0, submission: 0, space: 0, library: 0, teacher: 0 };
    for (const it of items) {
      if (it.type === "lesson") c.lesson += 1;
      else if (it.type === "submission") {
        c.submission += 1;
        if (isLibraryPractice(it)) c.library += 1;
        if (isTeacherSpaceSubmission(it)) c.teacher += 1;
      } else if (it.type === "space") c.space += 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return items
      .filter((it) => (showDeleted ? true : !isDeletedItem(it)))
      .filter((it) => {
        if (filter === "all") return true;
        if (filter === "library") return isLibraryPractice(it);
        if (filter === "teacher") return isTeacherSpaceSubmission(it);
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
        return tt.includes(qq) || meta.includes(qq) || st.includes(qq);
      })
      .slice()
      .sort((a, b) => {
        const aa = (a.updatedAt?.getTime?.() ?? 0) || 0;
        const bb = (b.updatedAt?.getTime?.() ?? 0) || 0;
        return bb - aa;
      });
  }, [items, q, filter, showDeleted, titleForCard]);

  const deletedLabel = locale === "en" ? "Deleted" : "Slettet";
  const showDeletedLabel = locale === "en" ? "Show deleted" : "Vis slettet";
  const deletedAtLabel = locale === "en" ? "Deleted at" : "Slettet";

  function labelWithCount(ft: FilterType) {
    const label =
      ft === "all"
        ? (t("filters.all") as string)
        : ft === "library"
          ? (locale === "en" ? "Library" : "Bibliotek")
          : ft === "teacher"
            ? (locale === "en" ? "Teacher" : "Innlevering")
            : ft === "lesson"
              ? (t("filters.lessons") as string)
              : ft === "submission"
                ? (t("filters.submissions") as string)
                : (t("filters.spaces") as string);

    if (ft === "lesson") return `${label} (${counts.lesson})`;
    if (ft === "submission") return `${label} (${counts.submission})`;
    if (ft === "space") return `${label} (${counts.space})`;
    if (ft === "library") return `${label} (${counts.library})`;
    if (ft === "teacher") return `${label} (${counts.teacher})`;

    return `${label} (${counts.lesson + counts.submission + counts.space})`;
  }

    function mobileDeletedLabel() {
    if (showDeleted) {
      return locale === "en" ? "Deleted: On" : "Slettet: På";
    }
    return locale === "en" ? "Deleted: Off" : "Slettet: Av";
  }

    const mobileFilterActions: ActionItem[] = [
    ...(["library", "teacher", "lesson", "submission", "space"] as const).map((ft) => ({
      key: `mobile-filter-${ft}`,
      label: labelWithCount(ft),
      onClick: () => setFilter(ft),
    })),
  ];

  return (
    <main className="mx-auto w-full max-w-5xl overflow-x-hidden px-3 py-4 sm:px-4">
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight">
            {isParent ? "Mitt innhold for familien" : t("title")}
          </h1>
          <p className="mt-1 text-sm opacity-75">
            {isParent
              ? "Her finner du oppgaver du kan åpne, organisere og dele videre til barnas rom."
              : t("subtitle")}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={isParent ? "Søk i oppgaver, rom og innleveringer …" : t("search.placeholder")}
          className="w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none focus:ring-2"
        />

        <div className="mt-3 hidden flex-wrap items-center justify-between gap-2 sm:flex">
          <div className="flex flex-wrap gap-2">
            {(["all", "library", "teacher", "lesson", "submission", "space"] as const).map((ft) => (
              <button
                key={ft}
                onClick={() => setFilter(ft)}
                className={[
                  "rounded-full border px-3 py-2 text-sm font-extrabold",
                  filter === ft ? "bg-zinc-900 text-white" : "bg-white hover:bg-zinc-50",
                ].join(" ")}
                title={
                  ft === "library"
                    ? locale === "en"
                      ? "Your own tasks from the library (practice)"
                      : "Dine egne oppgaver hentet fra biblioteket"
                    : ft === "teacher"
                      ? locale === "en"
                        ? "Assignments submitted in a class/space"
                        : "Oppgaver levert i rom"
                      : undefined
                }
              >
                {labelWithCount(ft)}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm font-extrabold">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="h-4 w-4"
            />
            {showDeletedLabel}
          </label>
        </div>

                <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center gap-2 sm:hidden">
          <button
            onClick={() => setFilter("all")}
            className={[
              "min-w-0 rounded-2xl border px-4 py-3 text-sm font-extrabold",
              "transition-colors",
              filter === "all" ? "bg-zinc-900 text-white" : "bg-white hover:bg-zinc-50",
            ].join(" ")}
          >
            <span className="truncate">{labelWithCount("all")}</span>
          </button>

          <button
            onClick={() => setShowDeleted((v) => !v)}
            className={[
              "rounded-2xl border px-3 py-3 text-sm font-extrabold whitespace-nowrap transition-colors",
              showDeleted ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-white hover:bg-zinc-50",
            ].join(" ")}
          >
            {mobileDeletedLabel()}
          </button>

          <div className="shrink-0 rounded-2xl border bg-white shadow-sm [&_button]:h-12 [&_button]:w-12 [&_button]:rounded-2xl [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-base [&_button_svg]:h-6 [&_button_svg]:w-6">
            <ActionMenu items={mobileFilterActions} />
          </div>
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="mb-1 font-black">{t("errors.label")}</div>
          <div className="whitespace-pre-wrap text-sm">{err}</div>
        </div>
      ) : null}

      {notes.length > 0 ? (
        <div className="mt-4 rounded-2xl border bg-zinc-50 p-4">
          {notes.map((n) => (
            <div key={n} className="text-sm">
              • {n}
            </div>
          ))}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          {warnings.map((w) => (
            <div key={w} className="text-sm">
              • {w}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {loading ? <div className="opacity-70">{t("states.loadingContent")}</div> : null}

        {!loading && filtered.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4">{emptyHint}</div>
        ) : null}

        {!loading
          ? filtered.map((it) => {
              const key = `${it.type}:${it.id}`;
              const actions = buildActions(it);

              const title = titleForCard(it);
              const deletedAt = getDeletedAt(it);

              let pill: React.ReactNode = null;

              const extraPill =
                it.type === "submission"
                  ? isLibraryPractice(it)
                    ? locale === "en"
                      ? <StatusPill label="Library" variant="gray" />
                      : <StatusPill label="Bibliotek" variant="gray" />
                    : isTeacherSpaceSubmission(it)
                      ? locale === "en"
                        ? <StatusPill label="Teacher" variant="gray" />
                        : <StatusPill label="Innlevering" variant="gray" />
                      : null
                  : null;

              if (isDeletedItem(it)) {
                pill = <StatusPill label={deletedLabel} variant="amber" />;
              } else if (it.type === "lesson") {
                if (isParent) {
                  pill = <StatusPill label="Klar til å dele" variant="green" />;
                } else {
                  const s = ((it.status ?? "draft") as LessonStatus) === "published" ? "published" : "unpublished";
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
              const parentMeta = isParent && it.type === "space" ? parentSpaceMeta[it.id] : null;

              return (
                                <div key={key} className="w-full overflow-hidden rounded-2xl border bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start gap-2">
                                                <div className="min-w-0 max-w-full break-words text-base font-black leading-tight">
                          {title}
                        </div>
                        {extraPill}
                        {pill}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs opacity-75">
                        {it.updatedAt ? <span>{fmtDate(it.updatedAt, locale)}</span> : null}

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

                      {isParent && it.type === "lesson" ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <StatusPill label="Kan deles til barnas rom" variant="gray" />
                        </div>
                      ) : null}

                      {parentMeta ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <StatusPill label={`${parentMeta.lessonCount} oppgaver`} variant="gray" />
                          {parentMeta.activeLessonTitle ? (
                            <StatusPill label={`Aktiv: ${parentMeta.activeLessonTitle}`} variant="gray" />
                          ) : null}
                          <StatusPill
                            label={parentChildProgressLabel(parentMeta.activeSubmissionStatus, locale)}
                            variant={parentChildProgressVariant(parentMeta.activeSubmissionStatus)}
                          />
                          {parentMeta.submittedCount > 0 ? (
                            <StatusPill label={`${parentMeta.submittedCount} sendt inn`} variant="green" />
                          ) : null}
                          {parentMeta.draftCount > 0 ? (
                            <StatusPill label={`${parentMeta.draftCount} påbegynt`} variant="amber" />
                          ) : null}
                          {parentMeta.aiFeedbackCount > 0 ? (
                            <StatusPill label={`${parentMeta.aiFeedbackCount} med AI-feedback`} variant="green" />
                          ) : null}
                          {parentMeta.reviewCount > 0 ? (
                            <StatusPill label={`${parentMeta.reviewCount} foreldrevurdert`} variant="green" />
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-3 hidden flex-wrap gap-2 sm:flex">
                        {actions
                          .filter((a) =>
                            [
                              "open",
                              "edit",
                              "publish",
                              "unpublish",
                              "share",
                              "shareToSpace",
                              "pdf",
                              "delete",
                              "restore",
                              "copyJoinLink",
                              "copyCode",
                              "shareLinkQr",
                            ].includes(a.key)
                          )
                          .slice(0, 6)
                          .map((a) => {
                            if (a.key === "delete") {
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

                    <div className="flex w-full justify-end sm:w-auto">
                      <div className="shrink-0 rounded-2xl border bg-white shadow-sm [&_button]:h-12 [&_button]:w-12 [&_button]:rounded-2xl [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-base [&_button_svg]:h-6 [&_button_svg]:w-6">
                        <ActionMenu items={actions} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          : null}
      </div>

      <div className="mt-6 text-sm opacity-80">
        <Link href={`/${locale}/join`} className="mr-4 underline">
          {t("footer.joinViaCode")}
        </Link>
        <Link href={`/${locale}/tools`} className="underline">
          {t("footer.tools")}
        </Link>
      </div>

      {shareOpen ? (
        <div role="dialog" aria-modal="true" onClick={closeShare} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-2xl border bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div className="min-w-0">
                <div className="font-black">{t("share.title")}</div>
                <div className="truncate text-sm opacity-75">{shareTitle}</div>
              </div>
              <button onClick={closeShare} className="rounded-xl border px-3 py-2 font-black hover:bg-zinc-50">
                ✕
              </button>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-[1.3fr_0.7fr]">
              <div>
                <div className="mb-2 text-sm font-black">{t("share.linkLabel")}</div>
                <input value={shareUrl} readOnly className="w-full rounded-xl border px-3 py-3 font-semibold" />

                <div className="mt-3 flex flex-wrap gap-2">
                  <PrimaryButton onClick={copyShareUrl}>{copied ? t("share.copied") : t("share.copyLink")}</PrimaryButton>
                  <GhostLink href={shareUrl} target="_blank" rel="noreferrer">
                    {t("share.openLink")}
                  </GhostLink>
                </div>

                <div className="mt-3 text-sm opacity-70">{t("share.tip")}</div>
              </div>

              <div className="grid place-items-center">
                <div className="mb-2 w-full text-left text-sm font-black">{t("share.qrLabel")}</div>
                <div className="grid h-56 w-56 place-items-center overflow-hidden rounded-2xl border bg-white">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrDataUrl} alt={t("share.qrAlt")} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <div className="p-3 text-center text-sm opacity-70">{t("share.qrNotReady")}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t p-4 text-xs opacity-70">
              {t("share.shareUrlLabel")} <code className="break-all">{shareUrl}</code>
            </div>
          </div>
        </div>
      ) : null}

      {pickSpaceOpen && pickLesson ? (
        <div role="dialog" aria-modal="true" onClick={closePickSpace} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-2xl border bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div className="min-w-0">
                <div className="font-black">{t("shareToSpace.title")}</div>
                <div className="truncate text-sm opacity-75">{pickLesson.title}</div>
              </div>
              <button onClick={closePickSpace} className="rounded-xl border px-3 py-2 font-black hover:bg-zinc-50">
                ✕
              </button>
            </div>

            <div className="p-4">
              {mySpaces.length === 0 ? (
                <div className="opacity-75">{t("shareToSpace.noSpaces")}</div>
              ) : (
                <div className="grid gap-2">
                  {mySpaces.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => assignLessonToSpace(s.id)}
                      className="rounded-2xl border bg-white p-4 text-left font-black hover:bg-zinc-50"
                    >
                      {(s.title || t("titles.space")).trim() || t("titles.space")}
                      <div className="mt-1 text-xs font-semibold opacity-70">{(s.meta?.join(" · ") ?? "").trim()}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t p-4 text-xs opacity-70">
              {t("shareToSpace.createsLabel")} <code>{`spaces/{spaceId}/lessons/${pickLesson.lessonId}`}</code>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}