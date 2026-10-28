import "server-only";
import { getAdmin, getAdminApp } from "../firebaseAdmin";
import { getSpaceAccess } from "./spaceAccess.server";
import { validateStoredStudentSubmission } from "./studentSubmissionPolicy";
import { parseLegacySpaceImagePath } from "./legacySpaceImage";
import { fileRange } from "../spaceFiles";

export class LegacyFileError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new LegacyFileError(status, message); };
export function legacyFileBucket() {
  const project = getAdminApp().options.projectId;
  const name = (process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
  if (!project || ![`${project}.appspot.com`, `${project}.firebasestorage.app`].includes(name)) return fail(503, "File storage unavailable");
  return getAdmin().storage.bucket(name);
}
export function parseLegacyAudioPath(value: unknown) {
  if (typeof value !== "string") return null;
  const p = value.split("/");
  if (p.length !== 8 || p.some(part => !part || part === "." || part === ".." || part.includes("\\") || [...part].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) ||
    p[0] !== "spaces" || p[2] !== "assignments" || p[4] !== "submissions" || p[6] !== "audio") return null;
  return { path: value, spaceId: p[1], activityId: p[3], pupilId: p[5] };
}
function data(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function referencePath(value: unknown, bucketName: string): string | null {
  if (typeof value !== "string") return null;
  if (parseLegacyAudioPath(value) || parseLegacySpaceImagePath(value)) return value;
  try {
    const url = new URL(value, "https://local.invalid");
    if (value.startsWith("/api/space-files/legacy-image?") && url.origin === "https://local.invalid" &&
      [...url.searchParams.keys()].every(key => key === "path") && url.searchParams.getAll("path").length === 1) {
      return parseLegacySpaceImagePath(url.searchParams.get("path"))?.path ?? null;
    }
    if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com" || url.username || url.password || url.port) return null;
    const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(url.pathname);
    if (!match || decodeURIComponent(match[1]) !== bucketName) return null;
    return parseLegacySpaceImagePath(decodeURIComponent(match[2]))?.path ?? null;
  } catch { return null; }
}
/** No mirror lookup, filename inference, data mutation, or capability-URL fetch.
 * Only the existing canonical document and its exact audio/image reference grant access. */
export async function authorizeLegacyFile(uid: string, path: string, kind: "audio" | "image") {
  const parsed = kind === "audio" ? parseLegacyAudioPath(path) : parseLegacySpaceImagePath(path);
  if (!parsed) return fail(400, "Invalid file reference");
  const { db } = getAdmin();
  const bucketName = legacyFileBucket().name;
  const access = await getSpaceAccess(db, parsed.spaceId, uid);
  if (!access.canRead || (parsed.pupilId !== null && !access.canTeach &&
    !(access.active && [uid, access.participantId].includes(parsed.pupilId)))) return fail(403, "No file access");
  if (parsed.pupilId === null) {
    const board = await db.doc(`spaces/${parsed.spaceId}/board/state`).get();
    if (!board.exists || referencePath(board.get("data.imageUrl"), bucketName) !== path) return fail(403, "File is not attached");
    return `${board.ref.path}:${board.createTime?.seconds}:${board.createTime?.nanoseconds}:${board.updateTime?.seconds}:${board.updateTime?.nanoseconds}`;
  }
  const collection = kind === "audio" ? "lessons" : "writingActivities";
  const activity = `spaces/${parsed.spaceId}/${collection}/${parsed.activityId}`;
  if (!(await db.doc(activity).get()).exists) return fail(404, "Activity not found");
  const ids = [...new Set([`${parsed.spaceId}_${parsed.activityId}_${parsed.pupilId}`, parsed.pupilId])];
  const snapshots = await db.getAll(...ids.map(id => db.doc(`${activity}/submissions/${id}`)));
  const identityUids = [...new Set(snapshots.map(snapshot => snapshot.data()?.uid).filter((value): value is string => typeof value === "string" && !!value && !value.includes("/")))];
  const members = identityUids.length ? await db.getAll(...identityUids.map(actor => db.doc(`spaceMembers/${parsed.spaceId}_${actor}`))) : [];
  const participants = new Map(members.filter(member => member.exists).map(member => [member.id, member.data()?.participantId]));
  const matches = snapshots.filter(snapshot => {
    const stored = snapshot.data();
    if (!stored) return false;
    if (![stored.uid, stored.studentUid, stored.participantId].includes(parsed.pupilId)) return false;
    const actor = typeof stored.uid === "string" ? stored.uid : typeof stored.studentUid === "string" ? stored.studentUid : parsed.pupilId!;
    const participantId = typeof stored.participantId === "string" && stored.participantId ? stored.participantId : actor;
    const memberId = `${parsed.spaceId}_${actor}`;
    if (participants.has(memberId) && (participants.get(memberId) || actor) !== participantId) return false;
    try { validateStoredStudentSubmission(stored, { kind: collection, spaceId: parsed.spaceId, activityId: parsed.activityId!, submissionId: snapshot.id, uid: actor, participantId }); }
    catch { return false; }
    if (kind === "image") return referencePath(data(stored.printProfile).imageUrl, bucketName) === path;
    const reading = data(stored.audioReading);
    const voices = Object.values(data(data(stored.podcastWorkshop).productionSegments)).map(segment => data(data(segment).voice));
    return [reading, ...voices].some(asset => (asset.storagePath ?? asset.audioStoragePath) === path);
  });
  if (matches.length !== 1) return fail(403, "File is not uniquely attached");
  const doc = matches[0];
  return `${doc.ref.path}:${doc.createTime?.seconds}:${doc.createTime?.nanoseconds}:${doc.updateTime?.seconds}:${doc.updateTime?.nanoseconds}`;
}

function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new LegacyFileError(504, "File read timed out"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new LegacyFileError(504, "File read timed out"));
    signal.addEventListener("abort", abort, { once: true });
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
export async function readLegacyFile(uid: string, path: string, kind: "audio" | "image", rangeHeader: string | null, expectedVersion?: string | null, complete = false, signal = AbortSignal.timeout(10000)) {
  const binding = await bounded(authorizeLegacyFile(uid, path, kind), signal);
  const bucket = legacyFileBucket(), file = bucket.file(path);
  const [metadata] = await bounded(file.getMetadata(), signal);
  const version = `"${metadata.generation}-${metadata.metageneration}"`;
  if (![metadata.generation, metadata.metageneration].every(value => typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)))) return fail(503, "File version unavailable");
  if (expectedVersion && expectedVersion !== version) return fail(412, "File changed");
  const size = Number(metadata.size), contentType = metadata.contentType ?? "";
  if (!Number.isSafeInteger(size) || size <= 0 || size > (kind === "audio" ? 25 : 8) * 1024 * 1024) return fail(413, "Invalid file size");
  if (!(kind === "audio" ? ["audio/webm","audio/ogg","audio/wav","audio/mp4","audio/mpeg","audio/x-m4a"] : ["image/png","image/jpeg","image/webp","image/gif"]).includes(contentType.split(";")[0])) return fail(415, "Unsupported file type");
  let range;
  try { range = complete ? { start: 0, end: size-1, partial: false } : fileRange(rangeHeader, size); }
  catch { return fail(416, "Invalid file range"); }
  const end = Math.min(range.end, size - 1), chunks: Buffer[] = []; let length = 0;
  if (signal.aborted) return fail(504, "File read timed out");
  const stream = bucket.file(path, { generation: metadata.generation }).createReadStream({ start: range.start, end });
  const abort = () => { stream.destroy(new LegacyFileError(504, "File read timed out")); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for await (const chunk of stream) { const bytes = Buffer.from(chunk); length += bytes.length; if (length > end-range.start+1) return fail(409, "File size changed"); chunks.push(bytes); }
  } finally { signal.removeEventListener("abort", abort); stream.destroy(); }
  if (length !== end-range.start+1) return fail(409, "Incomplete file");
  const [current] = await bounded(file.getMetadata(), signal);
  if (current.generation !== metadata.generation || current.metageneration !== metadata.metageneration) return fail(409, "File changed");
  if (await bounded(authorizeLegacyFile(uid, path, kind), signal) !== binding) return fail(403, "File binding changed");
  return { bytes: Buffer.concat(chunks), size, start: range.start, end, partial: range.partial, contentType, version };
}
