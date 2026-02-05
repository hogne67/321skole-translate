import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function OnboardingPage({ searchParams }: PageProps) {
  const nextUrl = typeof searchParams?.next === "string" ? searchParams.next : undefined;

  return <OnboardingClient nextUrl={nextUrl} />;
}
