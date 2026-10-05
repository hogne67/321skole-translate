"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import "./schoolAdmin.css";

export default function SchoolNav({ locale, active }: {
  locale: string;
  active: "overview" | "teachers" | "spaces" | "statistics" | "license";
}) {
  const t = useTranslations("schoolAdmin");
  const links = [
    ["overview", ""], ["teachers", "/teachers"], ["spaces", "/spaces"],
    ["statistics", "/statistics"], ["license", "/license"],
  ] as const;
  return (
    <nav className="schoolAdminNav" aria-label={t("nav.label")}>
      {links.map(([key, path]) => (
        <Link key={key} href={`/${locale}/school${path}`} aria-current={active === key ? "page" : undefined}>
          {t(`nav.${key}`)}
        </Link>
      ))}
    </nav>
  );
}
