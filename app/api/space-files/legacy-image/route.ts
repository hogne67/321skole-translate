import "server-only";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { parseLegacySpaceImagePath } from "@/lib/security/legacySpaceImage";
import { LegacyFileError, readLegacyFile } from "@/lib/security/legacySpaceFile.server";

export const runtime = "nodejs";
const json = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "private,no-store" } });
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json("Unauthorized", 401);
  const url = new URL(req.url), parsed = parseLegacySpaceImagePath(url.searchParams.get("path"));
  if (!parsed || url.searchParams.getAll("path").length !== 1 || [...url.searchParams.keys()].some(key => key !== "path")) return json("Invalid image path", 400);
  try {
    const { auth } = getAdmin(), { uid } = await auth.verifyIdToken(token, true);
    const result = await readLegacyFile(uid, parsed.path, "image", req.headers.get("range"), req.headers.get("if-match"));
    await auth.verifyIdToken(token, true);
    return new NextResponse(new Uint8Array(result.bytes), { status: result.partial ? 206 : 200, headers: {
      "Content-Type": result.contentType, "Content-Length": String(result.bytes.length), "Cache-Control": "private,no-store",
      "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes", ETag: result.version,
      ...(result.partial ? { "Content-Range": `bytes ${result.start}-${result.end}/${result.size}` } : {}),
    } });
  } catch (error) { return json("Image unavailable", error instanceof LegacyFileError ? error.status : accountErrorStatus(error) ?? (Number((error as { code?: unknown }).code) === 404 ? 404 : 503)); }
}
