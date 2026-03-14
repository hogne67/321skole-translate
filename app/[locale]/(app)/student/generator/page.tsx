// app/[locale]/(app)/student/generator/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

export default function StudentGeneratorRedirectPage() {
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    router.replace(`/${locale}/tools/generator`);
  }, [router, locale]);

  return null;
}