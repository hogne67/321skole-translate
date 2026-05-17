"use client";

import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";

const CHILD_START_URL_KEY = "321skole.childStartUrl";

export default function ChildStartPage() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const savedUrl = window.localStorage.getItem(CHILD_START_URL_KEY);

    if (savedUrl && savedUrl.startsWith("/")) {
      window.location.replace(savedUrl);
      return;
    }

    setChecking(false);
  }, []);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center p-4">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="text-sm font-black uppercase tracking-wide text-slate-400">321school</div>

        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">Barnerom</h1>

        <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-slate-600">
          {checking
            ? "Åpner barnerommet..."
            : "Åpne barnerommet fra foreldresiden én gang til, så husker startskjerm-ikonet riktig rom."}
        </p>

        {!checking ? (
          <div className="mt-6">
            <Link
              href="/parent/spaces"
              className="inline-flex items-center justify-center rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white no-underline hover:bg-emerald-600"
            >
              Gå til foreldrerom
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
