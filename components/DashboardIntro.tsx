// components/DashboardIntro.tsx
"use client";

import Link from "next/link";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale, useTranslations } from "next-intl";

type Props = { userIsAnon: boolean };

type Role = "student" | "teacher";

function safeRole(role: unknown): Role {
  return role === "teacher" ? "teacher" : "student";
}

function readStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  const v = rec[key];
  return typeof v === "string" ? v : null;
}

export function DashboardIntro({ userIsAnon }: Props) {
  const locale = useLocale();
  const t = useTranslations("student.dashboardIntro");
  const tModes = useTranslations("modes");

  const { profile } = useUserProfile();

  const name = (readStringField(profile, "displayName") ?? "").trim();

  // anon => student, ellers role fra profile
  const role: Role = userIsAnon ? "student" : safeRole(readStringField(profile, "role"));

  const roleLabel = role === "teacher" ? tModes("teacher") : tModes("student");

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

      <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
        {t.rich("youAre", {
          state: userIsAnon ? t("guest") : t("loggedIn"),
          role: roleLabel,
          b: (chunks) => <b>{chunks}</b>,
        })}
      </p>

      <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
        {t.rich("activity", {
          b: (chunks) => <b>{chunks}</b>,
        })}
      </p>

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