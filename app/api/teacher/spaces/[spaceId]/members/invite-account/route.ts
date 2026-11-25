import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { runCapacityTransaction } from "@/lib/server/runCapacityTransaction";
import { invitationEmail, manageSchoolRoomInvitation, SchoolRoomInvitationError } from "@/lib/server/schoolRoomAccountInvitations";
import { documentId } from "@/lib/server/schoolSpacePupilCode";

type Context = { params: Promise<{ spaceId: string }> };
type Action = "list" | "create" | "withdraw";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function handle(req: Request, { params }: Context, action: Action) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "unauthorized" }, 401);
  const { spaceId } = await params;
  if (!spaceId || documentId(spaceId) !== spaceId) return json({ error: "room_unavailable" }, 404);
  try {
    const { auth, db } = getAdmin();
    const actor = await auth.verifyIdToken(token, true);
    if (actor.firebase?.sign_in_provider === "anonymous") return json({ error: "forbidden" }, 403);
    const body = action === "list" ? null : await req.json().catch(() => null);
    const email = invitationEmail(body?.email);
    const id = typeof body?.invitationId === "string" ? body.invitationId : "";
    const sourceMemberId = documentId(body?.sourceMemberId);
    if (action === "create" && !email) return json({ error: "invalid_email" }, 400);
    if (action === "create" && body?.sourceMemberId !== undefined
      && (!sourceMemberId || sourceMemberId !== body.sourceMemberId)) {
      return json({ error: "account_transfer_unavailable" }, 400);
    }
    if (action === "withdraw" && !/^[a-f0-9]{64}$/.test(id)) return json({ error: "invalid_invitation" }, 400);
    const change = action === "create" ? { type: "create" as const, email, ...(sourceMemberId ? { sourceMemberId } : {}) }
      : action === "withdraw" ? { type: "withdraw" as const, id } : { type: "list" as const };
    return json(await runCapacityTransaction(db, tx => manageSchoolRoomInvitation({ db, tx, spaceId, actor }, change)));
  } catch (error) {
    if (error instanceof SchoolRoomInvitationError) return json({ error: error.message }, error.status);
    const status = accountErrorStatus(error);
    return json({ error: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "invitation_failed" }, status ?? 500);
  }
}

export const GET = (req: Request, context: Context) => handle(req, context, "list");
export const POST = (req: Request, context: Context) => handle(req, context, "create");
export const DELETE = (req: Request, context: Context) => handle(req, context, "withdraw");
