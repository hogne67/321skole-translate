// app/[locale]/(app)/teacher/spaces/[spaceId]/members/page.tsx
"use client";
import { getSpaceOwnerUid } from "@/lib/security/spaceOwnership";

import Link from "next/link";
import { ArrowLeft, ChevronDown, Printer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import TeacherPupilPicker from "@/components/TeacherPupilPicker";
import SchoolSpacePupilCard, { SchoolPupilNameFields } from "@/components/SchoolSpacePupilCard";
import SpaceAccessRequests, { type SpaceAccessRequest } from "@/components/SpaceAccessRequests";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import { getSpaceJoinCode } from "@/lib/spaceCode";
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useLocale, useTranslations } from "next-intl";

type MemberData = {
  spaceId?: string;
  userId?: string;
  uid?: string;
  participantId?: string;
  displayName?: string;
  email?: string;
  role?: string;
  staffRole?: string;
  archived?: boolean;
  active?: boolean;
  status?: string;
  isAnon?: boolean;
  studentCode?: string;
  studentCodeKey?: string;
  schoolPupilId?: string;
  schoolPupilRegistration?: boolean;
  createdAt?: unknown;
};

type MemberRow = {
  id: string;
  data: MemberData;
  deviceCount?: number;
};

const actionClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton = `${actionClass} border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
const primaryButton = `${actionClass} border-emerald-800 bg-emerald-800 text-white hover:bg-emerald-900`;
const dangerButton = `${actionClass} border-red-200 bg-white text-red-700 hover:bg-red-50`;
const fieldClass = "box-border min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-sky-700";
const disclosureClass = "flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 [&::-webkit-details-marker]:hidden";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function hasToDate(v: unknown): v is { toDate: () => Date } {
  return isRecord(v) && typeof (v as { toDate?: unknown }).toDate === "function";
}

function asDate(v: unknown): Date | null {
  if (!v) return null;
  if (hasToDate(v)) return v.toDate();
  return null;
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function memberRole(row: MemberRow): string {
  return String(row.data.staffRole || row.data.role || "member");
}

function memberUid(row: MemberRow): string {
  return String(row.data.userId ?? row.data.uid ?? "");
}

function memberCreatedMillis(row: MemberRow): number {
  return asDate(row.data.createdAt)?.getTime() ?? 0;
}

function memberGroupKey(row: MemberRow): string {
  const role = memberRole(row);
  if (role !== "student") return `doc:${row.id}`;

  const participantId = safeString(row.data.participantId);
  if (participantId) return `participant:${participantId}`;

  const studentCodeKey = safeString(row.data.studentCodeKey);
  if (studentCodeKey) return `student-code:${studentCodeKey}`;

  const studentCode = safeString(row.data.studentCode);
  if (studentCode) return `student-code:${row.data.spaceId ?? ""}:${studentCode}`;

  const uid = memberUid(row);
  return uid ? `uid:${uid}` : `doc:${row.id}`;
}

function preferMemberRow(current: MemberRow, candidate: MemberRow): MemberRow {
  if (Boolean(current.data.schoolPupilRegistration) !== Boolean(candidate.data.schoolPupilRegistration)) {
    return candidate.data.schoolPupilRegistration ? candidate : current;
  }
  const currentHasUid = !!memberUid(current);
  const candidateHasUid = !!memberUid(candidate);
  if (!currentHasUid && candidateHasUid) return candidate;
  if (currentHasUid && !candidateHasUid) return current;

  const currentHasCode = !!safeString(current.data.studentCode);
  const candidateHasCode = !!safeString(candidate.data.studentCode);
  if (!currentHasCode && candidateHasCode) return candidate;
  if (currentHasCode && !candidateHasCode) return current;

  return memberCreatedMillis(candidate) >= memberCreatedMillis(current) ? candidate : current;
}

function mergeMemberRows(rows: MemberRow[]): MemberRow[] {
  const groups = new Map<string, MemberRow[]>();
  for (const row of rows) {
    const key = memberGroupKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.values()).map((group) => {
    const primary = group.reduce(preferMemberRow);
    const earliestCreated = group
      .map((row) => asDate(row.data.createdAt))
      .filter((date): date is Date => !!date)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    return {
      ...primary,
      deviceCount: new Set(group.map(row => row.data.uid).filter(Boolean)).size,
      data: {
        ...primary.data,
        createdAt: earliestCreated ?? primary.data.createdAt,
      },
    };
  });
}

function readIsAdmin(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  if (profile.role === "admin") return true;
  const roles = profile.roles;
  return isRecord(roles) && roles.admin === true;
}

/**
 * Locale-safe link helper:
 * - keeps absolute URLs unchanged
 * - prefixes "/{locale}" for internal paths that start with "/"
 * - avoids double-prefix if already "/en/..." or "/no/..." or "/pt/..."
 */
function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "pt") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
}

export default function TeacherSpaceMembersPage() {
  return (
    <AuthGate>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const t = useTranslations("teacherMembers");
  const locale = useLocale();

  const params = useParams<{ spaceId: string }>();
  const spaceId = params?.spaceId;

  const { user, profile, loading } = useUserProfile();
  const isAdmin = useMemo(() => readIsAdmin(profile), [profile]);

  const [spaceTitle, setSpaceTitle] = useState<string>(() => t("fallbacks.spaceTitle"));
  const [spaceCode, setSpaceCode] = useState("");
  const [schoolRoomId, setSchoolRoomId] = useState<string | null>(null);
  const schoolRoom = Boolean(spaceId && schoolRoomId === spaceId);
  const [pupilNames, setPupilNames] = useState({ fullName: "", displayName: "" });
  const [issuedCode, setIssuedCode] = useState<{ spaceId: string; uid: string; value: string } | null>(null);
  const [canManageStaff, setCanManageStaff] = useState(false);
  const visibleCode = canManageStaff && issuedCode?.spaceId === spaceId && issuedCode?.uid === user?.uid ? issuedCode?.value : undefined;
  const issuedCodePanel = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [accessRequests, setAccessRequests] = useState<SpaceAccessRequest[]>([]);
  const [search, setSearch] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [singleRole, setSingleRole] = useState<"student" | "co_teacher" | "observer">("student");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentBusy, setStudentBusy] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [nameBusyId, setNameBusyId] = useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [studentCodeBusyId, setStudentCodeBusyId] = useState<string | null>(null);

  const fmt = useMemo(() => {
    return (d: Date | null) => {
      if (!d) return t("common.dash");
      try {
        return new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(d);
      } catch {
        return d.toISOString();
      }
    };
  }, [locale, t]);

  // Keep fallback title in sync if locale changes (only if we still show fallback)
  useEffect(() => {
    setSpaceTitle((prev) => (prev === "" || prev === t("fallbacks.spaceTitle") ? t("fallbacks.spaceTitle") : prev));
  }, [t]);

  function buildStudentJoinLink(studentCode: string): string | null {
    if (!spaceCode || !studentCode || studentCode === t("common.dash")) return null;
    if (typeof window === "undefined") return null;

    const params = new URLSearchParams({
      code: spaceCode,
      studentCode,
    });

    return `${window.location.origin}${withLocale(locale, `/join?${params.toString()}`)}`;
  }

  useEffect(() => {
    if (!spaceId) return;

    getDoc(doc(db, "spaces", spaceId))
      .then((snap) => {
        const data = snap.data();
        const title = data && isRecord(data) ? safeString(data["title"]) : null;
        const ownerId = getSpaceOwnerUid(data);
        if (title) setSpaceTitle(title);
        setSpaceCode(getSpaceJoinCode(data));
        setSchoolRoomId(safeString(data?.schoolId) ? spaceId : null);
        setCanManageStaff(Boolean(user?.uid) && (isAdmin || ownerId === user?.uid));
      })
      .catch(() => {
        setCanManageStaff(false);
      });
  }, [isAdmin, spaceId, user?.uid]);

  useEffect(() => {
    if (!spaceId || !user?.uid) return;

    const qy = query(
      collection(db, "spaceMembers"),
      where("spaceId", "==", spaceId),
      where("archived", "==", false),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(qy, (snap) => {
      const next: MemberRow[] = snap.docs
        .map((d) => {
          const raw = d.data();
          const data: MemberData = isRecord(raw) ? (raw as MemberData) : {};
          return { id: d.id, data };
        });
      setAccessRequests(next.filter(row => row.data.status === "pending_approval").map(row => ({
        id: row.id, isAnon: row.data.isAnon === true,
        name: next.find(other => other.data.participantId === row.data.participantId && other.data.displayName)?.data.displayName ?? "",
      })));
      setRows(next.filter((row) => row.data.active !== false && String(row.data.status ?? "").toLowerCase() !== "removed"));
    });
  }, [spaceId, user?.uid]);

  const displayRows = useMemo(() => mergeMemberRows(rows), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return displayRows;

    return displayRows.filter((r) => {
      const name = String(r.data.displayName ?? "").toLowerCase();
      const role = String(r.data.role ?? "").toLowerCase();
      const uid = String(r.data.userId ?? r.data.uid ?? "").toLowerCase();
      const participantId = String(r.data.participantId ?? "").toLowerCase();
      const studentCode = String(r.data.studentCode ?? "").toLowerCase();
      return name.includes(s) || role.includes(s) || uid.includes(s) || participantId.includes(s) || studentCode.includes(s);
    });
  }, [displayRows, search]);

  async function copyStudentCode(studentCode: string) {
    if (!studentCode || studentCode === t("common.dash")) return;

    try {
      await navigator.clipboard.writeText(studentCode);
      setInviteMessage(t("studentCode.messages.copied", { code: studentCode }));
      setInviteError(null);
    } catch {
      setInviteError(t("studentCode.messages.copyFailed"));
    }
  }

  async function copyStudentLink(studentCode: string) {
    const link = buildStudentJoinLink(studentCode);
    if (!link) {
      setInviteError(t("studentCode.messages.linkUnavailable"));
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      setInviteMessage(t("studentCode.messages.linkCopied"));
      setInviteError(null);
    } catch {
      setInviteError(t("studentCode.messages.copyFailed"));
    }
  }

  async function updateStudentCode(memberId: string, mode: "ensure" | "regenerate") {
    if (!spaceId || !user || !canManageStaff) return;

    setStudentCodeBusyId(memberId);
    setInviteMessage(null);
    setInviteError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch(
        `/api/teacher/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(memberId)}/student-code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ mode }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        studentCode?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || t("studentCode.messages.updateFailed"));
      }

      setInviteMessage(t("studentCode.messages.updated", { code: data.studentCode || "" }));
    } catch (error: unknown) {
      setInviteError(error instanceof Error ? error.message : String(error));
    } finally {
      setStudentCodeBusyId(null);
    }
  }

  async function inviteStaff() {
    const email = inviteEmail.trim().toLowerCase();
    if (!spaceId || !user || !email || !canManageStaff) return;

    setInviteBusy(true);
    setInviteMessage(null);
    setInviteError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/teacher/spaces/${encodeURIComponent(spaceId)}/staff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email, role: singleRole === "observer" ? "observer" : "co_teacher" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        member?: { displayName?: string; email?: string; role?: string };
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not invite teacher.");
      }

      setInviteEmail("");
      setInviteMessage(
        `${data.member?.displayName || data.member?.email || email} har fått tilgang til dette Space.`
      );
    } catch (error: unknown) {
      setInviteError(error instanceof Error ? error.message : String(error));
    } finally {
      setInviteBusy(false);
    }
  }

  useEffect(() => {
    if (visibleCode) issuedCodePanel.current?.focus();
  }, [visibleCode]);

  function showIssuedCode(code: string) {
    if (spaceId && user) setIssuedCode({ spaceId, uid: user.uid, value: code });
  }

  async function copyIssuedCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setInviteMessage(t("schoolPupil.copied"));
    } catch {
      setInviteError(t("studentCode.messages.copyFailed"));
    }
  }

  async function createStudent() {
    const displayName = studentName.replace(/\s+/g, " ").trim();
    if (!spaceId || !user || !canManageStaff || !(schoolRoom ? pupilNames.fullName.trim() : displayName)) return;

    setStudentBusy(true);
    setInviteMessage(null);
    setInviteError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/teacher/spaces/${encodeURIComponent(spaceId)}/members/create-student`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(schoolRoom ? pupilNames : { displayName }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        member?: { displayName?: string; studentCode?: string };
      };

      if (!response.ok || !data.ok) {
        const key = "schoolPupil.errors." + data.error;
        throw new Error(schoolRoom && t.has(key) ? t(key) : data.error || t("createStudent.messages.failed"));
      }
      const member = data.member;
      if (schoolRoom && member?.studentCode) {
        setPupilNames({ fullName: "", displayName: "" });
        showIssuedCode(member.studentCode);
        return;
      }

      setStudentName("");
      setInviteMessage(
        t("createStudent.messages.created", {
          name: member?.displayName || displayName,
          code: member?.studentCode || "",
        })
      );
    } catch (error: unknown) {
      setInviteError(error instanceof Error ? error.message : String(error));
    } finally {
      setStudentBusy(false);
    }
  }

  function startEditingName(memberId: string, currentName: string) {
    setEditingNameId(memberId);
    setNameDraft(currentName === t("common.dash") ? "" : currentName);
    setInviteMessage(null);
    setInviteError(null);
  }

  function cancelEditingName() {
    setEditingNameId(null);
    setNameDraft("");
  }

  async function saveStudentName(memberId: string) {
    const displayName = nameDraft.replace(/\s+/g, " ").trim();
    if (!spaceId || !user || !canManageStaff || !displayName) return;

    setNameBusyId(memberId);
    setInviteMessage(null);
    setInviteError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch(
        `/api/teacher/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(memberId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ displayName }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Kunne ikke lagre navnet.");
      }

      setInviteMessage(`Navnet ble oppdatert til ${displayName}.`);
      cancelEditingName();
    } catch (error: unknown) {
      setInviteError(error instanceof Error ? error.message : String(error));
    } finally {
      setNameBusyId(null);
    }
  }

  async function removeStudent(memberId: string, displayName: string) {
    if (!spaceId || !user || !canManageStaff) return;

    const confirmed = window.confirm(t("removeStudent.confirm", { name: displayName }));
    if (!confirmed) return;

    setRemovingMemberId(memberId);
    setInviteMessage(null);
    setInviteError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch(
        `/api/teacher/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(memberId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: "remove" }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || t("removeStudent.messages.failed"));
      }

      setInviteMessage(t("removeStudent.messages.removed", { name: displayName }));
      setExpandedMemberId((current) => (current === memberId ? null : current));
    } catch (error: unknown) {
      setInviteError(error instanceof Error ? error.message : String(error));
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function removeStaff(targetUid: string) {
    if (!spaceId || !user || !targetUid || !canManageStaff) return;

    setRemovingUid(targetUid);
    setInviteMessage(null);
    setInviteError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch(
        `/api/teacher/spaces/${encodeURIComponent(spaceId)}/staff?uid=${encodeURIComponent(targetUid)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not remove access.");
      }

      setInviteMessage("Tilgangen ble fjernet.");
    } catch (error: unknown) {
      setInviteError(error instanceof Error ? error.message : String(error));
    } finally {
      setRemovingUid(null);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-4xl p-4 text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  if (!spaceId) {
    return <div className="mx-auto max-w-4xl p-4 text-sm text-red-600">{t("errors.missingSpaceId")}</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
      <header className="mb-5">
        <nav aria-label={t("navigationLabel")} className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link
            href={withLocale(locale, `/teacher/spaces/${spaceId}`)}
            className="inline-flex items-center gap-2 font-medium text-slate-700 hover:text-slate-950"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t("actions.backToSpace")}
          </Link>
          <Link href={withLocale(locale, "/teacher/spaces")} className="font-medium text-slate-700 hover:text-slate-950">
            {t("actions.allSpaces")}
          </Link>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-2xl font-semibold text-slate-950 sm:text-3xl">{t("title")}</h1>
            <p className="mb-0 mt-1 break-words text-sm text-slate-600">{t("subtitle", { spaceTitle })}</p>
          </div>

          <details className="group relative">
            <summary className={`${secondaryButton} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
              <Printer aria-hidden="true" className="h-4 w-4" />
              {t("actions.printOptions")}
              <ChevronDown aria-hidden="true" className="h-4 w-4 group-open:rotate-180" />
            </summary>
            <ul className="m-0 mt-2 list-none rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm sm:absolute sm:right-0 sm:z-10 sm:w-max sm:max-w-64">
              <li>
                <Link
                  href={withLocale(locale, `/teacher/spaces/${spaceId}/members/print`)}
                  className="block rounded-lg px-3 py-2 font-medium text-slate-800 no-underline hover:bg-slate-50"
                >
                  {t("actions.printStudentCodes")}
                </Link>
              </li>
              <li>
                <Link
                  href={withLocale(locale, `/teacher/spaces/${spaceId}/members/guardian-print`)}
                  className="block rounded-lg px-3 py-2 font-medium text-slate-800 no-underline hover:bg-slate-50"
                >
                  {t("actions.printGuardianInfo")}
                </Link>
              </li>
            </ul>
          </details>
        </div>
      </header>

      {canManageStaff && user && spaceId ? <SpaceAccessRequests spaceId={spaceId} user={user} requests={accessRequests} /> : null}

      {canManageStaff ? (
        <section id="add-students" aria-labelledby="add-students-heading" className="mt-4 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 id="add-students-heading" className="m-0 text-lg font-semibold text-slate-950">{t("sections.addTitle")}</h2>
          <div className="mt-3">
            <TeacherPupilPicker spaceId={spaceId} schoolRoom={schoolRoom} />
          </div>

          <div className="mt-4 border-0 border-t border-solid border-slate-200 pt-4">
            <h3 className="m-0 text-base font-semibold text-slate-950">{t("sections.newMemberTitle")}</h3>
            {singleRole === "student" ? (
              <p id="new-student-hint" className="mb-0 mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">{t("createStudent.checkExisting")}</p>
            ) : null}
            <div className="mt-3 grid items-end gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <label htmlFor="new-member-role" className="mb-1 block text-sm font-medium">{t("table.role")}</label>
                <div className="relative">
                  <select
                    id="new-member-role"
                    value={singleRole}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSingleRole(value === "observer" ? "observer" : value === "co_teacher" ? "co_teacher" : "student");
                    }}
                    className={`${fieldClass} appearance-none pr-8`}
                  >
                    <option value="student">{t("roles.student")}</option>
                    <option value="co_teacher">{t("roles.co_teacher")}</option>
                    <option value="observer">{t("roles.observer")}</option>
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                </div>
              </div>

              {singleRole === "student" && schoolRoom ? (
                <SchoolPupilNameFields names={pupilNames} onChange={setPupilNames} disabled={studentBusy} />
              ) : singleRole === "student" ? (
                <input
                  aria-label={t("createStudent.placeholder")}
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  placeholder={t("createStudent.placeholder")}
                  className={fieldClass}
                />
              ) : (
                <input
                  aria-label={t("staff.email")}
                  aria-describedby="staff-account-hint"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder={t("staff.email")}
                  type="email"
                  className={fieldClass}
                />
              )}

              <button
                type="button"
                aria-describedby={singleRole === "student" ? "new-student-hint" : undefined}
                onClick={singleRole === "student" ? () => void createStudent() : inviteStaff}
                disabled={
                  singleRole === "student"
                    ? studentBusy || !(schoolRoom ? pupilNames.fullName.trim() : studentName.trim())
                    : inviteBusy || !inviteEmail.trim()
                }
                className={primaryButton}
              >
                {singleRole === "student"
                  ? t(studentBusy ? "createStudent.actions.working" : "createStudent.actions.create")
                  : t(inviteBusy ? "staff.inviting" : "staff.invite")}
              </button>
            </div>
            {singleRole !== "student" ? (
              <p id="staff-account-hint" className="mb-0 mt-2 text-sm text-slate-600">{t("staff.accountHint")}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section id="manage-students" aria-labelledby="manage-students-heading" className="mt-4 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="manage-students-heading" className="m-0 text-lg font-semibold text-slate-950">{t("sections.manageTitle")}</h2>
            <p className="mb-0 mt-1 text-sm text-slate-600">{t("memberCount", { count: filtered.length })}</p>
          </div>
          <input
            type="search"
            aria-label={t("search.label")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("search.placeholder")}
            className={`${fieldClass} sm:w-64`}
          />
        </div>

        <p role="status" className={inviteMessage ? "mb-0 mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900" : "sr-only"}>{inviteMessage}</p>
        {visibleCode ? (
          <div ref={issuedCodePanel} tabIndex={-1} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 p-3" role="status">
            <div>
              <p className="m-0 text-sm font-semibold">{t("schoolPupil.issued")}</p>
              <p className="my-1 font-mono text-lg font-semibold tracking-wide">{visibleCode}</p>
              <p className="m-0 text-sm text-slate-600">{t("schoolPupil.issuedHint")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryButton} onClick={() => void copyIssuedCode(visibleCode)}>{t("studentCode.actions.copy")}</button>
              <button type="button" className={secondaryButton} onClick={() => setIssuedCode(null)}>{t("schoolPupil.closeCode")}</button>
            </div>
          </div>
        ) : null}
        {inviteError ? <p role="alert" className="mb-0 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{inviteError}</p> : null}

        <div className="mt-3 grid gap-2">
          {filtered.length === 0 ? (
            <p className="m-0 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
              {t("empty")}
            </p>
          ) : (
            filtered.map((r) => {
              const name = String(r.data.displayName ?? t("common.dash"));
              const staffRole = String(r.data.staffRole ?? "");
              const role = staffRole || String(r.data.role ?? "member");
              const roleLabel = t.has(`roles.${role}`) ? t(`roles.${role}`) : role;
              const joined = fmt(asDate(r.data.createdAt));
              const isAnon = Boolean(r.data.isAnon);
              const uid = String(r.data.userId ?? r.data.uid ?? t("common.dash"));
              const studentCode = String(r.data.studentCode ?? t("common.dash"));
              const isStudent = role === "student";
              const schoolPupil = Boolean(r.data.schoolPupilId);
              const deviceCount = r.deviceCount ?? 1;
              const isOpen = expandedMemberId === r.id;
              const detailsId = `member-details-${r.id}`;
              const canRemoveStaff = Boolean(
                canManageStaff &&
                uid &&
                  uid !== t("common.dash") &&
                  (staffRole === "co_teacher" || staffRole === "observer" || r.data.role === "teacher")
              );

              return (
                <article key={r.id} className="rounded-xl border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="min-w-0 flex-1 basis-32">
                      {editingNameId === r.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            aria-label={t("createStudent.placeholder")}
                            value={nameDraft}
                            onChange={(event) => setNameDraft(event.target.value)}
                            className={`${fieldClass} flex-1 basis-40`}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => void saveStudentName(r.id)}
                            disabled={nameBusyId === r.id || !nameDraft.trim()}
                            className={primaryButton}
                          >
                            {t(nameBusyId === r.id ? "actions.savingName" : "actions.saveName")}
                          </button>
                          <button type="button" onClick={cancelEditingName} disabled={nameBusyId === r.id} className={secondaryButton}>
                            {t("actions.cancelEdit")}
                          </button>
                        </div>
                      ) : (
                        <div>
                          <h3 className="m-0 break-words text-base font-semibold text-slate-950">{name}</h3>
                          <p className="mb-0 mt-1 text-xs text-slate-600">{roleLabel}</p>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedMemberId(isOpen ? null : r.id)}
                      className={secondaryButton}
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? detailsId : undefined}
                    >
                      {t(isOpen ? "actions.hideDetails" : "actions.showDetails")}
                      <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                  </div>

                  {isOpen ? (
                    <div id={detailsId} className="grid gap-3 border-t border-slate-200 p-3">
                      {isStudent && !schoolPupil ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                          <dl className="m-0">
                            <dt className="text-xs font-semibold text-slate-600">{t("table.studentCode")}</dt>
                            <dd className="mb-0 ml-0 mt-1 font-mono text-base font-semibold text-slate-950">{studentCode}</dd>
                          </dl>
                          {canManageStaff && studentCode !== t("common.dash") ? (
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => void copyStudentLink(studentCode)} className={secondaryButton}>
                                {t("studentCode.actions.copyLink")}
                              </button>
                              <button type="button" onClick={() => void copyStudentCode(studentCode)} className={secondaryButton}>
                                {t("studentCode.actions.copy")}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {isStudent && canManageStaff ? (
                        <>
                          {schoolRoom && user ? (
                            <SchoolSpacePupilCard
                              key={JSON.stringify([user.uid, r.id, r.data.schoolPupilId])}
                              spaceId={spaceId} roomTitle={spaceTitle} roomCode={spaceCode}
                              memberId={r.id} registered={schoolPupil} viewerUid={user.uid}
                              onCodeIssued={showIssuedCode} onCodeShown={() => setIssuedCode(null)}
                            />
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2">
                            {!schoolPupil && editingNameId !== r.id ? (
                              <button type="button" onClick={() => startEditingName(r.id, name)} className={secondaryButton}>
                                {t("actions.editName")}
                              </button>
                            ) : null}
                            {!schoolPupil ? <button
                              type="button"
                              onClick={() => void updateStudentCode(r.id, studentCode === t("common.dash") ? "ensure" : "regenerate")}
                              disabled={studentCodeBusyId === r.id || removingMemberId === r.id}
                              className={secondaryButton}
                            >
                              {studentCodeBusyId === r.id
                                ? t("studentCode.actions.working")
                                : studentCode === t("common.dash")
                                  ? t("studentCode.actions.create")
                                  : t("studentCode.actions.regenerate")}
                            </button> : null}
                            <button
                              type="button"
                              onClick={() => void removeStudent(r.id, name)}
                              disabled={removingMemberId === r.id}
                              className={`${dangerButton} sm:ml-auto`}
                            >
                              {removingMemberId === r.id ? t("removeStudent.actions.removing") : t("removeStudent.actions.remove")}
                            </button>
                          </div>
                          {!schoolPupil ? <TeacherPupilPicker spaceId={spaceId} schoolRoom={schoolRoom} targetMemberId={r.id} targetName={name} /> : null}
                        </>
                      ) : null}

                      {canRemoveStaff ? (
                        <div>
                          <button type="button" onClick={() => removeStaff(uid)} disabled={removingUid === uid} className={dangerButton}>
                            {t(removingUid === uid ? "actions.removingStaff" : "actions.removeStaff")}
                          </button>
                        </div>
                      ) : null}

                      <details className="group rounded-lg border border-slate-200">
                        <summary className={disclosureClass}>
                          {t("sections.memberDetails")}
                          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 group-open:rotate-180" />
                        </summary>
                        <dl className="m-0 grid gap-3 border-t border-slate-200 p-3 text-sm sm:grid-cols-[auto_auto_minmax(0,1fr)]">
                          <div>
                            <dt className="text-xs font-semibold text-slate-600">{t("table.type")}</dt>
                            <dd className="mb-0 ml-0 mt-1 text-slate-950">{t(isAnon ? "types.anon" : "types.signedIn")}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold text-slate-600">{t("table.joined")}</dt>
                            <dd className="mb-0 ml-0 mt-1 text-slate-950">{joined}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold text-slate-600">{t("table.uid")}</dt>
                            <dd className="mb-0 ml-0 mt-1 break-all font-mono text-xs text-slate-950">{uid}</dd>
                          </div>
                          {deviceCount > 1 ? (
                            <div className="sm:col-span-3">
                              <dt className="font-semibold text-slate-800">{t("devices.count", { count: deviceCount })}</dt>
                              <dd className="mb-0 ml-0 mt-1 text-xs text-slate-600">{t("devices.description")}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </details>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </section>

      <details className="group mt-3 rounded-xl border border-slate-200 bg-white">
        <summary className={disclosureClass}>
          {t("sections.roomDetails")}
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 group-open:rotate-180" />
        </summary>
        <dl className="m-0 border-t border-slate-200 p-3">
          <dt className="text-xs font-semibold text-slate-600">{t("labels.spaceId")}</dt>
          <dd className="mb-0 ml-0 mt-1 break-all font-mono text-xs text-slate-800">{spaceId}</dd>
        </dl>
      </details>
    </div>
  );
}
