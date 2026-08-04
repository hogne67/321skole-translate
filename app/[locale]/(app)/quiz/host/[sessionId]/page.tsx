"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function QuizHostRedirectPage() {
  const params = useParams<{ locale: string; sessionId: string }>();
  const router = useRouter();
  const locale = params.locale;
  const sessionId = params.sessionId;

  useEffect(() => {
    router.replace(`/${locale}/quiz/host/${sessionId}/display`);
  }, [locale, router, sessionId]);

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-700">
      Åpner storskjerm...
    </main>
  );
}
