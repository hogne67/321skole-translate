"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";

type LibraryTabKey = "lessons" | "quiz" | "courses";

const LABELS: Record<string, { aria: string } & Record<LibraryTabKey, string>> = {
  nb: {
    aria: "Bibliotekinnhold",
    lessons: "Leksjoner",
    quiz: "Quiz",
    courses: "Kurs",
  },
  no: {
    aria: "Bibliotekinnhold",
    lessons: "Leksjoner",
    quiz: "Quiz",
    courses: "Kurs",
  },
  en: {
    aria: "Library content",
    lessons: "Lessons",
    quiz: "Quiz",
    courses: "Courses",
  },
  pt: {
    aria: "Conteudo da biblioteca",
    lessons: "Lições",
    quiz: "Quiz",
    courses: "Cursos",
  },
};

const TABS: { key: LibraryTabKey; href: string }[] = [
  { key: "lessons", href: "/321lessons" },
  { key: "quiz", href: "/321quiz" },
  { key: "courses", href: "/academy/courses/marketplace" },
];

function pathWithoutLocale(pathname: string | null) {
  return (pathname || "").split("?")[0].replace(/\/+$/, "").replace(/^\/(en|no|nb|pt)(?=\/|$)/, "") || "/";
}

function activeTab(pathname: string | null): LibraryTabKey {
  const path = pathWithoutLocale(pathname);
  if (path === "/321quiz" || path.startsWith("/321quiz/")) return "quiz";
  if (path === "/academy/courses/marketplace" || path.startsWith("/academy/courses/marketplace/")) {
    return "courses";
  }
  return "lessons";
}

export default function LibraryContentTabs() {
  const locale = useLocale();
  const pathname = usePathname();
  const active = activeTab(pathname);
  const labels = LABELS[locale] ?? LABELS.en;

  return (
    <nav className="libraryTabs" aria-label={labels.aria}>
      <div className="libraryTabsScroller">
        {TABS.map((tab) => {
          const selected = active === tab.key;

          return (
            <Link
              key={tab.key}
              href={`/${locale}${tab.href}`}
              className={`libraryTab ${selected ? "libraryTabActive" : ""}`}
              aria-current={selected ? "page" : undefined}
            >
              {labels[tab.key]}
            </Link>
          );
        })}
      </div>

      <style jsx global>{`
        .libraryTabs {
          margin: 0 0 14px;
          min-width: 0;
          max-width: 100%;
          display: flex;
          justify-content: center;
        }

        .libraryTabsScroller {
          display: flex;
          gap: 6px;
          max-width: 100%;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          border: 1px solid #d8e2dc;
          border-radius: 999px;
          background: #f7fbf8;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
          padding: 4px;
        }

        .libraryTabsScroller::-webkit-scrollbar {
          display: none;
        }

        .libraryTab {
          display: inline-flex;
          min-height: 34px;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
          border-radius: 999px;
          background: transparent;
          color: #385167;
          flex: 0 0 auto;
          min-width: 86px;
          padding: 7px 15px;
          font-size: 14px;
          font-weight: 900;
          line-height: 1.15;
          text-decoration: none;
          white-space: nowrap;
          transition:
            background-color 160ms ease,
            border-color 160ms ease,
            box-shadow 160ms ease,
            color 160ms ease,
            transform 160ms ease;
        }

        .libraryTab:hover {
          background: #ffffff;
          border-color: #d6e6de;
          color: #0f172a;
        }

        .libraryTabActive {
          border-color: #0f766e;
          background: #0f766e;
          color: #ffffff;
          box-shadow: 0 7px 14px rgba(15, 118, 110, 0.18);
          transform: translateY(-1px);
        }

        .libraryTabActive:hover {
          background: #0f766e;
          color: #ffffff;
        }

        @media (max-width: 560px) {
          .libraryTabs {
            margin-bottom: 12px;
            justify-content: flex-start;
          }

          .libraryTabsScroller {
            width: 100%;
            border-radius: 16px;
            padding: 4px;
          }

          .libraryTab {
            min-height: 34px;
            min-width: 82px;
            padding: 7px 12px;
            font-size: 13px;
          }
        }
      `}</style>
    </nav>
  );
}
