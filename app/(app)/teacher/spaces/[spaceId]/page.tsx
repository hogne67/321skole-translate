// app/(app)/teacher/spaces/[spaceId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import AttestationAndModeCard from "@/components/AttestationAndModeCard";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import type { SpaceDoc } from "@/lib/spacesClient";
import { setSpaceOpen } from "@/lib/spacesClient";

type Mode = "student" | "teacher" | "creator" | "parent";
type AccessState = "checking" | "allowed" | "denied";

type SourceType = "myContent" | "library";

type AssignmentDoc = {
  status: "active" | "archived";
  sourceType: SourceType;
  sourceId: string;
  title: string;
  level?: string;
  language?: string;
  createdAt?: unknown;
  assignedAt?: unknown;
  assignedByUid?: string;
  updatedAt?: unknown;
};

type AssignmentRow = {
  id: string;
  data: AssignmentDoc;
};

type SubmissionData = {
  createdAt?: unknown;
  status?: unknown;
};

type MyLesson = {
  title?: string;
  level?: string;
  language?: string;
  ownerId?: string;
  status?: string;
};

type LibraryLesson = {
  title?: string;
  level?: string;
  language?: string;
  isActive?: boolean;
};

type SpaceDocSafe = SpaceDoc & {
  ownerId?: unknown;
  code?: unknown;
  isOpen?: unknown;
  activeLessonId?: unknown;
  activeLessonTitle?: unknown;
};

