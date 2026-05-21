import type { SchoolMemberDoc } from "@/lib/schools/types";
import { schoolMemberDocRef } from "@/lib/schools/server/refs";

export async function getSchoolMember(
  schoolId: string,
  uid: string
): Promise<SchoolMemberDoc | null> {
  const snapshot = await schoolMemberDocRef(schoolId, uid).get();

  if (!snapshot.exists) return null;

  return {
    id: snapshot.id,
    ...(snapshot.data() as SchoolMemberDoc),
  };
}
