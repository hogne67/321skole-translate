import type { SchoolDoc } from "@/lib/schools/types";
import { schoolDocRef } from "@/lib/schools/server/refs";

export async function getSchool(schoolId: string): Promise<SchoolDoc | null> {
  const snapshot = await schoolDocRef(schoolId).get();

  if (!snapshot.exists) return null;

  return {
    id: snapshot.id,
    ...(snapshot.data() as SchoolDoc),
  };
}
