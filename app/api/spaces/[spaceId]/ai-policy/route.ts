import "server-only";

import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { getSpaceAccess } from "@/lib/security/spaceAccess.server";
import { isSpaceAiDisabled } from "@/lib/security/schoolAiPolicy.server";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(req: Request, context: { params: Promise<{ spaceId: string }> }) {
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ ok: false, error: "Unauthorized" }, 401);
    const spaceId = (await context.params).spaceId?.trim();
    if (!spaceId || spaceId.includes("/")) return json({ ok: false, error: "Invalid space" }, 400);
    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token, true);
    if (!decoded.uid) return json({ ok: false, error: "Unauthorized" }, 401);
    const access = await getSpaceAccess(db, spaceId, decoded.uid);
    if (!access.canRead) return json({ ok: false, error: "Forbidden" }, 403);
    const space = access.space as Record<string, unknown>;
    const [lessonFeedbackDisabled, writingDisabled] = await Promise.all([
      isSpaceAiDisabled(db, space, "lessonFeedback"),
      isSpaceAiDisabled(db, space, "writing"),
    ]);
    return json({ ok: true, lessonFeedbackDisabled, writingDisabled });
  } catch (error) {
    return json({ ok: false, error: "Could not load space AI policy" }, accountErrorStatus(error) ?? 500);
  }
}
