"use client";
import { useLocale } from "next-intl";
import { Suspense } from "react";
import GrammarTestTool from "@/components/assessments/GrammarTestTool";
import StudentSelfStudyPrompt from "@/components/StudentSelfStudyPrompt";
import { useUserProfile } from "@/lib/useUserProfile";
import { isSpaceOnlyStudent } from "@/lib/studentAccessMode";
export default function GrammarTestsPage(){
  const locale=useLocale(),{user,profile,loading}=useUserProfile(),isAnonymous=Boolean(user?.isAnonymous);
  if(loading)return null;
  if((profile?.role==="student"||isAnonymous)&&isSpaceOnlyStudent(profile,{isAnonymous,isFeideLinked:user?.providerData.some(provider=>provider.providerId==="oidc.feide")}))return <StudentSelfStudyPrompt isAnonymous={isAnonymous} nextHref={`/${locale}/tools/grammar-tests`}/>;
  return <Suspense fallback={null}><GrammarTestTool locale={locale}/></Suspense>;
}
