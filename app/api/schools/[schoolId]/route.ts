import "server-only";

import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";
import { isActiveSchoolAdminMember } from "@/lib/schools";
import { countActiveTeachers, getSchool, getSchoolMember } from "@/lib/schools/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    schoolId?: string;
  }>;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);

  return match ? match[1] : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const authToken = getBearerToken(req);
    if (!authToken) {
      return json({ ok: false, error: "Missing Authorization Bearer token" }, 401);
    }

    const { schoolId: rawSchoolId } = await context.params;
    const schoolId = readString(rawSchoolId);

    if (!schoolId) {
      return json({ ok: false, error: "Missing schoolId" }, 400);
    }

    const { auth } = getAdmin();
    const decoded = await auth.verifyIdToken(authToken);
    const uid = decoded.uid;

    if (!uid) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const adminMember = await getSchoolMember(schoolId, uid);

    if (!isActiveSchoolAdminMember(adminMember)) {
      return json({ ok: false, error: "Forbidden" }, 403);
    }

    const school = await getSchool(schoolId);

    if (!school) {
      return json({ ok: false, error: "School not found" }, 404);
    }

    const activeTeacherCount = await countActiveTeachers(schoolId);

    return json({
      ok: true,
      schoolId,
      school,
      activeTeacherCount,
      teacherSeatLimit: school.teacherSeatLimit,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return json({ ok: false, error: message || "Failed to load school" }, 500);
  }
}
