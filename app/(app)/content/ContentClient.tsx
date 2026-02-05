// app/(app)/content/ContentClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import QRCode from "qrcode";

import { db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { useAppMode } from "@/components/ModeProvider";
import { loadMyContent, type ContentItem } from "@/lib/contentFeed";
import ActionMenu, { type ActionItem } from "@/components/ActionMenu";
import { authedPost } from "@/lib/authedPost";

type LessonStatus = "draft" | "published";

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

function badgeForType(t: ContentItem["type"]) {
  if (t === "lesson") return "LESSON";
  if (t === "submission") return "SUBMISSION";
  return "SPACE";
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
          <p style={{ opacity: 0.85 }}>
            Du er i gjestemodus. Foreløpig viser My content ingen lagrede elementer her.
          </p>
          <p style={{ opacity: 0.85 }}>
            Bruk <Link href="/join">Join</Link> for å åpne en oppgave/space med kode,
            eller <Link href="/login">logg inn</Link> for å synkronisere innhold.
          </p>
        </>
      );
    }

    return (
      <p style={{ opacity: 0.85 }}>
        Du har ikke noe innhold i feeden ennå. Når du lager/bruker lessons, spaces eller submissions,
        dukker de opp her.
      </p>
    );
  }, [isAnon]);

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

    // fallback: read once if missing
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
    await openShareModal(it.title, url);
  }

  async function openShareForSpace(it: Extract<ContentItem, { type: "space" }>) {
    const code = it.joinCode ? encodeURIComponent(it.joinCode) : "";
    const url = code ? `${getOrigin()}/join?code=${code}` : `${getOrigin()}${it.href}`;
    await openShareModal(it.title, url);
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
      // best-effort unpublish
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

  function buildActions(it: ContentItem): ActionItem[] {
    const key = `${it.type}:${it.id}`;
    const busy = !!busyByKey[key];

    if (isAnon) {
      return [{ key: "open", label: "Open", disabled: busy, onClick: () => router.push(it.href) }];
    }

    // SUBMISSION
    if (it.type === "submission") {
      const ss = it as Extract<ContentItem, { type: "submission" }>;
      const status = (ss.status ?? "").toLowerCase();
      const isReviewed = status === "reviewed";

      const canEditSubmission = mode === "student" && !isReviewed;

      return [
        { key: "open", label: "Open", disabled: busy, onClick: () => router.push(ss.href) },
        ...(canEditSubmission
          ? [{
              key: "edit",
              label: "Edit answers",
              disabled: busy,
              onClick: () => router.push(`/student/submissions/${ss.id}`),
            }]
          : []),
        ...(ss.lessonId
          ? [{ key: "openLesson", label: "Open lesson", disabled: busy, onClick: () => router.push(`/lesson/${ss.lessonId}`) }]
          : []),
        ...(ss.spaceId && (mode === "teacher" || mode === "creator" || isAdmin)
          ? [{ key: "openSpace", label: "Open space", disabled: busy, onClick: () => router.push(`/teacher/spaces/${ss.spaceId}`) }]
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

    // Teacher/Creator should edit their lessons.
    const canEditLesson = isAdmin || mode === "teacher" || mode === "creator";
    const canPublish = isAdmin || isTeacherApproved;
    const canDelete = isAdmin || isTeacherApproved;
    const canShareToSpace = mySpaces.length > 0 && (isAdmin || isTeacherApproved);

    const editHref =
      mode === "creator"
        ? `/producer/texts/${ls.id}` // creator edit
        : mode === "teacher"
          ? `/teacher/lessons/${ls.id}` // teacher edit/view
          : `/lesson/${ls.id}`; // student

    const pdfHref = `/producer/${ls.id}/print`; // ✅ your actual route

    return [
      { key: "open", label: "Open", disabled: busy, onClick: () => router.push(ls.href) },
      { key: "edit", label: "Edit", disabled: busy || !canEditLesson, onClick: () => router.push(editHref) },
      {
        key: isPublished ? "unpublish" : "publish",
        label: busy ? "Working…" : isPublished ? "Unpublish" : "Publish",
        disabled: busy || !canPublish,
        onClick: () => setPublished(ls.id, !isPublished),
      },
      {
        key: "share",
        label: "Share (link + QR)",
        disabled: busy || !isPublished,
        onClick: () => openShareForLesson(ls),
      },
      {
        key: "shareToSpace",
        label: "Share to space",
        disabled: busy || !canShareToSpace,
        onClick: () => openPickSpace(ls.id, ls.title),
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
        onClick: () => deleteLessonSoft(ls.id, ls.title),
      },
    ];
  }

  return (
    <main style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>My content</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Oversikt per bruker – actions varierer med mode (teacher/student/creator).
          </p>
        </div>

        <button onClick={refresh} disabled={loading} style={btn}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 12, ...warnBox }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Error</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{err}</div>
        </div>
      )}

      {notes.length > 0 && (
        <div style={noteBox}>
          {notes.map((n) => (
            <div key={n}>• {n}</div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div style={warnBox}>
          {warnings.map((w) => (
            <div key={w}>• {w}</div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {loading && <div style={{ opacity: 0.7 }}>Loading content…</div>}

        {!loading && items.length === 0 && <div style={card}>{emptyHint}</div>}

        {!loading &&
          items.map((it) => {
            const key = `${it.type}:${it.id}`;
            const actions = buildActions(it);

            return (
              <div key={key} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={chip}>{badgeForType(it.type)}</span>

                      <Link href={it.href} style={{ fontWeight: 900, textDecoration: "none", color: "inherit" }}>
                        {it.title}
                      </Link>

                      {it.status ? <span style={miniChip}>{it.status}</span> : null}
                      {it.meta?.length ? it.meta.map((m) => <span key={m} style={miniChip}>{m}</span>) : null}
                    </div>

                    <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>{fmtDate(it.updatedAt)}</div>
                  </div>

                  <ActionMenu items={actions} />
                </div>
              </div>
            );
          })}
      </div>

      <div style={{ marginTop: 18, opacity: 0.8, fontSize: 13 }}>
        <Link href="/join" style={{ marginRight: 12 }}>Join via code</Link>
        <Link href="/tools">Tools</Link>
      </div>

      {/* Share link/QR modal */}
      {shareOpen ? (
        <div role="dialog" aria-modal="true" onClick={closeShare} style={overlay}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={modalHeader}>
              <div>
                <div style={{ fontWeight: 900 }}>Share</div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>{shareTitle}</div>
              </div>
              <button onClick={closeShare} style={xBtn}>✕</button>
            </div>

            <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 14 }}>
              <div>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Link</div>
                <input value={shareUrl} readOnly style={shareInput} />

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                  <button onClick={copyShareUrl} style={shareBtn}>{copied ? "Copied!" : "Copy link"}</button>
                  <a href={shareUrl} target="_blank" rel="noreferrer" style={shareA}>Open link</a>
                </div>

                <div style={{ marginTop: 12, fontSize: 13, opacity: 0.7 }}>
                  Tips: Del QR på skjerm eller skriv den ut.
                </div>
              </div>

              <div style={{ display: "grid", placeItems: "center" }}>
                <div style={{ fontWeight: 800, marginBottom: 8, justifySelf: "start" }}>QR</div>
                <div style={qrBox}>
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrDataUrl} alt="QR code" style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <div style={{ fontSize: 13, opacity: 0.7, padding: 12, textAlign: "center" }}>
                      QR not ready (link works).
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={modalFooter}>
              Share URL: <code>{shareUrl}</code>
            </div>
          </div>
        </div>
      ) : null}

      {/* Share to space modal */}
      {pickSpaceOpen && pickLesson ? (
        <div role="dialog" aria-modal="true" onClick={closePickSpace} style={overlay}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={modalHeader}>
              <div>
                <div style={{ fontWeight: 900 }}>Share to space</div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>{pickLesson.title}</div>
              </div>
              <button onClick={closePickSpace} style={xBtn}>✕</button>
            </div>

            <div style={{ padding: 14 }}>
              {mySpaces.length === 0 ? (
                <div style={{ opacity: 0.75 }}>Du har ingen spaces enda.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {mySpaces.map((s) => (
                    <button key={s.id} onClick={() => assignLessonToSpace(s.id)} style={spacePickBtn}>
                      {s.title}
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{s.meta?.join(" · ") ?? ""}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={modalFooter}>
              Creates: <code>spaces/{`{spaceId}`}/assignments/{pickLesson.lessonId}</code>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/* styles */
const btn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.14)",
  background: "white",
  borderRadius: 10,
  padding: "8px 10px",
  cursor: "pointer",
  fontWeight: 800,
};

const card: React.CSSProperties = {
  padding: 12,
  border: "1px solid rgba(0,0,0,0.1)",
  borderRadius: 12,
};

const chip: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.5,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.14)",
  opacity: 0.9,
};

const miniChip: React.CSSProperties = {
  fontSize: 12,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  opacity: 0.85,
};

const noteBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(0,0,0,0.03)",
};

const warnBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(255,165,0,0.35)",
  background: "rgba(255,165,0,0.08)",
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 50,
};

const modal: React.CSSProperties = {
  width: "min(720px, 100%)",
  background: "white",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
  overflow: "hidden",
};

const modalHeader: React.CSSProperties = {
  padding: 14,
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const modalFooter: React.CSSProperties = {
  padding: 14,
  borderTop: "1px solid rgba(0,0,0,0.08)",
  opacity: 0.7,
  fontSize: 12,
};

const xBtn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.15)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const shareInput: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.18)",
  fontFamily: "inherit",
};

const shareBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.18)",
  background: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const shareA: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.18)",
  background: "white",
  cursor: "pointer",
  fontWeight: 900,
  textDecoration: "none",
  color: "inherit",
  display: "inline-flex",
  alignItems: "center",
};

const qrBox: React.CSSProperties = {
  width: 240,
  height: 240,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "white",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
};

const spacePickBtn: React.CSSProperties = {
  textAlign: "left",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "white",
  cursor: "pointer",
  fontWeight: 800,
};