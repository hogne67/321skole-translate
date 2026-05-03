// app/[locale]/pricing/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
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
  const prices: Record<TierKey, string> = {
    free: t("tiers.free.price"),
    basic: t("tiers.basic.price"),
    plus: t("tiers.plus.price"),
    pro: t("tiers.pro.price"),
  };

  return (
    <section className="mt-6">
      {/* HEADER */}
      <div className="grid grid-cols-6 gap-2 mb-2">
        <div className="col-span-2 text-sm font-semibold text-slate-700 flex items-end pb-2">
          {t("compare.function")}
        </div>

        {(["free", "basic", "plus", "pro"] as TierKey[]).map((plan) => {
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
          <div key={row.labelKey} className="grid grid-cols-6 px-4 py-1">
            <div className="col-span-2 text-sm font-medium text-slate-900">
              {t(row.labelKey)}
            </div>

            <ValueCell value={row.values.free} />
            <ValueCell value={row.values.basic} />
            <ValueCell value={row.values.plus} />
            <ValueCell value={row.values.pro} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PricingPage() {
  const locale = useLocale();
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
        { labelKey: "features.createSpaces", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
        { labelKey: "features.digitalBoard", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
        { labelKey: "features.studentCount", values: { free: "10", basic: "30", plus: "100", pro: "500" } },
        { labelKey: "features.aiTaskFeedback", values: { free: "3", basic: "100", plus: "300", pro: "1000" } },
        { labelKey: "features.aiHelpSubmissions", values: { free: "3", basic: "100", plus: "300", pro: "1000" } },
        { labelKey: "features.premiumGenerator", values: { free: "3", basic: "30", plus: "150", pro: "500" } },
        { labelKey: "features.aiImageGenerator", values: { free: "2", basic: "30", plus: "100", pro: "500" } },
      ],
    },
    {
      id: "student",
      titleKey: "roles.student",
      rows: [
        ...commonRows,
        { labelKey: "features.joinSpaces", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
        { labelKey: "features.aiTaskFeedback", values: { free: "3", basic: "100", plus: "300", pro: "1000" } },
        { labelKey: "features.translateTeacherFeedback", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
        { labelKey: "features.premiumGenerator", values: { free: "2", basic: "30", plus: "100", pro: "500" } },
        { labelKey: "features.aiImageGenerator", values: { free: "2", basic: "30", plus: "100", pro: "500" } },
      ],
    },
    {
      id: "parent",
      titleKey: "roles.parent",
      rows: [
        ...commonRows,
        { labelKey: "features.createChildSpaces", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
        { labelKey: "features.starFeedback", values: { free: CHECK, basic: CHECK, plus: CHECK, pro: CHECK } },
        { labelKey: "features.aiTaskFeedback", values: { free: "3", basic: "100", plus: "300", pro: "1000" } },
        { labelKey: "features.premiumGenerator", values: { free: "2", basic: "30", plus: "100", pro: "500" } },
        { labelKey: "features.aiImageGenerator", values: { free: "2", basic: "30", plus: "100", pro: "500" } },
      ],
    },
  ];

  const activeRoleSection =
    ROLES.find((r) => r.id === selectedRole) ?? ROLES[0];

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6">

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