// app/[locale]/pricing/page.tsx
"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  getEffectivePlan,
  type BillingSnapshot,
} from "@/lib/featureAccess";
import { useUserProfile } from "@/lib/useUserProfile";

type TierKey = "free" | "basic" | "plus" | "pro";
type RoleKey = "student" | "teacher" | "parent";

type Tier = {
  key: TierKey;
  name: string;
  price: string;
  tagline: string;
  accent: "slate" | "blue" | "violet" | "rose";
  recommended?: boolean;
};

type FeatureRow = {
  label: string;
  note?: string;
  values: Record<TierKey, string>;
};

type RoleSection = {
  id: RoleKey;
  title: string;
  subtitle: string;
  hint?: string;
  rows: FeatureRow[];
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function safePlan(plan?: string | null): TierKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function resolveRoleFromProfile(profile: unknown): RoleKey | null {
  if (!profile || typeof profile !== "object") return null;

  const p = profile as Record<string, unknown>;

  if (p.role === "student" || p.role === "teacher" || p.role === "parent") {
    return p.role;
  }

  if (p.mode === "student" || p.mode === "teacher" || p.mode === "parent") {
    return p.mode;
  }

  if (p.org && typeof p.org === "object") {
    const orgRole = (p.org as Record<string, unknown>).role;
    if (orgRole === "student" || orgRole === "teacher" || orgRole === "parent") {
      return orgRole;
    }
  }

  if (p.roles && typeof p.roles === "object") {
    const roles = p.roles as Record<string, unknown>;
    if (roles.teacher === true) return "teacher";
    if (roles.parent === true) return "parent";
    if (roles.student === true) return "student";
  }

  return null;
}

function getBillingSnapshot(profile: unknown): BillingSnapshot | null {
  if (!profile || typeof profile !== "object") return null;

  const p = profile as Record<string, unknown>;
  const billing = p.billing;

  if (!billing || typeof billing !== "object") return null;

  const b = billing as Record<string, unknown>;

  return {
    plan: typeof b.plan === "string" ? b.plan : null,
    status: typeof b.status === "string" ? b.status : null,
  };
}

function AccentPill({
  accent,
  label,
}: {
  accent: Tier["accent"];
  label: string;
}) {
  const cls =
    accent === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : accent === "violet"
        ? "border-violet-200 bg-violet-50 text-violet-700"
        : accent === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        cls
      )}
    >
      {label}
    </span>
  );
}

