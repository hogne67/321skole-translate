// app\[locale]\(app)\teacher\spaces\page.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import SpaceRoomCard from "@/components/SpaceRoomCard";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";
import type { SpaceDoc } from "@/lib/spacesClient";
import { useLocale, useTranslations } from "next-intl";

type SpaceDocSafe = SpaceDoc & { createdAt?: unknown };
type Row = { id: string; data: SpaceDocSafe };
type TimestampLike = { toMillis: () => number };

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

type SortKey = "newest" | "oldest" | "title_az" | "title_za";

function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "pt") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
}

function FutureVideoSlot() {
  return <div aria-hidden="true" className="hidden h-10 w-[156px] shrink-0 lg:block" />;
}

function getSpacesGuide(locale: string) {
  if (locale === "en") {
    return {
      title: "Guide: Spaces",
      imageUrl: "/guides/teacher-spaces-guide-en.png",
      buttonLabel: "See quick guide",
      closeLabel: "Close",
      downloadLabel: "Download PNG",
      description: "A visual guide to creating, sharing and following up Spaces.",
    };
  }

  if (locale === "pt") {
    return {
      title: "Guia: Spaces",
      imageUrl: "/guides/teacher-spaces-guide-pt-br.png",
      buttonLabel: "Ver guia rápido",
      closeLabel: "Fechar",
      downloadLabel: "Baixar PNG",
      description: "Um guia visual para criar, compartilhar e acompanhar Spaces.",
    };
  }

  if (locale === "nb" || locale === "no") {
    return {
      title: "Guide: Spaces",
      imageUrl: "/guides/teacher-spaces-guide-no.png",
      buttonLabel: "Se hurtigguide",
      closeLabel: "Lukk",
      downloadLabel: "Last ned PNG",
      description: "En visuell guide til å opprette, dele og følge opp Spaces.",
    };
  }

  return null;
}

type SpacesGuide = NonNullable<ReturnType<typeof getSpacesGuide>>;

const GUIDE_IMAGE_WIDTH = 1024;
const GUIDE_IMAGE_HEIGHT = 1536;

