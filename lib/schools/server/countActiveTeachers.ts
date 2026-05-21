import { schoolMembersCollectionRef } from "@/lib/schools/server/refs";

export async function countActiveTeachers(schoolId: string): Promise<number> {
  const snapshot = await schoolMembersCollectionRef(schoolId)
    .where("role", "==", "school_teacher")
    .where("status", "==", "active")
    .get();

  return snapshot.size;
}
