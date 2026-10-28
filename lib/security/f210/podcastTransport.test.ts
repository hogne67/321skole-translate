import assert from "node:assert/strict";
import { before, after, afterEach, mock, test } from "node:test";
import { createHash } from "node:crypto";
import { deleteApp } from "firebase/app";
import { SPACE_FILE_CHUNK_BYTES } from "../../spaceFiles";
let firebase: typeof import("../../firebase"), audio: typeof import("../../audio/studentAudio"), files: typeof import("../../spaceFiles.client"), podcast: typeof import("../../audio/podcastExport");
const user = () => ({ uid: "synthetic-pupil", getIdToken: async () => "synthetic-token" });
function signIn() { Object.defineProperty(firebase.auth, "currentUser", { configurable: true, writable: true, value: user() }); }
const asset = (storagePath = "private-space-files/room/voice") => ({ version: 1 as const, activityType: "podcast", storagePath, mimeType: "audio/wav", recordedAt: 1, durationSeconds: 1 });
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
before(async () => {
  firebase = await import("../../firebase"); await firebase.auth.authStateReady();
  audio = await import("../../audio/studentAudio"); files = await import("../../spaceFiles.client"); podcast = await import("../../audio/podcastExport");
  Object.defineProperty(globalThis, "FileReader", { configurable: true, value: class {
    result = ""; onload?: () => void; onerror?: () => void;
    readAsDataURL(blob: Blob) { void blob.arrayBuffer().then(buffer => { this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`; this.onload?.(); }); }
  } });
});
afterEach(() => mock.restoreAll());
after(async () => { await deleteApp(firebase.appMaybe!); });

for (const legacy of [false, true]) test(`${legacy ? "legacy" : "private"} transport returns every byte across ranges for playback and download`, async () => {
  signIn(); const bytes = Uint8Array.from({ length: SPACE_FILE_CHUNK_BYTES * 2 + 73 }, (_, i) => i % 251);
  const reference = asset(legacy ? "spaces/room/assignments/task/submissions/pupil/audio/voice.wav" : undefined);
  let calls = 0;
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls++; assert.equal(url, legacy ? "/api/teacher/audio-url" : "/api/space-files/voice");
    assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
    const headers = new Headers(init.headers); assert.equal(headers.get("authorization"), "Bearer synthetic-token");
    if (legacy) { assert.equal(init.method, "POST"); assert.equal(JSON.parse(String(init.body)).storagePath, reference.storagePath); }
    const start = Number(/^bytes=(\d+)-/.exec(headers.get("range")!)![1]), end = Math.min(start + SPACE_FILE_CHUNK_BYTES, bytes.length);
    return new Response(bytes.slice(start, end), { status: 206, headers: { "Content-Type": "audio/wav", "Content-Range": `bytes ${start}-${end - 1}/${bytes.length}` } });
  });
  assert.equal(digest(new Uint8Array(await (await audio.readStudentAudioBlob(reference)).arrayBuffer())), digest(bytes));
  const resolved = await audio.resolveStudentAudioForPlayback(reference);
  assert.equal(digest(Buffer.from(resolved!.audioDataUrl!.split(",")[1], "base64")), digest(bytes));
  assert.equal(calls, 6); assert.equal(audio.studentAudioFilename(reference, "segment/1"), "segment_1.wav");
});

for (const status of [401, 403, 404, 416, 500]) test(`HTTP ${status} stops reading; stale preview is never a fallback`, async () => {
  signIn(); let calls = 0;
  mock.method(globalThis, "fetch", async () => { calls++; return new Response(null, { status }); });
  await assert.rejects(audio.resolveStudentAudioForPlayback({ ...asset(), audioDataUrl: "data:audio/wav;base64,AQID" })); assert.equal(calls, 1);
});

test("network failure is propagated without legacy retry or public URL", async () => {
  signIn(); let calls = 0;
  mock.method(globalThis, "fetch", async () => { calls++; throw new Error("synthetic offline"); });
  await assert.rejects(audio.readStudentAudioBlob(asset()), /synthetic offline/); assert.equal(calls, 1);
});

test("existing audioStoragePath records keep their legacy reader compatibility", async () => {
  signIn(); const path = "spaces/room/assignments/task/submissions/pupil/audio/old.ogg";
  const old = audio.readStudentAudioAsset({ audioStoragePath: path, mimeType: "audio/ogg" }, "podcast");
  assert.ok(old);
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/api/teacher/audio-url"); assert.equal(JSON.parse(String(init.body)).storagePath, path);
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/ogg" } });
  });
  assert.equal((await audio.readStudentAudioBlob(old)).size, 3);
});

for (const action of ["switch", "logout", "tokenSwitch"]) test(`user ${action} during transport cannot produce a Blob`, async () => {
  signIn(); let calls = 0;
  if (action === "tokenSwitch") Object.defineProperty(firebase.auth, "currentUser", { configurable: true, writable: true, value: { uid: "one", getIdToken: async () => { signIn(); return "old"; } } });
  mock.method(globalThis, "fetch", async () => {
    calls++; Object.defineProperty(firebase.auth, "currentUser", { configurable: true, writable: true, value: action === "logout" ? null : user() });
    return new Response("synthetic", { headers: { "Content-Type": "audio/wav" } });
  });
  await assert.rejects(audio.readStudentAudioBlob(asset()), /session changed/); assert.equal(calls, action === "tokenSwitch" ? 0 : 1);
});

test("changed total size across ranges is rejected instead of a truncated success", async () => {
  signIn(); let calls = 0;
  mock.method(globalThis, "fetch", async () => ++calls === 1
    ? new Response(new Uint8Array(SPACE_FILE_CHUNK_BYTES), { status: 206, headers: { "Content-Range": `bytes 0-${SPACE_FILE_CHUNK_BYTES - 1}/${SPACE_FILE_CHUNK_BYTES + 4}`, "Content-Type": "audio/wav" } })
    : new Response(new Uint8Array(2), { status: 206, headers: { "Content-Range": `bytes ${SPACE_FILE_CHUNK_BYTES}-${SPACE_FILE_CHUNK_BYTES + 1}/${SPACE_FILE_CHUNK_BYTES + 2}`, "Content-Type": "audio/wav" } }));
  await assert.rejects(audio.readStudentAudioBlob(asset()), /Invalid file response/); assert.equal(calls, 2);
});

test("invalid ranges, 204 and empty files do not count as complete audio", async () => {
  signIn();
  for (const response of [new Response(null, { status: 204 }), new Response(new Uint8Array()), new Response(new Uint8Array(2), { status: 206, headers: { "Content-Range": "bytes 0-1/9007199254740992" } })]) {
    mock.method(globalThis, "fetch", async () => response); await assert.rejects(audio.readStudentAudioBlob(asset())); mock.restoreAll();
  }
});

test("existing inline audio remains supported and external references receive no credentials", async () => {
  signIn(); const original = globalThis.fetch;
  const inline = { ...asset(), storagePath: undefined, audioDataUrl: "data:audio/wav;base64,AQID" };
  assert.deepEqual([...new Uint8Array(await (await audio.readStudentAudioBlob(inline)).arrayBuffer())], [1, 2, 3]);
  let calls = 0; mock.method(globalThis, "fetch", async (...args: Parameters<typeof fetch>) => { calls++; return original(...args); });
  for (const path of ["private-space-files/room/bad/extra", "https://synthetic.invalid/private", "spaces/room/assignments/task/submissions/pupil/audio/../x"])
    await assert.rejects(audio.readStudentAudioBlob(asset(path)));
  await assert.rejects(files.fetchAuthenticatedFileBlob("https://synthetic.invalid/token")); assert.equal(calls, 0);
});

function sequence() {
  const ids = ["one", "two", "three"];
  const config = { segments: ids.map(id => ({ id, title: id, hint: "" })) } as import("../../podcastWorkshop").PodcastWorkshopConfig;
  const submission = { customSegments: [], productionMix: { introSoundId: "", transitionSoundId: "", transitionSoundIds: {}, outroSoundId: "" },
    productionSegments: Object.fromEntries(ids.map(id => [id, { voice: asset(`private-space-files/room/${id}`) }])) } as unknown as import("../../podcastWorkshop").PodcastWorkshopSubmission;
  return { config, submission };
}
test("export manifest preserves three expected voices and fails on any missing segment", () => {
  const { config, submission } = sequence();
  assert.deepEqual(podcast.podcastExportClips(config, submission).map(clip => clip.label), ["one", "two", "three"]);
  delete submission.productionSegments.two;
  assert.throws(() => podcast.podcastExportClips(config, submission), /segment missing/);
});
test("custom segments and configured effects are included in order; optional silence does not hide missing voices", () => {
  const { config, submission } = sequence();
  submission.customSegments = [{ id: "custom", title: "custom", hint: "" }];
  assert.throws(() => podcast.podcastExportClips(config, submission), /segment missing/);
  submission.productionSegments.custom = { voice: asset(), volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0 };
  submission.productionMix.introSoundId = "intro_warm"; submission.productionMix.transitionSoundId = "transition_ding"; submission.productionMix.outroSoundId = "outro_soft";
  const clips = podcast.podcastExportClips(config, submission);
  assert.deepEqual(clips.filter(clip => clip.asset).map(clip => clip.label), ["one", "two", "three", "custom"]);
  assert.equal(clips.length, 9); assert.equal(clips[0].url, "/audio/podcast-library/intro-warm.mp3");
  assert.equal(clips[8].url, "/audio/podcast-library/outro-soft.mp3");
});
test("empty and duplicate segment manifests are rejected", () => {
  const { config, submission } = sequence(); config.segments = []; assert.throws(() => podcast.podcastExportClips(config, submission));
  config.segments = [{ id: "one", title: "1", hint: "" }, { id: "one", title: "2", hint: "" }]; assert.throws(() => podcast.podcastExportClips(config, submission));
});
