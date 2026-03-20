// components/DashboardIntro.tsx
"use client";

import Link from "next/link";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale, useTranslations } from "next-intl";
import { useUsage } from "@/lib/useUsage";
import { getBucketLimit, type PlanKey } from "@/lib/featureAccess";

type Props = { userIsAnon: boolean };

type Role = "student" | "teacher" | "parent";

function safeRole(role: unknown): Role {
  if (role === "teacher") return "teacher";
  if (role === "parent") return "parent";
  return "student";
}

function safePlan(plan: unknown): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function readStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  const v = rec[key];
  return typeof v === "string" ? v : null;
}

function getPlanLabel(plan: PlanKey) {
  if (plan === "basic") return "Basic";
  if (plan === "plus") return "Plus";
  if (plan === "pro") return "Pro";
  return "Free";
}

function getPlanColor(plan: PlanKey) {
  if (plan === "basic") return "#2563eb";
  if (plan === "plus") return "#7c3aed";
  if (plan === "pro") return "#e11d48";
  return "#64748b";
}

export function DashboardIntro({ userIsAnon }: Props) {
  const locale = useLocale();
  const t = useTranslations("student.dashboardIntro");
  const tModes = useTranslations("modes");

  const { profile } = useUserProfile();

  const name = (readStringField(profile, "displayName") ?? "").trim();
  const uid = readStringField(profile, "uid") ?? undefined;

  const role: Role = userIsAnon ? "student" : safeRole(readStringField(profile, "role"));
  const plan: PlanKey = userIsAnon ? "free" : safePlan(readStringField(profile, "plan"));

  const roleLabel =
    role === "teacher"
      ? tModes("teacher")
      : role === "parent"
      ? tModes("parent")
      : tModes("student");

  const planLabel = getPlanLabel(plan);
  const planColor = getPlanColor(plan);

  const { usage, loading: usageLoading } = useUsage(uid);

  const generatorsUsed = usage["premium_generators"] ?? 0;
  const generatorsLimit = getBucketLimit(role, plan, "premium_generators");
  const generatorsRemaining = Math.max(0, generatorsLimit - generatorsUsed);

  const showUsageBadge = !userIsAnon && !usageLoading && generatorsLimit > 0;

  const usageBadgeStyle: React.CSSProperties = {
    marginLeft: 8,
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#ffffff",
    color: "#111827",
  };

  const lowUsage =
    generatorsLimit > 0 && generatorsRemaining <= Math.max(2, Math.floor(generatorsLimit * 0.2));

  return (
    <section
      style={{
        padding: "14px 12px",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 14,
        background: "rgba(0,0,0,0.02)",
        marginBottom: 14,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>
        {userIsAnon || !name ? t("helloAnon") : t("helloUser", { name })}
      </h2>

      <p style={{ margin: "8px 0 0", opacity: 0.8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span>
          {t.rich("youAre", {
            state: userIsAnon ? t("guest") : t("loggedIn"),
            role: roleLabel,
            b: (chunks) => <b>{chunks}</b>,
          })}
        </span>

        {!userIsAnon && (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: `${planColor}15`,
              color: planColor,
              border: `1px solid ${planColor}40`,
            }}
          >
            {planLabel}
          </span>
        )}

        {showUsageBadge && (
          <span
            style={{
              ...usageBadgeStyle,
              color: lowUsage ? "#92400e" : usageBadgeStyle.color,
              background: lowUsage ? "#fff7ed" : usageBadgeStyle.background,
              border: lowUsage ? "1px solid #fdba74" : usageBadgeStyle.border,
            }}
          >
            {generatorsRemaining} igjen
          </span>
        )}
      </p>

      <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
        {t.rich("activity", {
          b: (chunks) => <b>{chunks}</b>,
        })}
      </p>

      {!userIsAnon && (plan === "free" || lowUsage) && (
        <div style={{ marginTop: 10 }}>
          <Link
            href={`/${locale}/pricing`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
              color: "#111827",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "6px 10px",
              background: "#fff",
            }}
          >
            Se planer
          </Link>
        </div>
      )}

      {userIsAnon ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, opacity: 0.85 }}>{t("recommendRegister")}</p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <Link
              href={`/${locale}/join`}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                textDecoration: "none",
              }}
            >
              {t("actions.registerLogin")}
            </Link>

            <Link
              href={`/${locale}/321lessons`}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                textDecoration: "none",
              }}
            >
              {t("actions.openLibrary")}
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}