// lib/mode.ts

export type AppMode = "student" | "teacher" | "creator" | "admin" | "parent";

/**
 * Minimal profil-type for mode-logikk.
 * Vi modellerer kun det vi faktisk bruker her.
 */
type ProfileLike = {
  roles?: {
    student?: boolean;
    teacher?: boolean;
    parent?: boolean;
    creator?: boolean;
    admin?: boolean;
  };
  teacherStatus?: "none" | "pending" | "approved" | "rejected";
  creatorStatus?: "none" | "pending" | "approved" | "rejected";
};

export function defaultModeForProfile(p: ProfileLike | null | undefined): AppMode {
  if (p?.roles?.admin) return "admin";
  if (p?.roles?.teacher && p?.teacherStatus === "approved") return "teacher";
  if (p?.roles?.parent) return "parent";
  return "student";
}

export function allowedModesForProfile(p: ProfileLike | null | undefined): AppMode[] {
  const modes: AppMode[] = ["student"];

  if (p?.roles?.parent) modes.push("parent");
  if (p?.roles?.teacher && p?.teacherStatus === "approved") modes.push("teacher");
  if (p?.roles?.creator && p?.creatorStatus === "approved") modes.push("creator");
  if (p?.roles?.admin) modes.push("admin");

  // Teacher har creator “automatisk” (UI-logikk)
  if (
    p?.roles?.teacher &&
    p?.teacherStatus === "approved" &&
    !modes.includes("creator")
  ) {
    modes.push("creator");
  }

  return modes;
}