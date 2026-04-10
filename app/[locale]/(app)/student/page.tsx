"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { DashboardIntro } from "@/components/DashboardIntro";
import UsageCard from "@/components/UsageCard";
import { db } from "@/lib/firebase";
import { getBucketLimit, type PlanKey } from "@/lib/featureAccess";
import { useUsage } from "@/lib/useUsage";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale, useTranslations } from "next-intl";
import {
  getStudentDashboardStats,
  type SubmissionDashboardStats,
} from "@/lib/dashboardSubmissionStats";

function safePlan(plan?: string): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function emptyStats(): SubmissionDashboardStats {
  return {
    total: 0,
    draft: 0,
    submitted: 0,
    needsWork: 0,
    approved: 0,
    other: 0,
  };
}

function getCopy(locale: string) {
  if (locale === "pt") {
    return {
      assignmentTitle: "Status das tarefas",
      assignmentSubtitle: "Veja rapidamente o que precisa fazer e o que já foi avaliado.",
      todo: "Por fazer",
      submitted: "Enviadas",
      needsWork: "Melhorar",
      approved: "Concluídas",
      openSpaces: "Abrir turmas",
      noClassTitle: "Você ainda não está conectado a uma turma",
      noClassText:
        "Mesmo assim, você pode estudar sozinho, usar a biblioteca e salvar seu próprio conteúdo.",
      library: "Biblioteca",
      myContent: "Meu conteúdo",
      spacesLabel: "Turmas",
    };
  }

  if (locale === "en") {
    return {
      assignmentTitle: "My assignment status",
      assignmentSubtitle: "See what still needs work and what has already been reviewed.",
      todo: "To do",
      submitted: "Submitted",
      needsWork: "Needs work",
      approved: "Done",
      openSpaces: "Open classes",
      noClassTitle: "You are not connected to a classroom yet",
      noClassText:
        "You can still study on your own, use the library, and save your own content.",
      library: "Library",
      myContent: "My content",
      spacesLabel: "Classes",
    };
  }

  return {
    assignmentTitle: "Oppgavestatus",
    assignmentSubtitle: "Se raskt hva du må gjøre, og hva som allerede er vurdert.",
    todo: "Å gjøre",
    submitted: "Levert",
    needsWork: "Forbedre",
    approved: "Ferdig",
    openSpaces: "Åpne klasserom",
    noClassTitle: "Du er ikke koblet til et klasserom ennå",
    noClassText:
      "Du kan fortsatt jobbe på egen hånd, bruke biblioteket og lagre ditt eget innhold.",
    library: "Bibliotek",
    myContent: "Mitt innhold",
    spacesLabel: "Klasserom",
  };
}

