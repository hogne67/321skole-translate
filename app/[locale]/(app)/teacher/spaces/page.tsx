// app\[locale]\(app)\teacher\spaces\page.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import type { SpaceDoc } from "@/lib/spacesClient";
import { useLocale, useTranslations } from "next-intl";
import TrainingVideoPlayer from "@/components/TrainingVideoPlayer";

type SpaceDocSafe = SpaceDoc & { createdAt?: unknown };
type Row = { id: string; data: SpaceDocSafe };
type QrFor = { spaceId: string; code: string; title?: string };
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

function getOrigin() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
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
  const router = useRouter();

  const { user, profile, loading } = useUserProfile();
  const [rows, setRows] = useState<Row[]>([]);

  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [memberCount, setMemberCount] = useState<Record<string, number | undefined>>({});
  const [memberCountBusy, setMemberCountBusy] = useState<Record<string, boolean>>({});

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleErr, setTitleErr] = useState<string | null>(null);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrFor, setQrFor] = useState<QrFor | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrErr, setQrErr] = useState<string | null>(null);

  const canUseTeacherSpaces = profile?.role === "teacher" || profile?.role === "admin";
  const canCreateSpace = Boolean(user?.uid && canUseTeacherSpaces);

  useEffect(() => {
    if (!user?.uid || !canUseTeacherSpaces) return;

    const q = query(collection(db, "spaces"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc"));

    return onSnapshot(q, (snap) => {
      const next: Row[] = snap.docs.map((d) => ({
        id: d.id,
        data: (d.data() as SpaceDocSafe) ?? ({} as SpaceDocSafe),
      }));
      setRows(next);
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
          const count = snap.docs.filter((docSnap) => {
            const data = docSnap.data() as { active?: unknown; status?: unknown };
            return data.active !== false && String(data.status ?? "").toLowerCase() !== "removed";
          }).length;
          setMemberCount((m) => ({ ...m, [r.id]: count }));
        })
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

  function startEditingTitle(spaceId: string, title: string) {
    setEditingTitleId(spaceId);
    setTitleDraft(title);
    setTitleErr(null);
  }

  function cancelEditingTitle() {
    setEditingTitleId(null);
    setTitleDraft("");
    setTitleErr(null);
  }

  async function saveSpaceTitle(spaceId: string, currentTitle: string) {
    const nextTitle = titleDraft.trim();

    if (!nextTitle) {
      setTitleErr(t("list.editTitleRequired"));
      return;
    }

    if (nextTitle === currentTitle.trim()) {
      cancelEditingTitle();
      return;
    }

    setTitleSaving(true);
    setTitleErr(null);

    try {
      await updateDoc(doc(db, "spaces", spaceId), {
        title: nextTitle,
        updatedAt: serverTimestamp(),
      });
      cancelEditingTitle();
    } catch {
      setTitleErr(t("list.editTitleError"));
    } finally {
      setTitleSaving(false);
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
      const joinPath = withLocale(locale, `/join?code=${encodeURIComponent(code)}`);
      const url = `${getOrigin()}${joinPath}`;
      const dataUrl = await QRCode.toDataURL(url, { margin: 1, scale: 6 });
      setQrDataUrl(dataUrl);
    } catch {
      setQrErr(t("qr.error"));
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

  const qrUrl = `${getOrigin()}${withLocale(
    locale,
    `/join?code=${encodeURIComponent(qrFor?.code ?? "")}`
  )}`;

  if (loading) {
    return <div className="w-full py-4 text-sm text-slate-600">{tCommon("loading")}</div>;
  }

  if (!canUseTeacherSpaces) {
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
            <TrainingVideoPlayer
              title={t("trainingVideo.title")}
              videoUrl="https://youtu.be/7zjhziVmGvc"
              buttonLabel={t("trainingVideo.button")}
              buttonTitle={t("trainingVideo.buttonTitle")}
              closeLabel={t("trainingVideo.close")}
              description={t("trainingVideo.description")}
              thumbnail
            />
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
                  ? "border-amber-500 bg-amber-100 text-amber-950 shadow-sm ring-2 ring-amber-300"
                  : "border-slate-300 bg-white text-slate-700",
              ].join(" ")}
              title={t("controls.filters.showClosedTitle")}
            >
              <input
                id="showClosed"
                type="checkbox"
                checked={showClosed}
                onChange={(e) => setShowClosed(e.target.checked)}
                className="h-4 w-4 rounded border-slate-400 accent-amber-600"
              />
              <span className="whitespace-nowrap">{t("controls.filters.showClosed")}</span>
            </label>
          </div>
        </div>
      </div>

      <div className="w-full min-w-0 rounded-2xl border border-slate-300 bg-slate-200 p-3 shadow-md sm:p-5">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-3 sm:mb-4">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900">{t("title")}</div>
            <div className="mt-1 break-words text-sm text-slate-600">
              {t("controls.filters.showing", { n: filtered.length })}
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

        <div className="grid min-w-0 gap-3">
          {filtered.map((r) => {
            const code = (r.data.code ?? "").toString();
            const title = (r.data.title ?? t("list.untitled")).toString();
            const open = Boolean(r.data.isOpen);
            const count = memberCount[r.id];
            const countBusy = Boolean(memberCountBusy[r.id]);

            return (
              <div
                key={r.id}
                className={[
                  "min-w-0 overflow-hidden rounded-2xl border bg-white p-3 shadow-sm transition hover:shadow-md sm:p-5",
                  open ? "border-emerald-300" : "border-slate-300",
                ].join(" ")}
              >
                <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {editingTitleId === r.id ? (
                        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start">
                          <div className="min-w-0 flex-1">
                            <label className="sr-only" htmlFor={`space-title-${r.id}`}>
                              {t("list.editTitleLabel")}
                            </label>
                            <input
                              id={`space-title-${r.id}`}
                              value={titleDraft}
                              onChange={(e) => setTitleDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveSpaceTitle(r.id, title);
                                if (e.key === "Escape") cancelEditingTitle();
                              }}
                              disabled={titleSaving}
                              className="box-border w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:opacity-60"
                              autoFocus
                            />
                            {titleErr && <div className="mt-1 break-words text-xs text-red-600">{titleErr}</div>}
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                            <button
                              type="button"
                              onClick={() => saveSpaceTitle(r.id, title)}
                              disabled={titleSaving}
                              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                              title={t("list.saveTitleTitle")}
                            >
                              {titleSaving ? t("list.savingTitle") : t("list.saveTitle")}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingTitle}
                              disabled={titleSaving}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                              title={t("list.cancelEditTitleTitle")}
                            >
                              {t("list.cancelEditTitle")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="break-words text-base font-semibold text-slate-900">{title}</div>
                          <button
                            type="button"
                            onClick={() => startEditingTitle(r.id, title)}
                            className="hidden shrink-0 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:inline-flex"
                            title={t("list.editTitleTitle")}
                          >
                            {t("list.editTitle")}
                          </button>
                        </>
                      )}
                      <span
                        className={[
                          "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                          open
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-slate-300 bg-slate-100 text-slate-700",
                        ].join(" ")}
                        title={open ? t("list.openTitle") : t("list.closedTitle")}
                      >
                        {open ? t("list.open") : t("list.closed")}
                      </span>
                    </div>

                    <div className="mt-2 min-w-0 break-words text-sm text-slate-600">
                      {t("list.code")}{" "}
                      <button
                        type="button"
                        onClick={() => copyToClipboard(code, r.id)}
                        className="max-w-full rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-left text-sm font-medium text-slate-900 hover:bg-slate-100"
                        title={t("list.copyCodeTitle")}
                      >
                        <span className="break-all">{code || "—"}</span>
                      </button>
                      {copiedId === r.id && (
                        <span className="ml-2 inline-block break-words text-xs text-slate-600">{t("list.copied")}</span>
                      )}
                      <span className="mx-2">·</span>
                      {t("list.members")}{" "}
                      <b className="text-slate-900">{countBusy ? "…" : count !== undefined ? String(count) : "—"}</b>
                    </div>

                    <div className="mt-3 hidden w-full min-w-0 grid-cols-1 gap-2 sm:grid sm:w-auto sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => {
                          const joinPath = withLocale(locale, `/join?code=${encodeURIComponent(code)}`);
                          const url = `${getOrigin()}${joinPath}`;
                          copyToClipboard(url, `url_${r.id}`);
                        }}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                        title={t("list.copyJoinLinkTitle")}
                      >
                        {t("list.copyJoinLink")}
                      </button>

                      <button
                        type="button"
                        onClick={() => openQr(r.id, code, title)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                        title={t("list.joinWithQrTitle")}
                      >
                        {t("list.joinWithQr")}
                      </button>

                      <button
                        type="button"
                        onClick={() => router.push(withLocale(locale, `/teacher/spaces/${r.id}/print`))}
                        className="rounded-xl border border-sky-700 bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500"
                        title={t("list.printRoomTitle")}
                      >
                        {t("list.printRoom")}
                      </button>
                    </div>
                  </div>

                  <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:w-auto xl:min-w-[330px]">
                    <button
                      type="button"
                      onClick={() => router.push(withLocale(locale, `/teacher/spaces/${r.id}/members`))}
                      className="hidden rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 sm:block"
                      title={t("list.seeMembersTitle")}
                    >
                      {t("list.seeMembers")}
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push(withLocale(locale, `/teacher/spaces/${r.id}/board`))}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                      title={t("list.boardTitle")}
                    >
                      {t("list.board")}
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push(withLocale(locale, `/teacher/spaces/${r.id}`))}
                      className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      title={t("list.openSpaceTitle")}
                    >
                      {t("list.openSpace")}
                    </button>
                  </div>
                </div>

                <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 sm:hidden">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-slate-800">
                    {t("list.moreActions")}
                  </summary>
                  <div className="grid gap-2 border-t border-slate-200 p-3">
                    <button
                      type="button"
                      onClick={() => router.push(withLocale(locale, `/teacher/spaces/${r.id}/members`))}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                      title={t("list.seeMembersTitle")}
                    >
                      {t("list.seeMembers")}
                    </button>

                    <button
                      type="button"
                      onClick={() => startEditingTitle(r.id, title)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                      title={t("list.editTitleTitle")}
                    >
                      {t("list.editTitle")}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const joinPath = withLocale(locale, `/join?code=${encodeURIComponent(code)}`);
                        const url = `${getOrigin()}${joinPath}`;
                        copyToClipboard(url, `url_${r.id}`);
                      }}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                      title={t("list.copyJoinLinkTitle")}
                    >
                      {t("list.copyJoinLink")}
                    </button>

                    <button
                      type="button"
                      onClick={() => openQr(r.id, code, title)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                      title={t("list.joinWithQrTitle")}
                    >
                      {t("list.joinWithQr")}
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push(withLocale(locale, `/teacher/spaces/${r.id}/print`))}
                      className="rounded-xl border border-sky-700 bg-white px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-50"
                      title={t("list.printRoomTitle")}
                    >
                      {t("list.printRoom")}
                    </button>
                  </div>
                </details>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-600 shadow-sm sm:p-6">
              {t("empty.title")}
              <div className="mt-2">{t("empty.hint")}</div>
            </div>
          )}
        </div>
      </div>

      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
          onClick={closeQr}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md min-w-0 rounded-2xl border border-slate-300 bg-white p-4 shadow-xl sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-slate-900">{t("qr.title")}</div>
                <div className="mt-1 break-words text-sm text-slate-600">
                  {t("qr.subtitle", {
                    title: qrFor?.title ?? t("list.untitled"),
                    code: qrFor?.code ?? "",
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={closeQr}
                className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                {t("qr.close")}
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-300 p-4">
              {qrBusy && <div className="text-sm text-slate-600">{t("qr.generating")}</div>}
              {qrErr && <div className="text-sm text-red-600">{qrErr}</div>}

              {qrDataUrl && (
                <div className="flex flex-col items-center gap-3">
                  <Image
                    src={qrDataUrl}
                    alt={t("qr.imageAlt")}
                    width={256}
                    height={256}
                    unoptimized
                    className="h-auto max-w-full rounded-lg border border-slate-300"
                  />
                  <div className="break-all text-center text-xs text-slate-600">
                    {t("qr.pointsTo")} <b className="text-slate-900">{qrUrl}</b>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 text-xs text-slate-600">{t("qr.note")}</div>
          </div>
        </div>
      )}
    </div>
  );
}
