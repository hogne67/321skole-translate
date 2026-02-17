// app/(app)/teacher/spaces/page.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import {
  collection,
  getCountFromServer,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import type { SpaceDoc } from "@/lib/spacesClient";
import AttestationAndModeCard from "@/components/AttestationAndModeCard";

type SpaceDocSafe = SpaceDoc & { createdAt?: unknown };

type Row = { id: string; data: SpaceDocSafe };
type Mode = "student" | "teacher" | "creator" | "parent";

type QrFor = { spaceId: string; code: string; title?: string };

type TimestampLike = { toMillis: () => number };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isTimestampLike(v: unknown): v is TimestampLike {
  return isRecord(v) && typeof v["toMillis"] === "function";
}

function readModeFromProfile(profile: unknown): Mode {
  if (!isRecord(profile)) return "student";
  const m = profile["mode"];
  return m === "teacher" || m === "creator" || m === "parent" || m === "student" ? m : "student";
}

function readHasAttested(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  const att = profile["attestation"];
  if (!isRecord(att)) return false;
  return Boolean(att["acceptedAt"]);
}

/**
 * Accepts:
 * - Firestore Timestamp (or Timestamp-like)
 * - number (already millis)
 * - { seconds, nanoseconds } style objects (best-effort)
 */
function asMillis(v: unknown): number {
  if (isTimestampLike(v)) return v.toMillis();

  if (typeof v === "number" && Number.isFinite(v)) return v;

  if (isRecord(v)) {
    const seconds = v["seconds"];
    const nanoseconds = v["nanoseconds"];
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      const ns = typeof nanoseconds === "number" && Number.isFinite(nanoseconds) ? nanoseconds : 0;
      return seconds * 1000 + Math.floor(ns / 1_000_000);
    }
  }

  return 0;
}

type SortKey = "newest" | "oldest" | "title_az" | "title_za";

export default function TeacherSpacesPage() {
  return (
    <AuthGate>
      <TeacherSpacesInner />
    </AuthGate>
  );
}

