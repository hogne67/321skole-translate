import { TrustNavigation } from "@/components/trust/TrustNavigation";

import { getLocale } from "next-intl/server";
import { FeideDocumentationClient } from "./FeideDocumentationClient";

export default async function SchoolFeideDocumentationPage() {
  const locale = (await getLocale()) as string;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <TrustNavigation locale={locale} currentPath="/school/feide" />

      <FeideDocumentationClient locale={locale} />
    </main>
  );
}
