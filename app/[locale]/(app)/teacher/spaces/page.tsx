// app\[locale]\(app)\teacher\spaces\page.tsx
"use client";
import { watchOwnedSpaceSnapshots } from "@/lib/security/ownedSpaces.client";
import { getSpaceOwnerUid } from "@/lib/security/spaceOwnership";
import { isCurrentSpaceSubstitute } from "@/lib/security/spaceAccess";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import SpaceRoomCard from "@/components/SpaceRoomCard";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import type { SpaceDoc } from "@/lib/spacesClient";
import { useLocale, useTranslations } from "next-intl";
import { activeTeacherSchoolId, teacherSpaceArea, type TeacherSpaceArea } from "@/lib/teacherSpaceArea";
import { useTeacherSpaceSchool } from "@/lib/useTeacherSpaceSchool";

type SpaceDocSafe = SpaceDoc & { createdAt?: unknown };
type Row = { id: string; data: SpaceDocSafe };
type TimestampLike = { toMillis: () => number };
const roomViews = ["open", "closed", "deleted"] as const;
type RoomView = (typeof roomViews)[number];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isTimestampLike(v: unknown): v is TimestampLike {
  return isRecord(v) && typeof v["toMillis"] === "function";
}

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


function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "pt") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
}


export default function TeacherSpacesPage() {
  const t = useTranslations("common");
  return (
    <AuthGate>
      <Suspense fallback={<p className="p-4 text-sm text-slate-600">{t("loading")}</p>}>
        <TeacherSpacesForUser />
      </Suspense>
    </AuthGate>
  );
}

function TeacherSpacesForUser() {
  const account = useUserProfile();
  return <TeacherSpacesInner key={account.user?.uid} {...account} />;
}

