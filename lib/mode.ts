// lib/mode.ts
export type AppMode = "student" | "teacher" | "creator" | "admin" | "parent";

export function defaultModeForProfile(p: any): AppMode {
  if (p?.roles?.admin) return "admin";
  if (p?.roles?.teacher && p?.teacherStatus === "approved") return "teacher";
  if (p?.roles?.parent) return "parent";
  return "student";
}

export function allowedModesForProfile(p: any): AppMode[] {
  const modes: AppMode[] = ["student"];

  if (p?.roles?.parent) modes.push("parent");
  if (p?.roles?.teacher && p?.teacherStatus === "approved") modes.push("teacher");
  if (p?.roles?.creator && p?.creatorStatus === "approved") modes.push("creator");
  if (p?.roles?.admin) modes.push("admin");

  // Teacher har creator “automatisk” hos deg: her er det UI-messig lov å vise creator
  // selv om du ikke har creatorStatus på plass enda.
  if (p?.roles?.teacher && p?.teacherStatus === "approved" && !modes.includes("creator")) {
    modes.push("creator");
  }

  return modes;
}
