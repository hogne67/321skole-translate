import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default function OnboardingPage(props: any) {
  const sp = props?.searchParams;
  const nextUrl = typeof sp?.next === "string" ? sp.next : undefined;

  return <OnboardingClient nextUrl={nextUrl} />;
}
