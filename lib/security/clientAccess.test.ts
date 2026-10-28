import assert from "node:assert/strict";
import { after, afterEach, before, test, mock } from "node:test";
import { deleteApp } from "firebase/app";
import { Timestamp } from "firebase/firestore";
import { getOwnSubmissions } from "./ownSubmissions.client";

let firebase: typeof import("../firebase");
let audio: typeof import("../audio/studentAudio");
let fileReaderDescriptor: PropertyDescriptor | undefined;
before(async () => {
  // No real account, project, provider key or network operation is used.
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "synthetic-api-key";
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-security-client";
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "demo-security-client.invalid";
  firebase = await import("../firebase");
  await firebase.auth.authStateReady();
  audio = await import("../audio/studentAudio");
  fileReaderDescriptor = Object.getOwnPropertyDescriptor(globalThis, "FileReader");
  Object.defineProperty(globalThis, "FileReader", { configurable: true, value: class {
    result = "";
    onload?: () => void;
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then(bytes => { this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`; this.onload?.(); });
    }
  } });
});
afterEach(() => { mock.restoreAll(); Object.defineProperty(firebase.auth, "currentUser", { configurable: true, writable: true, value: null }); });
after(async () => {
  if (fileReaderDescriptor) Object.defineProperty(globalThis, "FileReader", fileReaderDescriptor);
  else Reflect.deleteProperty(globalThis, "FileReader");
  await deleteApp(firebase.appMaybe!);
});
function signIn() {
  Object.defineProperty(firebase.auth, "currentUser", { configurable: true, writable: true, value: { uid: "pupil", getIdToken: async () => "synthetic-token" } });
}

test("submission overview preserves timestamps, sorting and limits through the authenticated API", async () => {
  signIn();
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/api/student/submissions?source=spaceSubmissions");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer synthetic-token");
    return Response.json({ documents: [
      { id: "older", data: { uid: "pupil", updatedAt: { seconds: 1, nanoseconds: 0 } } },
      { id: "newer", data: { uid: "pupil", updatedAt: { seconds: 2, nanoseconds: 0 } } },
    ] });
  });
  const snapshot = await getOwnSubmissions("spaceSubmissions", "pupil", 1);
  assert.equal(snapshot.docs[0].id, "newer");
  assert.equal(snapshot.docs.length, 1);
  assert.ok(snapshot.docs[0].data().updatedAt instanceof Timestamp);
  await assert.rejects(getOwnSubmissions("spaceSubmissions", "foreign"), /Unauthorized/);
});

test("audio playback and deletion use an authenticated request and disregard stored bearer URLs", async () => {
  signIn();
  const asset = { version: 1 as const, activityType: "podcast", storagePath: "spaces/room/assignments/task/submissions/pupil/audio/test.webm", audioDataUrl: "https://synthetic.invalid/old-token", mimeType: "audio/webm", durationSeconds: 1, recordedAt: 1 };
  const calls: string[] = [];
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/api/teacher/audio-url");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer synthetic-token");
    const body = JSON.parse(String(init.body));
    assert.equal(body.storagePath, asset.storagePath);
    calls.push(body.mode);
    return body.mode === "delete" ? Response.json({ ok: true }) : new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "audio/webm" } });
  });
  const playable = await audio.resolveStudentAudioForPlayback(asset);
  assert.equal(playable?.audioDataUrl, "data:audio/webm;base64,AQI=");
  await audio.deleteStudentAudioAsset(asset);
  assert.deepEqual(calls, ["bytes", "delete"]);
  assert.equal(audio.stripStudentAudioPlaybackUrl(playable!).audioDataUrl, undefined);
});

test("revoked audio access and failed overview requests fail without returning old playback URLs", async () => {
  signIn();
  mock.method(globalThis, "fetch", async () => new Response("Forbidden", { status: 403 }));
  await assert.rejects(getOwnSubmissions("spaceSubmissions", "pupil"), /Could not load/);
  const asset = { version: 1 as const, activityType: "podcast", storagePath: "synthetic", audioDataUrl: "https://synthetic.invalid/old-token", mimeType: "audio/webm", durationSeconds: 1, recordedAt: 1 };
  await assert.rejects(audio.resolveStudentAudioForPlayback(asset), /No access/);
  await assert.rejects(audio.deleteStudentAudioAsset(asset), /Could not delete/);
});
