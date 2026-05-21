import { countActiveTeachers } from "@/lib/schools/server/countActiveTeachers";
import { getSchool } from "@/lib/schools/server/getSchool";

export type CanActivateTeacherResult = {
  ok: boolean;
  reason?:
    | "school_not_found"
    | "school_not_active"
    | "invalid_seat_limit"
    | "seat_limit_reached";
  activeTeacherCount?: number;
  teacherSeatLimit?: number;
};

export async function canActivateTeacher(
  schoolId: string
): Promise<CanActivateTeacherResult> {
  const school = await getSchool(schoolId);

  if (!school) {
    return { ok: false, reason: "school_not_found" };
  }

  const { teacherSeatLimit } = school;

  if (school.status !== "active") {
    return {
      ok: false,
      reason: "school_not_active",
      teacherSeatLimit,
    };
  }

  if (!Number.isFinite(teacherSeatLimit) || teacherSeatLimit <= 0) {
    return {
      ok: false,
      reason: "invalid_seat_limit",
      teacherSeatLimit,
    };
  }

  const activeTeacherCount = await countActiveTeachers(schoolId);

  if (activeTeacherCount >= teacherSeatLimit) {
    return {
      ok: false,
      reason: "seat_limit_reached",
      activeTeacherCount,
      teacherSeatLimit,
    };
  }

  return {
    ok: true,
    activeTeacherCount,
    teacherSeatLimit,
  };
}
