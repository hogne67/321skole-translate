"use client";

import { useLocale } from "next-intl";
import { Suspense } from "react";
import ListeningTestTool from "@/components/assessments/ListeningTestTool";
import StudentSelfStudyPrompt from "@/components/StudentSelfStudyPrompt";
import { useUserProfile } from "@/lib/useUserProfile";
import { isSpaceOnlyStudent } from "@/lib/studentAccessMode";

export default function ListeningTestsPage(){
  const locale=useLocale();
  const {user,profile,loading}=useUserProfile();
  const isAnonymous=Boolean(user?.isAnonymous);
  if(loading)return null;
  if((profile?.role==="student"||isAnonymous)&&isSpaceOnlyStudent(profile,{isAnonymous,isFeideLinked:user?.providerData.some(provider=>provider.providerId==="oidc.feide")}))return <StudentSelfStudyPrompt isAnonymous={isAnonymous} nextHref={`/${locale}/tools/listening-tests`}/>;
  return <Suspense fallback={null}><ListeningTestTool locale={locale}/></Suspense>;
}
