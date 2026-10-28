import "server-only";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { manageAccountAccess, AccountManagementError, type AccountAction } from "@/lib/security/manageAccountAccess.server";

export const runtime = "nodejs";
export async function POST(req: Request, ctx: { params: Promise<{ uid: string }> }) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { auth, db } = getAdmin();
    const actor = await auth.verifyIdToken(token, true);
    const { uid } = await ctx.params;
    const body = await req.json();
    if (!uid || uid.includes("/") || !body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some(key => key !== "action") || !["disable", "reactivate", "revoke", "synchronize"].includes(body.action)) {
      return NextResponse.json({ error: "Invalid account action" }, { status: 400 });
    }
    return NextResponse.json(await manageAccountAccess(auth, db, actor.uid, uid, body.action as AccountAction));
  } catch (error) {
    const status = accountErrorStatus(error) ?? (error instanceof AccountManagementError ? error.status : (accountErrorStatus(error) ?? 500));
    return NextResponse.json({ error: error instanceof Error ? error.message : "Account operation failed" }, { status });
  }
}