function TierCard({
  tier,
  activePlan,
  isLoggedIn,
  locale,
  t,
}: {
  tier: Tier;
  activePlan: TierKey;
  isLoggedIn: boolean;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const border =
    tier.accent === "blue"
      ? "border-blue-200"
      : tier.accent === "violet"
        ? "border-violet-300 ring-2 ring-violet-100"
        : tier.accent === "rose"
          ? "border-rose-200"
          : "border-slate-200";

  const buttonClass =
    tier.accent === "violet"
      ? "bg-violet-700 hover:bg-violet-800"
      : "bg-slate-900 hover:bg-slate-800";

  const isCurrent = activePlan === tier.key;
  const ctaHref = isLoggedIn ? `/${locale}/account/billing` : `/${locale}/join`;

  const ctaLabel = isCurrent
    ? t("tiers.card.activePlan")
    : isLoggedIn
      ? tier.key === "free"
        ? t("tiers.card.managePlan")
        : t("tiers.card.choosePlan", { name: tier.name })
      : tier.key === "free"
        ? t("tiers.card.getStarted")
        : t("tiers.card.choosePlan", { name: tier.name });

  return (
    <div
      className={cx(
        "rounded-2xl border bg-white p-5 shadow-sm",
        border,
        isCurrent && "ring-2 ring-emerald-100 border-emerald-300"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <AccentPill
              accent={tier.accent}
              label={tier.key === "free" ? t("tiers.free.badge") : tier.name}
            />

            {tier.recommended ? (
              <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                {t("tiers.card.recommended")}
              </span>
            ) : null}

            {isCurrent ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                {t("tiers.card.activePlan")}
              </span>
            ) : null}
          </div>

          <div className="mt-3 text-lg font-semibold text-slate-900">{tier.name}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{tier.price}</div>
          <p className="mt-2 text-sm text-slate-600">{tier.tagline}</p>
        </div>
      </div>

      <div className="mt-5">
        <Link
          href={ctaHref}
          className={cx(
            "inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-white",
            isCurrent ? "bg-emerald-600 hover:bg-emerald-700" : buttonClass
          )}
        >
          {ctaLabel}
        </Link>
      </div>

      <p className="mt-3 text-xs text-slate-500">{t("tiers.card.disclaimer")}</p>
    </div>
  );
}

function ValueCell({
  value,
  highlight,
}: {
  value: string;
  highlight?: boolean;
}) {
  const isCheck = value.trim() === "✔";
  const isDash = value.trim() === "–" || value.trim() === "-";

  return (
    <div
      className={cx(
        "flex min-h-[40px] items-center justify-center rounded-lg px-2 text-sm text-center border",
        highlight ? "border-emerald-200 bg-emerald-50" : "border-transparent",
        isCheck && "text-emerald-700",
        isDash && "text-slate-400",
        !isCheck && !isDash && "text-slate-800"
      )}
      aria-label={value}
    >
      {value}
    </div>
  );
}

function CompareTable({
  role,
  activePlan,
  activeRole,
  t,
}: {
  role: RoleSection;
  activePlan: TierKey;
  activeRole: RoleKey | null;
  t: ReturnType<typeof useTranslations>;
}) {
  const highlightPlan = activeRole === role.id ? activePlan : null;

  return (
    <section id={role.id} className="scroll-mt-24">
      <div className="mb-3">
        <h2 className="text-xl font-semibold text-slate-900">{role.title}</h2>
        <p className="mt-1 text-sm text-slate-600">{role.subtitle}</p>
        {role.hint ? <p className="mt-2 text-sm text-slate-700">{role.hint}</p> : null}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="hidden grid-cols-6 gap-0 border-b bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600 md:grid">
          <div className="col-span-2">{t("compare.function")}</div>
          <div
            className={cx(
              "text-center",
              highlightPlan === "free" && "text-emerald-700 font-semibold"
            )}
          >
            {t("tiers.free.name")}
          </div>
          <div
            className={cx(
              "text-center",
              highlightPlan === "basic" && "text-emerald-700 font-semibold"
            )}
          >
            {t("tiers.basic.name")}
          </div>
          <div
            className={cx(
              "text-center",
              highlightPlan === "plus" && "text-emerald-700 font-semibold"
            )}
          >
            {t("tiers.plus.name")}
          </div>
          <div
            className={cx(
              "text-center",
              highlightPlan === "pro" && "text-emerald-700 font-semibold"
            )}
          >
            {t("tiers.pro.name")}
          </div>
        </div>

        <div className="divide-y">
          {role.rows.map((row) => (
            <div key={row.label} className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-6 md:gap-3">
              <div className="md:col-span-2">
                <div className="text-sm font-medium text-slate-900">{row.label}</div>
                {row.note ? <div className="mt-0.5 text-xs text-slate-500">{row.note}</div> : null}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:col-span-4 md:grid-cols-4">
                <div className="md:hidden text-center text-xs font-medium text-slate-500">
                  {t("tiers.free.name")}
                </div>
                <div className="md:hidden text-center text-xs font-medium text-slate-500">
                  {t("tiers.basic.name")}
                </div>
                <div className="md:hidden text-center text-xs font-medium text-slate-500">
                  {t("tiers.plus.name")}
                </div>
                <div className="md:hidden text-center text-xs font-medium text-slate-500">
                  {t("tiers.pro.name")}
                </div>

                <ValueCell value={row.values.free} highlight={highlightPlan === "free"} />
                <ValueCell value={row.values.basic} highlight={highlightPlan === "basic"} />
                <ValueCell value={row.values.plus} highlight={highlightPlan === "plus"} />
                <ValueCell value={row.values.pro} highlight={highlightPlan === "pro"} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function PricingPage() {
  const locale = useLocale();
  const t = useTranslations("pricing");
  const { user, loading } = useUserProfile();

  const activeRole = resolveRoleFromProfile(user);
  const topLevelPlan = safePlan((user as { plan?: string } | null)?.plan ?? null);
  const billing = getBillingSnapshot(user);

  const activePlan = getEffectivePlan({
    plan: topLevelPlan,
    billing,
  }) as TierKey;

  const isLoggedIn = Boolean(user);

  const backHref = locale ? `/${locale}` : "/";
  const joinHref = locale ? `/${locale}/join` : "/join";
  const billingHref = locale ? `/${locale}/account/billing` : "/account/billing";

  const TIERS: Tier[] = [
    {
      key: "free",
      name: t("tiers.free.name"),
      price: t("tiers.free.price"),
      tagline: t("tiers.free.tagline"),
      accent: "slate",
    },
    {
      key: "basic",
      name: t("tiers.basic.name"),
      price: t("tiers.basic.price"),
      tagline: t("tiers.basic.tagline"),
      accent: "blue",
    },
    {
      key: "plus",
      name: t("tiers.plus.name"),
      price: t("tiers.plus.price"),
      tagline: t("tiers.plus.tagline"),
      accent: "violet",
      recommended: true,
    },
    {
      key: "pro",
      name: t("tiers.pro.name"),
      price: t("tiers.pro.price"),
      tagline: t("tiers.pro.tagline"),
      accent: "rose",
    },
  ];

  const ROLES: RoleSection[] = [
    {
      id: "student",
      title: t("roles.student.title"),
      subtitle: t("roles.student.subtitle"),
      hint: t("roles.student.hint"),
      rows: [
        {
          label: t("roles.student.rows.library.label"),
          values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
        },
        {
          label: t("roles.student.rows.classroom.label"),
          values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
        },
        {
          label: t("roles.student.rows.generators.label"),
          note: t("roles.student.rows.generators.note"),
          values: { free: "2", basic: "10", plus: "25", pro: "100" },
        },
        {
          label: t("roles.student.rows.feedback.label"),
          values: { free: "5", basic: "30", plus: "100", pro: "300" },
        },
        {
          label: t("roles.student.rows.images.label"),
          values: { free: "–", basic: "10", plus: "50", pro: "150" },
        },
        {
          label: t("roles.student.rows.downloads.label"),
          values: { free: "3", basic: "20", plus: "75", pro: "200" },
        },
        {
          label: t("roles.student.rows.translator.label"),
          values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
        },
        {
          label: t("roles.student.rows.groups.label"),
          note: t("roles.student.rows.groups.note"),
          values: {
            free: t("values.simple"),
            basic: t("values.more"),
            plus: t("values.more"),
            pro: t("values.most"),
          },
        },
      ],
    },
    {
      id: "teacher",
      title: t("roles.teacher.title"),
      subtitle: t("roles.teacher.subtitle"),
      hint: t("roles.teacher.hint"),
      rows: [
        {
          label: t("roles.teacher.rows.library.label"),
          values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
        },
        {
          label: t("roles.teacher.rows.generators.label"),
          note: t("roles.teacher.rows.generators.note"),
          values: { free: "15", basic: "50", plus: "150", pro: "500" },
        },
        {
          label: t("roles.teacher.rows.feedback.label"),
          values: { free: "20", basic: "100", plus: "300", pro: "1000" },
        },
        {
          label: t("roles.teacher.rows.images.label"),
          values: { free: "5", basic: "50", plus: "200", pro: "1000" },
        },
        {
          label: t("roles.teacher.rows.downloads.label"),
          values: { free: "10", basic: "50", plus: "200", pro: "1000" },
        },
        {
          label: t("roles.teacher.rows.members.label"),
          note: t("roles.teacher.rows.members.note"),
          values: { free: "50", basic: "150", plus: "500", pro: "2000" },
        },
        {
          label: t("roles.teacher.rows.rooms.label"),
          values: {
            free: t("values.basic"),
            basic: t("values.moreCapacity"),
            plus: t("values.largeCapacity"),
            pro: t("values.maxCapacity"),
          },
        },
        {
          label: t("roles.teacher.rows.appAccess.label"),
          values: { free: "–", basic: "✔", plus: "✔", pro: "✔" },
        },
      ],
    },
    {
      id: "parent",
      title: t("roles.parent.title"),
      subtitle: t("roles.parent.subtitle"),
      hint: t("roles.parent.hint"),
      rows: [
        {
          label: t("roles.parent.rows.library.label"),
          values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
        },
        {
          label: t("roles.parent.rows.homeRoom.label"),
          values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
        },
        {
          label: t("roles.parent.rows.generators.label"),
          note: t("roles.parent.rows.generators.note"),
          values: { free: "1", basic: "5", plus: "20", pro: "100" },
        },
        {
          label: t("roles.parent.rows.feedback.label"),
          values: { free: "3", basic: "20", plus: "75", pro: "200" },
        },
        {
          label: t("roles.parent.rows.images.label"),
          values: { free: "–", basic: "10", plus: "50", pro: "150" },
        },
        {
          label: t("roles.parent.rows.downloads.label"),
          values: { free: "3", basic: "15", plus: "50", pro: "150" },
        },
        {
          label: t("roles.parent.rows.family.label"),
          values: {
            free: t("values.small"),
            basic: t("values.more"),
            plus: t("values.large"),
            pro: t("values.largest"),
          },
        },
        {
          label: t("roles.parent.rows.appAccess.label"),
          values: { free: "–", basic: "✔", plus: "✔", pro: "✔" },
        },
      ],
    },
  ];

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:py-14">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {t("hero.title")}
            </h1>

            <p className="mt-3 text-base text-slate-600">
              {t("hero.subtitle")}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <a href="#student" className="rounded-full border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                {t("nav.student")}
              </a>
              <a href="#teacher" className="rounded-full border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                {t("nav.teacher")}
              </a>
              <a href="#parent" className="rounded-full border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                {t("nav.parent")}
              </a>
            </div>

            {!loading && isLoggedIn ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {t("activePlan.label")}{" "}
                <span className="font-semibold">{activePlan.toUpperCase()}</span>
                {activeRole ? (
                  <>
                    {" "}
                    · {t("activePlan.role")}{" "}
                    <span className="font-semibold">{activeRole}</span>
                  </>
                ) : null}
                <div className="mt-2">
                  <Link href={billingHref} className="font-medium underline underline-offset-2">
                    {t("activePlan.manage")}
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={backHref}
              className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("buttons.back")}
            </Link>

            <Link
              href={isLoggedIn ? billingHref : joinHref}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              {isLoggedIn ? t("buttons.managePlan") : t("buttons.createAccount")}
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:mt-10 md:grid-cols-4">
          {TIERS.map((tier) => (
            <TierCard
              key={tier.key}
              tier={tier}
              activePlan={activePlan}
              isLoggedIn={isLoggedIn}
              locale={locale}
              t={t}
            />
          ))}
        </div>

        <div className="mt-8 rounded-2xl border bg-slate-50 p-5">
          <h2 className="text-base font-semibold text-slate-900">
            {t("howItWorks.title")}
          </h2>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">
                {t("howItWorks.cards.categories.title")}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {t("howItWorks.cards.categories.body")}
              </p>
            </div>

            <div className="rounded-xl bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">
                {t("howItWorks.cards.dashboard.title")}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {t("howItWorks.cards.dashboard.body")}
              </p>
            </div>

            <div className="rounded-xl bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">
                {t("howItWorks.cards.roles.title")}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {t("howItWorks.cards.roles.body")}
              </p>
            </div>

            <div className="rounded-xl bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">
                {t("howItWorks.cards.plus.title")}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {t("howItWorks.cards.plus.body")}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 space-y-10 md:mt-12">
          {ROLES.map((role) => (
            <CompareTable
              key={role.id}
              role={role}
              activePlan={activePlan}
              activeRole={activeRole}
              t={t}
            />
          ))}
        </div>

        <div className="mt-12 border-t pt-6 text-sm text-slate-500">
          <p>{t("footer.note")}</p>
        </div>
      </div>
    </main>
  );
}