// app/(app)/unauthorized/page.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";
import { useTranslations } from "next-intl";

type Roles = {
  admin?: boolean;
  teacher?: boolean;
  creator?: boolean;
};

export default function UnauthorizedPage() {
  const t = useTranslations("unauthorized");
  const { user, profile, loading } = useUserProfile();
  const pathname = usePathname();

  if (loading) return null;

  // Ikke innlogget
  if (!user) {
    return (
      <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>{t("notLoggedIn.title")}</h1>
        <p style={{ opacity: 0.85 }}>{t("notLoggedIn.body")}</p>
        <Link href={`/login?next=${encodeURIComponent(pathname || "/")}`}>
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
          <Link href="/login">{t("common.login")}</Link>
          <Link href="/student">{t("common.backToStudent")}</Link>
        </div>
      </main>
    );
  }

  // ---------- Trygg lesing av profile ----------
  const profileObj = profile && typeof profile === "object" ? profile : undefined;

  const roles: Roles | undefined =
    profileObj && "roles" in profileObj && typeof profileObj.roles === "object"
      ? (profileObj.roles as Roles)
      : undefined;

  const teacherStatus =
    profileObj && "teacherStatus" in profileObj && typeof profileObj.teacherStatus === "string"
      ? profileObj.teacherStatus
      : undefined;

  const creatorStatus =
    profileObj && "creatorStatus" in profileObj && typeof profileObj.creatorStatus === "string"
      ? profileObj.creatorStatus
      : undefined;

  const isAdmin = roles?.admin === true;
  const isTeacher = roles?.teacher === true;
  const isCreator = roles?.creator === true;

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
            {t("card.teacher")}: <b>{isTeacher ? t("common.yes") : t("common.no")}</b>{" "}
            {teacherStatus ? (
              <span style={{ opacity: 0.7 }}>{t("card.status", { status: teacherStatus })}</span>
            ) : null}
          </div>

          <div>
            {t("card.creator")}: <b>{isCreator ? t("common.yes") : t("common.no")}</b>{" "}
            {creatorStatus ? (
              <span style={{ opacity: 0.7 }}>{t("card.status", { status: creatorStatus })}</span>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <Link href="/student">{t("common.backToStudent")}</Link>

          {!isTeacher && <Link href="/teacher/apply">{t("actions.applyTeacher")}</Link>}
          {!isCreator && <Link href="/apply/creator">{t("actions.applyCreator")}</Link>}

          <Link href="/">{t("actions.frontpage")}</Link>
        </div>

        <p style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>{t("tips.refresh")}</p>
      </div>
    </main>
  );
}