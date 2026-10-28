import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { deleteSpaceFile, finishSpaceFileUpload, readSpaceFile, SpaceFileError } from "@/lib/spaceFiles.server";
type Context = { params: Promise<{ id: string }> };
async function handle(req: Request, ctx: Context, action: "read" | "finish" | "delete") {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let uid: string;
  try { uid = (await getAdmin().auth.verifyIdToken(token, true)).uid; }
  catch (accountError) { return Response.json({ error: "Unauthorized" }, { status: (accountErrorStatus(accountError) ?? 401) }); }
  try {
    const { id } = await ctx.params;
    if (action === "read") return await readSpaceFile(uid, id, req.headers.get("range"));
    if (action === "delete") await deleteSpaceFile(uid, id);
    const body = action === "finish" ? await finishSpaceFileUpload(uid, id, () => getAdmin().auth.verifyIdToken(token, true)) : { ok: true };
    return Response.json(body, { headers: { "Cache-Control": "private,no-store" } });
  } catch (error) {
    console.error("space_file_access_failed", { action, code: error instanceof SpaceFileError ? error.status : (accountErrorStatus(error) ?? 500) });
    return Response.json({ error: error instanceof SpaceFileError ? error.message : "File unavailable" }, { status: error instanceof SpaceFileError ? error.status : (accountErrorStatus(error) ?? 503) });
  }
}
export const GET = (req: Request, ctx: Context) => handle(req, ctx, "read");
export const POST = (req: Request, ctx: Context) => handle(req, ctx, "finish");
export const DELETE = (req: Request, ctx: Context) => handle(req, ctx, "delete");
