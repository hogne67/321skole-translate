import "server-only";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { changeSpaceDeletion, getSpaceDeletionStatus, SpaceDeletionError } from "@/lib/spaceDeletion.server";

export const runtime = "nodejs";
type Context = { params: Promise<{ spaceId: string }> };

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function handle(req: Request, context: Context) {
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "unauthorized" }, 401);
    const { spaceId } = await context.params;
    if (!spaceId || spaceId.includes("/") || spaceId.length > 150) return json({ error: "invalidRequest" }, 400);
    const { auth, db } = getAdmin();
    const { uid } = await auth.verifyIdToken(token, true);
    if (req.method === "GET") return json(await getSpaceDeletionStatus(db, spaceId, uid));
    const body = await req.json().catch(() => null);
    if (body?.action !== "delete" && body?.action !== "restore") return json({ error: "invalidRequest" }, 400);
    await changeSpaceDeletion(db, spaceId, uid, body.action);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof SpaceDeletionError) return json({ error: error.code }, error.status);
    return json({ error: "failed" }, accountErrorStatus(error) ?? 503);
  }
}

export const GET = handle;
export const POST = handle;
