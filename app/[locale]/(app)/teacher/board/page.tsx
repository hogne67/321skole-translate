"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import type { SpaceDoc } from "@/lib/spacesClient";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { ExternalLink, MonitorUp, PlayCircle, Radio, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

type SpaceRow = { id: string; data: SpaceDoc & { createdAt?: unknown } };
type BoardMode = "text" | "poll" | "wordwall" | "image" | "clock" | "quiz";
type BoardState = {
  active?: boolean;
  mode?: BoardMode | string;
  sessionId?: string;
  updatedAt?: unknown;
};

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function modeLabel(t: (key: string) => string, mode: unknown) {
  if (mode === "poll") return t("modes.poll");
  if (mode === "wordwall") return t("modes.wordwall");
  if (mode === "image") return t("modes.image");
  if (mode === "clock") return t("modes.clock");
  if (mode === "quiz") return t("modes.quiz");
  return t("modes.text");
}

export default function TeacherBoardIndexPage() {
  return (
    <AuthGate>
      <TeacherBoardIndexInner />
    </AuthGate>
  );
}

function TeacherBoardIndexInner() {
  const t = useTranslations("teacherBoardIndex");
  const locale = useLocale();
  const { user, profile, loading } = useUserProfile();

  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [boardStates, setBoardStates] = useState<Record<string, BoardState | null>>({});

  const canUse = profile?.role === "teacher" || profile?.role === "admin";

  useEffect(() => {
    if (!user?.uid || !canUse) return;

    const q = query(collection(db, "spaces"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setSpaces(
        snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as SpaceRow["data"],
        }))
      );
    });
  }, [user?.uid, canUse]);

  useEffect(() => {
    if (spaces.length === 0) {
      setBoardStates({});
      return;
    }

    const unsubs = spaces.map((space) =>
      onSnapshot(
        doc(db, "spaces", space.id, "board", "state"),
        (snap) => {
          setBoardStates((prev) => ({
            ...prev,
            [space.id]: snap.exists() ? (snap.data() as BoardState) : null,
          }));
        },
        () => {
          setBoardStates((prev) => ({ ...prev, [space.id]: null }));
        }
      )
    );

    return () => unsubs.forEach((unsub) => unsub());
  }, [spaces]);

  const activeCount = useMemo(
    () => spaces.filter((space) => boardStates[space.id]?.active === true).length,
    [boardStates, spaces]
  );

  if (loading) {
    return <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-slate-600">{t("loading")}</div>;
  }

  if (!canUse) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">{t("access.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-700">{t("access.text")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-4">
      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-5 sm:p-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
              <MonitorUp className="h-4 w-4" aria-hidden="true" />
              {t("hero.eyebrow")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{t("hero.title")}</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{t("hero.text")}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <InfoPill label={t("stats.rooms")} value={String(spaces.length)} />
              <InfoPill label={t("stats.active")} value={String(activeCount)} />
              <InfoPill label={t("stats.activities")} value={t("stats.activitiesValue")} />
            </div>
          </div>

          <div className="border-t border-blue-100 bg-blue-50/50 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
                  <PlayCircle className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-950">{t("video.title")}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{t("video.text")}</p>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-dashed border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">
                {t("video.placeholder")}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t("guide.title")}
          </div>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-amber-950">
            <li>{t("guide.step1")}</li>
            <li>{t("guide.step2")}</li>
            <li>{t("guide.step3")}</li>
          </ol>
        </aside>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">{t("rooms.title")}</h2>
              <p className="mt-1 text-sm text-slate-600">{t("rooms.text")}</p>
            </div>
            <Link
              href={`/${locale}/teacher/spaces`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              {t("rooms.manage")}
            </Link>
          </div>

          {spaces.length === 0 ? (
            <div className="p-5 text-sm text-slate-600">{t("rooms.empty")}</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {spaces.map((space) => {
                const state = boardStates[space.id] ?? null;
                const isLive = state?.active === true;
                const title = safeString(space.data.title) ?? t("rooms.untitled");

                return (
                  <div key={space.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-slate-950">{title}</h3>
                        <span
                          className={[
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                            isLive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600",
                          ].join(" ")}
                        >
                          <span className={["h-2 w-2 rounded-full", isLive ? "bg-emerald-500" : "bg-slate-400"].join(" ")} />
                          {isLive ? t("rooms.live") : state ? t("rooms.notLive") : t("rooms.notStarted")}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                        <Radio className="h-4 w-4" aria-hidden="true" />
                        <span>{isLive ? t("rooms.activeMode", { mode: modeLabel(t, state?.mode) }) : t("rooms.ready")}</span>
                      </div>
                    </div>

                    <Link
                      href={`/${locale}/teacher/spaces/${space.id}/board`}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      {t("rooms.openBoard")}
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}
