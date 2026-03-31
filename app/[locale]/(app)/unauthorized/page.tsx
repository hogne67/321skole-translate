// app/(app)/unauthorized/page.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale, useTranslations } from "next-intl";

type Roles = {
  admin?: boolean;
  teacher?: boolean;
  creator?: boolean;
  parent?: boolean;
  student?: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readRole(profile: unknown): string | null {
  if (!isRecord(profile)) return null;

  const r = profile.role;
  if (typeof r === "string" && r.trim()) return r;

  // legacy fallback
  const roles = isRecord(profile.roles) ? (profile.roles as Record<string, unknown>) : null;
  if (roles) {
    if (roles.admin === true) return "admin";
    if (roles.teacher === true) return "teacher";
    if (roles.creator === true) return "creator";
    if (roles.parent === true) return "parent";
    if (roles.student === true) return "student";
  }

  return null;
}

export default function UnauthorizedPage() {
  const t = useTranslations("unauthorized");
  const locale = useLocale();
  const { user, profile, loading } = useUserProfile();
  const pathname = usePathname();

  if (loading) return null;

  // Ikke innlogget
  if (!user) {
    return (
      <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>{t("notLoggedIn.title")}</h1>
        <p style={{ opacity: 0.85 }}>{t("notLoggedIn.body")}</p>
        <Link href={`/${locale}/login?next=${encodeURIComponent(pathname || `/${locale}/`)}`}>
          {t("notLoggedIn.ctaLogin")}
        </Link>
      </main>
    );
  }
  // Anonym bruker
  if (user.isAnonymous) {
    return (
      <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>{t("anonymous.title")}</h1>
        <p style={{ opacity: 0.85 }}>{t("anonymous.body")}</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          <Link href={`/${locale}/login`}>{t("common.login")}</Link>
          <Link href={`/${locale}/student`}>{t("common.backToStudent")}</Link>
        </div>
      </main>
    );
  }

  // ---------- Trygg lesing av profile ----------
  const role = readRole(profile);

  const roles: Roles | undefined =
    profile && isRecord(profile) && isRecord(profile.roles) ? (profile.roles as Roles) : undefined;

  const isAdmin = role === "admin" || roles?.admin === true;
  const isTeacher = role === "teacher" || roles?.teacher === true;
  const isCreator = role === "creator" || roles?.creator === true;

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>{t("noAccess.title")}</h1>

      <p style={{ opacity: 0.85 }}>{t("noAccess.body")}</p>

      <div
        style={{
          marginTop: 12,
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          padding: 12,
          background: "white",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 6 }}>{t("card.title")}</div>

        <div style={{ opacity: 0.85, lineHeight: 1.6 }}>
          <div>
            {t("card.admin")}: <b>{isAdmin ? t("common.yes") : t("common.no")}</b>
          </div>

          <div>
            {t("card.teacher")}: <b>{isTeacher ? t("common.yes") : t("common.no")}</b>
          </div>

          <div>
            {t("card.creator")}: <b>{isCreator ? t("common.yes") : t("common.no")}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <Link href={`/${locale}/student`}>{t("common.backToStudent")}</Link>

          {/* Hvis user faktisk ER teacher, gi snarvei tilbake */}
          {isTeacher && <Link href={`/${locale}/teacher`}>{t("common.backToTeacher")}</Link>}

          {/* Apply-teacher fjernet: teacher skal ikke godkjennes */}
          {/* Creator kan beholdes hvis dere fortsatt har creator-flow */}
          {!isCreator && <Link href={`/${locale}/apply/creator`}>{t("actions.applyCreator")}</Link>}

          <Link href={`/${locale}/`}>{t("actions.frontpage")}</Link>
        </div>

        <p style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>{t("tips.refresh")}</p>
      </div>
    </main>
  );
}