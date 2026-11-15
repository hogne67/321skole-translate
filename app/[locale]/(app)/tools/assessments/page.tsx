"use client";

import { useLocale } from "next-intl";
import AssessmentOverview from "@/components/assessments/AssessmentOverview";
import StudentSelfStudyPrompt from "@/components/StudentSelfStudyPrompt";
import { isSpaceOnlyStudent } from "@/lib/studentAccessMode";
import { useUserProfile } from "@/lib/useUserProfile";

export default function AssessmentsPage() {
  const locale = useLocale();
  const { user, profile, loading } = useUserProfile();
  const isAnonymous = Boolean(user?.isAnonymous);
  if (loading) return null;
  if ((profile?.role === "student" || isAnonymous) && isSpaceOnlyStudent(profile, { isAnonymous, isFeideLinked: user?.providerData.some(provider=>provider.providerId==="oidc.feide") })) {
    return <StudentSelfStudyPrompt isAnonymous={isAnonymous} nextHref={`/${locale}/tools/assessments`} />;
  }
  return <AssessmentOverview locale={locale} />;
}
