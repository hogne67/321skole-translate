import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import "server-only";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isActiveSchoolAdminMember } from "@/lib/schools";
import { getSchoolMember } from "@/lib/schools/server";

export const runtime = "nodejs";
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

// Administrative totals only. No room IDs, titles, codes, owners, rosters or deep links.
export async function GET(req: Request, context: { params: Promise<{ schoolId?: string }> }) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ ok: false, error: "Unauthorized" }, 401);
  const schoolId = (await context.params).schoolId?.trim();
  if (!schoolId || schoolId.includes("/")) return json({ ok: false, error: "Invalid schoolId" }, 400);
  if (new URL(req.url).search) return json({ ok: false, error: "Filters are not available" }, 400);
  try {
    const { auth, db } = getAdmin();
    let uid: string;
    try { uid = (await auth.verifyIdToken(token, true)).uid; }
    catch (accountError) { return json({ ok: false, error: "Unauthorized" }, (accountErrorStatus(accountError) ?? 401)); }
    if (!isActiveSchoolAdminMember(await getSchoolMember(schoolId, uid))) return json({ ok: false, error: "Forbidden" }, 403);
    const count = await db.collection("spaces").where("schoolId", "==", schoolId).count().get();
    return json({ ok: true, schoolId, totalSpaceCount: count.data().count });
  } catch { return json({ ok: false, error: "School overview unavailable" }, 503); }
}
