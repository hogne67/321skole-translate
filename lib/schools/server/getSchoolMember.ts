import type { SchoolMemberDoc } from "@/lib/schools/types";
import { schoolMemberDocRef } from "@/lib/schools/server/refs";
import { getAdmin } from "@/lib/firebaseAdmin";

export async function getSchoolMember(
  schoolId: string,
  uid: string
): Promise<SchoolMemberDoc | null> {
  const snapshot = await schoolMemberDocRef(schoolId, uid).get();

  if (!snapshot.exists) return null;
  if (snapshot.get("role") === "school_admin") {
    const profile = (await getAdmin().db.collection("users").doc(uid).get()).data();
    if (profile?.disabled === true || profile?.schoolId !== schoolId || profile?.schoolRole !== "school_admin" || profile?.schoolStatus !== "active") return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as SchoolMemberDoc),
  };
}
