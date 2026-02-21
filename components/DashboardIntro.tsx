"use client";

import Link from "next/link";
import { useUserProfile } from "@/lib/useUserProfile";
import { useAppMode } from "@/components/ModeProvider";
import { useLocale, useTranslations } from "next-intl";

type Props = { userIsAnon: boolean };

function safeMode(mode: unknown): "student" | "parent" | "teacher" | "creator" | "admin" | "user" {
  const m = String(mode ?? "");
  if (m === "student" || m === "parent" || m === "teacher" || m === "creator" || m === "admin") return m;
  return "user";
}

export function DashboardIntro({ userIsAnon }: Props) {
  const locale = useLocale();
  const t = useTranslations("student.dashboardIntro");
  const tModes = useTranslations("modes");

  const { profile } = useUserProfile();
  const { mode } = useAppMode();

  const name = (profile?.displayName || "").trim();
  const m = safeMode(mode);

  const roleLabel = m === "user" ? t("roleFallback") : tModes(m);

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