import type { SchoolMemberDoc, SchoolMemberRole } from "@/lib/schools/types";

export type SchoolProfileLike = {
  schoolId?: string | null;
  schoolRole?: SchoolMemberRole | null;
};

export function hasSchoolMembership(
  profile: SchoolProfileLike | null | undefined
): profile is SchoolProfileLike & { schoolId: string; schoolRole: SchoolMemberRole } {
  return Boolean(profile?.schoolId && profile.schoolRole);
}

export function isSchoolAdminProfile(
  profile: SchoolProfileLike | null | undefined
): boolean {
  return hasSchoolMembership(profile) && profile.schoolRole === "school_admin";
}

export function isSchoolTeacherProfile(
  profile: SchoolProfileLike | null | undefined
): boolean {
  return hasSchoolMembership(profile) && profile.schoolRole === "school_teacher";
}

export function canAccessSchoolAdmin(
  profile: SchoolProfileLike | null | undefined
): boolean {
  return isSchoolAdminProfile(profile);
}

export function isActiveSchoolTeacherMember(
  member: SchoolMemberDoc | null | undefined
): boolean {
  return member?.status === "active" && member.role === "school_teacher";
}

export function isActiveSchoolAdminMember(
  member: SchoolMemberDoc | null | undefined
): boolean {
  return member?.status === "active" && member.role === "school_admin";
}
