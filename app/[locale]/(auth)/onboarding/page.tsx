// app/[locale]/(auth)/onboarding/page.tsx
import OnboardingClient from "./OnboardingClient";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OnboardingPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const nextUrl = typeof sp.next === "string" ? sp.next : undefined;
  return <OnboardingClient nextUrl={nextUrl} />;
}