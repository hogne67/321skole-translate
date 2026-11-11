import "server-only";

import { getAdmin } from "@/lib/firebaseAdmin";
import { getEffectiveStudentModeForToken } from "@/lib/studentAccessMode";

type StudentModeInput = {
  role?: unknown;
  studentAccessMode?: unknown;
  schoolId?: unknown;
  schoolStatus?: unknown;
};

type AuthToken = Parameters<typeof getEffectiveStudentModeForToken>[1] & { uid?: unknown };
export type ProviderLookup = (uid: string) => Promise<readonly string[]>;

/** Check live Auth providers when an older token predates Feide account linking. */
export async function getEffectiveStudentModeForAccount(
  input: StudentModeInput,
  token: AuthToken,
  lookupProviders: ProviderLookup = async (uid) =>
    (await getAdmin().auth.getUser(uid)).providerData.map((provider) => provider.providerId),
): Promise<string | null> {
  const mode = getEffectiveStudentModeForToken(input, token);
  if (input.role !== "student" || mode === "space_only") return mode;

  const uid = token?.uid;
  if (typeof uid !== "string" || !uid) return "space_only";
  return (await lookupProviders(uid)).includes("oidc.feide")
    ? "space_only"
    : mode;
}
