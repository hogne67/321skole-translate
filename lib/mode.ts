// lib/mode.ts

export type AppMode = "student" | "teacher" | "creator" | "admin" | "parent";

// ✅ POLICY FLAGS (gjør det umulig å “gjeninnføre” i det skjulte)
const ENABLE_CREATOR_MODE = true;
const TEACHER_GETS_CREATOR_MODE = true;

type ProfileLike = {
  role?: "student" | "teacher" | "admin" | "parent" | "creator" | string;
  roles?: {
    student?: boolean;
    teacher?: boolean;
    parent?: boolean;
    creator?: boolean;
    admin?: boolean;
  };
  creatorStatus?: "none" | "pending" | "approved" | "rejected";
  teacherStatus?: "none" | "pending" | "approved" | "rejected"; // ignored for access
};

function hasRole(p: ProfileLike | null | undefined, role: string): boolean {
  if (!p) return false;
  const r = String(p.role ?? "").toLowerCase();
  if (r === role) return true;
  return Boolean((p.roles as Record<string, unknown> | undefined)?.[role] === true);
}

function isTeacher(p: ProfileLike | null | undefined) {
  return hasRole(p, "teacher");
}
function isAdmin(p: ProfileLike | null | undefined) {
  return hasRole(p, "admin");
}
function isParent(p: ProfileLike | null | undefined) {
  return hasRole(p, "parent");
}
function isCreator(p: ProfileLike | null | undefined) {
  if (!ENABLE_CREATOR_MODE) return false;
  if (hasRole(p, "creator")) return true;

  // Valgfritt: hvis dere vil kreve creatorStatus=approved:
  // return Boolean(p?.roles?.creator && p.creatorStatus === "approved");

  return false;
}

export function defaultModeForProfile(p: ProfileLike | null | undefined): AppMode {
  if (isAdmin(p)) return "admin";
  if (isTeacher(p)) return "teacher";
  if (isParent(p)) return "parent";
  if (isCreator(p)) return "creator";
  return "student";
}

export function allowedModesForProfile(p: ProfileLike | null | undefined): AppMode[] {
  const modes: AppMode[] = ["student"];

  if (isParent(p)) modes.push("parent");
  if (isTeacher(p)) modes.push("teacher");
  if (isAdmin(p)) modes.push("admin");

  if (ENABLE_CREATOR_MODE) {
    if (isCreator(p)) modes.push("creator");
    if (TEACHER_GETS_CREATOR_MODE && isTeacher(p) && !modes.includes("creator")) {
      modes.push("creator");
    }
  }

  return modes;
}