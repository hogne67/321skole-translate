import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAssessmentCopy } from "@/lib/assessments/catalog";

export default function AssessmentBackLink({ locale }: { locale: string }) {
  return <Link href={`/${locale}/tools/assessments`} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-800 no-underline hover:underline"><ArrowLeft size={16} aria-hidden="true" />{getAssessmentCopy(locale).backToAssessments}</Link>;
}
