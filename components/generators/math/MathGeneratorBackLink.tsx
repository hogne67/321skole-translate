"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLocale } from "next-intl";
import { getMathGeneratorCopy } from "@/lib/math/generators";

export default function MathGeneratorBackLink() {
  const locale = useLocale();
  return <Link href={`/${locale}/producer/math`} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 no-underline hover:underline print:hidden">
    <ArrowLeft size={16} aria-hidden="true" />{getMathGeneratorCopy(locale).back}
  </Link>;
}
