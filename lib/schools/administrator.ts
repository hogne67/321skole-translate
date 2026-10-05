export class SchoolAdministratorError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

type AdministratorAccount = { uid: string; email?: string; displayName?: string; disabled: boolean };
type AccountLookup = {
  getUser(uid: string): Promise<AdministratorAccount>;
  getUserByEmail(email: string): Promise<AdministratorAccount>;
};

export function normalizeAdministratorUid(value: string): string {
  return value.trim().replace(/^uid\s*:\s*/i, "").trim();
}

export function assertSchoolAssignmentAvailable(
  profile: { schoolId?: unknown; schoolStatus?: unknown; disabled?: unknown } | undefined,
  schoolId: string
) {
  if (profile?.disabled === true) throw new SchoolAdministratorError("This user profile is disabled.");
  if (profile?.schoolId && profile.schoolId !== schoolId && profile.schoolStatus === "active") {
    throw new SchoolAdministratorError("This user already has active access to another school.", 409);
  }
}

export async function resolveSchoolAdministrator(
  lookup: AccountLookup,
  input: { adminUid?: string; adminEmail?: string | null }
) {
  const uid = normalizeAdministratorUid(input.adminUid ?? "");
  const email = (input.adminEmail ?? "").trim().toLowerCase();
  if (!uid && !email) throw new SchoolAdministratorError("Enter the school administrator's email or UID.");

  let account: AdministratorAccount;
  try {
    account = uid ? await lookup.getUser(uid) : await lookup.getUserByEmail(email);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "auth/user-not-found" || code === "auth/invalid-uid" || code === "auth/invalid-email") {
      throw new SchoolAdministratorError("School administrator not found. Use an existing user's email or UID.");
    }
    throw error;
  }
  if (account.disabled) throw new SchoolAdministratorError("This user account is disabled.");
  if (email && account.email?.toLowerCase() !== email) {
    throw new SchoolAdministratorError("The administrator UID and email belong to different users.");
  }
  return account;
}
