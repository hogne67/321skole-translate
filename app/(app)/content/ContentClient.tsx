// app/(app)/content/ContentClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import QRCode from "qrcode";

import { db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { useAppMode } from "@/components/ModeProvider";
import { loadMyContent, type ContentItem } from "@/lib/contentFeed";
import ActionMenu, { type ActionItem } from "@/components/ActionMenu";
import { authedPost } from "@/lib/authedPost";

type LessonStatus = "draft" | "published";
type FilterType = "all" | "lesson" | "submission" | "space";

function fmtDate(d?: Date | null) {
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("nb-NO", {
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
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-extrabold ${ring}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
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
        "disabled:opacity-50 disabled:cursor-not-allowed",
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

// Prøv å hente lesson-title fra meta (vi putter ofte `Lesson: <title>` i meta)
function lessonTitleFromMeta(meta?: string[]) {
  if (!meta?.length) return "";
  const m = meta.find((x) => typeof x === "string" && x.startsWith("Lesson: "));
  return m ? m.replace("Lesson: ", "").trim() : "";
}

export default function ContentClient() {
  const router = useRouter();
  const { user, profile } = useUserProfile();
  const { mode } = useAppMode();

  const isAnon = !!user?.isAnonymous;
  const uid = user?.uid ?? null;

  const [items, setItems] = useState<ContentItem[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [busyByKey, setBusyByKey] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);

  // UI controls
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  // Share link/QR modal
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTitle, setShareTitle] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // Share to space modal
  const [pickSpaceOpen, setPickSpaceOpen] = useState(false);
  const [pickLesson, setPickLesson] = useState<{ lessonId: string; title: string } | null>(null);

  const mySpaces = useMemo(() => items.filter((x) => x.type === "space"), [items]);

  const isAdmin = !!profile?.roles?.admin;
  const isTeacherApproved = !!profile?.roles?.teacher && profile?.teacherStatus === "approved";

  function setBusy(key: string, v: boolean) {
    setBusyByKey((m) => ({ ...m, [key]: v }));
  }

  async function refresh() {
    setLoading(true);
    setWarnings([]);
    setErr(null);
    try {
      const res = await loadMyContent({ db, mode, uid, isAnon });
      setItems(res.items);
      setNotes(res.notes);
      setWarnings(res.warnings);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load content");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, isAnon, mode]);

  const emptyHint = useMemo(() => {
    if (isAnon) {
      return (
        <>
          <p className="opacity-85">Du er i gjestemodus. Foreløpig viser My content ingen lagrede elementer her.</p>
          <p className="opacity-85">
            Bruk <Link href="/join" className="underline">Join</Link> for å åpne en oppgave/space med kode,
            eller <Link href="/login" className="underline">logg inn</Link> for å synkronisere innhold.
          </p>
        </>
      );
    }
    return (
      <p className="opacity-85">
        Du har ikke noe innhold i feeden ennå. Når du lager/bruker lessons, spaces eller submissions,
        dukker de opp her.
      </p>
    );
  }, [isAnon]);

  // ---------- Share helpers ----------
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

    const url = `${getOrigin()}/lesson/${pid}`;
    await openShareModal(titleForCard(it), url);
  }

  async function openShareForSpace(it: Extract<ContentItem, { type: "space" }>) {
    const code = it.joinCode ? encodeURIComponent(it.joinCode) : "";
    const url = code ? `${getOrigin()}/join?code=${code}` : `${getOrigin()}${it.href}`;
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
    if (!pickLesson || !uid) return;

    const key = `lesson:${pickLesson.lessonId}`;
    setErr(null);
    setBusy(key, true);

    try {
      await setDoc(doc(db, `spaces/${spaceId}/assignments/${pickLesson.lessonId}`), {
        lessonId: pickLesson.lessonId,
        createdAt: serverTimestamp(),
        createdBy: uid,
        status: "active",
      });

      closePickSpace();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to assign to space");
    } finally {
      setBusy(key, false);
    }
  }

  // ---------- Publish / delete ----------
  async function setPublished(lessonId: string, nextPublished: boolean) {
    const key = `lesson:${lessonId}`;
    setErr(null);
    setBusy(key, true);

    try {
      const lessonRef = doc(db, "lessons", lessonId);
      const lessonSnap = await getDoc(lessonRef);
      if (!lessonSnap.exists()) throw new Error("Lesson not found");

      const dataUnknown = lessonSnap.data() as unknown;
      const data = isRecord(dataUnknown) ? dataUnknown : {};

      if (data.deletedAt) throw new Error("This lesson is deleted/archived and cannot be published.");

      if (nextPublished) {
        const publishObj = isRecord(data.publish) ? data.publish : undefined;
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
          typeof data.activePublishedId === "string" && data.activePublishedId ? data.activePublishedId : lessonId;

        await authedPost("/api/unpublish", { id: publishedId, draftId: lessonId });

        await updateDoc(lessonRef, {
          status: "draft",
          activePublishedId: null,
          updatedAt: serverTimestamp(),
        });
      }

      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to update publish status");
      await refresh();
    } finally {
      setBusy(key, false);
    }
  }

  async function deleteLessonSoft(lessonId: string, title: string) {
    const ok = confirm(
      `Delete lesson${title ? `: "${title}"` : ""}?\n\n` +
        `This will archive it (soft delete).\n` +
        `It will also attempt to unpublish via server.\n\n` +
        `An admin can restore it later.`
    );
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
          typeof d.activePublishedId === "string" && d.activePublishedId ? d.activePublishedId : lessonId;
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
      setErr(e instanceof Error ? e.message : "Failed to delete (archive) lesson");
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

  // ---------- Routing / titles ----------
  function submissionOpenHref(submissionId: string) {
    // ✅ robust: ikke stol på it.href for submission i student-mode
    // (hvis du fremdeles får 404 her, er det denne ene du endrer)
    return `/student/submissions/${submissionId}`;
  }

  function itemOpenHref(it: ContentItem) {
    if (it.type === "lesson") return `/student/lesson/${it.id}`;
    if (it.type === "submission") {
      return mode === "student" ? submissionOpenHref(it.id) : it.href;
    }
    return it.href;
  }

  function titleForCard(it: ContentItem) {
    const raw = (it.title || "").trim();
    if (raw && raw.toLowerCase() !== "untitled") return raw;

    if (it.type === "submission") {
      const s = it as Extract<ContentItem, { type: "submission" }>;
      const lt = lessonTitleFromMeta(s.meta);
      if (lt) return `${lt} – Submission`;
      if (s.lessonId) return `Submission · ${lastIdBits(s.lessonId)}`;
      return "Submission";
    }

    if (it.type === "space") return "Space";
    return "Lesson";
  }

  function cleanMetaForCard(it: ContentItem): string {
    const meta = it.meta?.filter(Boolean) ?? [];
    // Vi vil ikke vise “lesson:xxxxxxxx” hvis vi allerede viser pen lesson-title i meta
    const hasLessonTitle = meta.some((m) => m.startsWith("Lesson: "));
    const filtered = meta.filter((m) => {
      if (hasLessonTitle && m.startsWith("lesson:")) return false;
      return true;
    });
    return filtered.join(" · ");
  }

  // ---------- Action builder ----------
  function buildActions(it: ContentItem): ActionItem[] {
    const key = `${it.type}:${it.id}`;
    const busy = !!busyByKey[key];

    if (isAnon) {
      return [{ key: "open", label: "Open", disabled: busy, onClick: () => router.push(itemOpenHref(it)) }];
    }

    // SUBMISSION
    if (it.type === "submission") {
      const ss = it as Extract<ContentItem, { type: "submission" }>;
      const status = (ss.status ?? "").toLowerCase();
      const isReviewed = status === "reviewed";
      const canEditSubmission = mode === "student" && !isReviewed;

      return [
        { key: "open", label: "Open", disabled: busy, onClick: () => router.push(itemOpenHref(ss)) },
        ...(canEditSubmission
          ? [{
              key: "edit",
              label: "Edit answers",
              disabled: busy,
              onClick: () => router.push(`/student/submissions/${ss.id}`),
            }]
          : []),
        ...(ss.lessonId
          ? [{
              key: "openLesson",
              label: "Open lesson",
              disabled: busy,
              onClick: () => router.push(`/student/lesson/${ss.lessonId}`),
            }]
          : []),
        ...(ss.spaceId && (mode === "teacher" || mode === "creator" || isAdmin)
          ? [{
              key: "openSpace",
              label: "Open space",
              disabled: busy,
              onClick: () => router.push(`/teacher/spaces/${ss.spaceId}`),
            }]
          : []),
      ];
    }

    // SPACE
    if (it.type === "space") {
      const sp = it as Extract<ContentItem, { type: "space" }>;
      const code = sp.joinCode || "";
      const joinUrl = code ? `${getOrigin()}/join?code=${encodeURIComponent(code)}` : "";

      return [
        { key: "open", label: "Open", disabled: busy, onClick: () => router.push(sp.href) },
        ...(code ? [{ key: "copyCode", label: "Copy join code", disabled: busy, onClick: () => copyText(code) }] : []),
        { key: "share", label: "Share (link + QR)", disabled: busy, onClick: () => openShareForSpace(sp) },
        ...(joinUrl ? [{ key: "copyJoinLink", label: "Copy join link", disabled: busy, onClick: () => copyText(joinUrl) }] : []),
      ];
    }

    // LESSON
    const ls = it as Extract<ContentItem, { type: "lesson" }>;
    const status = (ls.status ?? "draft") as LessonStatus;
    const isPublished = status === "published";

    const canPublish = isAdmin || isTeacherApproved;
    const canDelete = isAdmin || isTeacherApproved;
    const canShareToSpace = mySpaces.length > 0 && (isAdmin || isTeacherApproved);

    // Du sa du endret edit for å komme til siden der bilde kan redigeres:
    const editHref = `/producer/${ls.id}`;
    const pdfHref = `/producer/${ls.id}/print`;

    return [
      { key: "open", label: "Open", disabled: busy, onClick: () => router.push(`/student/lesson/${ls.id}`) },
      { key: "edit", label: "Edit", disabled: busy, onClick: () => router.push(editHref) },
      {
        key: isPublished ? "unpublish" : "publish",
        label: busy ? "Working…" : isPublished ? "Unpublish" : "Publish",
        disabled: busy || !canPublish,
        onClick: () => setPublished(ls.id, !isPublished),
      },
      {
        key: "share",
        label: "Share",
        disabled: busy || !isPublished,
        onClick: () => openShareForLesson(ls),
      },
      {
        key: "shareToSpace",
        label: "Share to space",
        disabled: busy || !canShareToSpace,
        onClick: () => openPickSpace(ls.id, titleForCard(ls)),
      },
      {
        key: "pdf",
        label: "PDF",
        disabled: busy || !(mode === "teacher" || mode === "creator" || isAdmin),
        onClick: () => router.push(pdfHref),
      },
      {
        key: "delete",
        label: "Delete",
        danger: true,
        disabled: busy || !canDelete,
        onClick: () => deleteLessonSoft(ls.id, titleForCard(ls)),
      },
    ];
  }

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items
      .filter((it) => (filter === "all" ? true : it.type === filter))
      .filter((it) => {
        if (!qq) return true;
        const t = titleForCard(it).toLowerCase();
        const meta = (it.meta || []).join(" ").toLowerCase();
        const status = (it.status || "").toLowerCase();
        return t.includes(qq) || meta.includes(qq) || status.includes(qq);
      })
      .slice()
      .sort((a, b) => (b.updatedAt?.getTime?.() ?? 0) - (a.updatedAt?.getTime?.() ?? 0));
  }, [items, q, filter]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight">My content</h1>
          <p className="mt-1 text-sm opacity-75">Her samler vi alt innhold: publiser, del, PDF, rediger og mer.</p>
        </div>

        <div className="flex items-center gap-2">
          <PrimaryButton onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </PrimaryButton>
        </div>
      </div>

      {/* Search + filter */}
      <div className="mt-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Søk i tittel, status, meta…"
          className="w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none focus:ring-2"
        />

        {/* ✅ midtstilt under søk */}
        <div className="mt-3 flex justify-center">
          <div className="flex flex-wrap justify-center gap-2">
            {(["all", "lesson", "submission", "space"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={[
                  "rounded-full border px-3 py-2 text-sm font-extrabold",
                  filter === t ? "bg-zinc-900 text-white" : "bg-white hover:bg-zinc-50",
                ].join(" ")}
              >
                {t === "all" ? "All" : t === "lesson" ? "Lessons" : t === "submission" ? "Submissions" : "Spaces"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {err && (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="mb-1 font-black">Error</div>
          <div className="whitespace-pre-wrap text-sm">{err}</div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="mt-4 rounded-2xl border bg-zinc-50 p-4">
          {notes.map((n) => (
            <div key={n} className="text-sm">• {n}</div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          {warnings.map((w) => (
            <div key={w} className="text-sm">• {w}</div>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {loading && <div className="opacity-70">Loading content…</div>}

        {!loading && filtered.length === 0 && (
          <div className="rounded-2xl border bg-white p-4">{emptyHint}</div>
        )}

        {!loading &&
          filtered.map((it) => {
            const key = `${it.type}:${it.id}`;
            const actions = buildActions(it);

            const openHref = itemOpenHref(it);
            const title = titleForCard(it);

            // Status pill
            let pill: React.ReactNode = null;
            if (it.type === "lesson") {
              const s = ((it.status ?? "draft") as LessonStatus) === "published" ? "published" : "unpublished";
              pill = s === "published"
                ? <StatusPill label="published" variant="green" />
                : <StatusPill label="unpublished" variant="red" />;
            } else if (it.status) {
              pill = <StatusPill label={it.status} variant="gray" />;
            }

            const metaLine = cleanMetaForCard(it);

            // Plukk ut actions for inline-knapper (desktop)
            const aOpen = actions.find((a) => a.key === "open");
            const aEdit = actions.find((a) => a.key === "edit");
            const aOpenLesson = actions.find((a) => a.key === "openLesson");
            const aOpenSpace = actions.find((a) => a.key === "openSpace");
            const aPublish = actions.find((a) => a.key === "publish");
            const aUnpublish = actions.find((a) => a.key === "unpublish");
            const aShare = actions.find((a) => a.key === "share");
            const aShareToSpace = actions.find((a) => a.key === "shareToSpace");
            const aPdf = actions.find((a) => a.key === "pdf");

            return (
              <div key={key} className="rounded-2xl border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={openHref}
                        className="truncate text-base font-black leading-tight hover:underline"
                      >
                        {title}
                      </Link>
                      {pill}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs opacity-75">
                      {!!it.updatedAt && <span>{fmtDate(it.updatedAt)}</span>}
                      {metaLine ? <span className="opacity-60">•</span> : null}
                      {metaLine ? <span className="truncate">{metaLine}</span> : null}
                    </div>

                    {/* ✅ Desktop action row for BOTH lessons and submissions */}
                    <div className="mt-3 hidden flex-wrap gap-2 sm:flex">
                      {/* LESSON desktop buttons */}
                      {it.type === "lesson" ? (
                        <>
                          {aOpen ? (
                            <PrimaryButton onClick={aOpen.onClick} disabled={aOpen.disabled}>
                              Open
                            </PrimaryButton>
                          ) : null}

                          {/* Publish/Unpublish inline */}
                          {aPublish ? (
                            <PrimaryButton onClick={aPublish.onClick} disabled={aPublish.disabled}>
                              Publish
                            </PrimaryButton>
                          ) : null}
                          {aUnpublish ? (
                            <PrimaryButton onClick={aUnpublish.onClick} disabled={aUnpublish.disabled}>
                              Unpublish
                            </PrimaryButton>
                          ) : null}

                          {aShare ? (
                            <PrimaryButton onClick={aShare.onClick} disabled={aShare.disabled} title="Share (link + QR)">
                              Share
                            </PrimaryButton>
                          ) : null}
                          {aShareToSpace ? (
                            <PrimaryButton onClick={aShareToSpace.onClick} disabled={aShareToSpace.disabled}>
                              Share to space
                            </PrimaryButton>
                          ) : null}
                          {aEdit ? (
                            <PrimaryButton onClick={aEdit.onClick} disabled={aEdit.disabled}>
                              Edit
                            </PrimaryButton>
                          ) : null}
                          {aPdf ? (
                            <PrimaryButton onClick={aPdf.onClick} disabled={aPdf.disabled}>
                              PDF
                            </PrimaryButton>
                          ) : null}
                        </>
                      ) : null}

                      {/* SUBMISSION desktop buttons */}
                      {it.type === "submission" ? (
                        <>
                          {aOpen ? (
                            <PrimaryButton onClick={aOpen.onClick} disabled={aOpen.disabled}>
                              Open
                            </PrimaryButton>
                          ) : null}
                          {aEdit ? (
                            <PrimaryButton onClick={aEdit.onClick} disabled={aEdit.disabled}>
                              Edit answers
                            </PrimaryButton>
                          ) : null}
                          {aOpenLesson ? (
                            <PrimaryButton onClick={aOpenLesson.onClick} disabled={aOpenLesson.disabled}>
                              Open lesson
                            </PrimaryButton>
                          ) : null}
                          {aOpenSpace ? (
                            <PrimaryButton onClick={aOpenSpace.onClick} disabled={aOpenSpace.disabled}>
                              Open space
                            </PrimaryButton>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* Right side: Mobile hamburgermenu always */}
                  <div className="shrink-0">
                    <div className="sm:hidden">
                      <ActionMenu items={actions} />
                    </div>

                    {/* Desktop: keep ActionMenu for spaces + extra actions (delete etc) */}
                    <div className="hidden sm:block">
                      {it.type === "space" ? <ActionMenu items={actions} /> : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      <div className="mt-6 text-sm opacity-80">
        <Link href="/join" className="mr-4 underline">Join via code</Link>
        <Link href="/tools" className="underline">Tools</Link>
      </div>

      {/* Share link/QR modal */}
      {shareOpen ? (
        <div role="dialog" aria-modal="true" onClick={closeShare} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-2xl border bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div className="min-w-0">
                <div className="font-black">Share</div>
                <div className="truncate text-sm opacity-75">{shareTitle}</div>
              </div>
              <button onClick={closeShare} className="rounded-xl border px-3 py-2 font-black hover:bg-zinc-50">✕</button>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-[1.3fr_0.7fr]">
              <div>
                <div className="mb-2 text-sm font-black">Link</div>
                <input value={shareUrl} readOnly className="w-full rounded-xl border px-3 py-3 font-semibold" />

                <div className="mt-3 flex flex-wrap gap-2">
                  <PrimaryButton onClick={copyShareUrl}>{copied ? "Copied!" : "Copy link"}</PrimaryButton>
                  <GhostLink href={shareUrl} target="_blank" rel="noreferrer">
                    Open link
                  </GhostLink>
                </div>

                <div className="mt-3 text-sm opacity-70">Tips: Del QR på skjerm eller skriv den ut.</div>
              </div>

              <div className="grid place-items-center">
                <div className="mb-2 w-full text-left text-sm font-black">QR</div>
                <div className="h-56 w-56 overflow-hidden rounded-2xl border bg-white grid place-items-center">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrDataUrl} alt="QR code" style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <div className="p-3 text-center text-sm opacity-70">QR not ready (link works).</div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t p-4 text-xs opacity-70">
              Share URL: <code className="break-all">{shareUrl}</code>
            </div>
          </div>
        </div>
      ) : null}

      {/* Share to space modal */}
      {pickSpaceOpen && pickLesson ? (
        <div role="dialog" aria-modal="true" onClick={closePickSpace} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-2xl border bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div className="min-w-0">
                <div className="font-black">Share to space</div>
                <div className="truncate text-sm opacity-75">{pickLesson.title}</div>
              </div>
              <button onClick={closePickSpace} className="rounded-xl border px-3 py-2 font-black hover:bg-zinc-50">✕</button>
            </div>

            <div className="p-4">
              {mySpaces.length === 0 ? (
                <div className="opacity-75">Du har ingen spaces enda.</div>
              ) : (
                <div className="grid gap-2">
                  {mySpaces.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => assignLessonToSpace(s.id)}
                      className="rounded-2xl border bg-white p-4 text-left font-black hover:bg-zinc-50"
                    >
                      {(s.title || "Space").trim() || "Space"}
                      <div className="mt-1 text-xs font-semibold opacity-70">{(s.meta?.join(" · ") ?? "").trim()}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t p-4 text-xs opacity-70">
              Creates: <code>spaces/{`{spaceId}`}/assignments/{pickLesson.lessonId}</code>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}