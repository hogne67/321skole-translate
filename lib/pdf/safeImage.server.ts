import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";
import { getAdmin } from "@/lib/firebaseAdmin";
import { parseLegacySpaceImagePath } from "@/lib/security/legacySpaceImage";
import { privateSpaceFileUrlId } from "@/lib/spaceFiles";
import { readSpaceFile, SpaceFileError } from "@/lib/spaceFiles.server";
import { LegacyFileError, readLegacyFile } from "@/lib/security/legacySpaceFile.server";

export const PDF_IMAGE_BYTES = 8 * 1024 * 1024;
export const PDF_IMAGE_TIMEOUT_MS = 10_000;
const fail = (status: number, message: string): never => { throw new SpaceFileError(status, message); };
function pdfBucket() {
  const name = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!name || !/^[a-z0-9][a-z0-9._-]+[a-z0-9]$/.test(name)) return fail(503, "Image bucket unavailable");
  return getAdmin().storage.bucket(name);
}

export async function pdfAccount(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return fail(401, "Unauthorized");
  const decoded = await getAdmin().auth.verifyIdToken(token, true);
  return { uid: decoded.uid, recheck: () => getAdmin().auth.verifyIdToken(token, true) };
}

// Abort the consumer on byte/time limits; never accumulate an unbounded image/body.
export async function boundedPdfBytes(stream: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal): Promise<Buffer> {
  if (!stream) return fail(400, "Missing image/body");
  const reader = stream.getReader();
  const parts: Buffer[] = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const item = await reader.read();
      signal.throwIfAborted();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > limit) return fail(413, "Image/body too large");
      parts.push(Buffer.from(item.value));
    }
    return Buffer.concat(parts);
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

async function timed<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new SpaceFileError(504, "Image read timed out"));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function pdfJson(request: Request): Promise<unknown> {
  try { return JSON.parse((await boundedPdfBytes(request.body, 12 * 1024 * 1024, AbortSignal.timeout(PDF_IMAGE_TIMEOUT_MS))).toString("utf8")); }
  catch (error) { if (error instanceof SpaceFileError) throw error; return fail(400, "Invalid or timed out PDF payload"); }
}

export function pdfStoragePath(source: string, bucket: string): string | null {
  try {
    const url = new URL(source);
    // This URL is NEVER fetched. No DNS lookup, redirect or client-selected endpoint.
    if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com" || url.username || url.password || url.port || url.hash) return null;
    const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(url.pathname);
    if (!match || decodeURIComponent(match[1]) !== bucket) return null;
    const object = decodeURIComponent(match[2]);
    return validObjectPath(object) ? object : null;
  } catch { return null; }
}
function validObjectPath(object: string) {
  return object.length <= 1024 && object.split("/").every(part => !!part && part !== "." && part !== ".." && !/[\\%]/.test(part) && ![...part].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127));
}

async function posterCoverAccess(uid: string, object: string, source: string, signal: AbortSignal) {
  const match = /^learning-posters\/([^/]+)\/([^/]+)\/covers\/[^/]+$/.exec(object);
  if (!match) return false;
  const { db } = getAdmin();
  const poster = (await timed(db.doc(`learningPosters/${match[2]}`).get(), signal)).data();
  if (!poster || poster.ownerId !== match[1] || poster.deletedAt) return false;
  if (uid === match[1]) return true;
  // A token/known path is insufficient. Non-owners need an actual published teaching reference.
  const published = await timed(db.collection("published_lessons").where("coverImageUrl", "==", source).limit(20).get(), signal);
  return published.docs.some(doc => {
    const lesson = doc.data();
    return lesson.ownerId === match[1] && !lesson.deletedAt && lesson.isActive !== false &&
      (lesson.isActive === true || lesson.published === true || ["published", "unlisted"].includes(lesson.status)) &&
      lesson.visibility !== "private" && lesson.publishVisibility !== "private" && lesson.publish?.visibility !== "private";
  });
}

async function objectImage(uid: string, object: string, source: string, signal: AbortSignal): Promise<Buffer> {
  if (!validObjectPath(object)) return fail(400, "Invalid image reference");
  const legacy = parseLegacySpaceImagePath(object);
  if (legacy) {
    try { return (await readLegacyFile(uid, object, "image", null, null, true, signal)).bytes; }
    catch (error) { if (error instanceof LegacyFileError) return fail(error.status, error.message); throw error; }
  }
  const posterCover = /^learning-posters\/[^/]+\/[^/]+\/covers\/[^/]+$/.test(object);
  if (posterCover) {
    if (!await posterCoverAccess(uid, object, source, signal)) return fail(403, "No teaching cover access");
  } else if (!/^covers\/[^/]+\/(?!writing-).+/.test(object) && !/^live-image-activities\/[^/]+\/[^/]+$/.test(object)) {
    return fail(403, "Image namespace is not approved");
  }
  const bucket = pdfBucket(); // server-configured bucket/endpoint only
  const [metadata] = await timed(bucket.file(object).getMetadata(), signal);
  if (!legacy && ["student-writing-print", "student_writing_print"].includes(metadata.metadata?.context as string)) return fail(403, "Unbound individual image");
  const size = Number(metadata.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > PDF_IMAGE_BYTES) return fail(413, "Image too large or invalid");
  // This SDK converts versions to Number; reject zero/missing/unsafe versions rather than lose precision.
  if (![metadata.generation, metadata.metageneration].every(value =>
    typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)))) return fail(503, "Image version unavailable");
  const stream = bucket.file(object, { generation: metadata.generation }).createReadStream();
  const abort = () => { stream.destroy(); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const bytes = await boundedPdfBytes(Readable.toWeb(stream) as ReadableStream<Uint8Array>, PDF_IMAGE_BYTES, signal);
    if (bytes.length !== size) return fail(409, "Image size changed");
    const [current] = await timed(bucket.file(object).getMetadata(), signal);
    if (current.generation !== metadata.generation || current.metageneration !== metadata.metageneration) return fail(409, "Image metadata changed");
    // Re-evaluate membership after reading; never fall back to a download token.
    if (posterCover && !await posterCoverAccess(uid, object, source, signal)) return fail(403, "No teaching cover access");
    return bytes;
  } finally { signal.removeEventListener("abort", abort); stream.destroy(); }
}

