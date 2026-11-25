export const pupilAccountProviders = ["email", "feide", "google"] as const;
export type PupilAccountProvider = typeof pupilAccountProviders[number];

export function parsePupilAccountProviders(value: unknown): PupilAccountProvider[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > pupilAccountProviders.length) return null;
  const selected = pupilAccountProviders.filter(provider => value.includes(provider));
  return selected.length === value.length ? selected : null;
}

export function schoolPupilProviderAllowed(schoolData: Record<string, unknown> | undefined, signInProvider: unknown): boolean {
  if (schoolData?.pupilAccountProviders === undefined) return true;
  const selected = parsePupilAccountProviders(schoolData.pupilAccountProviders);
  if (!selected) return false;
  if (signInProvider === "password") return selected.includes("email");
  if (signInProvider === "oidc.feide") return selected.includes("feide");
  if (signInProvider === "google.com") return selected.includes("google");
  return false;
}
