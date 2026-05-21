import "server-only";

import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";
import { isActiveSchoolAdminMember } from "@/lib/schools";
import {
  getSchoolMember,
  schoolMembersCollectionRef,
} from "@/lib/schools/server";
import type { SchoolMemberDoc } from "@/lib/schools/types";

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

function sortTeachers(a: SchoolMemberDoc, b: SchoolMemberDoc): number {
  const aEmail = a.email ?? "";
  const bEmail = b.email ?? "";
  const byEmail = aEmail.localeCompare(bEmail);

  if (byEmail !== 0) return byEmail;

  return (a.id ?? "").localeCompare(b.id ?? "");
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

    const snapshot = await schoolMembersCollectionRef(schoolId)
      .where("role", "==", "school_teacher")
      .get();
    const teachers = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...(doc.data() as SchoolMemberDoc),
      }))
      .sort(sortTeachers);

    return json({
      ok: true,
      schoolId,
      teachers,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return json({ ok: false, error: message || "Failed to load school teachers" }, 500);
  }
}
