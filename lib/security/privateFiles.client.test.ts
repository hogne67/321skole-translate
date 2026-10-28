import assert from "node:assert/strict";
import { before, after, afterEach, test, mock } from "node:test";
import { deleteApp } from "firebase/app";
import { SPACE_FILE_CHUNK_BYTES } from "../spaceFiles";

let firebase: typeof import("../firebase");
let files: typeof import("../spaceFiles.client");
before(async () => {
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "synthetic-api-key";
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-security-files-client";
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "demo-security-files-client.invalid";
  firebase = await import("../firebase");
  await firebase.auth.authStateReady();
  files = await import("../spaceFiles.client");
});
afterEach(() => mock.restoreAll());
after(async () => { await deleteApp(firebase.appMaybe!); });
const scope = { spaceId: "room", activityId: "task", submissionId: "room_task_pupil", purpose: "audio_reading" as const };
function signIn() {
  Object.defineProperty(firebase.auth, "currentUser", { configurable: true, writable: true, value: { uid: "pupil", getIdToken: async () => "synthetic-token" } });
}

test("large recordings upload directly to a write-only session without forwarding Firebase credentials", async () => {
  signIn();
  const blob = new Blob([new Uint8Array(5 * 1024 * 1024)], { type: "audio/webm" });
  const calls: string[] = [];
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push(url);
    if (url === "https://synthetic.invalid/write-only") {
      assert.equal(init.method, "PUT"); assert.equal(init.body, blob);
      assert.equal(new Headers(init.headers).get("authorization"), null);
      assert.equal(init.credentials, "omit"); assert.equal(init.referrerPolicy, "no-referrer");
      return new Response();
    }
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer synthetic-token");
    if (url === "/api/space-files") {
      assert.equal(JSON.parse(String(init.body)).size, blob.size);
      assert.ok(String(init.body).length < 1000);
      return Response.json({ id: "asset", uploadUrl: "https://synthetic.invalid/write-only" });
    }
    assert.equal(init.method, "POST");
    return Response.json({ storagePath: "private-space-files/room/asset", imageUrl: "/api/space-files/asset" });
  });
  const result = await files.uploadPrivateSpaceFile(scope, blob);
  assert.equal(result.storagePath, "private-space-files/room/asset");
  assert.deepEqual(calls, ["/api/space-files", "https://synthetic.invalid/write-only", "/api/space-files/asset"]);
});

test("failed finalization cancels the provider capability and requests private cleanup", async () => {
  signIn();
  const calls: string[] = [];
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push(`${init.method} ${url}`);
    if (url === "/api/space-files") return Response.json({ id: "asset", uploadUrl: "https://synthetic.invalid/write-only" });
    if (init.method === "POST") return new Response(null, { status: 403 });
    if (url.startsWith("https:")) assert.equal(new Headers(init.headers).get("authorization"), null);
    return new Response();
  });
  await assert.rejects(files.uploadPrivateSpaceFile(scope, new Blob(["synthetic"], { type: "audio/webm" })), /finalized/);
  assert.deepEqual(calls.slice(-2), ["DELETE https://synthetic.invalid/write-only", "DELETE /api/space-files/asset"]);
});

test("authenticated playback joins bounded ranges and stops immediately when later access is revoked", async () => {
  signIn();
  let revoked = false;
  const size = SPACE_FILE_CHUNK_BYTES + 3;
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/api/space-files/asset");
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer synthetic-token");
    const range = new Headers(init.headers).get("range")!;
    const start = Number(/^bytes=(\d+)-/.exec(range)![1]);
    if (start && revoked) return new Response(null, { status: 403 });
    const end = Math.min(start + SPACE_FILE_CHUNK_BYTES - 1, size - 1);
    return new Response(new Uint8Array(end - start + 1), { status: 206, headers: { "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Type": "audio/webm" } });
  });
  assert.equal((await files.fetchAuthenticatedFileBlob("/api/space-files/asset")).size, size);
  revoked = true;
  await assert.rejects(files.fetchAuthenticatedFileBlob("/api/space-files/asset"), /No access/);
  await assert.rejects(files.fetchAuthenticatedFileBlob("https://synthetic.invalid/token"), /Invalid protected/);
});

test("malformed or empty partial responses cannot create an unbounded playback loop", async () => {
  signIn();
  mock.method(globalThis, "fetch", async () => new Response(new Uint8Array(), { status: 206, headers: { "Content-Range": "bytes 0-0/5" } }));
  await assert.rejects(files.fetchAuthenticatedFileBlob("/api/space-files/asset"), /Invalid file response/);
});
