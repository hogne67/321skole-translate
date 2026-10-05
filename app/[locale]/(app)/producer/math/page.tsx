"use client";

import MathGeneratorOverview from "@/components/generators/math/MathGeneratorOverview";
import { useLocale } from "next-intl";
import StudentSelfStudyPrompt from "@/components/StudentSelfStudyPrompt";
import { isSpaceOnlyStudent } from "@/lib/studentAccessMode";
import { useUserProfile } from "@/lib/useUserProfile";

export default function MathGeneratorsPage() {
  const locale = useLocale();
  const { user, profile, loading } = useUserProfile();
  const isGuest = Boolean(user?.isAnonymous);
  if ((profile?.role === "student" || isGuest) && isSpaceOnlyStudent(profile, { isAnonymous: isGuest })) return <StudentSelfStudyPrompt isAnonymous={isGuest} nextHref={`/${locale}/producer/math`} />;
  if (loading) return null;
  return <MathGeneratorOverview locale={locale} isGuest={isGuest} />;
}
