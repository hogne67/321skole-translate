// app/[locale]/pricing/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";
import { useUserProfile } from "@/lib/useUserProfile";

type TierKey = "free" | "basic" | "plus" | "pro";
type RoleKey = "teacher" | "student" | "parent";

type FeatureRow = {
  labelKey: string;
  values: Record<TierKey, string>;
};

type RoleSection = {
  id: RoleKey;
  titleKey: string;
  rows: FeatureRow[];
};

const CHECK = "CHECK";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function ValueCell({ value }: { value: string }) {
  return (
    <div className="flex min-h-[34px] items-center justify-center text-sm">
      {value === CHECK ? "✓" : value}
    </div>
  );
}

function CompareTable({
  role,
  isLoggedIn,
  locale,
  t,
}: {
  role: RoleSection;
  isLoggedIn: boolean;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const visiblePlans: TierKey[] =
    role.id === "teacher" ? ["free", "basic", "plus", "pro"] : ["free", "pro"];
  const prices: Record<TierKey, string> = {
    free: t("tiers.free.price"),
    basic: t("tiers.basic.price"),
    plus: t("tiers.plus.price"),
    pro:
      role.id === "teacher"
        ? t("tiers.pro.price")
        : t("tiers.pro.studentParentPrice"),
  };
  const gridCols = role.id === "teacher" ? "grid-cols-6" : "grid-cols-4";

  return (
    <section className="mt-6">
      {/* HEADER */}
      <div className={cx("grid gap-2 mb-2", gridCols)}>
        <div className="col-span-2 text-sm font-semibold text-slate-700 flex items-end pb-2">
          {t("compare.function")}
        </div>

        {visiblePlans.map((plan) => {
          const href = isLoggedIn
            ? `/${locale}/account/billing`
            : `/${locale}/join`;

          return (
            <div
              key={plan}
              className={cx(
                "rounded-xl border p-3 text-center bg-white shadow-sm",
                plan === "plus" && "border-violet-300 bg-violet-50"
              )}
            >
              <div className="text-sm font-semibold">
                {t(`tiers.${plan}.name`)}
              </div>

              <div className="text-base font-semibold mt-1">
                {prices[plan]}
              </div>

              <Link
                href={href}
                className={cx(
                  "mt-2 inline-flex items-center justify-center rounded-md px-3 py-1 text-xs font-medium text-white",
                  plan === "plus"
                    ? "bg-violet-700 hover:bg-violet-800"
                    : "bg-slate-900 hover:bg-slate-800"
                )}
              >
                {t("compare.choose")}
              </Link>
            </div>
          );
        })}
      </div>

      {/* TABLE */}
      <div className="border rounded-xl divide-y">
        {role.rows.map((row) => (
          <div key={row.labelKey} className={cx("grid px-4 py-1", gridCols)}>
            <div className="col-span-2 text-sm font-medium text-slate-900">
              {t(row.labelKey)}
            </div>

            {visiblePlans.map((plan) => (
              <ValueCell key={plan} value={row.values[plan]} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PricingPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("pricing");
  const { user } = useUserProfile();

  const isLoggedIn = Boolean(user);

  const [selectedRole, setSelectedRole] = useState<RoleKey>("teacher");

  const commonRows: FeatureRow[] = [
    { labelKey: "features.library", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
    { labelKey: "features.generators", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
    { labelKey: "features.translateText", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
    { labelKey: "features.translateTaskText", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
    { labelKey: "features.taskAudio", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
    { labelKey: "features.feedbackAudio", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
  ];

  const ROLES: RoleSection[] = [
    {
      id: "teacher",
      titleKey: "roles.teacher",
      rows: [
        ...commonRows,
        { labelKey: "features.digitalBoard", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
        { labelKey: "features.studentCount", values: { free: "10", basic: "30", plus: "100", pro: "300" } },
        { labelKey: "features.createSpaces", values: { free: "3", basic: "10", plus: "30", pro: "100" } },
        { labelKey: "features.aiTaskFeedback", values: { free: "3", basic: "100", plus: "300", pro: "1000" } },
        { labelKey: "features.aiHelpSubmissions", values: { free: "3", basic: "100", plus: "300", pro: "1000" } },
        { labelKey: "features.premiumGenerator", values: { free: "3", basic: "30", plus: "100", pro: "500" } },
        { labelKey: "features.aiImageGenerator", values: { free: "2", basic: "30", plus: "100", pro: "500" } },
        { labelKey: "features.pdfPrints", values: { free: "3", basic: "30", plus: "100", pro: "500" } },
      ],
    },
    {
      id: "student",
      titleKey: "roles.student",
      rows: [
        ...commonRows,
        { labelKey: "features.joinSpaces", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
        { labelKey: "features.aiTaskFeedback", values: { free: "3", basic: "100", plus: "300", pro: "100" } },
        { labelKey: "features.translateTeacherFeedback", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
        { labelKey: "features.pdfPrints", values: { free: "5", basic: "20", plus: "100", pro: "20" } },
        { labelKey: "features.premiumGenerator", values: { free: "2", basic: "30", plus: "100", pro: "30" } },
        { labelKey: "features.aiImageGenerator", values: { free: "2", basic: "30", plus: "100", pro: "30" } },
      ],
    },
    {
      id: "parent",
      titleKey: "roles.parent",
      rows: [
        ...commonRows,
        { labelKey: "features.createChildSpaces", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
        { labelKey: "features.starFeedback", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
        { labelKey: "features.pdfPrints", values: { free: "5", basic: "20", plus: "100", pro: "20" } },
        { labelKey: "features.aiChildFeedbackSupport", values: { free: "3", basic: "100", plus: "300", pro: "100" } },
        { labelKey: "features.aiTaskFeedback", values: { free: "3", basic: "100", plus: "300", pro: "100" } },
        { labelKey: "features.premiumGenerator", values: { free: "2", basic: "30", plus: "100", pro: "30" } },
        { labelKey: "features.aiImageGenerator", values: { free: "2", basic: "30", plus: "100", pro: "30" } },
      ],
    },
  ];

  const activeRoleSection =
    ROLES.find((r) => r.id === selectedRole) ?? ROLES[0];

  function handleClose() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(`/${locale}`);
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            aria-label={t("buttons.close")}
          >
            <X size={16} aria-hidden="true" />
            <span>{t("buttons.close")}</span>
          </button>
        </div>

        {/* HERO */}
        <div className="mb-8 max-w-3xl">
          <h1 className="text-3xl font-semibold md:text-4xl">
            {t("hero.title")}
          </h1>
          <p className="mt-3 text-slate-600">
            {t("hero.subtitle")}
          </p>
        </div>

        {/* NAV */}
        <div className="mb-6 flex gap-2 border p-2 rounded-xl bg-slate-50">
          {ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRole(role.id)}
              className={cx(
                "px-4 py-1 rounded-lg text-sm",
                selectedRole === role.id
                  ? "bg-slate-900 text-white"
                  : "text-slate-700"
              )}
            >
              {t(role.titleKey)}
            </button>
          ))}
        </div>

        {/* TABLE */}
        <CompareTable
          role={activeRoleSection}
          isLoggedIn={isLoggedIn}
          locale={locale}
          t={t}
        />

      </div>
    </main>
  );
}
