// components/AppShell.tsx
"use client";

import React, { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import TopNav from "@/components/TopNav";
import LibraryBar from "@/components/LibraryBar";
import SectionShell from "@/components/SectionShell";
import { useUserProfile } from "@/lib/useUserProfile";
import { canAccessAcademy } from "@/lib/courses/academyAccess";
import { navItemsForRole } from "@/lib/navItems";
import { useTranslations } from "next-intl";

type AppRole = "student" | "teacher" | "parent" | "admin" | "creator";

const PERSONAL_ADMIN_LINK_UIDS = new Set(["x9gRQLihwobfyXaoPIl6OZBd5Ov1"]);

function normalizeRole(role: unknown, isAnonymous: boolean): AppRole {
  if (isAnonymous) return "student";
  if (role === "teacher") return "teacher";
  if (role === "parent") return "parent";
  if (role === "admin") return "admin";
  if (role === "creator") return "creator";
  return "student";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const tModes = useTranslations("modes");
  const tNav = useTranslations("nav");

  const { user, profile } = useUserProfile();
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;

    const scrollNow = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    scrollNow();

    const r1 = requestAnimationFrame(scrollNow);
    const r2 = requestAnimationFrame(() => {
      requestAnimationFrame(scrollNow);
    });

    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [pathname]);

  const role: AppRole = normalizeRole(profile?.role, !!user?.isAnonymous);

  const cleanPathname = (pathname || "").split("?")[0].replace(/\/+$/, "");
  const pathWithoutLocale = cleanPathname.replace(/^\/(en|no|nb|pt)(?=\/|$)/, "") || "/";
  const isLibrary = cleanPathname.endsWith("/321lessons");
  const isProducer = (pathname || "").includes("/producer");
  const isAnonymousOpenLesson =
    !!user?.isAnonymous && (pathname || "").includes("/student/lesson/");
  const isAnonymousDashboard = !!user?.isAnonymous && cleanPathname.endsWith("/student");
  const showSchoolTeacherIndicator =
    Boolean(profile?.schoolId) &&
    profile?.schoolRole === "school_teacher" &&
    profile?.schoolStatus === "active";
  const showPersonalAdminLink =
    !!user && !user.isAnonymous && PERSONAL_ADMIN_LINK_UIDS.has(user.uid);
  const academyEnabled = canAccessAcademy(profile);

  const title =
    isAnonymousOpenLesson
      ? tModes("openTask")
      : isAnonymousDashboard
        ? tModes("guest")
      : user?.isAnonymous && isLibrary
        ? tModes("openLibrary")
        : isLibrary
          ? tModes("library")
      : role === "teacher"
      ? tModes("teacher")
      : role === "parent"
        ? tModes("parent")
        : role === "admin" || role === "creator"
          ? tModes("teacher")
          : tModes("student");

  const items = useMemo(() => {
    const baseItems = navItemsForRole(role, { academyEnabled }).map((it) => ({
      href: it.href,
      label: tNav(it.labelKey),
    }));

    const withSchoolItems =
      profile?.schoolId &&
      profile.schoolRole === "school_admin" &&
      profile.schoolStatus === "active"
        ? [
          ...baseItems,
          {
            href: "/school",
            label: "Skoleadministrasjon",
          },
        ]
        : baseItems;

    if (showPersonalAdminLink && !withSchoolItems.some((it) => it.href === "/admin")) {
      return [
        ...withSchoolItems,
        {
          href: "/admin",
          label: tNav("admin"),
        },
      ];
    }

    return withSchoolItems;
  }, [
    profile?.schoolId,
    profile?.schoolRole,
    profile?.schoolStatus,
    role,
    academyEnabled,
    showPersonalAdminLink,
    tNav,
  ]);

  const isSpacesDetailPage =
    pathWithoutLocale.startsWith("/teacher/spaces/") ||
    pathWithoutLocale.startsWith("/student/spaces/") ||
    pathWithoutLocale.startsWith("/parent/spaces/");
  const isLessonViewPage =
    pathWithoutLocale.startsWith("/student/lesson/") ||
    pathWithoutLocale.startsWith("/lesson/");
  const isToolPage = pathWithoutLocale === "/tools" || pathWithoutLocale.startsWith("/tools/");
  const isProducerPage = pathWithoutLocale === "/producer" || pathWithoutLocale.startsWith("/producer/");
  const isCoursePage =
    pathWithoutLocale === "/teacher/courses" ||
    pathWithoutLocale.startsWith("/teacher/courses/") ||
    pathWithoutLocale === "/student/courses" ||
    pathWithoutLocale.startsWith("/student/courses/");
  const isPlannerPage =
    pathWithoutLocale === "/teacher/planner" ||
    pathWithoutLocale.startsWith("/teacher/planner/");
  const isPrintViewPage = pathWithoutLocale.includes("/print");
  const isBoardDisplayPage = pathWithoutLocale.includes("/board/display");
  const isTopLevelNavPage = items.some((item) => item.href === pathWithoutLocale);
  const hideAppChrome = isPrintViewPage || isBoardDisplayPage;
  const useCompactSectionHeader =
    isTopLevelNavPage ||
    isSpacesDetailPage ||
    isLessonViewPage ||
    isToolPage ||
    isProducerPage ||
    isCoursePage ||
    isPlannerPage ||
    isPrintViewPage ||
    isBoardDisplayPage;

  if (isBoardDisplayPage) {
    return (
      <div className="app-scope tw-scope appShellRoot">
        {children}
        <style jsx>{`
          .appShellRoot {
            width: 100%;
            min-width: 0;
            overflow-x: clip;
          }

          :global(html),
          :global(body) {
            max-width: 100%;
            overflow-x: clip;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="app-scope tw-scope appShellRoot">
      {!hideAppChrome ? <TopNav /> : null}
      {!hideAppChrome ? <LibraryBar /> : null}

      {isLibrary ? (
        <div className="libraryWrap">
          <h1 className="libraryTitle">{title}</h1>
          {showSchoolTeacherIndicator && !hideAppChrome ? <SchoolTeacherIndicator /> : null}
          {children}
        </div>
      ) : (
        <SectionShell
          title={title}
          items={items}
          fullWidth={isProducer}
          hideHeader={hideAppChrome}
          hideTitle={useCompactSectionHeader}
          containedHeader={useCompactSectionHeader}
          blockedToolsMessage={
            user?.isAnonymous ? tModes("anonymousCreateLessonRequired") : undefined
          }
          blockedToolsLoginLabel={tModes("anonymousCreateLessonLogin")}
        >
          {showSchoolTeacherIndicator ? <SchoolTeacherIndicator /> : null}
          {children}
        </SectionShell>
      )}

      <style jsx>{`
        .appShellRoot {
          width: 100%;
          min-width: 0;
          overflow-x: clip;
        }

        .libraryWrap {
          max-width: 1200px;
          margin: 10px auto;
          padding: 10px;
          width: 100%;
          min-width: 0;
          overflow-x: clip;
        }

        .libraryTitle {
          margin: 0 0 14px;
          font-size: 24px;
          line-height: 1.2;
          font-weight: 900;
          color: #0f172a;
        }

        :global(html),
        :global(body) {
          max-width: 100%;
          overflow-x: clip;
        }
      `}</style>
    </div>
  );
}

function SchoolTeacherIndicator() {
  return (
    <div className="schoolTeacherIndicator" aria-label="Tilknyttet skole">
      <div>
        <strong>Tilknyttet skole</strong>
        <span>Du bruker 321school gjennom en skolelisens.</span>
      </div>

      <style jsx>{`
        .schoolTeacherIndicator {
          margin: 0 0 12px;
          padding: 10px 12px;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          background: #eff6ff;
          color: #1e3a8a;
        }

        .schoolTeacherIndicator div {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 10px;
          align-items: baseline;
        }

        .schoolTeacherIndicator strong {
          font-size: 14px;
          line-height: 1.3;
        }

        .schoolTeacherIndicator span {
          font-size: 13px;
          line-height: 1.35;
          color: #1d4ed8;
        }
      `}</style>
    </div>
  );
}