function SpacesGuidePoster({ guide }: { guide: SpacesGuide }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={guide.buttonLabel}
        className="inline-flex min-h-[70px] w-full min-w-0 max-w-none items-center justify-start gap-2 rounded-[20px] border border-blue-200 bg-white/90 p-2 text-left text-sm font-bold text-slate-900 shadow-[0_10px_24px_rgba(37,99,235,0.09)] transition hover:bg-white active:translate-y-px sm:min-h-[84px] sm:min-w-[250px] sm:gap-3 sm:p-2.5 lg:max-w-[340px]"
      >
        <span className="relative block aspect-video w-[76px] shrink-0 overflow-hidden rounded-[14px] bg-blue-100 sm:w-[92px]">
          <Image src={guide.imageUrl} alt="" fill sizes="92px" className="object-cover" aria-hidden="true" />
          <span className="absolute inset-0 bg-gradient-to-br from-white/0 to-blue-900/10" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block break-words text-[13px] font-black leading-5 text-slate-950">{guide.buttonLabel}</span>
          <span className="mt-0.5 hidden break-words text-[13px] font-medium leading-5 text-slate-500 sm:block">
            {guide.description}
          </span>
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/72 p-3 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
              <div className="min-w-0">
                <h2 id={titleId} className="break-words text-lg font-extrabold text-slate-950 sm:text-xl">
                  {guide.title}
                </h2>
                <p className="mt-1 break-words text-sm text-slate-600">{guide.description}</p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                aria-label={guide.closeLabel}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 overflow-auto bg-slate-100 p-2 sm:p-4">
              <Image
                src={guide.imageUrl}
                alt={guide.title}
                width={GUIDE_IMAGE_WIDTH}
                height={GUIDE_IMAGE_HEIGHT}
                className="mx-auto h-auto w-full max-w-[1024px] rounded-xl bg-white object-contain shadow-sm"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-4 py-3 sm:px-5">
              <a
                href={guide.imageUrl}
                download
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                {guide.downloadLabel}
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                {guide.closeLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function TeacherSpacesPage() {
  return (
    <AuthGate>
      <TeacherSpacesInner />
    </AuthGate>
  );
}

function TeacherSpacesInner() {
  const t = useTranslations("spaces");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const spacesGuide = getSpacesGuide(locale);

  const { user, profile, loading } = useUserProfile();
  const isGuestPreview = Boolean(user?.isAnonymous);
  const [ownedRows, setOwnedRows] = useState<Row[]>([]);
  const [sharedRows, setSharedRows] = useState<Row[]>([]);
  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const row of sharedRows) map.set(row.id, row);
    for (const row of ownedRows) map.set(row.id, row);
    return Array.from(map.values());
  }, [ownedRows, sharedRows]);

  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [memberCount, setMemberCount] = useState<Record<string, number | undefined>>({});
  const [memberCountBusy, setMemberCountBusy] = useState<Record<string, boolean>>({});

  const canUseTeacherSpaces = !isGuestPreview && (profile?.role === "teacher" || profile?.role === "admin");
  const canCreateSpace = Boolean(user?.uid && canUseTeacherSpaces);

  useEffect(() => {
    if (!user?.uid || !canUseTeacherSpaces) return;

    const q = query(collection(db, "spaces"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc"));

    return onSnapshot(q, (snap) => {
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
          if (data.ownerId === user.uid || data.ownerUid === user.uid) return null;
          return { id: spaceSnap.id, data } satisfies Row;
        })
      );

      setSharedRows(nextRows.filter((row): row is Row => row !== null));
    });
  }, [user?.uid, canUseTeacherSpaces]);

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

    if (!showClosed) {
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
  }, [rows, search, showClosed, sortKey]);

  useEffect(() => {
    if (!user?.uid) return;

    const visible = filtered.slice(0, 50);
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
  }, [filtered, user?.uid]);

  if (loading) {
    return <div className="w-full py-4 text-sm text-slate-600">{tCommon("loading")}</div>;
  }

  if (!canUseTeacherSpaces) {
    if (isGuestPreview) {
      return (
        <div className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-3 sm:space-y-4">
          <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-50 p-3 shadow-md sm:p-5">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <h1 className="m-0 break-words text-2xl font-semibold text-slate-900">{t("title")}</h1>
                <p className="mt-1 break-words text-sm text-slate-600 sm:mt-2">{t("guestPreview.subtitle")}</p>
              </div>

              {spacesGuide ? <SpacesGuidePoster guide={spacesGuide} /> : <FutureVideoSlot />}
            </div>
          </div>

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
      <div className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-50 p-3 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="m-0 break-words text-2xl font-semibold text-slate-900">{t("title")}</h1>
            </div>
            <p className="mt-1 break-words text-sm text-slate-600 sm:mt-2">{t("subtitle")}</p>
          </div>

          <div className="flex w-full min-w-0 flex-wrap gap-2 sm:items-center lg:w-auto lg:justify-end">
            {spacesGuide ? <SpacesGuidePoster guide={spacesGuide} /> : <FutureVideoSlot />}
          </div>
        </div>
      </div>

      <div className="w-full min-w-0 rounded-2xl border border-slate-300 bg-slate-100 p-3 shadow-md sm:p-4">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{t("controls.filters.label")}</div>
            <div className="mt-1 break-words text-xs text-slate-600">
              {t("controls.filters.showing", { n: filtered.length })}
            </div>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="inline-flex shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 sm:hidden"
            >
              {filtersOpen ? t("controls.filters.hide") : t("controls.filters.show")}
            </button>
          </div>

          <div className={[filtersOpen ? "grid" : "hidden", "min-w-0 flex-1 grid-cols-1 gap-2 sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.8fr)_auto] lg:max-w-3xl"].join(" ")}>
            <div className="min-w-0">
              <label className="sr-only" htmlFor="space-search">
                {t("controls.search.label")}
              </label>
              <input
                id="space-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("controls.search.placeholder")}
                className="box-border w-full min-w-0 max-w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="min-w-0">
              <label className="sr-only" htmlFor="space-sort">
                {t("controls.sort.label")}
              </label>
              <select
                id="space-sort"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="newest">{t("controls.sort.options.newest")}</option>
                <option value="oldest">{t("controls.sort.options.oldest")}</option>
                <option value="title_az">{t("controls.sort.options.title_az")}</option>
                <option value="title_za">{t("controls.sort.options.title_za")}</option>
              </select>
            </div>

            <label
              className={[
                "inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                showClosed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-300 bg-white text-slate-700",
              ].join(" ")}
              title={t("controls.filters.showClosedTitle")}
            >
              <input
                id="showClosed"
                type="checkbox"
                checked={showClosed}
                onChange={(e) => setShowClosed(e.target.checked)}
                className="h-4 w-4 rounded border-slate-400 accent-emerald-600"
              />
              <span className="whitespace-nowrap">{t("controls.filters.showClosed")}</span>
            </label>
          </div>
        </div>
      </div>

      <div className="w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-5">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-3 sm:mb-4">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900">{t("title")}</div>
            <div className="mt-1 break-words text-sm text-slate-600">
              {t("list.overviewHint")}
            </div>
          </div>
          <Link
            href={withLocale(locale, "/teacher/spaces/new")}
            title={canCreateSpace ? t("newSpaceTitle") : t("newSpaceLockedTitle")}
            className={[
              "inline-flex shrink-0 items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold shadow-sm no-underline hover:shadow-md sm:px-4",
              canCreateSpace
                ? "bg-green-600 text-white hover:bg-green-500"
                : "border border-slate-300 bg-white text-slate-800",
            ].join(" ")}
          >
            <span className="sm:hidden">{canCreateSpace ? t("newSpaceShort") : t("newSpaceLockedShort")}</span>
            <span className="hidden sm:inline">{canCreateSpace ? t("newSpace") : t("newSpaceLocked")}</span>
          </Link>
        </div>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {filtered.map((row) => (
            <SpaceRoomCard
              key={row.id}
              spaceId={row.id}
              title={row.data.title}
              memberCount={memberCount[row.id]}
              loading={Boolean(memberCountBusy[row.id])}
            />
          ))}

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-600 shadow-sm sm:col-span-2 sm:p-6">
              {t("empty.title")}
              <div className="mt-2">{t("empty.hint")}</div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
