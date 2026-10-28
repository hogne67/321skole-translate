import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { FieldPath, type Transaction, type DocumentSnapshot } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { FileMetadata, Bucket } from "@google-cloud/storage";
import { assertActiveProfile } from "./security/accountAccess.server";
import { getAdmin, getAdminApp } from "./firebaseAdmin";
import { getSpaceAccess, ownsSpaceSubmission } from "./security/spaceAccess.server";
import { fileRange, privateSpaceFileUrl, SPACE_FILE_UPLOAD_LIFETIME_MS, validSpaceFileId, type SpaceFileRecord, type SpaceFileScope } from "./spaceFiles";

export class SpaceFileError extends Error { constructor(public status: number, message: string) { super(message); } }
function fail(status: number, message: string): never { throw new SpaceFileError(status, message); }
function bucket() {
  const project = getAdminApp().options.projectId;
  const name = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
  if (!project || ![`${project}.appspot.com`, `${project}.firebasestorage.app`].includes(name)) fail(503, "File storage unavailable");
  return getAdmin().storage.bucket(name);
}
function source(record: SpaceFileScope) {
  if (record.purpose === "board_image") return { path: `spaces/${record.spaceId}/board/state`, field: new FieldPath("data", "imageUrl") };
  if (record.purpose === "writing_image") return { path: `spaces/${record.spaceId}/writingActivities/${record.activityId}/submissions/${record.submissionId}`, field: new FieldPath("printProfile", "imageUrl") };
  return { path: `spaces/${record.spaceId}/lessons/${record.activityId}/submissions/${record.submissionId}`,
    field: record.purpose === "podcast" ? new FieldPath("podcastWorkshop", "productionSegments", record.segmentId!, "voice", "storagePath") : new FieldPath("audioReading", "storagePath") };
}
export async function authorizeSpaceFileScope(uid: string, scope: SpaceFileScope, writing = false, transaction?: Transaction, decoded?: DecodedIdToken) {
  if (!validSpaceFileId(scope.spaceId) || !validSpaceFileId(scope.activityId) || !["audio_reading", "podcast", "writing_image", "board_image"].includes(scope.purpose)
    || (scope.purpose !== "board_image" && !validSpaceFileId(scope.submissionId)) || (scope.purpose === "podcast" && !validSpaceFileId(scope.segmentId))) fail(400, "Invalid file scope");
  const { db } = getAdmin();
  const access = await getSpaceAccess(db, scope.spaceId, uid, transaction);
  if (transaction) assertActiveProfile(access.profile, decoded);
  if (!access.exists || !access.canRead) fail(403, "No Space access");
  if (scope.purpose === "board_image") {
    if ((writing && !access.canTeach) || scope.activityId !== "state") fail(403, "Teaching access required");
  } else {
    const kind = scope.purpose === "writing_image" ? "writingActivities" : "lessons";
    const activity = db.doc(`spaces/${scope.spaceId}/${kind}/${scope.activityId}`);
    if (!(await (transaction ? transaction.get(activity) : activity.get())).exists) fail(404, "Activity not found");
  }
  const target = source(scope);
  const fields = { fieldMask: ["uid", "userId", "studentUid", "participantId", "spaceId", "assignmentId", "activityId", target.field] };
  const [submission] = await (transaction ? transaction.getAll(db.doc(target.path), fields) : db.getAll(db.doc(target.path), fields));
  const data = submission.data() ?? {};
  if ((data.spaceId && data.spaceId !== scope.spaceId) || (data.assignmentId && data.assignmentId !== scope.activityId) || (data.activityId && data.activityId !== scope.activityId)) fail(403, "Submission scope mismatch");
  const own = access.active && (submission.exists ? ownsSpaceSubmission(data, uid, access.participantId) :
    [uid, access.participantId].some(id => scope.submissionId === `${scope.spaceId}_${scope.activityId}_${id}`));
  if (scope.purpose !== "board_image" && !access.canTeach && !own) fail(403, "No submission access");
  return { access, own, submission, reference: submission.get(target.field), participantId: String(data.participantId || access.participantId || uid) };
}
function submissionStamp(submission: DocumentSnapshot) {
  const created = submission.createTime;
  return submission.exists && created ? `${created.seconds}:${created.nanoseconds}` : undefined;
}
async function authorizeFileRecord(uid: string, record: SpaceFileRecord, writing = false, transaction?: Transaction, decoded?: DecodedIdToken) {
  const authorization = await authorizeSpaceFileScope(uid, record, writing, transaction, decoded);
  // A file session opened for an existing submission cannot silently become a
  // new-submission session after delete/recreate, even at the same canonical ID.
  // First-save workflows legitimately upload before their submission exists.
  if (record.submissionCreatedAt !== undefined && (typeof record.submissionCreatedAt !== "string"
    || record.submissionCreatedAt !== submissionStamp(authorization.submission))) fail(410, "Submission no longer exists or was replaced");
  return authorization;
}
function validateUpload(scope: SpaceFileScope, contentType: string, size: number) {
  const audio = scope.purpose === "audio_reading" || scope.purpose === "podcast";
  const allowed = audio ? ["audio/webm", "audio/ogg", "audio/wav", "audio/mp4", "audio/mpeg", "audio/x-m4a"] : ["image/webp", "image/png", "image/jpeg"];
  if (!allowed.includes(contentType) || !Number.isSafeInteger(size) || size <= 0 || size > (audio ? 25 : 8) * 1024 * 1024) fail(400, "Invalid file type or size");
}
export async function beginSpaceFileUpload(uid: string, scope: SpaceFileScope, contentType: string, size: number, origin?: string) {
  const authorization = await authorizeSpaceFileScope(uid, scope, true);
  validateUpload(scope, contentType, size);
  if ((scope.purpose === "audio_reading" || scope.purpose === "podcast") && !authorization.own) fail(403, "Only own recordings may be uploaded");
  const binding = scope.purpose === "board_image" ? undefined : submissionStamp(authorization.submission);
  if (scope.purpose !== "board_image" && authorization.submission.exists && !binding) fail(503, "Submission version unavailable");
  const id = randomUUID();
  const record: SpaceFileRecord = { ...scope, ownerUid: uid, participantId: authorization.participantId, contentType, size,
    storagePath: `private-space-files/${scope.spaceId}/${id}`, uploadPath: `private-space-uploads/${scope.spaceId}/${id}`, createdAt: Date.now(), status: "pending",
    ...(binding ? { submissionCreatedAt: binding } : {}) };
  // The URI grants a single quarantined write, never a read of teaching data.
  const [uploadUrl] = await bucket().file(record.uploadPath).createResumableUpload({ origin,
    preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType, contentLength: size, cacheControl: "private,no-store" } });
  await getAdmin().db.doc(`privateSpaceFiles/${id}`).create(record);
  return { id, uploadUrl, expiresAt: record.createdAt + SPACE_FILE_UPLOAD_LIFETIME_MS };
}
async function recordFor(id: string) {
  if (!validSpaceFileId(id)) fail(400, "Invalid file id");
  const ref = getAdmin().db.doc(`privateSpaceFiles/${id}`);
  const record = (await ref.get()).data() as SpaceFileRecord | undefined;
  if (!record || record.status === "deleted") fail(404, "File not found");
  return { ref, record };
}
function version(value: unknown): value is string { return typeof value === "string" && /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value)); }
function checksums(metadata: FileMetadata) {
  const values: { crc32c?: string; md5Hash?: string } = {};
  for (const [key, length] of [["crc32c", 4], ["md5Hash", 16]] as const) {
    const value = metadata[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || Buffer.from(value, "base64").length !== length || Buffer.from(value, "base64").toString("base64") !== value) fail(503, "Invalid file checksum");
    values[key] = value;
  }
  if (!values.crc32c && !values.md5Hash) fail(503, "File checksum unavailable");
  return values;
}
function validateObject(metadata: FileMetadata, storage: Bucket, path: string, record: SpaceFileRecord) {
  if (metadata.name !== path || metadata.bucket !== storage.name || !version(metadata.generation) || !version(metadata.metageneration)
    || Number(metadata.size) !== record.size || metadata.contentType !== record.contentType) fail(503, "File identity validation failed");
  return checksums(metadata);
}
function validatePrivate(metadata: FileMetadata, storage: Bucket, id: string, record: SpaceFileRecord, expected: { crc32c?: string; md5Hash?: string; sourceGeneration?: string; sourceMetageneration?: string; generation?: string }) {
  const hashes = validateObject(metadata, storage, record.storagePath, record);
  const token = metadata.metadata?.firebaseStorageDownloadTokens;
  if (metadata.metadata?.assetId !== id || metadata.metadata?.spaceId !== record.spaceId || metadata.cacheControl !== "private,no-store"
    || (token !== undefined && token !== null && token !== "")
    || metadata.acl?.some(entry => ["allUsers", "allAuthenticatedUsers"].includes(entry.entity ?? ""))
    || (expected.generation !== undefined && metadata.generation !== expected.generation)
    || (expected.sourceGeneration !== undefined && metadata.metadata?.sourceGeneration !== expected.sourceGeneration)
    || (expected.sourceMetageneration !== undefined && metadata.metadata?.sourceMetageneration !== expected.sourceMetageneration)
    || (["crc32c", "md5Hash"] as const).some(key => expected[key] !== undefined && hashes[key] !== expected[key])) fail(503, "File integrity or privacy validation failed");
  return hashes;
}
function validateRecord(id: string, record: SpaceFileRecord) {
  validateUpload(record, record.contentType, record.size);
  if (record.storagePath !== `private-space-files/${record.spaceId}/${id}` || record.uploadPath !== `private-space-uploads/${record.spaceId}/${id}`
    || !Number.isFinite(record.createdAt) || !["pending", "ready"].includes(record.status)) fail(503, "Invalid file record");
}
function sameRecord(current: SpaceFileRecord | undefined, original: SpaceFileRecord) {
  if (!current || current.status === "deleted") fail(410, "File deleted");
  for (const key of ["spaceId", "activityId", "submissionId", "purpose", "segmentId", "ownerUid", "participantId", "storagePath", "uploadPath", "contentType", "size", "createdAt", "submissionCreatedAt"] as const) {
    if (current[key] !== original[key]) fail(409, "File record changed");
  }
  if (!["pending", "ready"].includes(current.status)) fail(409, "Invalid file state");
  return current;
}
// File options, rather than delete options: this SDK passes these conditions
// into the actual delete request. A stale cleanup can never remove a replacement.
async function removeVersion(storage: Bucket, path: string, metadata: FileMetadata) {
  if (!version(metadata.generation) || !version(metadata.metageneration)) fail(503, "File version unavailable");
  await storage.file(path, { generation: metadata.generation, preconditionOpts: {
    ifGenerationMatch: metadata.generation, ifMetagenerationMatch: metadata.metageneration,
  } }).delete({ ignoreNotFound: true });
}
type SessionCheck = () => Promise<DecodedIdToken>;
export async function finishSpaceFileUpload(uid: string, id: string, checkSession?: SessionCheck) {
  const { ref, record } = await recordFor(id);
  validateRecord(id, record);
  if (record.ownerUid !== uid) fail(403, "Wrong uploader");
  await authorizeFileRecord(uid, record, true);
  const storage = bucket();
  let staging: FileMetadata | undefined;
  let expected = { crc32c: record.crc32c, md5Hash: record.md5Hash, sourceGeneration: record.sourceGeneration, sourceMetageneration: record.sourceMetageneration, generation: record.generation };
  if (record.status !== "ready") {
    if (Date.now() - record.createdAt >= SPACE_FILE_UPLOAD_LIFETIME_MS) fail(410, "Upload expired");
    try { [staging] = await storage.file(record.uploadPath).getMetadata(); }
    catch (error) {
      if (Number((error as { code?: unknown }).code) !== 404) throw error;
      // Another finalizer may already have committed ready and removed staging.
      // Only that verified state permits resuming through the ready validation path.
      const current = sameRecord((await ref.get()).data() as SpaceFileRecord | undefined, record);
      if (current.status === "ready") return finishSpaceFileUpload(uid, id, checkSession);
      throw error;
    }
    const hashes = validateObject(staging, storage, record.uploadPath, record);
    expected = { crc32c: hashes.crc32c, md5Hash: hashes.md5Hash, sourceGeneration: String(staging.generation), sourceMetageneration: String(staging.metageneration), generation: undefined };
    // Copy a fixed source generation, create only, with no inherited bearer token.
    try {
      await storage.file(record.uploadPath, { generation: staging.generation }).copy(storage.file(record.storagePath), {
        preconditionOpts: { ifGenerationMatch: 0 }, contentType: record.contentType, cacheControl: "private,no-store",
        metadata: { firebaseStorageDownloadTokens: null, assetId: id, spaceId: record.spaceId,
          sourceGeneration: staging.generation!, sourceMetageneration: staging.metageneration! },
      });
    } catch (error) { if (Number((error as { code?: unknown }).code) !== 412) throw error; }
  } else if (!version(record.generation)) fail(503, "File version unavailable");
  const [result] = await storage.file(record.storagePath, expected.generation ? { generation: expected.generation } : undefined).getMetadata();
  const hashes = validatePrivate(result, storage, id, record, expected);
  const decoded = await checkSession?.();
  if (decoded && decoded.uid !== uid) fail(403, "Session changed");
  await getAdmin().db.runTransaction(async tx => {
    const current = sameRecord((await tx.get(ref)).data() as SpaceFileRecord | undefined, record);
    // Authorization reads participate in the same commit as ready publication.
    // Firestore retries/conflicts cannot reuse an earlier membership/profile decision.
    await authorizeFileRecord(uid, record, true, tx, decoded);
    if (current.status === "ready") {
      if (current.generation !== result.generation || (["crc32c", "md5Hash"] as const).some(key => current[key] !== undefined && current[key] !== hashes[key])) fail(409, "File version changed");
      return;
    }
    if (Date.now() - record.createdAt >= SPACE_FILE_UPLOAD_LIFETIME_MS) fail(410, "Upload expired");
    tx.update(ref, { status: "ready", generation: result.generation!, ...hashes,
      sourceGeneration: expected.sourceGeneration!, sourceMetageneration: expected.sourceMetageneration! });
  });
  if (staging) await removeVersion(storage, record.uploadPath, staging);
  return { storagePath: record.storagePath, imageUrl: privateSpaceFileUrl(id) };
}

