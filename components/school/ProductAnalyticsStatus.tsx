"use client";

import { useTranslations } from "next-intl";
import { isProductAnalyticsEnabled } from "@/lib/productAnalyticsPolicy";

export default function ProductAnalyticsStatus() {
  const t = useTranslations("schoolAdmin.productAnalytics");
  if (isProductAnalyticsEnabled()) return null;
  return (
    <section aria-label={t("title")} className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">{t("title")}</h2>
      <p>{t("description")}</p>
      <p>{t("necessaryLogging")}</p>
    </section>
  );
}