type QrState = {
  open: boolean;
  dataUrl: string | null;
  busy: boolean;
  err: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
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

function readIsAdmin(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  const roles = profile["roles"];
  if (!isRecord(roles)) return false;
  return roles["admin"] === true;
}

function getErrorInfo(err: unknown): { code?: string; message: string } {
  if (err instanceof Error) return { message: err.message };
  if (typeof err === "string") return { message: err };
  if (err && typeof err === "object") {
    const code = "code" in err ? (err as { code?: unknown }).code : undefined;
    const message = "message" in err ? (err as { message?: unknown }).message : undefined;
    return {
      code: typeof code === "string" ? code : undefined,
      message: typeof message === "string" ? message : JSON.stringify(err),
    };
  }
  return { message: String(err) };
}

function formatMaybeDate(v: unknown) {
  try {
    if (!v) return "";
    const d: Date | null =
      v instanceof Date
        ? v
        : isRecord(v) && typeof v["toDate"] === "function"
        ? (v as { toDate: () => Date }).toDate()
        : v instanceof Timestamp
        ? v.toDate()
        : null;
    return d ? d.toLocaleString() : "";
  } catch {
    return "";
  }
}

function snapTo<T>(d: QueryDocumentSnapshot<DocumentData>): T {
  return (d.data() as T) ?? ({} as T);
}

/**
 * "New" = ikke reviewet ennå.
 * Ferdig: reviewed / approved / needs_work
 */
function isReviewedStatus(statusRaw: unknown): boolean {
  const s = typeof statusRaw === "string" ? statusRaw.toLowerCase().trim() : "";
  return s === "reviewed" || s === "approved" || s === "needs_work" || s === "needswork";
}

export default function TeacherSpaceDetailPage() {
  return (
    <AuthGate>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const router = useRouter();
  const { user, profile, loading } = useUserProfile();
  const params = useParams<{ spaceId: string }>();
  const spaceId = params.spaceId;

  const mode: Mode = useMemo(() => readModeFromProfile(profile), [profile]);
  const hasAttested = useMemo(() => readHasAttested(profile), [profile]);
  const isAdmin = useMemo(() => readIsAdmin(profile), [profile]);

  const canOperateSpace = Boolean(user?.uid) && hasAttested && (mode === "teacher" || mode === "creator");

  const [space, setSpace] = useState<SpaceDocSafe | null>(null);

  const [access, setAccess] = useState<AccessState>("checking");
  const [accessReason, setAccessReason] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [qr, setQr] = useState<QrState>({
    open: false,
    dataUrl: null,
    busy: false,
    err: null,
  });

  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  // Per-assignment submission summary (counts + new)
  const [subSummaryByAssignment, setSubSummaryByAssignment] = useState<Record<string, { total: number; newCount: number }>>(
    {}
  );
  const [subSummaryErrByAssignment, setSubSummaryErrByAssignment] = useState<Record<string, string | null>>({});
  const [subSummaryUnsubByAssignment, setSubSummaryUnsubByAssignment] = useState<Record<string, Unsubscribe>>({});

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTab, setAssignTab] = useState<SourceType>("myContent");
  const [assignSearch, setAssignSearch] = useState("");

  // Pagination (My Content only)
  const PAGE_SIZE = 5;
  const [pageMy, setPageMy] = useState(0);
  const [myContent, setMyContent] = useState<Array<{ id: string; data: MyLesson }>>([]);
  const [library, setLibrary] = useState<Array<{ id: string; data: LibraryLesson }>>([]);

  // Space doc
  useEffect(() => {
    const ref = doc(db, "spaces", spaceId);
    return onSnapshot(ref, (snap) => setSpace(snap.exists() ? (snap.data() as SpaceDocSafe) : null));
  }, [spaceId]);

  // Access check
  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (loading) return;

      if (!user?.uid) {
        if (!alive) return;
        setAccess("denied");
        setAccessReason("You must be signed in.");
        return;
      }

      if (!space) return;

      setAccess("checking");
      setAccessReason("");

      try {
        if (isAdmin) {
          if (!alive) return;
          setAccess("allowed");
          return;
        }

        const ownerId = space.ownerId;
        if (typeof ownerId === "string" && ownerId === user.uid) {
          if (!alive) return;
          setAccess("allowed");
          return;
        }

        const memberDocId = `${spaceId}_${user.uid}`;
        const ms = await getDoc(doc(db, "spaceMembers", memberDocId));
        if (!alive) return;

        if (ms.exists()) setAccess("allowed");
        else {
          setAccess("denied");
          setAccessReason("You are not a member of this space.");
        }
      } catch (e: unknown) {
        if (!alive) return;
        setAccess("denied");
        setAccessReason(getErrorInfo(e).message || "Could not verify access.");
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [loading, user?.uid, isAdmin, spaceId, space]);

  const joinCode = useMemo(() => (space?.code ?? "").toString(), [space]);
  const joinLink = useMemo(() => `/join?code=${encodeURIComponent(joinCode || "")}`, [joinCode]);

  const activeForStudentsId = useMemo(() => {
    const v = space?.activeLessonId;
    return typeof v === "string" && v.trim() ? v : null;
  }, [space]);

  const activeForStudentsTitle = useMemo(() => {
    const v = space?.activeLessonTitle;
    return typeof v === "string" ? v : "";
  }, [space]);

  const isOpen = Boolean(space?.isOpen);

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((v) => (v === key ? null : v)), 1200);
    } catch {
      // no-op
    }
  }

  async function openQr() {
    setQr({ open: true, dataUrl: null, busy: true, err: null });

    try {
      const QRCode = (await import("qrcode")).default;
      const url = `${window.location.origin}${joinLink}`;
      const dataUrl = await QRCode.toDataURL(url, { margin: 1, scale: 6 });
      setQr({ open: true, dataUrl, busy: false, err: null });
    } catch {
      setQr({ open: true, dataUrl: null, busy: false, err: "Could not generate QR. Install dependency: npm i qrcode" });
    }
  }

  function closeQr() {
    setQr({ open: false, dataUrl: null, busy: false, err: null });
  }

  async function setActiveForStudents(assignmentId: string | null) {
    setSaveErr(null);
    if (!canOperateSpace) {
      setSaveErr("To manage this space, you need attestation and Teacher/Creator mode.");
      return;
    }
    if (access !== "allowed") {
      setSaveErr("You do not have access to manage this space.");
      return;
    }

    const title = assignmentId ? assignments.find((a) => a.id === assignmentId)?.data?.title ?? null : null;

    setSaving(true);
    try {
      await updateDoc(doc(db, "spaces", spaceId), {
        activeLessonId: assignmentId,
        activeLessonTitle: title,
        activeUpdatedAt: Timestamp.now(),
      });
    } catch (e: unknown) {
      setSaveErr(getErrorInfo(e).message || "Could not set active task.");
    } finally {
      setSaving(false);
    }
  }

  // Assignments list
  useEffect(() => {
    if (access !== "allowed") return;

    const qy = query(collection(db, "spaces", spaceId, "lessons"), orderBy("assignedAt", "desc"));

    return onSnapshot(qy, (snap) => {
      const next: AssignmentRow[] = snap.docs.map((d) => ({
        id: d.id,
        data: (d.data() as AssignmentDoc) ?? ({} as AssignmentDoc),
      }));
      setAssignments(next);
    });
  }, [access, spaceId]);

  const visibleAssignments = useMemo(() => {
    return showArchived ? assignments : assignments.filter((a) => a.data.status !== "archived");
  }, [assignments, showArchived]);

  // Ensure submission-summary listeners for visible assignments
  useEffect(() => {
    if (access !== "allowed") return;

    const visibleIds = new Set(visibleAssignments.map((a) => a.id));

    // Unsubscribe listeners that are no longer visible (avoid empty blocks)
    Object.entries(subSummaryUnsubByAssignment).forEach(([assignmentId, unsub]) => {
      if (!visibleIds.has(assignmentId)) {
        try {
          unsub();
        } catch (e: unknown) {
          // ignore
          void e;
        }
        setSubSummaryUnsubByAssignment((m) => {
          const copy = { ...m };
          delete copy[assignmentId];
          return copy;
        });
      }
    });

    // Subscribe missing
    visibleAssignments.forEach((a) => {
      if (subSummaryUnsubByAssignment[a.id]) return;

      setSubSummaryErrByAssignment((m) => ({ ...m, [a.id]: null }));

      const qy = query(
        collection(db, "spaces", spaceId, "lessons", a.id, "submissions"),
        orderBy("createdAt", "desc"),
        limit(200)
      );

      const unsub = onSnapshot(
        qy,
        (snap) => {
          let newCount = 0;
          snap.docs.forEach((d) => {
            const data = (d.data() as SubmissionData) ?? {};
            if (!isReviewedStatus(data.status)) newCount += 1;
          });

          setSubSummaryByAssignment((m) => ({
            ...m,
            [a.id]: { total: snap.size, newCount },
          }));
        },
        (err: unknown) => {
          const info = getErrorInfo(err);
          setSubSummaryErrByAssignment((m) => ({ ...m, [a.id]: info.message || "Could not read submissions." }));
        }
      );

      setSubSummaryUnsubByAssignment((m) => ({ ...m, [a.id]: unsub }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, spaceId, visibleAssignments]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(subSummaryUnsubByAssignment).forEach((u) => {
        try {
          u();
        } catch (e: unknown) {
          // ignore
          void e;
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load My Content (published + unlisted only)
  useEffect(() => {
    if (access !== "allowed") return;
    if (!user?.uid) return;

    const qy = query(
      collection(db, "lessons"),
      where("ownerId", "==", user.uid),
      where("status", "in", ["published", "unlisted"]),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    return onSnapshot(qy, (snap) => setMyContent(snap.docs.map((d) => ({ id: d.id, data: snapTo<MyLesson>(d) }))));
  }, [access, user?.uid]);

  // Load Library (unpaged)
  useEffect(() => {
    if (access !== "allowed") return;

    const qy = query(
      collection(db, "published_lessons"),
      where("isActive", "==", true),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    return onSnapshot(qy, (snap) => setLibrary(snap.docs.map((d) => ({ id: d.id, data: snapTo<LibraryLesson>(d) }))));
  }, [access]);

  useEffect(() => setPageMy(0), [assignTab, assignSearch]);

  const filteredMyContent = useMemo(() => {
    const s = assignSearch.trim().toLowerCase();
    if (!s) return myContent;
    return myContent.filter((x) => {
      const t = (x.data.title ?? "").toString().toLowerCase();
      const lvl = (x.data.level ?? "").toString().toLowerCase();
      const lang = (x.data.language ?? "").toString().toLowerCase();
      return t.includes(s) || lvl.includes(s) || lang.includes(s) || x.id.toLowerCase().includes(s);
    });
  }, [myContent, assignSearch]);

  const filteredLibrary = useMemo(() => {
    const s = assignSearch.trim().toLowerCase();
    if (!s) return library;
    return library.filter((x) => {
      const t = (x.data.title ?? "").toString().toLowerCase();
      const lvl = (x.data.level ?? "").toString().toLowerCase();
      const lang = (x.data.language ?? "").toString().toLowerCase();
      return t.includes(s) || lvl.includes(s) || lang.includes(s) || x.id.toLowerCase().includes(s);
    });
  }, [library, assignSearch]);

  const pagedMy = useMemo(() => {
    const start = pageMy * PAGE_SIZE;
    return filteredMyContent.slice(start, start + PAGE_SIZE);
  }, [filteredMyContent, pageMy]);

  const myRangeText = useMemo(() => {
    const total = filteredMyContent.length;
    if (total === 0) return "0 of 0";
    const start = pageMy * PAGE_SIZE + 1;
    const end = Math.min((pageMy + 1) * PAGE_SIZE, total);
    return `${start}-${end} of ${total}`;
  }, [filteredMyContent.length, pageMy]);

  async function assignTask(src: { type: SourceType; id: string; title?: string; level?: string; language?: string }) {
    setSaveErr(null);

    if (!canOperateSpace) {
      setSaveErr("To manage this space, you need attestation and Teacher/Creator mode.");
      return;
    }
    if (access !== "allowed") {
      setSaveErr("You do not have access to manage this space.");
      return;
    }
    if (!user?.uid) return;

    const payload: AssignmentDoc = {
      status: "active",
      sourceType: src.type,
      sourceId: src.id,
      title: (src.title ?? "Untitled task").toString(),
      level: src.level,
      language: src.language,
      assignedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      assignedByUid: user.uid,
    };

    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "spaces", spaceId, "lessons"), payload);

      await updateDoc(doc(db, "spaces", spaceId), {
        activeLessonId: ref.id,
        activeLessonTitle: payload.title ?? null,
        activeUpdatedAt: Timestamp.now(),
      });

      setAssignOpen(false);
      setAssignSearch("");
    } catch (e: unknown) {
      setSaveErr(getErrorInfo(e).message || "Could not assign task.");
    } finally {
      setSaving(false);
    }
  }

  async function setAssignmentStatus(assignmentId: string, status: "active" | "archived") {
    setSaveErr(null);

    if (!canOperateSpace) {
      setSaveErr("To manage this space, you need attestation and Teacher/Creator mode.");
      return;
    }
    if (access !== "allowed") {
      setSaveErr("You do not have access to manage this space.");
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "spaces", spaceId, "lessons", assignmentId), { status, updatedAt: Timestamp.now() });

      if (status === "archived" && activeForStudentsId === assignmentId) {
        const nextActive = assignments.find((a) => a.id !== assignmentId && a.data.status !== "archived");
        await updateDoc(doc(db, "spaces", spaceId), {
          activeLessonId: nextActive ? nextActive.id : null,
          activeLessonTitle: nextActive ? (nextActive.data.title ?? null) : null,
          activeUpdatedAt: Timestamp.now(),
        });
      }

      if (status === "active" && !activeForStudentsId) {
        const restoredTitle = assignments.find((a) => a.id === assignmentId)?.data?.title ?? null;
        await updateDoc(doc(db, "spaces", spaceId), {
          activeLessonId: assignmentId,
          activeLessonTitle: restoredTitle,
          activeUpdatedAt: Timestamp.now(),
        });
      }
    } catch (e: unknown) {
      setSaveErr(getErrorInfo(e).message || "Could not update assignment.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-4xl p-4 text-sm text-muted-foreground">Loading…</div>;
  if (!space) return <div className="mx-auto max-w-4xl p-4 text-sm text-muted-foreground">Loading…</div>;

  if (access === "checking") {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="m-0 text-2xl font-semibold">Space</h1>
            <div className="mt-1 text-sm text-muted-foreground">Verifying access…</div>
          </div>
          <Link className="text-sm underline" href="/teacher/spaces">
            ← Back
          </Link>
        </div>
      </div>
    );
  }

  if (access === "denied") {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="m-0 text-2xl font-semibold">No access</h1>
            <div className="mt-2 text-sm text-muted-foreground">
              {accessReason || "You do not have access to this space."}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              To join, use the join link/code or ask the owner to add you.
            </div>
          </div>
          <Link className="text-sm underline" href="/teacher/spaces">
            ← Back
          </Link>
        </div>

        <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-base font-semibold">Join this space</div>
          <div className="mt-2 text-sm text-muted-foreground">
            Join link:{" "}
            <Link className="underline" href={joinLink}>
              {joinLink}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      {/* Top / Overview */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[240px]">
            <h1 className="m-0 text-2xl font-semibold">{space.title}</h1>

            <div className="mt-1 text-sm text-muted-foreground">
              Here you can find codes and links you can send to members, so they can join your space.
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Code:</span>
              <button
                type="button"
                onClick={() => copyToClipboard(joinCode, "code")}
                className="rounded-lg border px-2 py-0.5 text-sm font-medium hover:shadow-sm"
                title="Copy code"
              >
                {joinCode || "—"}
              </button>
              {copiedKey === "code" && <span className="text-xs">Copied ✅</span>}
              <span className="mx-1">·</span>
              <span>
                Open: <b>{isOpen ? "Yes" : "No"}</b>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link className="text-sm underline" href="/teacher/spaces">
              ← Back
            </Link>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const url = `${window.location.origin}${joinLink}`;
              copyToClipboard(url, "joinlink");
            }}
            className="rounded-xl border px-3 py-2 text-sm hover:shadow-sm"
          >
            Copy join link
          </button>
          {copiedKey === "joinlink" && <span className="self-center text-xs">Copied ✅</span>}

          <button type="button" onClick={openQr} className="rounded-xl border px-3 py-2 text-sm hover:shadow-sm">
            QR
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {activeForStudentsId ? (
              <>
                <span className="text-sm text-muted-foreground">
                  Active for students: <b>{activeForStudentsTitle || "Task"}</b>
                </span>
                <button
                  type="button"
                  onClick={() => setActiveForStudents(null)}
                  disabled={saving || !canOperateSpace}
                  className="rounded-xl border px-3 py-2 text-sm hover:shadow-sm disabled:opacity-50"
                >
                  Clear
                </button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                Active for students: <b>—</b>
              </span>
            )}
          </div>
        </div>
      </div>

      {!canOperateSpace && (
        <div className="mt-4 grid gap-3">
          <AttestationAndModeCard
            attestationVersion="2026-02-09"
            allowedModes={["student", "teacher", "creator", "parent"]}
            requireAttestationForProModes={true}
          />
          <div className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground shadow-sm">
            To manage spaces (B1 model), you need <b>attestation</b> and <b>teacher</b> or <b>creator</b> mode.
          </div>
        </div>
      )}

      {saveErr && (
        <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{saveErr}</div>
      )}

      {/* Assignments */}
      <div className="mt-4 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold">Assignments</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Assign tasks from My Content or Library. Students see assigned tasks after they join.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              disabled={!canOperateSpace || saving}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Assign task
            </button>

            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="rounded-xl border px-4 py-2 text-sm hover:shadow-sm"
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </button>

            <button
              type="button"
              onClick={async () => {
                setSaveErr(null);
                if (!canOperateSpace) {
                  setSaveErr("To manage this space, you need attestation and Teacher/Creator mode.");
                  return;
                }
                setSaving(true);
                try {
                  await setSpaceOpen(spaceId, !isOpen);
                } catch (e: unknown) {
                  setSaveErr(getErrorInfo(e).message || "Could not update space.");
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving || !canOperateSpace}
              className="rounded-xl border px-4 py-2 text-sm hover:shadow-sm disabled:opacity-50"
            >
              {isOpen ? "Close space" : "Open space"}
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          {visibleAssignments.length === 0 ? (
            <div className="rounded-xl border p-4 text-sm text-muted-foreground">
              No assignments yet. Click <b>Assign task</b>.
            </div>
          ) : (
            visibleAssignments.map((a) => {
              const assignedAt = formatMaybeDate(a.data.assignedAt || a.data.createdAt);
              const status = a.data.status ?? "active";
              const sourceLabel = a.data.sourceType === "library" ? "Library" : "My Content";
              const isActiveForStudents = activeForStudentsId === a.id;

              const summary = subSummaryByAssignment[a.id] ?? { total: 0, newCount: 0 };
              const sumErr = subSummaryErrByAssignment[a.id] ?? null;

              const allReviewed = summary.total > 0 && summary.newCount === 0;
              const hasNew = summary.newCount > 0;

              return (
                <div key={a.id} className="rounded-xl border">
                  <div className="flex flex-wrap items-start justify-between gap-3 p-3">
                    <div className="min-w-[220px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold">{a.data.title || "Untitled task"}</div>

                        {isActiveForStudents && <span className="rounded-full border px-2 py-0.5 text-xs">Active</span>}

                        {status === "archived" && (
                          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Archived</span>
                        )}

                        {!sumErr ? (
                          <>
                            {summary.total === 0 ? (
                              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                                No submissions
                              </span>
                            ) : allReviewed ? (
                              <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
                                All reviewed
                              </span>
                            ) : hasNew ? (
                              <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-900">
                                {summary.newCount} new
                              </span>
                            ) : (
                              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                                {summary.total} submissions
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
                            Submissions: error
                          </span>
                        )}
                      </div>

                      <div className="mt-1 text-sm text-muted-foreground">
                        {sourceLabel}
                        {a.data.level ? ` · ${a.data.level}` : ""}
                        {a.data.language ? ` · ${a.data.language}` : ""}
                        {assignedAt ? ` · ${assignedAt}` : ""}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/teacher/spaces/${spaceId}/lessons/${a.id}`)}
                        className="rounded-xl border px-4 py-2 text-sm hover:shadow-sm"
                      >
                        Submissions
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveForStudents(a.id)}
                        disabled={saving || !canOperateSpace || status === "archived"}
                        className={[
                          "rounded-xl border px-4 py-2 text-sm hover:shadow-sm disabled:opacity-50",
                          isActiveForStudents ? "bg-black text-white" : "",
                        ].join(" ")}
                      >
                        Set active
                      </button>

                      {status !== "archived" ? (
                        <button
                          type="button"
                          onClick={() => setAssignmentStatus(a.id, "archived")}
                          disabled={saving || !canOperateSpace}
                          className="rounded-xl border px-4 py-2 text-sm hover:shadow-sm disabled:opacity-50"
                        >
                          Archive
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAssignmentStatus(a.id, "active")}
                          disabled={saving || !canOperateSpace}
                          className="rounded-xl border px-4 py-2 text-sm hover:shadow-sm disabled:opacity-50"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Assign modal */}
      {assignOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAssignOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-2xl rounded-2xl border bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Assign task</div>
                <div className="mt-1 text-sm text-muted-foreground">Choose from My Content or Library.</div>
              </div>
              <button
                type="button"
                onClick={() => setAssignOpen(false)}
                className="rounded-xl border px-3 py-2 text-sm hover:shadow-sm"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAssignTab("myContent")}
                className={[
                  "rounded-xl border px-3 py-2 text-sm",
                  assignTab === "myContent" ? "bg-black text-white" : "bg-white",
                ].join(" ")}
              >
                My Content
              </button>
              <button
                type="button"
                onClick={() => setAssignTab("library")}
                className={[
                  "rounded-xl border px-3 py-2 text-sm",
                  assignTab === "library" ? "bg-black text-white" : "bg-white",
                ].join(" ")}
              >
                Library
              </button>

              <input
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                placeholder="Search title / level / language…"
                className="ml-auto w-full rounded-xl border px-3 py-2 text-sm md:w-[360px]"
              />
            </div>

            <div className="mt-4 grid gap-2">
              {assignTab === "myContent" && (
                <>
                  {pagedMy.length === 0 ? (
                    <div className="rounded-xl border p-4 text-sm text-muted-foreground">No results.</div>
                  ) : (
                    pagedMy.map((x) => (
                      <div key={x.id} className="rounded-xl border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">{x.data.title || "Untitled"}</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {x.data.level ? x.data.level : "—"}
                              {x.data.language ? ` · ${x.data.language}` : ""}
                              {x.data.status ? ` · ${x.data.status}` : ""}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              lessonId: <code>{x.id}</code>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              assignTask({
                                type: "myContent",
                                id: x.id,
                                title: x.data.title,
                                level: x.data.level,
                                language: x.data.language,
                              })
                            }
                            disabled={saving || !canOperateSpace}
                            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                          >
                            Assign
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
                      disabled={pageMy === 0}
                      onClick={() => setPageMy((p) => Math.max(0, p - 1))}
                    >
                      ← Previous
                    </button>

                    <div className="text-xs text-muted-foreground">
                      Showing <b>{myRangeText}</b>
                    </div>

                    <button
                      type="button"
                      className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
                      disabled={(pageMy + 1) * PAGE_SIZE >= filteredMyContent.length}
                      onClick={() => setPageMy((p) => p + 1)}
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}

              {assignTab === "library" && (
                <>
                  {filteredLibrary.length === 0 ? (
                    <div className="rounded-xl border p-4 text-sm text-muted-foreground">No results.</div>
                  ) : (
                    filteredLibrary.map((x) => (
                      <div key={x.id} className="rounded-xl border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">{x.data.title || "Untitled"}</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {x.data.level ? x.data.level : "—"}
                              {x.data.language ? ` · ${x.data.language}` : ""}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              publishedLessonId: <code>{x.id}</code>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              assignTask({
                                type: "library",
                                id: x.id,
                                title: x.data.title,
                                level: x.data.level,
                                language: x.data.language,
                              })
                            }
                            disabled={saving || !canOperateSpace}
                            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                          >
                            Assign
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {qr.open && (
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
                  Code: <b>{joinCode}</b>
                </div>
              </div>
              <button type="button" onClick={closeQr} className="rounded-xl border px-3 py-2 text-sm hover:shadow-sm">
                Close
              </button>
            </div>

            <div className="mt-4 rounded-xl border p-4">
              {qr.busy && <div className="text-sm text-muted-foreground">Generating…</div>}
              {qr.err && <div className="text-sm text-red-600">{qr.err}</div>}

              {qr.dataUrl && (
                <div className="flex flex-col items-center gap-3">
                  <Image
                    src={qr.dataUrl}
                    alt="QR code"
                    width={256}
                    height={256}
                    unoptimized
                    className="h-auto w-64 rounded-lg border"
                  />
                  <div className="text-center text-xs text-muted-foreground">
                    Points to <b>{typeof window !== "undefined" ? `${window.location.origin}${joinLink}` : joinLink}</b>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              If needed: <b>npm i qrcode</b>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}