// components/AppShell.tsx
"use client";

import React, { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import TopNav from "@/components/TopNav";
import LibraryBar from "@/components/LibraryBar";
import LibraryContentTabs from "@/components/LibraryContentTabs";
import SectionShell from "@/components/SectionShell";
import { useUserProfile } from "@/lib/useUserProfile";
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
  const tLibrary = useTranslations("library");

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
  const locale = cleanPathname.match(/^\/(en|no|nb|pt)(?=\/|$)/)?.[1] ?? "nb";
  const pathWithoutLocale = cleanPathname.replace(/^\/(en|no|nb|pt)(?=\/|$)/, "") || "/";
  const isLibrary = cleanPathname.endsWith("/321lessons");
  const isLibraryContentPage =
    pathWithoutLocale === "/321lessons" ||
    pathWithoutLocale === "/321quiz" ||
    pathWithoutLocale.startsWith("/321quiz/") ||
    pathWithoutLocale === "/academy/courses/marketplace" ||
    pathWithoutLocale.startsWith("/academy/courses/marketplace/");
  const showLibraryClosePanel =
    pathWithoutLocale === "/321lessons" ||
    pathWithoutLocale === "/321quiz" ||
    pathWithoutLocale === "/academy/courses/marketplace";
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
    const baseItems = navItemsForRole(role).map((it) => ({
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
    showPersonalAdminLink,
    tNav,
  ]);

  const libraryCloseHref = `/${locale}${
    role === "teacher" || role === "admin" || role === "creator"
      ? "/teacher"
      : role === "parent"
        ? "/parent"
        : "/student"
  }`;

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
  const isAccountPage =
    pathWithoutLocale === "/account" ||
    pathWithoutLocale.startsWith("/account/");
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
    isAccountPage ||
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

      {isLibraryContentPage ? (
        <div className={`libraryWrap ${showLibraryClosePanel ? "libraryWrapWithClose" : ""}`}>
          <LibraryContentTabs />
          {showSchoolTeacherIndicator && !hideAppChrome ? <SchoolTeacherIndicator /> : null}
          {children}
          {showLibraryClosePanel ? <LibraryClosePanel href={libraryCloseHref} label={tLibrary("close")} /> : null}
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

        .libraryWrapWithClose {
          padding-bottom: 88px;
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

function LibraryClosePanel({ href, label }: { href: string; label: string }) {
  return (
    <div className="libraryClosePanel" aria-label={label}>
      <Link
        href={href}
        className="libraryClosePanelLink no-underline"
        style={{
          textDecoration: "none",
          color: "#dc2626",
        }}
      >
        <span className="libraryCloseArrow" aria-hidden="true">^</span>
        <span
          style={{
            textDecoration: "none",
            color: "#ffffff",
          }}
        >
          {label}
        </span>
        <span className="libraryCloseArrow" aria-hidden="true">^</span>
      </Link>

      <style jsx global>{`
        .libraryClosePanel {
          position: fixed;
          inset-inline: 0;
          bottom: 0;
          z-index: 60;
          display: flex;
          justify-content: center;
          border-top: 1px solid rgba(15, 23, 42, 0.10);
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 -12px 34px rgba(15, 23, 42, 0.10);
          padding: 5px 12px calc(5px + env(safe-area-inset-bottom));
          pointer-events: none;
          backdrop-filter: blur(10px);
        }

        .libraryClosePanelLink {
          pointer-events: auto;
          display: inline-flex;
          min-height: 36px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid rgba(185, 28, 28, 0.26);
          border-radius: 999px;
          background: #dc2626;
          color: #ffffff;
          box-shadow: 0 8px 18px rgba(185, 28, 28, 0.18);
          padding: 7px 16px;
          font-size: 15px;
          font-weight: 900;
          line-height: 1;
          text-decoration: none !important;
          transition:
            transform 140ms ease,
            box-shadow 140ms ease,
          background-color 140ms ease;
        }

        .libraryClosePanelLink:visited,
        .libraryClosePanelLink:active,
        .libraryClosePanelLink:hover,
        .app-scope .libraryClosePanelLink,
        .app-scope .libraryClosePanelLink:visited,
        .app-scope .libraryClosePanelLink:active,
        .app-scope .libraryClosePanelLink:hover {
          color: #ffffff;
          text-decoration: none !important;
          text-decoration-line: none !important;
        }

        .libraryClosePanelLink span,
        .app-scope .libraryClosePanelLink span {
          display: inline-flex;
          align-items: center;
          color: #ffffff;
          text-decoration: none !important;
          text-decoration-line: none !important;
        }

        .libraryCloseArrow {
          font-size: 19px;
          font-weight: 1000;
          line-height: 1;
          transform: translateY(-1px);
        }

        .libraryClosePanelLink:hover {
          background: #b91c1c;
          box-shadow: 0 10px 20px rgba(185, 28, 28, 0.22);
        }

        @media (min-width: 768px) {
          .libraryClosePanel {
            padding-bottom: 6px;
          }
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