function TeacherSpacesInner({ user, profile, loading }: ReturnType<typeof useUserProfile>) {
  const t = useTranslations("spaces");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const substituteText = useTranslations("schoolAdmin.substitutes");
  const requestedArea = useSearchParams().get("area");
  const [substituteRooms, setSubstituteRooms] = useState<{ id: string; title: string; schoolId: unknown }[]>([]);

  const isGuestPreview = Boolean(user?.isAnonymous);
  const [ownedRows, setOwnedRows] = useState<Row[]>([]);
  const [sharedRows, setSharedRows] = useState<Row[]>([]);
  const [roomView, setRoomView] = useState<RoomView>("open");
  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const row of sharedRows) map.set(row.id, row);
    for (const row of ownedRows) map.set(row.id, row);
    return Array.from(map.values());
  }, [ownedRows, sharedRows]);


  const [memberCount, setMemberCount] = useState<Record<string, number | undefined>>({});
  const [memberCountBusy, setMemberCountBusy] = useState<Record<string, boolean>>({});

  const canUseTeacherSpaces = !isGuestPreview && (profile?.role === "teacher" || profile?.role === "admin");
  const schoolId = activeTeacherSchoolId(profile);
  const schoolName = useTeacherSpaceSchool(user, schoolId)?.name;
  const selectedArea: TeacherSpaceArea = requestedArea === "private" || requestedArea === "shared"
    ? requestedArea : schoolId ? "school" : "private";
  const hasOtherSchoolRooms = rows.some(({ data }) => teacherSpaceArea(data.schoolId, schoolId) === "shared")
    || substituteRooms.some(room => teacherSpaceArea(room.schoolId, schoolId) === "shared");
  const areas: TeacherSpaceArea[] = schoolId ? ["school", "private"] : ["private"];
  if (hasOtherSchoolRooms || selectedArea === "shared") areas.push("shared");
  const visibleSubstituteRooms = substituteRooms.filter(room => teacherSpaceArea(room.schoolId, schoolId) === selectedArea);
  const canCreateSpace = Boolean(user?.uid && canUseTeacherSpaces && (
    selectedArea === "school" ? schoolId : selectedArea === "private" && profile?.schoolStatus !== "active"
  ));

  function areaLabel(area: TeacherSpaceArea) {
    return area === "school" && schoolName ? schoolName : t(`areas.${area}`);
  }

  useEffect(() => {
    if (!user?.uid || !canUseTeacherSpaces) return;

    return watchOwnedSpaceSnapshots(db, user.uid, (snap) => {
      const next: Row[] = snap.docs.map((d) => ({
        id: d.id,
        data: (d.data() as SpaceDocSafe) ?? ({} as SpaceDocSafe),
      }));
      setOwnedRows(next);
    });
  }, [user?.uid, canUseTeacherSpaces]);

  useEffect(() => {
    if (!user?.uid || !canUseTeacherSpaces) return;

    const qy = query(collection(db, "spaceMembers"), where("uid", "==", user.uid));

    return onSnapshot(qy, async (snap) => {
      setSubstituteRooms(snap.docs.flatMap(member => {
        const data = member.data();
        if (!isCurrentSpaceSubstitute(data) || typeof data.spaceId !== "string" || member.id !== `${data.spaceId}_${user.uid}`) return [];
        return [{ id: data.spaceId, title: typeof data.substituteRoomTitle === "string" ? data.substituteRoomTitle : "", schoolId: data.substituteSchoolId }];
      }));
      const staffSpaceIds = snap.docs
        .filter((memberSnap) => {
          const data = memberSnap.data() as {
            active?: unknown;
            archived?: unknown;
            role?: unknown;
            staffRole?: unknown;
            status?: unknown;
            spaceId?: unknown;
          };
          const role = String(data.role ?? "").toLowerCase();
          const staffRole = String(data.staffRole ?? "").toLowerCase();
          const status = String(data.status ?? "").toLowerCase();
          return (
            typeof data.spaceId === "string" &&
            data.active !== false &&
            data.archived !== true &&
            status !== "removed" &&
            (role === "teacher" ||
              role === "observer" ||
              staffRole === "co_teacher" ||
              staffRole === "substitute" ||
              staffRole === "observer")
          );
        })
        .map((memberSnap) => String((memberSnap.data() as { spaceId?: unknown }).spaceId))
        .filter(Boolean);

      const uniqueSpaceIds = Array.from(new Set(staffSpaceIds));
      const nextRows = await Promise.all(
        uniqueSpaceIds.map(async (id) => {
          const spaceSnap = await getDoc(doc(db, "spaces", id));
          if (!spaceSnap.exists()) return null;
          const data = (spaceSnap.data() as SpaceDocSafe) ?? ({} as SpaceDocSafe);
          if (getSpaceOwnerUid(data) === user.uid) return null;
          return { id: spaceSnap.id, data } satisfies Row;
        })
      );

      setSharedRows(nextRows.filter((row): row is Row => row !== null));
    });
  }, [user?.uid, canUseTeacherSpaces]);

  const visibleRooms = useMemo(() => {
    return rows
      .filter(({ data }) => {
        if (teacherSpaceArea(data.schoolId, schoolId) !== selectedArea) return false;
        if (roomView === "deleted") return Boolean(data.deletedAt) && getSpaceOwnerUid(data) === user?.uid;
        return !data.deletedAt && (data.isOpen === true) === (roomView === "open");
      })
      .sort((a, b) => asMillis(b.data.createdAt) - asMillis(a.data.createdAt));
  }, [rows, roomView, schoolId, selectedArea, user?.uid]);

  useEffect(() => {
    if (!user?.uid || roomView === "deleted") return;

    const visible = visibleRooms.slice(0, 50);
    visible.forEach((r) => {
      if (memberCount[r.id] !== undefined) return;
      if (memberCountBusy[r.id]) return;

      setMemberCountBusy((m) => ({ ...m, [r.id]: true }));

      const q = query(collection(db, "spaceMembers"), where("spaceId", "==", r.id), where("archived", "==", false));

      getDocs(q)
        .then((snap) => {
          const active = snap.docs.filter((docSnap) => {
            const data = docSnap.data() as { active?: unknown; status?: unknown };
            return data.active !== false && String(data.status ?? "").toLowerCase() !== "removed";
          });
          const count = new Set(active.map(docSnap => {
            const data = docSnap.data();
            return data.participantId || data.uid || docSnap.id;
          })).size;
          setMemberCount((m) => ({ ...m, [r.id]: count }));
        })
        .catch(() => setMemberCount((m) => ({ ...m, [r.id]: undefined })))
        .finally(() => setMemberCountBusy((m) => ({ ...m, [r.id]: false })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRooms, roomView, user?.uid]);

  if (loading) {
    return <div className="w-full py-4 text-sm text-slate-600">{tCommon("loading")}</div>;
  }

  if (!canUseTeacherSpaces) {
    if (isGuestPreview) {
      return (
        <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-3 sm:space-y-4">
          <header className="rounded-2xl border border-solid border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h1 className="m-0 break-words text-2xl font-semibold text-slate-950">{t("title")}</h1>
            <p className="mb-0 mt-1 text-sm text-slate-600">{t("guestPreview.subtitle")}</p>
          </header>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h2 className="m-0 text-xl font-semibold text-slate-950">{t("guestPreview.title")}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">{t("guestPreview.body")}</p>
              </div>

              <Link
                href={withLocale(locale, `/login?next=/${locale}/teacher/spaces/new`)}
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white no-underline shadow-sm hover:bg-blue-500"
              >
                {t("guestPreview.loginCreate")}
              </Link>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-950">{t("guestPreview.cards.organize.title")}</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t("guestPreview.cards.organize.text")}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-950">{t("guestPreview.cards.share.title")}</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t("guestPreview.cards.share.text")}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-950">{t("guestPreview.cards.follow.title")}</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t("guestPreview.cards.follow.text")}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white p-4 text-sm leading-6 text-slate-700 shadow-sm sm:p-5">
            <b className="text-slate-950">{t("guestPreview.lockedTitle")}</b>{" "}
            {t("guestPreview.lockedText")}{" "}
            <Link href={withLocale(locale, `/login?next=/${locale}/teacher/spaces/new`)} className="font-semibold text-blue-700 underline">
              {t("guestPreview.loginLink")}
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto box-border w-full max-w-3xl min-w-0 rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-md">
        <h1 className="m-0 break-words text-2xl font-semibold text-slate-900">{t("access.title")}</h1>
        <p className="mt-2 break-words text-sm text-slate-700">{t("access.subtitle")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-3 sm:space-y-4">
      {visibleSubstituteRooms.length ? <section className="rounded-2xl border border-slate-300 bg-white p-4">
        <h2 className="font-semibold">{substituteText("myRooms")}</h2>
        <ul className="mt-2 space-y-1">{visibleSubstituteRooms.map(room => <li key={room.id}>
          <Link className="underline" href={`/${locale}/teacher/spaces/${encodeURIComponent(room.id)}/substitute`}>
            {room.title || substituteText("room")}
          </Link>
        </li>)}</ul>
      </section> : null}
      <header className="rounded-2xl border border-solid border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="m-0 break-words text-2xl font-semibold text-slate-950">{t("title")}</h1>
            <p className="mb-0 mt-1 text-sm text-slate-600">{t("subtitle")}</p>
          </div>
          {canCreateSpace ? (
            <Link
              href={`/${locale}/teacher/spaces/new?area=${selectedArea}`}
              title={t("newSpaceTitle")}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-800 px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              <span className="sm:hidden">{t("newSpaceShort")}</span>
              <span className="hidden sm:inline">{t("newSpace")}</span>
            </Link>
          ) : null}
        </div>
        {areas.length > 1 ? (
          <nav aria-label={t("areas.label")} className="mt-3 flex flex-wrap gap-2">
            {areas.map(area => (
              <Link
                key={area}
                href={`/${locale}/teacher/spaces?area=${area}`}
                aria-current={area === selectedArea ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-lg border border-solid px-3 py-2 text-sm font-semibold no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${area === selectedArea
                  ? "border-emerald-800 bg-emerald-50 text-emerald-950"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {areaLabel(area)}
              </Link>
            ))}
          </nav>
        ) : null}
        {selectedArea === "private" && profile?.schoolStatus === "active" ? (
          <p className="mb-0 mt-2 text-sm text-slate-600">{t("areas.privateCreationHint")}</p>
        ) : null}
      </header>

      <div
        role="group"
        aria-label={t("list.roomView")}
        className="box-border grid w-full grid-cols-3 gap-1 rounded-xl border border-solid border-slate-200 bg-white p-1 shadow-sm sm:w-fit"
      >
        {roomViews.map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={roomView === view}
            onClick={() => setRoomView(view)}
            className={[
              "min-h-11 rounded-lg border-0 px-2 py-2 text-center text-sm font-semibold leading-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:px-4",
              roomView === view ? "bg-slate-900 text-white" : "bg-transparent text-slate-700 hover:bg-slate-100",
            ].join(" ")}
          >
            {t(`list.views.${view}`)}
          </button>
        ))}
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {visibleRooms.map((row) => (
          <SpaceRoomCard
            key={row.id}
            spaceId={row.id}
            title={row.data.title}
            memberCount={memberCount[row.id]}
            loading={Boolean(memberCountBusy[row.id])}
            canDelete={getSpaceOwnerUid(row.data) === user?.uid}
            closed={row.data.isOpen !== true}
            deleted={roomView === "deleted"}
          />
        ))}
        {visibleRooms.length === 0 ? (
          <p className="m-0 rounded-2xl border border-solid border-slate-200 bg-white p-4 text-sm text-slate-600 sm:col-span-2">
            {t(roomView === "deleted" ? "deletion.empty" : `empty.${roomView}`)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