function StatusCard({
  title,
  value,
  href,
}: {
  title: string;
  value: number;
  href: string;
}) {
  function getStyle(title: string) {
    const t = title.toLowerCase();

    if (t.includes("forbedre") || t.includes("needs")) {
      return {
        bg: "rgba(245,158,11,0.12)",
        border: "rgba(245,158,11,0.35)",
        color: "rgba(180,83,9,1)",
        badgeBg: "rgba(245,158,11,1)",
      };
    }

    if (t.includes("levert") || t.includes("submitted")) {
      return {
        bg: "rgba(59,130,246,0.12)",
        border: "rgba(59,130,246,0.35)",
        color: "rgba(37,99,235,1)",
        badgeBg: "rgba(59,130,246,1)",
      };
    }

    if (t.includes("ferdig") || t.includes("approved")) {
      return {
        bg: "rgba(16,185,129,0.12)",
        border: "rgba(16,185,129,0.35)",
        color: "rgba(5,150,105,1)",
        badgeBg: "rgba(16,185,129,1)",
      };
    }

    return {
      bg: "rgba(148,163,184,0.12)",
      border: "rgba(148,163,184,0.35)",
      color: "rgba(51,65,85,1)",
      badgeBg: "rgba(100,116,139,1)",
    };
  }

  const style = getStyle(title);

  return (
    <Link
      href={href}
      className="block rounded-xl border p-4 shadow-sm no-underline transition hover:-translate-y-0.5 hover:shadow-md"
      style={{
        background: style.bg,
        borderColor: style.border,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold" style={{ color: style.color }}>
          {title}
        </div>

        {value > 0 ? (
          <span
            style={{
              minWidth: 24,
              height: 24,
              padding: "0 8px",
              borderRadius: 999,
              background: style.badgeBg,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1,
              boxShadow: "0 1px 3px rgba(0,0,0,0.14)",
              flexShrink: 0,
            }}
          >
            {value}
          </span>
        ) : null}
      </div>

      <div className="mt-2 text-3xl font-extrabold text-slate-900">
        {value}
      </div>
    </Link>
  );
}

export default function StudentDashboard() {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const copy = useMemo(() => getCopy(locale), [locale]);

  const { profile } = useUserProfile();

  const [isAnon, setIsAnon] = useState(true);
  const [uid, setUid] = useState<string | undefined>(undefined);

  const [statsLoading, setStatsLoading] = useState(true);
  const [hasSpaces, setHasSpaces] = useState(false);
  const [spaceCount, setSpaceCount] = useState(0);
  const [submissionStats, setSubmissionStats] =
    useState<SubmissionDashboardStats>(emptyStats());

  const { usage, loading: usageLoading } = useUsage(uid);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const user = await ensureAnonymousUser();
        if (!alive) return;

        setIsAnon(Boolean(user.isAnonymous));
        setUid(user.uid);
      } catch {
        if (!alive) return;
        setIsAnon(true);
        setUid(undefined);
      }
    };

    void run();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      if (!uid || !db) {
        if (!cancelled) {
          setSubmissionStats(emptyStats());
          setHasSpaces(false);
          setSpaceCount(0);
          setStatsLoading(false);
        }
        return;
      }

      try {
        setStatsLoading(true);
        const result = await getStudentDashboardStats(db, uid);

        if (!cancelled) {
          setSubmissionStats(result.stats);
          setHasSpaces(result.hasSpaces);
          setSpaceCount(result.spaceCount);
        }
      } catch (error) {
        console.error("Failed to load student dashboard stats", error);
        if (!cancelled) {
          setSubmissionStats(emptyStats());
          setHasSpaces(false);
          setSpaceCount(0);
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
        }
      }
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  const planValue =
    profile && typeof profile === "object" && "plan" in profile
      ? (profile as { plan?: string }).plan
      : undefined;

  const plan = safePlan(planValue);
  const role = "student" as const;

  const generatorsUsed = usage["premium_generators"] ?? 0;
  const generatorsLimit = getBucketLimit(role, plan, "premium_generators");

  const feedbackUsed = usage["ai_feedback"] ?? 0;
  const feedbackLimit = getBucketLimit(role, plan, "ai_feedback");

  const imagesUsed = usage["image_generation"] ?? 0;
  const imagesLimit = getBucketLimit(role, plan, "image_generation");

  return (
    <main className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-4">
      <DashboardIntro
        userIsAnon={isAnon}
        helloAnon={t("dashboardIntro.helloAnon")}
        helloUser={t.raw("dashboardIntro.helloUser")}
        guestLabel={t("dashboardIntro.guest")}
        loggedInLabel={t("dashboardIntro.loggedIn")}
        youAre={t.raw("dashboardIntro.youAre")}
        activity={t.raw("dashboardIntro.activity")}
        recommendRegister={t("dashboardIntro.recommendRegister")}
        remainingLabel={t.raw("dashboardIntro.remaining")}
        roleLabelStudent={t("dashboardIntro.roles.student")}
        roleLabelTeacher={t("dashboardIntro.roles.teacher")}
        roleLabelParent={t("dashboardIntro.roles.parent")}
        roleFallback={t("dashboardIntro.roleFallback")}
        planFree={t("dashboardIntro.plans.free")}
        planBasic={t("dashboardIntro.plans.basic")}
        planPlus={t("dashboardIntro.plans.plus")}
        planPro={t("dashboardIntro.plans.pro")}
        actionSeePlans={t("dashboardIntro.actions.seePlans")}
        actionRegisterLogin={t("dashboardIntro.actions.registerLogin")}
        actionOpenLibrary={t("dashboardIntro.actions.openLibrary")}
      />

      {!usageLoading && (
        <section className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-200 p-4 shadow-md sm:p-5">
          <div className="mb-4 min-w-0">
            <div className="text-base font-semibold text-slate-900">
              {t("usage.title")}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {t("usage.subtitle")}
            </div>
          </div>

          <div className="grid min-w-0 gap-3">
            <UsageCard
              title={t("usage.cards.premiumGenerators")}
              used={generatorsUsed}
              limit={generatorsLimit}
              unlimitedLabel={t("usage.labels.unlimited")}
              usedLabel={t.raw("usage.labels.used")}
              remainingLabel={t.raw("usage.labels.remaining")}
              nearLimitLabel={t("usage.labels.nearLimit")}
              seePlansLabel={t("usage.labels.seePlans")}
              limitReachedLabel={t("usage.labels.limitReached")}
              upgradeLabel={t("usage.labels.upgrade")}
            />

            <UsageCard
              title={t("usage.cards.aiFeedback")}
              used={feedbackUsed}
              limit={feedbackLimit}
              unlimitedLabel={t("usage.labels.unlimited")}
              usedLabel={t.raw("usage.labels.used")}
              remainingLabel={t.raw("usage.labels.remaining")}
              nearLimitLabel={t("usage.labels.nearLimit")}
              seePlansLabel={t("usage.labels.seePlans")}
              limitReachedLabel={t("usage.labels.limitReached")}
              upgradeLabel={t("usage.labels.upgrade")}
            />

            <UsageCard
              title={t("usage.cards.imageGeneration")}
              used={imagesUsed}
              limit={imagesLimit}
              unlimitedLabel={t("usage.labels.unlimited")}
              usedLabel={t.raw("usage.labels.used")}
              remainingLabel={t.raw("usage.labels.remaining")}
              nearLimitLabel={t("usage.labels.nearLimit")}
              seePlansLabel={t("usage.labels.seePlans")}
              limitReachedLabel={t("usage.labels.limitReached")}
              upgradeLabel={t("usage.labels.upgrade")}
            />
          </div>
        </section>
      )}

      {!statsLoading && (
        <section className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-md sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                {hasSpaces ? copy.assignmentTitle : copy.noClassTitle}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {hasSpaces ? copy.assignmentSubtitle : copy.noClassText}
              </p>
            </div>

            {hasSpaces && (
              <div className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {copy.spacesLabel}: {spaceCount}
              </div>
            )}
          </div>

          {hasSpaces ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatusCard
  title={copy.todo}
  value={submissionStats.draft}
  href={`/${locale}/student/spaces`}
/>
<StatusCard
  title={copy.submitted}
  value={submissionStats.submitted}
  href={`/${locale}/student/spaces`}
/>
<StatusCard
  title={copy.needsWork}
  value={submissionStats.needsWork}
  href={`/${locale}/student/spaces`}
/>
<StatusCard
  title={copy.approved}
  value={submissionStats.approved}
  href={`/${locale}/student/spaces`}
/>
              </div>

              <div className="mt-4">
                <Link
                  href={`/${locale}/student/spaces`}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
                >
                  {copy.openSpaces}
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link
                href={`/${locale}/321lessons`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
              >
                {copy.library}
              </Link>

              <Link
                href={`/${locale}/student/content`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
              >
                {copy.myContent}
              </Link>
            </div>
          )}
        </section>
      )}

      <section className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-md sm:p-5">
        <h2 className="text-base font-extrabold text-slate-900">
          {t("quickLinks.title")}
        </h2>

        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          <Link
            href={`/${locale}/321lessons`}
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
          >
            {t("quickLinks.library")}
          </Link>

          <Link
            href={`/${locale}/student/content`}
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
          >
            {t("quickLinks.myContent")}
          </Link>
        </div>
      </section>
    </main>
  );
}