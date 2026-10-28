import "server-only";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { listOwnedSpaces } from "@/lib/security/ownedSpaces.server";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private,no-store" } });
export async function GET(req: Request) {
  if (new URL(req.url).search) return json({ error: "Unexpected parameters" }, 400);
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Unauthorized" }, 401);
  try {
    const { auth, db } = getAdmin();
    const { uid } = await auth.verifyIdToken(token, true);
    return json({ spaces: await listOwnedSpaces(db, uid) });
  } catch (error) { return json({ error: "Could not list owned Spaces" }, accountErrorStatus(error) ?? 503); }
}
