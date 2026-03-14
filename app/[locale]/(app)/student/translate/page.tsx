// app/(app)/student/translate/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

export default function StudentTranslateRedirectPage() {
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    router.replace(`/${locale}/tools/translate`);
  }, [router, locale]);

  return null;
}