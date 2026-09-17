// app/[locale]/(app)/teacher/spaces/[spaceId]/members/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
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
  createdAt?: unknown;
};

type MemberRow = {
  id: string;
  data: MemberData;
  deviceCount?: number;
};

const INITIAL_BULK_STUDENT_COUNT = 15;

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
      deviceCount: group.length,
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
  const [spaceCode, setSpaceCode] = useState<string | null>(null);
  const [canManageStaff, setCanManageStaff] = useState(false);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [search, setSearch] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [singleRole, setSingleRole] = useState<"student" | "co_teacher" | "observer">("student");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentBusy, setStudentBusy] = useState(false);
  const [bulkStudentNames, setBulkStudentNames] = useState<string[]>(
    () => Array.from({ length: INITIAL_BULK_STUDENT_COUNT }, () => "")
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [nameBusyId, setNameBusyId] = useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removingUid, setRemovingUid] = useState<string | null>(null);
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

  function readSpaceCode(data: unknown): string | null {
    if (!isRecord(data)) return null;
    const code = safeString(data.code) || safeString(data.joinCode);
    if (code) return code;

    const join = data.join;
    if (!isRecord(join)) return null;
    return safeString(join.code);
  }

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
        const ownerId = data && isRecord(data) ? safeString(data["ownerId"]) || safeString(data["ownerUid"]) : null;
        if (title) setSpaceTitle(title);
        setSpaceCode(readSpaceCode(data));
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
        })
        .filter((row) => row.data.active !== false && String(row.data.status ?? "").toLowerCase() !== "removed");
      setRows(next);
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

  function updateBulkStudentName(index: number, value: string) {
    setBulkStudentNames((current) => current.map((name, i) => (i === index ? value : name)));
  }

  function addBulkStudentRows() {
    setBulkStudentNames((current) => [...current, ...Array.from({ length: 5 }, () => "")]);
  }

  async function createStudentWithName(displayName: string) {
    if (!spaceId || !user || !displayName || !canManageStaff) {
      throw new Error(t("createStudent.messages.failed"));
    }

    const token = await user.getIdToken();
    const response = await fetch(`/api/teacher/spaces/${encodeURIComponent(spaceId)}/members/create-student`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ displayName }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      member?: { displayName?: string; studentCode?: string };
    };

    if (!response.ok || !data.ok) {
      throw new Error(data.error || t("createStudent.messages.failed"));
    }

    return data.member;
  }

  async function createBulkStudents() {
    const names = bulkStudentNames.map((name) => name.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!spaceId || !user || !canManageStaff || names.length === 0) return;

    setBulkBusy(true);
    setInviteMessage(null);
    setInviteError(null);

    try {
      const created: string[] = [];
      for (const name of names) {
        const member = await createStudentWithName(name);
        created.push(member?.displayName || name);
      }

      setBulkStudentNames(Array.from({ length: INITIAL_BULK_STUDENT_COUNT }, () => ""));
      setInviteMessage(`${created.length} elever er lagt til.`);
    } catch (error: unknown) {
      setInviteError(error instanceof Error ? error.message : String(error));
    } finally {
      setBulkBusy(false);
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

  async function createStudent() {
    const displayName = studentName.replace(/\s+/g, " ").trim();
    if (!spaceId || !user || !displayName || !canManageStaff) return;

    setStudentBusy(true);
    setInviteMessage(null);
    setInviteError(null);

    try {
      const member = await createStudentWithName(displayName);

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
    <div className="mx-auto max-w-4xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle", { spaceTitle })} · {t("labels.spaceId")}:{" "}
            <span className="font-mono text-xs">{spaceId}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={withLocale(locale, `/teacher/spaces/${spaceId}/members/print`)}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 no-underline hover:bg-emerald-100"
          >
            Skriv ut elevkoder
          </Link>
          <Link
            href={withLocale(locale, `/teacher/spaces/${spaceId}`)}
            className="rounded-xl border px-3 py-2 text-sm no-underline hover:shadow-sm"
          >
            {t("actions.backToSpace")}
          </Link>
          <Link
            href={withLocale(locale, "/teacher/spaces")}
            className="rounded-xl border px-3 py-2 text-sm no-underline hover:shadow-sm"
          >
            {t("actions.allSpaces")}
          </Link>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        {canManageStaff ? (
          <div className="mb-4 grid gap-3">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-950">Legg til elever</div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Lim inn eller skriv elevnavn. Alle utfylte rader får elevkode og kan skrives ut etterpå.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void createBulkStudents()}
                  disabled={bulkBusy || !bulkStudentNames.some((name) => name.trim())}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {bulkBusy ? "Legger til..." : "Legg til elever"}
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {bulkStudentNames.map((name, index) => (
                  <input
                    key={index}
                    value={name}
                    onChange={(event) => updateBulkStudentName(index, event.target.value)}
                    placeholder={`Elev ${index + 1}`}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    disabled={bulkBusy}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={addBulkStudentRows}
                disabled={bulkBusy}
                className="mt-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
              >
                Legg til flere rader
              </button>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="text-sm font-bold text-slate-950">Legg til ny elev/lærer</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Bruk denne når du legger til én person senere. Elever får elevkode. Lærere inviteres med e-post og må være registrert.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
                <select
                  value={singleRole}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSingleRole(value === "observer" ? "observer" : value === "co_teacher" ? "co_teacher" : "student");
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="student">Elev</option>
                  <option value="co_teacher">Co-teacher</option>
                  <option value="observer">Observer</option>
                </select>

                {singleRole === "student" ? (
                  <input
                    value={studentName}
                    onChange={(event) => setStudentName(event.target.value)}
                    placeholder="Elevnavn"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                ) : (
                  <input
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="laerer@skole.no"
                    type="email"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                )}

                <button
                  type="button"
                  onClick={singleRole === "student" ? () => void createStudent() : inviteStaff}
                  disabled={
                    singleRole === "student"
                      ? studentBusy || !studentName.trim()
                      : inviteBusy || !inviteEmail.trim()
                  }
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {singleRole === "student"
                    ? studentBusy
                      ? t("createStudent.actions.working")
                      : "Legg til elev"
                    : inviteBusy
                      ? "Inviterer..."
                      : "Inviter lærer"}
                </button>
              </div>
              {inviteMessage ? <div className="mt-2 text-sm font-medium text-emerald-700">{inviteMessage}</div> : null}
              {inviteError ? <div className="mt-2 text-sm font-medium text-red-600">{inviteError}</div> : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {t("showing")} <b>{filtered.length}</b>
          </div>
          <div className="w-full sm:w-72">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search.placeholder")}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            />
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            filtered.map((r) => {
              const name = String(r.data.displayName ?? t("common.dash"));
              const staffRole = String(r.data.staffRole ?? "");
              const role = staffRole || String(r.data.role ?? "member");
              const joined = fmt(asDate(r.data.createdAt));
              const isAnon = Boolean(r.data.isAnon);
              const uid = String(r.data.userId ?? r.data.uid ?? t("common.dash"));
              const studentCode = String(r.data.studentCode ?? t("common.dash"));
              const isStudent = role === "student";
              const deviceCount = r.deviceCount ?? 1;
              const isOpen = expandedMemberId === r.id;
              const canRemoveStaff = Boolean(
                canManageStaff &&
                uid &&
                  uid !== t("common.dash") &&
                  (staffRole === "co_teacher" || staffRole === "observer" || r.data.role === "teacher")
              );

              return (
                <article key={r.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      {editingNameId === r.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={nameDraft}
                            onChange={(event) => setNameDraft(event.target.value)}
                            className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-emerald-500"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => void saveStudentName(r.id)}
                            disabled={nameBusyId === r.id || !nameDraft.trim()}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                          >
                            {nameBusyId === r.id ? "Lagrer..." : "Lagre"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingName}
                            disabled={nameBusyId === r.id}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Avbryt
                          </button>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <div className="break-words text-base font-semibold text-slate-950">{name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {role}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isAnon ? "bg-slate-100 text-slate-700" : "bg-emerald-50 text-emerald-800"}`}>
                              {isAnon ? t("types.anon") : t("types.signedIn")}
                            </span>
                            {deviceCount > 1 ? (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                                {t("devices.count", { count: deviceCount })}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {isStudent && canManageStaff && editingNameId !== r.id ? (
                        <button
                          type="button"
                          onClick={() => startEditingName(r.id, name)}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Rediger navn
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setExpandedMemberId(isOpen ? null : r.id)}
                        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                        aria-expanded={isOpen}
                      >
                        {isOpen ? "Lukk" : "Åpne"}
                      </button>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <div className="text-xs font-semibold text-slate-500">{t("table.joined")}</div>
                          <div className="mt-1 text-slate-900">{joined}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-500">{t("table.studentCode")}</div>
                          <div className="mt-1 font-mono text-sm font-semibold text-slate-900">{studentCode}</div>
                        </div>
                        <div className="sm:col-span-2">
                          <div className="text-xs font-semibold text-slate-500">{t("table.uid")}</div>
                          <div className="mt-1 break-all font-mono text-xs text-slate-700">{uid}</div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {isStudent && canManageStaff ? (
                          <>
                            {studentCode !== t("common.dash") ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void copyStudentCode(studentCode)}
                                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  {t("studentCode.actions.copy")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void copyStudentLink(studentCode)}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                                >
                                  {t("studentCode.actions.copyLink")}
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void updateStudentCode(r.id, studentCode === t("common.dash") ? "ensure" : "regenerate")}
                              disabled={studentCodeBusyId === r.id}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              {studentCodeBusyId === r.id
                                ? t("studentCode.actions.working")
                                : studentCode === t("common.dash")
                                  ? t("studentCode.actions.create")
                                  : t("studentCode.actions.regenerate")}
                            </button>
                          </>
                        ) : null}

                        {canRemoveStaff ? (
                          <button
                            type="button"
                            onClick={() => removeStaff(uid)}
                            disabled={removingUid === uid}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            {removingUid === uid ? "Fjerner..." : "Fjern tilgang"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
