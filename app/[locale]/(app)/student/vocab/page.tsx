// app/(app)/student/vocab/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

export default function StudentVocabRedirectPage() {
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    router.replace(`/${locale}/tools/vocab`);
  }, [router, locale]);

  return null;
}