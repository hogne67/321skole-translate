// app/[locale]/(app)/teacher/spaces/[spaceId]/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import { getAuth } from "firebase/auth";
import {
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
import { useLocale, useTranslations } from "next-intl";

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

type AssignmentRow = { id: string; data: AssignmentDoc };

type SubmissionData = { createdAt?: unknown; status?: unknown };

type MyLesson = {
  title?: string;
  level?: string;
  language?: string;
  ownerId?: string;
  status?: string;
  type?: string;
  taskType?: string;
  contentType?: string;
  kind?: string;
};

type LibraryLesson = {
  title?: string;
  level?: string;
  language?: string;
  isActive?: boolean;
  type?: string;
  taskType?: string;
  contentType?: string;
  kind?: string;
};

type SpaceDocSafe = SpaceDoc & {
  ownerId?: unknown;
  code?: unknown;
  isOpen?: unknown;
  activeLessonId?: unknown;
  activeLessonTitle?: unknown;
  title?: unknown;
};

type QuotaState = {
  feature: string;
  periodKey: string;
  limit: number;
  used: number;
  remaining: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
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

function isReviewedStatus(statusRaw: unknown): boolean {
  const s = typeof statusRaw === "string" ? statusRaw.toLowerCase().trim() : "";
  return s === "reviewed" || s === "approved" || s === "needs_work" || s === "needswork";
}

function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "pt") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
}

function parseJsonUnknown(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function normalizeLang(s: unknown): string {
  const v = typeof s === "string" ? s.trim().toLowerCase() : "";
  if (!v) return "";
  if (v === "nb-no" || v === "nb_no") return "nb";
  if (v === "nn-no" || v === "nn_no") return "nn";
  if (v === "no-no" || v === "no_no") return "no";
  return v;
}

function queryImpliesLang(q: string): string[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];

  if (["norsk", "norwegian", "nor", "no", "nb", "bokmål", "bokmal"].includes(s)) return ["no", "nb"];
  if (["nynorsk", "nn"].includes(s)) return ["nn"];
  if (["engelsk", "english", "en"].includes(s)) return ["en"];
  if (["portugisisk", "portuguese", "pt", "brasil", "brazil", "br"].includes(s)) return ["pt", "pt-br", "pt_br"];
  if (["spansk", "spanish", "es"].includes(s)) return ["es"];

  return [];
}

function matchesLanguage(docLangRaw: unknown, searchRaw: string): boolean {
  const q = searchRaw.trim().toLowerCase();
  if (!q) return true;

  const implied = queryImpliesLang(q);
  if (implied.length === 0) return false;

  const docLang = normalizeLang(docLangRaw);
  return implied.some((code) => {
    const c = normalizeLang(code);
    return docLang === c || docLang.startsWith(c);
  });
}

function normalizeType(s: unknown): string {
  return typeof s === "string" ? s.trim().toLowerCase() : "";
}

function queryImpliesType(q: string): string[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];

  if (["text", "tekst", "writing", "skriving", "free", "fritekst"].includes(s)) return ["text", "writing", "free", "free_text"];
  if (["mcq", "multiple", "multiple choice", "flervalg"].includes(s)) return ["mcq", "multiple", "multiple_choice"];
  if (["truefalse", "true/false", "sant", "usant", "sant/usant"].includes(s)) return ["truefalse", "true_false", "tf"];
  if (["quiz", "test"].includes(s)) return ["quiz", "test"];

  return [];
}

function matchesType(doc: { type?: unknown; taskType?: unknown; contentType?: unknown; kind?: unknown }, searchRaw: string): boolean {
  const q = searchRaw.trim().toLowerCase();
  if (!q) return true;

  const implied = queryImpliesType(q);
  if (implied.length === 0) return false;

  const candidates = [
    normalizeType(doc.type),
    normalizeType(doc.taskType),
    normalizeType(doc.contentType),
    normalizeType(doc.kind),
  ].filter(Boolean);

  if (candidates.length === 0) return false;

  return implied.some((t) => candidates.some((c) => c === t || c.includes(t)));
}

