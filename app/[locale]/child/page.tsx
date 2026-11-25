"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { CHILD_START_URL_KEY } from "@/lib/familyDevice";

export default function ChildStartPage() {
  const t = useTranslations("childSpace");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    try {
      const savedUrl = window.localStorage.getItem(CHILD_START_URL_KEY);
      if (savedUrl && /^\/(nb|en|pt)\/child\/spaces\/[A-Za-z0-9_-]{1,128}$/.test(savedUrl)) {
        window.location.replace(savedUrl);
        return;
      }
    } catch {
      // Storage can be disabled in the browser.
    }

    setChecking(false);
  }, []);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center p-4">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="text-sm font-black uppercase tracking-wide text-slate-400">{t("brand")}</div>

        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
          {t("startPage.title")}
        </h1>

        <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-slate-600">
          {checking
            ? t("startPage.opening")
            : t("startPage.missingSavedRoom")}
        </p>

      </section>
    </main>
  );
}