export async function rasterPdfImage(bytes: Buffer): Promise<string> {
  if (!bytes.length || bytes.length > PDF_IMAGE_BYTES) return fail(413, "Image too large or empty");
  // Reject SVG, HTML, PDF and other active/container formats BEFORE invoking a decoder.
  const raster = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
    (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    ["GIF87a", "GIF89a"].includes(bytes.subarray(0,6).toString("ascii")) ||
    (bytes.subarray(0,4).toString("ascii") === "RIFF" && bytes.subarray(8,12).toString("ascii") === "WEBP");
  if (!raster) return fail(415, "Unsupported image bytes");
  try {
    const input = sharp(bytes, { failOn: "warning", limitInputPixels: 16_000_000, pages: 1 });
    const meta = await input.metadata();
    if (!["png", "jpeg", "webp", "gif"].includes(meta.format ?? "") || !meta.width || !meta.height || meta.width > 8192 || meta.height > 8192 || (meta.pages ?? 1) !== 1) return fail(415, "Unsupported image dimensions or animation");
    const normalized = await input.rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).timeout({ seconds: 5 }).toBuffer();
    if (normalized.length > PDF_IMAGE_BYTES) return fail(413, "Normalized image too large");
    return `data:image/jpeg;base64,${normalized.toString("base64")}`;
  } catch (error) { if (error instanceof SpaceFileError) throw error; return fail(415, "Invalid raster image"); }
}

export async function safePdfImage(source: unknown, uid: string): Promise<string> {
  if (source === undefined || source === null || source === "") return "";
  if (typeof source !== "string" || source.length > Math.ceil(PDF_IMAGE_BYTES / 3) * 4 + 64) return fail(400, "Invalid image source");
  const signal = AbortSignal.timeout(PDF_IMAGE_TIMEOUT_MS);
  try {
    let bytes: Buffer;
    const inline = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
    if (inline) {
      bytes = Buffer.from(inline[2], "base64");
      if (bytes.toString("base64") !== inline[2]) return fail(400, "Invalid image encoding");
    } else {
      if (source.length > 4096) return fail(400, "Image reference too long");
      const id = privateSpaceFileUrlId(source);
      if (id) {
        const parts: Buffer[] = []; let start = 0; let total: number | undefined;
        while (true) {
          const pending = readSpaceFile(uid, id, `bytes=${start}-`);
          // A late response after timeout must not leave a live unread storage stream.
          void pending.then(response => { if (signal.aborted) void response.body?.cancel().catch(() => undefined); }, () => undefined);
          const response = await timed(pending, signal);
          if (!response.ok) { await response.body?.cancel(); return fail(403, "No image access"); }
          const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
          const end = range ? Number(range[2]) : -1, length = range ? Number(range[3]) : -1;
          if (!range || Number(range[1]) !== start || !Number.isSafeInteger(end) || !Number.isSafeInteger(length) || end < start || end >= length || length > PDF_IMAGE_BYTES || (total !== undefined && length !== total)) {
            await response.body?.cancel(); return fail(413, "Invalid or oversized image range");
          }
          total = length;
          const part = await boundedPdfBytes(response.body, end - start + 1, signal);
          if (part.length !== end - start + 1) return fail(409, "Incomplete image range");
          parts.push(part); start = end + 1;
          if (start === total) break;
        }
        bytes = Buffer.concat(parts);
        const check = await timed(readSpaceFile(uid, id, "bytes=0-0"), signal);
        await check.body?.cancel(); if (!check.ok) return fail(403, "No image access");
      } else if (source === "/logo321ny.png" || /^\/reading-test-covers\/(blue|pink)\.jpg$/.test(source) || /^\/guides\/[a-z0-9-]+\.(png|jpe?g|webp)$/.test(source)) {
        bytes = await timed(fs.readFile(path.join(process.cwd(), "public", source.slice(1))), signal);
      } else {
        const bucket = pdfBucket().name;
        let object = pdfStoragePath(source, bucket);
        if (source.startsWith("/api/space-files/legacy-image?")) {
          const query = new URL(source, "https://internal.invalid").searchParams;
          if (query.getAll("path").length === 1 && [...query.keys()].every(key => key === "path") && parseLegacySpaceImagePath(query.get("path"))) object = query.get("path");
        }
        if (!object) return fail(400, "Use a supported image upload or internal file reference");
        bytes = await objectImage(uid, object, source, signal);
      }
    }
    return await timed(rasterPdfImage(bytes), signal);
  } catch (error) {
    if (signal.aborted) return fail(504, "Image read timed out");
    throw error;
  }
}
