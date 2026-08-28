import { redirect } from "next/navigation";

export default async function SchoolInvitesRedirectPage({
  params,
}: {
  params: Promise<{ locale?: string }>;
}) {
  const { locale } = await params;

  redirect(`/${locale || "nb"}/school/teachers`);
}