function TeacherSpacesInner() {
  const { user, profile, loading } = useUserProfile();
  const [rows, setRows] = useState<Row[]>([]);

  // UI controls
  const [search, setSearch] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  // Member counts cache
  const [memberCount, setMemberCount] = useState<Record<string, number | undefined>>({});
  const [memberCountBusy, setMemberCountBusy] = useState<Record<string, boolean>>({});

  // Copy toast
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // QR modal
  const [qrOpen, setQrOpen] = useState(false);
  const [qrFor, setQrFor] = useState<QrFor | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrErr, setQrErr] = useState<string | null>(null);

  const mode: Mode = useMemo(() => readModeFromProfile(profile), [profile]);
  const hasAttested = useMemo(() => readHasAttested(profile), [profile]);
  const canCreateSpace = Boolean(user?.uid) && hasAttested && (mode === "teacher" || mode === "creator");

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(collection(db, "spaces"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc"));

    return onSnapshot(q, (snap) => {
      const next: Row[] = snap.docs.map((d) => ({
        id: d.id,
        data: (d.data() as SpaceDocSafe) ?? ({} as SpaceDocSafe),
      }));
      setRows(next);
    });
  }, [user?.uid]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let list = rows;

    if (s) {
      list = list.filter((r) => {
        const title = (r.data.title ?? "").toString().toLowerCase();
        const code = (r.data.code ?? "").toString().toLowerCase();
        return title.includes(s) || code.includes(s);
      });
    }

    if (openOnly) {
      list = list.filter((r) => Boolean(r.data.isOpen));
    }

    const sorted = [...list].sort((a, b) => {
      if (sortKey === "title_az" || sortKey === "title_za") {
        const at = (a.data.title ?? "").toString().toLowerCase();
        const bt = (b.data.title ?? "").toString().toLowerCase();
        const cmp = at.localeCompare(bt, "en");
        return sortKey === "title_az" ? cmp : -cmp;
      }

      const am = asMillis(a.data.createdAt);
      const bm = asMillis(b.data.createdAt);
      return sortKey === "newest" ? bm - am : am - bm;
    });

    return sorted;
  }, [rows, search, openOnly, sortKey]);

  useEffect(() => {
    if (!user?.uid) return;

    const visible = filtered.slice(0, 50);
    visible.forEach((r) => {
      if (memberCount[r.id] !== undefined) return;
      if (memberCountBusy[r.id]) return;

      setMemberCountBusy((m) => ({ ...m, [r.id]: true }));

      const q = query(
        collection(db, "spaceMembers"),
        where("spaceId", "==", r.id),
        where("archived", "==", false)
      );

      getCountFromServer(q)
        .then((agg) => setMemberCount((m) => ({ ...m, [r.id]: agg.data().count })))
        .catch(() => setMemberCount((m) => ({ ...m, [r.id]: undefined })))
        .finally(() => setMemberCountBusy((m) => ({ ...m, [r.id]: false })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, user?.uid]);

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((v) => (v === id ? null : v)), 1200);
    } catch {
      // no-op
    }
  }

  async function openQr(spaceId: string, code: string, title?: string) {
    setQrErr(null);
    setQrDataUrl(null);
    setQrBusy(true);
    setQrFor({ spaceId, code, title });
    setQrOpen(true);

    try {
      const QRCode = (await import("qrcode")).default;
      const url = `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
      const dataUrl = await QRCode.toDataURL(url, { margin: 1, scale: 6 });
      setQrDataUrl(dataUrl);
    } catch {
      setQrErr("Could not generate QR. Install dependency: npm i qrcode");
    } finally {
      setQrBusy(false);
    }
  }

  function closeQr() {
    setQrOpen(false);
    setQrFor(null);
    setQrDataUrl(null);
    setQrBusy(false);
    setQrErr(null);
  }

  if (loading) {
    return <div className="mx-auto max-w-4xl p-4 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-2xl font-semibold">Teacher Spaces</h1>

        <Link
          href="/teacher/spaces/new"
          title={canCreateSpace ? "Create a new space" : "Requires attestation + Teacher/Creator mode"}
          className={[
            "rounded-xl px-3 py-2 text-sm font-medium no-underline",
            canCreateSpace ? "bg-black text-white" : "border border-black/20 bg-transparent text-slate-900",
          ].join(" ")}
        >
          {canCreateSpace ? "+ New space" : "+ New space (locked)"}
        </Link>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Spaces are classrooms/groups where you share tasks via link or code. Sharing to a space requires attestation
        (B1), but not full name.
      </p>

      {!canCreateSpace && (
        <div className="mt-4 grid gap-3">
          <AttestationAndModeCard
            attestationVersion="2026-02-09"
            allowedModes={["student", "teacher", "creator", "parent"]}
            requireAttestationForProModes={true}
          />
        </div>
      )}

      {/* Controls */}
      <div className="mt-4 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-3">
        <div className="md:col-span-1">
          <label className="text-sm font-medium">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title or code…"
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
          />
        </div>

        <div className="md:col-span-1">
          <label className="text-sm font-medium">Sort</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title_az">Title (A–Z)</option>
            <option value="title_za">Title (Z–A)</option>
          </select>
        </div>

        <div className="md:col-span-1">
          <label className="text-sm font-medium">Filters</label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="openOnly"
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="openOnly" className="text-sm text-muted-foreground">
              Open only
            </label>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Showing: <b>{filtered.length}</b>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="mt-4 grid gap-3">
        {filtered.map((r) => {
          const code = (r.data.code ?? "").toString();
          const title = (r.data.title ?? "Untitled space").toString();
          const open = Boolean(r.data.isOpen);
          const count = memberCount[r.id];
          const countBusy = Boolean(memberCountBusy[r.id]);

          return (
            <div
              key={r.id}
              className={[
                "rounded-2xl bg-white p-4 shadow-sm",
                "border-2",
                open ? "border-emerald-200" : "border-slate-200",
                "hover:shadow-md hover:border-slate-300 transition",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[240px]">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold">{title}</div>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        open ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700",
                      ].join(" ")}
                      title={open ? "Room is open" : "Room is closed"}
                    >
                      {open ? "Open" : "Closed"}
                    </span>
                  </div>

                  <div className="mt-1 text-sm text-muted-foreground">
                    Code:{" "}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(code, r.id)}
                      className="rounded-lg border px-2 py-0.5 text-sm font-medium hover:shadow-sm"
                      title="Copy code"
                    >
                      {code || "—"}
                    </button>
                    {copiedId === r.id && <span className="ml-2 text-xs">Copied ✅</span>}
                    <span className="mx-2">·</span>
                    Members: <b>{countBusy ? "…" : count !== undefined ? String(count) : "—"}</b>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
                        copyToClipboard(url, `url_${r.id}`);
                      }}
                      className="rounded-xl border px-3 py-2 text-sm hover:shadow-sm"
                      title="Copy join link"
                    >
                      Copy join link
                    </button>

                    <button
                      type="button"
                      onClick={() => openQr(r.id, code, title)}
                      className="rounded-xl border px-3 py-2 text-sm hover:shadow-sm"
                      title="Show QR code"
                    >
                      Join with QR code
                    </button>

                    <Link
                      href={`/teacher/spaces/${r.id}/members`}
                      className="rounded-xl border px-3 py-2 text-sm hover:shadow-sm no-underline"
                      title="See members"
                    >
                      See members
                    </Link>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/teacher/spaces/${r.id}`}
                    className="rounded-xl bg-black px-3 py-2 text-sm font-medium text-white no-underline hover:opacity-90"
                    title="Open space"
                  >
                    Open
                  </Link>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground shadow-sm">
            No spaces found.
            <div className="mt-2">
              Create one with <b>New space</b>, then share via code or link.
            </div>
          </div>
        )}
      </div>

      {/* QR Modal */}
      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeQr}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Join QR</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {qrFor?.title ?? "Space"} · Code: <b>{qrFor?.code}</b>
                </div>
              </div>
              <button type="button" onClick={closeQr} className="rounded-xl border px-3 py-2 text-sm hover:shadow-sm">
                Close
              </button>
            </div>

            <div className="mt-4 rounded-xl border p-4">
              {qrBusy && <div className="text-sm text-muted-foreground">Generating…</div>}
              {qrErr && <div className="text-sm text-red-600">{qrErr}</div>}

              {qrDataUrl && (
                <div className="flex flex-col items-center gap-3">
                  <Image
                    src={qrDataUrl}
                    alt="QR code"
                    width={256}
                    height={256}
                    unoptimized
                    className="h-auto w-64 rounded-lg border"
                  />
                  <div className="text-center text-xs text-muted-foreground">
                    This QR points to{" "}
                    <b>
                      {typeof window !== "undefined"
                        ? `${window.location.origin}/join?code=${encodeURIComponent(qrFor?.code ?? "")}`
                        : "/join?code=…"}
                    </b>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              Note: install QR dependency once: <b>npm i qrcode</b>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}