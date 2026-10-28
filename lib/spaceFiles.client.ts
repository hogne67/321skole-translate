import { auth } from "./firebase";
import { privateSpaceFileUrlId, SPACE_FILE_CHUNK_BYTES, type SpaceFileScope } from "./spaceFiles";

async function headers() {
  if (!auth.currentUser) throw new Error("Sign in to access this file");
  return { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` };
}
export async function uploadPrivateSpaceFile(scope: SpaceFileScope, blob: Blob) {
  const response = await fetch("/api/space-files", { method: "POST", headers: { ...await headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ ...scope, contentType: blob.type.split(";")[0], size: blob.size }) });
  if (!response.ok) throw new Error("File upload not permitted");
  const { id, uploadUrl } = await response.json();
  // Do not attach the Firebase ID token to the provider's write-only session.
  try {
    const uploaded = await fetch(uploadUrl, { method: "PUT", body: blob, credentials: "omit", referrerPolicy: "no-referrer", headers: { "Content-Type": blob.type } });
    if (!uploaded.ok) throw new Error("File upload failed");
    const finalized = await fetch(`/api/space-files/${id}`, { method: "POST", headers: await headers() });
    if (!finalized.ok) throw new Error("File upload could not be finalized");
    return await finalized.json() as { storagePath: string; imageUrl: string };
  } catch (error) {
    // Best effort: request cancellation of an incomplete provider session and
    // deny/clean up the app asset. A completed upload cannot be undone by its URI.
    await fetch(uploadUrl, { method: "DELETE", credentials: "omit", referrerPolicy: "no-referrer" }).catch(() => undefined);
    try { await fetch(`/api/space-files/${id}`, { method: "DELETE", headers: await headers() }); } catch { /* Cleanup remains private and can be retried later. */ }
    throw error;
  }
}
export async function fetchAuthenticatedFileBlob(url: string, options: RequestInit = {}) {
  if (!privateSpaceFileUrlId(url) && url !== "/api/teacher/audio-url"
    && !/^\/api\/space-files\/legacy-image\?path=[A-Za-z0-9%_.!~*'()-]+$/.test(url)) throw new Error("Invalid protected file URL");
  const chunks: Blob[] = [];
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to access this file");
  const checkSession = () => { if (auth.currentUser !== user) throw new Error("File session changed"); };
  let start = 0;
  let type = "application/octet-stream";
  let expectedSize: number | undefined;
  let expectedVersion: string | null | undefined;
  while (true) {
    checkSession();
    const token = await user.getIdToken();
    checkSession();
    const requestHeaders = new Headers(options.headers);
    requestHeaders.set("Authorization", `Bearer ${token}`);
    requestHeaders.set("Range", `bytes=${start}-${start + SPACE_FILE_CHUNK_BYTES - 1}`);
    if (expectedVersion) requestHeaders.set("If-Match", expectedVersion);
    const response = await fetch(url, { ...options, cache: "no-store", redirect: "error", headers: requestHeaders });
    checkSession();
    if (!response.ok) throw new Error("No access to this file");
    const version = response.headers.get("etag");
    if (expectedVersion !== undefined && version !== expectedVersion) throw new Error("File version changed");
    expectedVersion = version;
    const nextType = response.headers.get("content-type") || "application/octet-stream";
    if (start && type !== nextType) throw new Error("Invalid file response");
    type = nextType;
    const chunk = await response.blob();
    checkSession();
    chunks.push(chunk);
    if (response.status === 200) {
      if (start !== 0 || chunk.size === 0 || chunk.size > 25 * 1024 * 1024) throw new Error("Invalid file response");
      break;
    }
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
    if (response.status !== 206 || !range || !range.slice(1).every(value => Number.isSafeInteger(Number(value)))
      || chunk.size === 0 || chunk.size > SPACE_FILE_CHUNK_BYTES || Number(range[1]) !== start || Number(range[2]) + 1 - start !== chunk.size
      || Number(range[2]) >= Number(range[3]) || Number(range[3]) > 25 * 1024 * 1024) throw new Error("Invalid file response");
    if (expectedSize !== undefined && expectedSize !== Number(range[3])) throw new Error("Invalid file response");
    expectedSize = Number(range[3]);
    start = Number(range[2]) + 1;
    if (start >= Number(range[3])) break;
  }
  checkSession();
  return new Blob(chunks, { type });
}