export default function TeacherSpaceDetailPage() {
  return (
    <AuthGate>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const t = useTranslations("teacher.spaceDetail");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const router = useRouter();
  const { user, profile, loading } = useUserProfile();
  const params = useParams<{ spaceId: string }>();
  const spaceId = params.spaceId;

  const isAdmin = useMemo(() => readIsAdmin(profile), [profile]);
  const canOperateSpace = accessAllowedGuard(user?.uid);

  const [space, setSpace] = useState<SpaceDocSafe | null>(null);

  const [access, setAccess] = useState<AccessState>("checking");
  const [accessReason, setAccessReason] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const [subSummaryByAssignment, setSubSummaryByAssignment] = useState<Record<string, { total: number; newCount: number }>>({});
  const [subSummaryErrByAssignment, setSubSummaryErrByAssignment] = useState<Record<string, string | null>>({});
  const [subSummaryUnsubByAssignment, setSubSummaryUnsubByAssignment] = useState<Record<string, Unsubscribe>>({});

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTab, setAssignTab] = useState<SourceType>("myContent");
  const [assignSearch, setAssignSearch] = useState("");

  const PAGE_SIZE = 5;
  const PAGE_LIB_SIZE = 25;

  const [pageMy, setPageMy] = useState(0);
  const [pageLib, setPageLib] = useState(0);

  const [myContent, setMyContent] = useState<Array<{ id: string; data: MyLesson }>>([]);
  const [library, setLibrary] = useState<Array<{ id: string; data: LibraryLesson }>>([]);

  const FEATURE_ASSIGN = "teacher_assign_task";
  const [, setQuota] = useState<QuotaState | null>(null);
  const [quotaErr, setQuotaErr] = useState<string | null>(null);

  const loadQuota = useCallback(async () => {
    setQuotaErr(null);
    try {
      const u = getAuth().currentUser;
      if (!u) {
        setQuota(null);
        return;
      }

      const token = await u.getIdToken();
      const res = await fetch(`/api/quota?feature=${encodeURIComponent(FEATURE_ASSIGN)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const raw = await res.text();
      const data: unknown = parseJsonUnknown(raw) ?? {};

      if (!res.ok) {
        const msg = isRecord(data) && typeof data["error"] === "string" ? String(data["error"]) : raw || `Quota request failed (${res.status})`;
        throw new Error(msg);
      }

      if (
        isRecord(data) &&
        typeof data["limit"] === "number" &&
        typeof data["used"] === "number" &&
        typeof data["remaining"] === "number" &&
        typeof data["periodKey"] === "string"
      ) {
        setQuota({
          feature: FEATURE_ASSIGN,
          periodKey: String(data["periodKey"]),
          limit: Number(data["limit"]),
          used: Number(data["used"]),
          remaining: Number(data["remaining"]),
        });
      } else {
        setQuota(null);
      }
    } catch (e: unknown) {
      setQuota(null);
      setQuotaErr(getErrorInfo(e).message || "Failed to load quota");
    }
  }, [FEATURE_ASSIGN]);

  useEffect(() => {
    const ref = doc(db, "spaces", spaceId);
    return onSnapshot(ref, (snap) => setSpace(snap.exists() ? (snap.data() as SpaceDocSafe) : null));
  }, [spaceId]);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (loading) return;

      if (!user?.uid) {
        if (!alive) return;
        setAccess("denied");
        setAccessReason(t("access.mustBeSignedIn"));
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
          setAccessReason(t("access.notMember"));
        }
      } catch (e: unknown) {
        if (!alive) return;
        setAccess("denied");
        setAccessReason(getErrorInfo(e).message || t("access.verifyFailed"));
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [loading, user?.uid, isAdmin, spaceId, space, t]);

  useEffect(() => {
    if (access !== "allowed") return;
    if (!user?.uid) return;
    void loadQuota();
  }, [access, user?.uid, loadQuota]);

  useEffect(() => {
    if (!assignOpen) return;
    if (access !== "allowed") return;
    void loadQuota();
  }, [assignOpen, access, loadQuota]);

  const activeForStudentsId = useMemo(() => {
    const v = space?.activeLessonId;
    return typeof v === "string" && v.trim() ? v : null;
  }, [space]);

  const activeForStudentsTitle = useMemo(() => {
    const v = space?.activeLessonTitle;
    return typeof v === "string" ? v : "";
  }, [space]);

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

  const visibleAssignments = useMemo(
    () => (showArchived ? assignments : assignments.filter((a) => a.data.status !== "archived")),
    [assignments, showArchived]
  );

  useEffect(() => {
    if (access !== "allowed") return;

    const visibleIds = new Set(visibleAssignments.map((a) => a.id));

    Object.entries(subSummaryUnsubByAssignment).forEach(([assignmentId, unsub]) => {
      if (!visibleIds.has(assignmentId)) {
        try {
          unsub();
        } catch {
          // ignore
        }
        setSubSummaryUnsubByAssignment((m) => {
          const copy = { ...m };
          delete copy[assignmentId];
          return copy;
        });
      }
    });

    visibleAssignments.forEach((a) => {
      if (subSummaryUnsubByAssignment[a.id]) return;

      setSubSummaryErrByAssignment((m) => ({ ...m, [a.id]: null }));

      const qy = query(collection(db, "spaces", spaceId, "lessons", a.id, "submissions"), orderBy("createdAt", "desc"), limit(200));

      const unsub = onSnapshot(
        qy,
        (snap) => {
          let newCount = 0;
          snap.docs.forEach((d) => {
            const data = (d.data() as SubmissionData) ?? {};
            if (!isReviewedStatus(data.status)) newCount += 1;
          });

          setSubSummaryByAssignment((m) => ({ ...m, [a.id]: { total: snap.size, newCount } }));
        },
        (err: unknown) => {
          const info = getErrorInfo(err);
          setSubSummaryErrByAssignment((m) => ({ ...m, [a.id]: info.message || t("errors.readSubmissionsFailed") }));
        }
      );

      setSubSummaryUnsubByAssignment((m) => ({ ...m, [a.id]: unsub }));
    });
  }, [access, spaceId, visibleAssignments, subSummaryUnsubByAssignment, t]);

  useEffect(() => {
    return () => {
      Object.values(subSummaryUnsubByAssignment).forEach((u) => {
        try {
          u();
        } catch {
          // ignore
        }
      });
    };
  }, [subSummaryUnsubByAssignment]);

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

  useEffect(() => {
    if (access !== "allowed") return;

    const qy = query(collection(db, "published_lessons"), where("isActive", "==", true), orderBy("createdAt", "desc"), limit(50));

    return onSnapshot(qy, (snap) => setLibrary(snap.docs.map((d) => ({ id: d.id, data: snapTo<LibraryLesson>(d) }))));
  }, [access]);

  useEffect(() => {
    setPageMy(0);
    setPageLib(0);
  }, [assignTab, assignSearch]);

  const filteredMyContent = useMemo(() => {
    const s = assignSearch.trim().toLowerCase();
    if (!s) return myContent;

    return myContent.filter((x) => {
      const tt = (x.data.title ?? "").toString().toLowerCase();
      const lvl = (x.data.level ?? "").toString().toLowerCase();
      const lang = (x.data.language ?? "").toString().toLowerCase();
      const id = x.id.toLowerCase();

      if (tt.includes(s) || lvl.includes(s) || lang.includes(s) || id.includes(s)) return true;
      if (matchesLanguage(x.data.language, s)) return true;
      if (matchesType(x.data, s)) return true;

      return false;
    });
  }, [myContent, assignSearch]);

  const filteredLibrary = useMemo(() => {
    const s = assignSearch.trim().toLowerCase();
    if (!s) return library;

    return library.filter((x) => {
      const tt = (x.data.title ?? "").toString().toLowerCase();
      const lvl = (x.data.level ?? "").toString().toLowerCase();
      const lang = (x.data.language ?? "").toString().toLowerCase();
      const id = x.id.toLowerCase();

      if (tt.includes(s) || lvl.includes(s) || lang.includes(s) || id.includes(s)) return true;
      if (matchesLanguage(x.data.language, s)) return true;
      if (matchesType(x.data, s)) return true;

      return false;
    });
  }, [library, assignSearch]);

  const pagedMy = useMemo(() => {
    const start = pageMy * PAGE_SIZE;
    return filteredMyContent.slice(start, start + PAGE_SIZE);
  }, [filteredMyContent, pageMy]);

  const pagedLibrary = useMemo(() => {
    const start = pageLib * PAGE_LIB_SIZE;
    return filteredLibrary.slice(start, start + PAGE_LIB_SIZE);
  }, [filteredLibrary, pageLib]);

  const myRangeText = useMemo(() => {
    const total = filteredMyContent.length;
    if (total === 0) return t("assignModal.paging.zero");
    const start = pageMy * PAGE_SIZE + 1;
    const end = Math.min((pageMy + 1) * PAGE_SIZE, total);
    return t("assignModal.paging.range", { start, end, total });
  }, [filteredMyContent.length, pageMy, t]);

  const libRangeText = useMemo(() => {
    const total = filteredLibrary.length;
    if (total === 0) return "0";
    const start = pageLib * PAGE_LIB_SIZE + 1;
    const end = Math.min((pageLib + 1) * PAGE_LIB_SIZE, total);
    return `${start}–${end} / ${total}`;
  }, [filteredLibrary.length, pageLib]);

  async function assignTask(src: { type: SourceType; id: string; title?: string; level?: string; language?: string }) {
    setSaveErr(null);

    if (access !== "allowed") {
      setSaveErr(t("errors.noManageAccess"));
      return;
    }
    if (!user?.uid) return;

    setSaving(true);
    try {
      const u = getAuth().currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch(`/api/teacher/spaces/${spaceId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sourceType: src.type,
          sourceId: src.id,
          title: (src.title ?? t("fallback.untitledTask")).toString(),
          level: src.level,
          language: src.language,
        }),
      });

      const raw = await res.text();
      const data: unknown = parseJsonUnknown(raw) ?? {};

      if (res.status === 429) {
        setSaveErr("Du har nå nådd grensen for denne måneden (0 igjen).");
        void loadQuota();
        return;
      }

      if (!res.ok) {
        const msg = isRecord(data) && typeof data["error"] === "string" ? String(data["error"]) : raw || `Request failed (${res.status})`;
        throw new Error(msg);
      }

      setAssignOpen(false);
      setAssignSearch("");
      void loadQuota();
    } catch (e: unknown) {
      setSaveErr(getErrorInfo(e).message || t("errors.assignFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function setActiveForStudents(assignmentId: string | null) {
    setSaveErr(null);

    if (access !== "allowed") {
      setSaveErr(t("errors.noManageAccess"));
      return;
    }
    if (!user?.uid) return;

    const title = assignmentId ? assignments.find((a) => a.id === assignmentId)?.data?.title ?? null : null;

    setSaving(true);
    try {
      await updateDoc(doc(db, "spaces", spaceId), {
        activeLessonId: assignmentId,
        activeLessonTitle: title,
        activeUpdatedAt: Timestamp.now(),
      });
    } catch (e: unknown) {
      setSaveErr(getErrorInfo(e).message || t("errors.setActiveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function setAssignmentStatus(assignmentId: string, status: "active" | "archived") {
    setSaveErr(null);

    if (access !== "allowed") {
      setSaveErr(t("errors.noManageAccess"));
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
      setSaveErr(getErrorInfo(e).message || t("errors.updateAssignmentFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="w-full py-4 text-sm text-slate-600">{tCommon("loading")}</div>;
  if (!space) return <div className="w-full py-4 text-sm text-slate-600">{tCommon("loading")}</div>;

  if (access === "checking") {
    return (
      <div className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="m-0 text-2xl font-semibold text-slate-900">{t("checking.title")}</h1>
            <div className="mt-1 text-sm text-slate-600">{t("checking.subtitle")}</div>
          </div>
          <Link className="text-sm font-medium text-slate-700 underline underline-offset-4" href={withLocale(locale, "/teacher/spaces")}>
            {t("actions.back")}
          </Link>
        </div>
      </div>
    );
  }

  if (access === "denied") {
    return (
      <div className="w-full">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="m-0 text-2xl font-semibold text-slate-900">{t("denied.title")}</h1>
            <div className="mt-2 text-sm text-slate-600">{accessReason || t("denied.subtitle")}</div>
            <div className="mt-2 text-sm text-slate-600">{t("denied.hint")}</div>
          </div>
          <Link className="text-sm font-medium text-slate-700 underline underline-offset-4" href={withLocale(locale, "/teacher/spaces")}>
            {t("actions.back")}
          </Link>
        </div>
      </div>
    );
  }

  const canManage = access === "allowed" && Boolean(user?.uid) && canOperateSpace;

  return (
    <div className="w-full space-y-4">
      <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-md sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 break-words text-2xl font-semibold text-slate-900">{String(space.title ?? "")}</h1>
            <div className="mt-1 text-sm text-slate-600">{t("overview.subtitle")}</div>
          </div>

          <div className="flex w-full justify-start lg:w-auto lg:justify-end">
            <Link className="text-sm font-medium text-slate-700 underline underline-offset-4" href={withLocale(locale, "/teacher/spaces")}>
              {t("actions.back")}
            </Link>
          </div>
        </div>
      </div>

      {saveErr && <div className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{saveErr}</div>}

      <div className="rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-md sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-base font-semibold text-slate-900">{t("assignments.title")}</div>
            <div className="mt-1 text-sm text-slate-600">{t("assignments.subtitle")}</div>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap xl:justify-end">
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              disabled={!canManage || saving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {t("assignments.assignTask")}
            </button>

            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              {showArchived ? t("assignments.hideArchived") : t("assignments.showArchived")}
            </button>

            <button
              type="button"
              onClick={async () => {
                setSaveErr(null);
                if (!canManage) {
                  setSaveErr(t("errors.noManageAccess"));
                  return;
                }
                setSaving(true);
                try {
                  await setSpaceOpen(spaceId, !(space?.isOpen === true));
                } catch (e: unknown) {
                  setSaveErr(getErrorInfo(e).message || t("errors.updateSpaceFailed"));
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving || !canManage}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:col-span-2 xl:col-span-1"
            >
              {space?.isOpen ? t("assignments.closeSpace") : t("assignments.openSpace")}
            </button>
          </div>

          {quotaErr && <div className="text-xs text-slate-600">{quotaErr}</div>}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-300 bg-slate-200 p-4 shadow-md sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-base font-semibold text-slate-900">{t("assignments.title")}</div>
            <div className="mt-1 text-sm text-slate-600">
              {visibleAssignments.length} {visibleAssignments.length === 1 ? "oppgave" : "oppgaver"}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {visibleAssignments.length === 0 ? (
            <div className="rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-600">
              {t.rich("assignments.emptyHtml", { b: (chunks) => <b>{chunks}</b> })}
            </div>
          ) : (
            visibleAssignments.map((a) => {
              const assignedAt = formatMaybeDate(a.data.assignedAt || a.data.createdAt);
              const status = a.data.status ?? "active";
              const sourceLabel = a.data.sourceType === "library" ? t("labels.library") : t("labels.myContent");
              const isActiveForStudents = activeForStudentsId === a.id;

              const summary = subSummaryByAssignment[a.id] ?? { total: 0, newCount: 0 };
              const sumErr = subSummaryErrByAssignment[a.id] ?? null;

              const allReviewed = summary.total > 0 && summary.newCount === 0;
              const hasNew = summary.newCount > 0;

              return (
                <div key={a.id} className="rounded-xl border border-slate-300 bg-white p-3 shadow-sm sm:p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="break-words font-semibold text-slate-900">{a.data.title || t("fallback.untitledTask")}</div>

                        {isActiveForStudents && (
                          <span className="rounded-full border border-slate-300 bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
                            {t("badges.active")}
                          </span>
                        )}

                        {status === "archived" && (
                          <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                            {t("badges.archived")}
                          </span>
                        )}

                        {!sumErr ? (
                          <>
                            {summary.total === 0 ? (
                              <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                                {t("badges.noSubmissions")}
                              </span>
                            ) : allReviewed ? (
                              <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
                                {t("badges.allReviewed")}
                              </span>
                            ) : hasNew ? (
                              <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-900">
                                {t("badges.newCount", { n: summary.newCount })}
                              </span>
                            ) : (
                              <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                                {t("badges.submissionsCount", { n: summary.total })}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
                            {t("badges.submissionsError")}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 break-words text-sm text-slate-600">
                        {sourceLabel}
                        {a.data.level ? ` · ${a.data.level}` : ""}
                        {a.data.language ? ` · ${a.data.language}` : ""}
                        {assignedAt ? ` · ${assignedAt}` : ""}
                      </div>
                    </div>

                    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap xl:justify-end">
                      <button
                        type="button"
                        onClick={() => router.push(withLocale(locale, `/teacher/spaces/${spaceId}/lessons/${a.id}`))}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                      >
                        {t("actions.submissions")}
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveForStudents(a.id)}
                        disabled={saving || !canManage || status === "archived"}
                        className={[
                          "rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50",
                          isActiveForStudents
                            ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                            : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        {t("actions.setActive")}
                      </button>

                      {status !== "archived" ? (
                        <button
                          type="button"
                          onClick={() => setAssignmentStatus(a.id, "archived")}
                          disabled={saving || !canManage}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:col-span-2 xl:col-span-1"
                        >
                          {t("actions.archive")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAssignmentStatus(a.id, "active")}
                          disabled={saving || !canManage}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:col-span-2 xl:col-span-1"
                        >
                          {t("actions.restore")}
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

      {assignOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 p-3 sm:p-4" onClick={() => setAssignOpen(false)} role="dialog" aria-modal="true">
          <div className="mx-auto w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="max-h-[90vh] overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-xl">
              <div className="border-b border-slate-200 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-slate-900">{t("assignModal.title")}</div>
                    <div className="mt-1 text-sm text-slate-600">{t("assignModal.subtitle")}</div>
                    {quotaErr && <div className="mt-2 text-xs text-slate-600">{quotaErr}</div>}
                  </div>

                  <button
                    type="button"
                    onClick={() => setAssignOpen(false)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 sm:w-auto"
                  >
                    {t("assignModal.close")}
                  </button>
                </div>

                <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setAssignTab("myContent")}
                      className={[
                        "rounded-xl border px-3 py-2 text-sm font-medium",
                        assignTab === "myContent"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {t("labels.myContent")}
                    </button>

                    <button
                      type="button"
                      onClick={() => setAssignTab("library")}
                      className={[
                        "rounded-xl border px-3 py-2 text-sm font-medium",
                        assignTab === "library"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {t("labels.library")}
                    </button>
                  </div>

                  <input
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    placeholder={t("assignModal.searchPlaceholder")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 lg:ml-auto lg:max-w-[360px]"
                  />
                </div>

                <div className="mt-3 grid grid-cols-3 items-center gap-2">
                  {assignTab === "myContent" ? (
                    <>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
                        disabled={pageMy === 0}
                        onClick={() => setPageMy((p) => Math.max(0, p - 1))}
                      >
                        {t("assignModal.paging.prev")}
                      </button>

                      <div className="px-2 text-center text-xs text-slate-600">
                        {t("assignModal.paging.showing")} <b className="text-slate-900">{myRangeText}</b>
                      </div>

                      <button
                        type="button"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
                        disabled={(pageMy + 1) * PAGE_SIZE >= filteredMyContent.length}
                        onClick={() => setPageMy((p) => p + 1)}
                      >
                        {t("assignModal.paging.next")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
                        disabled={pageLib === 0}
                        onClick={() => setPageLib((p) => Math.max(0, p - 1))}
                      >
                        {t("assignModal.paging.prev")}
                      </button>

                      <div className="px-2 text-center text-xs text-slate-600">
                        {t("assignModal.paging.showing")} <b className="text-slate-900">{libRangeText}</b>
                      </div>

                      <button
                        type="button"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
                        disabled={(pageLib + 1) * PAGE_LIB_SIZE >= filteredLibrary.length}
                        onClick={() => setPageLib((p) => p + 1)}
                      >
                        {t("assignModal.paging.next")}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="max-h-[calc(90vh-270px)] overflow-y-auto p-4 sm:p-5">
                <div className="grid gap-3">
                  {assignTab === "myContent" && (
                    <>
                      {pagedMy.length === 0 ? (
                        <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">{t("assignModal.noResults")}</div>
                      ) : (
                        pagedMy.map((x) => (
                          <div key={x.id} className="rounded-xl border border-slate-300 bg-white p-3 sm:p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="break-words font-semibold text-slate-900">{x.data.title || t("fallback.untitled")}</div>
                                <div className="mt-1 break-words text-sm text-slate-600">
                                  {x.data.level ? x.data.level : "—"}
                                  {x.data.language ? ` · ${x.data.language}` : ""}
                                  {x.data.status ? ` · ${x.data.status}` : ""}
                                </div>
                                <div className="mt-1 break-all text-xs text-slate-500">
                                  {t("assignModal.lessonId")}: <code>{x.id}</code>
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
                                disabled={saving || !canManage}
                                className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
                              >
                                {t("assignModal.assign")}
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}

                  {assignTab === "library" && (
                    <>
                      {filteredLibrary.length === 0 ? (
                        <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">{t("assignModal.noResults")}</div>
                      ) : (
                        pagedLibrary.map((x) => (
                          <div key={x.id} className="rounded-xl border border-slate-300 bg-white p-3 sm:p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="break-words font-semibold text-slate-900">{x.data.title || t("fallback.untitled")}</div>
                                <div className="mt-1 break-words text-sm text-slate-600">
                                  {x.data.level ? x.data.level : "—"}
                                  {x.data.language ? ` · ${x.data.language}` : ""}
                                </div>
                                <div className="mt-1 break-all text-xs text-slate-500">
                                  {t("assignModal.publishedLessonId")}: <code>{x.id}</code>
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
                                disabled={saving || !canManage}
                                className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
                              >
                                {t("assignModal.assign")}
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
          </div>
        </div>
      )}
    </div>
  );
}

function accessAllowedGuard(uid: string | undefined | null): boolean {
  return !!uid;
}