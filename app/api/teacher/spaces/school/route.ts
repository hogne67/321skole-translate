import "server-only";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { canCreateSchoolSpace } from "@/lib/schools/teacherSpaceAccess";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { activeTeacherSchoolId } from "@/lib/teacherSpaceArea";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Unauthorized" }, 401);
  try {
    const { auth, db } = getAdmin();
    const { uid, firebase } = await auth.verifyIdToken(token, true);
    if (firebase?.sign_in_provider === "anonymous") return json({ error: "Forbidden" }, 403);
    const profile = (await db.doc(`users/${uid}`).get()).data();
    const schoolId = activeTeacherSchoolId(profile);
    if (!schoolId || !(profile?.role === "teacher" || profile?.role === "admin" || profile?.roles?.admin === true)) {
      return json({ school: null });
    }
    const [school, member] = await db.getAll(db.doc(`schools/${schoolId}`), db.doc(`schools/${schoolId}/members/${uid}`));
    if (!canCreateSchoolSpace(schoolId, uid, profile?.schoolRole, school.data(), member.data())) return json({ school: null });
    const name = school.get("name");
    return json({ school: {
      id: schoolId, name: typeof name === "string" ? name.trim() : "",
      allowPupilCodeAccess: school.get("allowPupilCodeAccess") !== false,
    } });
  } catch (error) {
    return json({ error: "Could not load school" }, accountErrorStatus(error) ?? 503);
  }
}
