// app/(app)/producer/texts/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAuth } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import QRCode from "qrcode";

type LessonRow = {
  id: string;
  title?: string;
  level?: string;
  topic?: string;
  topics?: string[];
  language?: string;
  status?: "draft" | "published";
  updatedAt?: any;

  textType?: string;
  texttype?: string;

  deletedAt?: any;

  sourceText?: string;
  text?: string;
  tasks?: any;

  coverImageUrl?: string;
  imageUrl?: string;

  activePublishedId?: string | null;
};

function formatMaybeDate(v: any) {
  try {
    const d: Date | null =
      v?.toDate?.() instanceof Date
        ? v.toDate()
        : v instanceof Date
        ? v
        : typeof v === "number"
        ? new Date(v)
        : null;

    if (!d) return "—";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  } catch {
    return "—";
  }
}

function coerceTextType(d: any): string {
  const a = String(d?.textType ?? "").trim();
  if (a) return a;
  const b = String(d?.texttype ?? "").trim();
  if (b) return b;
  return "";
}

/** --- API helpers (server writes published_lessons) --- */
async function authedPost(url: string, body: any) {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export default function ProducerTextsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [items, setItems] = useState<LessonRow[]>([]);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");

  const [busyById, setBusyById] = useState<Record<string, boolean>>({});

  // Share modal state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLesson, setShareLesson] = useState<LessonRow | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  function setBusy(id: string, v: boolean) {
    setBusyById((m) => ({ ...m, [id]: v }));
  }

  async function requireUser() {
    const u = getAuth().currentUser;
    if (!u) throw new Error("Not signed in");
    setUid(u.uid);
    return u.uid;
  }

  async function load() {
    setErr(null);
    setLoading(true);

    try {
      const u = await requireUser();

      const qy = query(
        collection(db, "lessons"),
        where("ownerId", "==", u),
        orderBy("updatedAt", "desc")
      );

      const snap = await getDocs(qy);

      const data = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as LessonRow[];

      setItems(data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load lessons");
    } finally {
      setLoading(false);
    }
  }

  async function setPublished(lessonId: string, nextPublished: boolean) {
    setErr(null);
    setBusy(lessonId, true);

    // optimistic UI (list only)
    setItems((prev) =>
      prev.map((l) =>
        l.id === lessonId
          ? { ...l, status: nextPublished ? "published" : "draft", updatedAt: new Date() }
          : l
      )
    );

    try {
      await requireUser();

      // ensure draft exists & not deleted
      const lessonRef = doc(db, "lessons", lessonId);
      const lessonSnap = await getDoc(lessonRef);
      if (!lessonSnap.exists()) throw new Error("Lesson not found");
      const data: any = lessonSnap.data();
      if (data?.deletedAt) throw new Error("This lesson is deleted/archived and cannot be published.");

      if (nextPublished) {
        // ✅ publish via server (writes published_lessons with signing/audit)
        await authedPost("/api/publish", {
          id: lessonId,
          visibility: (data?.publish?.state === "unlisted" ? "unlisted" : "public"),
        });

        // mark draft as published (client write is OK on lessons)
        await updateDoc(lessonRef, {
          status: "published",
          activePublishedId: lessonId,
          updatedAt: serverTimestamp(),
        });
      } else {
        // ✅ unpublish via server (sets isActive=false)
        await authedPost("/api/unpublish", { id: lessonId });

        await updateDoc(lessonRef, {
          status: "draft",
          activePublishedId: null,
          updatedAt: serverTimestamp(),
        });
      }

      await load();
    } catch (e: any) {
      console.error("setPublished failed:", e);
      setErr(e?.message ?? "Failed to update publish status");
      await load();
    } finally {
      setBusy(lessonId, false);
    }
  }

  // Soft delete (archive): only touch lessons/{id} from client
  async function deleteLesson(lessonId: string, title?: string) {
    const ok = confirm(
      `Delete lesson${title ? `: "${title}"` : ""}?\n\n` +
        `This will archive it (soft delete).\n` +
        `It will also attempt to unpublish via server.\n\n` +
        `An admin can restore it later.`
    );
    if (!ok) return;

    setErr(null);
    setBusy(lessonId, true);

    const before = items;
    setItems((prev) => prev.filter((l) => l.id !== lessonId));

    try {
      await requireUser();

      // best-effort unpublish via server (ignore failure)
      try {
        await authedPost("/api/unpublish", { id: lessonId });
      } catch {}

      await updateDoc(doc(db, "lessons", lessonId), {
        status: "draft",
        activePublishedId: null,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await load();
    } catch (e: any) {
      console.error("deleteLesson failed:", e);
      setItems(before);
      setErr(e?.message ?? "Failed to delete (archive) lesson");
    } finally {
      setBusy(lessonId, false);
    }
  }

  // Share: build URL + generate QR (client-side)
  async function openShare(l: LessonRow) {
    setCopied(false);
    setQrDataUrl("");
    setShareLesson(l);

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/lesson/${l.id}`;
    setShareUrl(url);
    setShareOpen(true);

    try {
      const dataUrl = await QRCode.toDataURL(url, {
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
    setShareLesson(null);
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

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await load();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return items.filter((l) => {
      if (l.deletedAt) return false;

      const st = (l.status ?? "draft") as "draft" | "published";
      if (statusFilter !== "all" && st !== statusFilter) return false;

      if (!needle) return true;

      const tt = coerceTextType(l);
      const hay = `${l.title ?? ""} ${tt} ${l.level ?? ""} ${l.language ?? ""} ${l.status ?? ""}`
        .toLowerCase()
        .trim();

      return hay.includes(needle);
    });
  }, [items, q, statusFilter]);

  return (
    <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>My content</h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>uid: {uid ?? "—"}</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title/type/level…"
            style={{
              padding: "10px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              minWidth: 220,
              outline: "none",
            }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              padding: "10px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "white",
              outline: "none",
              fontWeight: 700,
            }}
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>

          <button
            onClick={load}
            style={{
              padding: "10px 14px",
              border: "1px solid #ddd",
              borderRadius: 10,
              background: "white",
              cursor: "pointer",
              fontWeight: 800,
            }}
            disabled={loading}
            title="Reload list"
          >
            Refresh
          </button>

          <Link
            href="/producer/texts/new"
            style={{
              padding: "10px 14px",
              border: "1px solid #111827",
              borderRadius: 10,
              textDecoration: "none",
              color: "white",
              background: "#111827",
              fontWeight: 900,
            }}
          >
            Create new lesson
          </Link>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 16 }}>Loading…</p>
      ) : err ? (
        <div
          style={{
            marginTop: 16,
            border: "1px solid #f3b4b4",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 800 }}>Error</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{err}</pre>
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ marginTop: 16, opacity: 0.75 }}>No lessons match. Click “New”.</p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {filtered.map((l) => {
            const isPublished = (l.status ?? "draft") === "published";
            const busy = !!busyById[l.id];
            const tt = coerceTextType(l);

            return (
              <div
                key={l.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 320 }}>
                  <div style={{ fontWeight: 900 }}>{l.title ?? "Untitled"}</div>
                  <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
                    {(l.status ?? "—").toUpperCase()}
                    {l.level ? ` · ${l.level}` : ""}
                    {tt ? ` · ${tt}` : ""}
                    {l.language ? ` · ${l.language}` : ""}
                    {" · "}
                    Updated: {formatMaybeDate(l.updatedAt)}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  {/* ✅ Publish / Unpublish buttons (replaces toggle) */}
                  {isPublished ? (
                    <button
                      onClick={() => setPublished(l.id, false)}
                      disabled={busy}
                      style={{
                        padding: "10px 14px",
                        border: "1px solid #ef4444",
                        borderRadius: 10,
                        background: "white",
                        cursor: busy ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        color: "#ef4444",
                        opacity: busy ? 0.7 : 1,
                      }}
                      title="Unpublish (will hide from library)"
                    >
                      {busy ? "Working…" : "Unpublish"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setPublished(l.id, true)}
                      disabled={busy}
                      style={{
                        padding: "10px 14px",
                        border: "1px solid #16a34a",
                        borderRadius: 10,
                        background: "white",
                        cursor: busy ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        color: "#16a34a",
                        opacity: busy ? 0.7 : 1,
                      }}
                      title="Publish (adds/updates published snapshot)"
                    >
                      {busy ? "Working…" : "Publish"}
                    </button>
                  )}

                  <button
                    onClick={() => openShare(l)}
                    disabled={!isPublished || busy}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #ddd",
                      borderRadius: 10,
                      background: !isPublished ? "rgba(0,0,0,0.03)" : "white",
                      cursor: !isPublished || busy ? "not-allowed" : "pointer",
                      fontWeight: 800,
                      opacity: !isPublished ? 0.6 : 1,
                    }}
                    title={!isPublished ? "Publish first to share link/QR" : "Share link + QR"}
                  >
                    Share
                  </button>

                  <Link
                    href={`/producer/${l.id}/preview`}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #ddd",
                      borderRadius: 10,
                      textDecoration: "none",
                      color: "inherit",
                      fontWeight: 700,
                      opacity: 0.9,
                    }}
                  >
                    Preview
                  </Link>

                  {/* ✅ PDF button */}
                  <Link
                    href={`/producer/${l.id}/print`}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #ddd",
                      borderRadius: 10,
                      textDecoration: "none",
                      color: "inherit",
                      fontWeight: 800,
                      opacity: 0.9,
                    }}
                    title="Printable PDF"
                  >
                    PDF
                  </Link>

                  <Link
                    href={`/producer/${l.id}`}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #ddd",
                      borderRadius: 10,
                      textDecoration: "none",
                      color: "inherit",
                      fontWeight: 800,
                    }}
                  >
                    Edit
                  </Link>

                  <button
                    onClick={() => deleteLesson(l.id, l.title)}
                    disabled={busy}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #ef4444",
                      borderRadius: 10,
                      background: "white",
                      cursor: busy ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      color: "#ef4444",
                      opacity: busy ? 0.7 : 1,
                    }}
                    title="Delete lesson (archive)"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Share modal */}
      {shareOpen && shareLesson ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeShare}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              background: "white",
              borderRadius: 14,
              border: "1px solid rgba(0,0,0,0.12)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: 14,
                borderBottom: "1px solid rgba(0,0,0,0.08)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 900 }}>Share lesson</div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  {shareLesson.title ?? "Untitled"} · {shareLesson.level ?? "—"}
                </div>
              </div>

              <button
                onClick={closeShare}
                style={{
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "white",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 14 }}>
              <div>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Link</div>

                <input
                  value={shareUrl}
                  readOnly
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.18)",
                    fontFamily: "inherit",
                  }}
                />

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                  <button
                    onClick={copyShareUrl}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.18)",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    {copied ? "Copied!" : "Copy link"}
                  </button>

                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
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
                    }}
                  >
                    Open link
                  </a>
                </div>

                <div style={{ marginTop: 12, fontSize: 13, opacity: 0.7 }}>
                  Tips: Del QR på skjerm eller skriv den ut. Studenter kan åpne direkte i nettleseren.
                </div>
              </div>

              <div style={{ display: "grid", placeItems: "center" }}>
                <div style={{ fontWeight: 800, marginBottom: 8, justifySelf: "start" }}>QR</div>

                <div
                  style={{
                    width: 240,
                    height: 240,
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "white",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                  }}
                >
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

            <div style={{ padding: 14, borderTop: "1px solid rgba(0,0,0,0.08)", opacity: 0.7, fontSize: 12 }}>
              Share URL points to: <code>/lesson/{shareLesson.id}</code>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
