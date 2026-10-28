import { NextResponse } from "next/server";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { authorizeLegacyFile, legacyFileBucket, LegacyFileError, parseLegacyAudioPath, readLegacyFile } from "@/lib/security/legacySpaceFile.server";

export const runtime = "nodejs";
const json = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "private,no-store" } });
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json("Unauthorized", 401);
    const body = await req.json().catch(() => ({}));
    const parsed = parseLegacyAudioPath(body?.storagePath);
    if (!parsed) return json("Invalid audio path", 400);
    const { auth } = getAdmin(), { uid } = await auth.verifyIdToken(token, true);
    if (body.mode === "delete") {
      await authorizeLegacyFile(uid, parsed.path, "audio");
      // Existing user-triggered deletion only; no batch cleanup or data migration.
      await legacyFileBucket().file(parsed.path).delete();
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private,no-store" } });
    }
    const result = await readLegacyFile(uid, parsed.path, "audio", req.headers.get("range"), req.headers.get("if-match"));
    await auth.verifyIdToken(token, true);
    const filename = parsed.path.split("/").at(-1)!.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0,180);
    return new NextResponse(new Uint8Array(result.bytes), { status: result.partial ? 206 : 200, headers: {
      "Content-Type": result.contentType, "Content-Length": String(result.bytes.length), "Cache-Control": "private,no-store",
      "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes", ETag: result.version,
      "Content-Disposition": `${body.mode === "download" ? "attachment" : "inline"}; filename="${filename}"`,
      ...(result.partial ? { "Content-Range": `bytes ${result.start}-${result.end}/${result.size}` } : {}),
    } });
  } catch (error) {
    return json("Audio unavailable", error instanceof LegacyFileError ? error.status : accountErrorStatus(error) ?? (Number((error as { code?: unknown }).code) === 404 ? 404 : 503));
  }
}
