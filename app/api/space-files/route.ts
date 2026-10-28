import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { beginSpaceFileUpload, SpaceFileError } from "@/lib/spaceFiles.server";
import type { SpaceFileScope } from "@/lib/spaceFiles";

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let uid: string;
  try { uid = (await getAdmin().auth.verifyIdToken(token, true)).uid; }
  catch (accountError) { return Response.json({ error: "Unauthorized" }, { status: (accountErrorStatus(accountError) ?? 401) }); }
  try {
    const body = await req.json();
    const scope: SpaceFileScope = { spaceId: body.spaceId, activityId: body.activityId, purpose: body.purpose,
      ...(body.submissionId ? { submissionId: body.submissionId } : {}), ...(body.segmentId ? { segmentId: body.segmentId } : {}) };
    return Response.json(await beginSpaceFileUpload(uid, scope, body.contentType, body.size, req.headers.get("origin") || undefined), { headers: { "Cache-Control": "private,no-store" } });
  } catch (error) {
    console.error("space_file_upload_failed", { code: error instanceof SpaceFileError ? error.status : (accountErrorStatus(error) ?? 500) });
    return Response.json({ error: error instanceof SpaceFileError ? error.message : "File upload unavailable" }, { status: error instanceof SpaceFileError ? error.status : 503 });
  }
}
