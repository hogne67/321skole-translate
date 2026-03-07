import type { AdminLevel, UserProfile } from "@/lib/userProfile";

type AdminProfileLike =
  | Pick<UserProfile, "role" | "adminLevel" | "disabled">
  | null
  | undefined;

export function isAdmin(profile: AdminProfileLike): boolean {
  return profile?.role === "admin" && profile?.disabled !== true;
}

export function isModerator(profile: AdminProfileLike): boolean {
  return isAdmin(profile) && profile?.adminLevel === "moderator";
}

export function isAdminLevel(profile: AdminProfileLike): boolean {
  return isAdmin(profile) && profile?.adminLevel === "admin";
}

export function isSuperAdmin(profile: AdminProfileLike): boolean {
  return isAdmin(profile) && profile?.adminLevel === "superadmin";
}

export function hasAnyAdminLevel(profile: AdminProfileLike): boolean {
  return isModerator(profile) || isAdminLevel(profile) || isSuperAdmin(profile);
}

export function canReadStats(profile: AdminProfileLike): boolean {
  return hasAnyAdminLevel(profile);
}

export function canModerate(profile: AdminProfileLike): boolean {
  return hasAnyAdminLevel(profile);
}

export function canReadUsers(profile: AdminProfileLike): boolean {
  return isAdminLevel(profile) || isSuperAdmin(profile);
}

export function canWriteUsers(profile: AdminProfileLike): boolean {
  return isSuperAdmin(profile);
}

export function canReadTrash(profile: AdminProfileLike): boolean {
  return isAdminLevel(profile) || isSuperAdmin(profile);
}

export function canRestoreTrash(profile: AdminProfileLike): boolean {
  return isAdminLevel(profile) || isSuperAdmin(profile);
}

export function canPermanentDelete(profile: AdminProfileLike): boolean {
  return isSuperAdmin(profile);
}

export function adminLabel(level?: AdminLevel): string {
  if (level === "superadmin") return "Superadmin";
  if (level === "admin") return "Admin";
  if (level === "moderator") return "Moderator";
  return "Admin";
}