/** Trusted, server-generated images use the same private reader and scope policy. */
export async function saveGeneratedSpaceImage(uid: string, scope: SpaceFileScope, bytes: Buffer, checkSession?: SessionCheck) {
  const authorization = await authorizeSpaceFileScope(uid, scope, true);
  validateUpload(scope, "image/webp", bytes.length);
  if (scope.purpose !== "writing_image" && scope.purpose !== "board_image") fail(400, "Invalid image scope");
  const id = randomUUID();
  const storagePath = `private-space-files/${scope.spaceId}/${id}`;
  const storage = bucket(), file = storage.file(storagePath);
  await file.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, contentType: "image/webp",
    metadata: { cacheControl: "private,no-store", metadata: { assetId: id, spaceId: scope.spaceId } } });
  const [metadata] = await file.getMetadata();
  const record: SpaceFileRecord = { ...scope, ownerUid: uid, participantId: authorization.participantId, storagePath,
    uploadPath: `private-space-uploads/${scope.spaceId}/${id}`, contentType: "image/webp", size: bytes.length,
    createdAt: Date.now(), status: "ready", generation: String(metadata.generation) };
  const hashes = validatePrivate(metadata, storage, id, record, { md5Hash: createHash("md5").update(bytes).digest("base64") });
  const decoded = await checkSession?.();
  if (decoded && decoded.uid !== uid) fail(403, "Session changed");
  await getAdmin().db.runTransaction(async tx => {
    await authorizeSpaceFileScope(uid, scope, true, tx, decoded);
    tx.create(getAdmin().db.doc(`privateSpaceFiles/${id}`), { ...record, ...hashes });
  });
  return { storagePath, imageUrl: privateSpaceFileUrl(id) };
}
export async function readSpaceFile(uid: string, id: string, rangeHeader: string | null) {
  const { record } = await recordFor(id);
  if (record.status !== "ready" || !record.generation) fail(404, "File not ready");
  const scope = await authorizeFileRecord(uid, record);
  const expected = record.purpose.endsWith("image") ? privateSpaceFileUrl(id) : record.storagePath;
  const attached = scope.submission.exists && scope.reference === expected;
  const ownPreview = record.ownerUid === uid && Date.now() - record.createdAt <= SPACE_FILE_UPLOAD_LIFETIME_MS;
  if (!attached && !ownPreview) fail(403, "File is no longer attached to its submission");
  let range;
  try { range = fileRange(rangeHeader, record.size); } catch { return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${record.size}`, "Cache-Control": "private,no-store" } }); }
  const stream = bucket().file(record.storagePath, { generation: record.generation }).createReadStream({ start: range.start, end: range.end });
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range.partial ? 206 : 200,
    headers: { "Content-Type": record.contentType, "Content-Length": String(range.end - range.start + 1), "Cache-Control": "private,no-store", "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes", "Content-Disposition": "inline", ...(range.partial ? { "Content-Range": `bytes ${range.start}-${range.end}/${record.size}` } : {}) } });
}
export async function deleteSpaceFile(uid: string, id: string) {
  const { ref, record } = await recordFor(id);
  validateRecord(id, record);
  // A revoked uploader may still clean up their unfinished quarantined upload.
  if (!(record.status === "pending" && record.ownerUid === uid)) {
    const access = await authorizeSpaceFileScope(uid, record);
    if (!access.access.canTeach && record.ownerUid !== uid) fail(403, "Cannot delete this file");
  }
  // Mark denied before touching storage; failed cleanup must not restore reads.
  const deleted = await getAdmin().db.runTransaction(async tx => {
    const current = sameRecord((await tx.get(ref)).data() as SpaceFileRecord | undefined, record);
    tx.update(ref, { status: "deleted" });
    return current;
  });
  const storage = bucket();
  const existing = async (path: string, generation?: string) => {
    try { return (await storage.file(path, generation ? { generation } : undefined).getMetadata())[0]; }
    catch (error) { if (Number((error as { code?: unknown }).code) === 404) return undefined; throw error; }
  };
  const staging = await existing(record.uploadPath);
  const hashes = staging ? validateObject(staging, storage, record.uploadPath, record) : {};
  const privateObject = await existing(record.storagePath, deleted.generation);
  if (privateObject) {
    validatePrivate(privateObject, storage, id, record, deleted.status === "ready" ? deleted : {
      ...hashes, ...(staging ? { sourceGeneration: String(staging.generation), sourceMetageneration: String(staging.metageneration) } : {}),
    });
    await removeVersion(storage, record.storagePath, privateObject);
  }
  if (staging) await removeVersion(storage, record.uploadPath, staging);
}
