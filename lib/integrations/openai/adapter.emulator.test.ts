import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { initializeApp, deleteApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import { firestoreAdapter, OAUTH_STATE_COLLECTION, stateId } from "./adapter";
import { firebaseOAuthServices, DELEGATIONS_COLLECTION } from "./services";
import { IntegrationError } from "./config";

const host = process.env.FIRESTORE_EMULATOR_HOST;
test("Firestore adapter atomically consumes once, preserves markers, expires and revokes artifacts", { skip: !host }, async () => {
  assert.ok(host && /^(127\.0\.0\.1|localhost):\d+$/.test(host), "Only a local emulator is allowed.");
  const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const app = initializeApp({ projectId: "demo-321school-openai", credential: cert({
    projectId: "demo-321school-openai", clientEmail: "emulator@example.invalid", privateKey,
  }) }, `oauth-adapter-${Date.now()}`);
  const db = getFirestore(app);
  const factory = firestoreAdapter(db);
  const code = factory("AuthorizationCode");
  const access = factory("AccessToken");
  const refresh = factory("RefreshToken");
  const id = `code-${Date.now()}`;
  try {
    await code.upsert(id, { kind: "AuthorizationCode", grantId: id }, 60);
    const consumed = await Promise.allSettled([code.consume(id), code.consume(id)]);
    assert.equal(consumed.filter((result) => result.status === "fulfilled").length, 1);
    assert.ok((await code.find(id))?.consumed);
    await code.upsert(id, { kind: "AuthorizationCode", grantId: id }, 60);
    assert.ok((await code.find(id))?.consumed, "stale writes cannot revive a consumed authorization code");
    await access.upsert(id, { kind: "AccessToken", grantId: id }, 60);
    await refresh.upsert(id, { kind: "RefreshToken", grantId: id }, 86400);
    const refreshRace = await Promise.allSettled([refresh.consume(id), refresh.consume(id)]);
    assert.equal(refreshRace.filter(result => result.status === "fulfilled").length, 1);
    await refresh.upsert(id, { kind: "RefreshToken", grantId: id }, 86400);
    assert.ok((await refresh.find(id))?.consumed, "stale refresh writes cannot revive a rotated token");
    assert.equal((await access.find(id))?.kind, "AccessToken", "model IDs cannot collide");
    await db.collection(OAUTH_STATE_COLLECTION).doc(stateId("AccessToken", id)).update({ expiresAt: new Date(1) });
    assert.equal(await access.find(id), undefined, "expiry is checked without waiting for TTL cleanup");
    await access.upsert(id, { kind: "AccessToken", grantId: id }, 60);
    await code.revokeByGrantId(id);
    assert.equal(await code.find(id), undefined);
    assert.equal(await access.find(id), undefined);
    assert.equal(await refresh.find(id), undefined, "grant revocation deletes refresh artifacts too");
  } finally {
    await Promise.all([code.destroy(id), access.destroy(id), refresh.destroy(id)]);
    await deleteApp(app);
  }
});

test("Firebase bridge verifies revocation, denies anonymous/disabled accounts and persists server-owned grants", { skip: !host }, async () => {
  assert.ok(host && /^(127\.0\.0\.1|localhost):\d+$/.test(host), "Only a local emulator is allowed.");
  const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const app = initializeApp({ projectId: "demo-321school-openai", credential: cert({
    projectId: "demo-321school-openai", clientEmail: "emulator@example.invalid", privateKey,
  }) }, `oauth-firebase-${Date.now()}`);
  const db = getFirestore(app);
  const uid = `bridge-${Date.now()}`;
  const authTime = Math.floor(Date.now() / 1000);
  const state = { disabled: false, anonymous: false, revoked: false };
  const auth = {
    async verifyIdToken(token: string, checkRevoked: boolean) {
      assert.equal(checkRevoked, true);
      if (token !== "valid-firebase-proof" || state.revoked) throw new Error("invalid proof");
      return { uid, auth_time: authTime, firebase: { sign_in_provider: state.anonymous ? "anonymous" : "password" } };
    },
    async getUser(identity: string) {
      assert.equal(identity, uid);
      return { uid, disabled: state.disabled, tokensValidAfterTime: new Date(0).toUTCString() };
    },
  } as unknown as Auth;
  const config = { allowedUids: new Set([uid]), clientId: "private-chatgpt" };
  const services = firebaseOAuthServices(config, { auth, db });
  const profile = db.collection("users").doc(uid);
  const grantId = `${uid}-grant`;
  try {
    await profile.set({ disabled: false, role: "teacher" });
    assert.equal((await services.verifyFirebaseToken("valid-firebase-proof")).uid, uid);
    await assert.rejects(services.verifyFirebaseToken("invalid"), IntegrationError);
    assert.equal(await services.getIdentity("foreign-uid"), undefined);
    state.anonymous = true;
    await assert.rejects(services.verifyFirebaseToken("valid-firebase-proof"), IntegrationError);
    state.anonymous = false; state.disabled = true;
    assert.equal(await services.getIdentity(uid), undefined);
    state.disabled = false; state.revoked = true;
    await assert.rejects(services.verifyFirebaseToken("valid-firebase-proof"), IntegrationError);
    state.revoked = false;
    await profile.update({ disabled: true });
    assert.equal(await services.getIdentity(uid), undefined);
    await profile.update({ disabled: false });
    await services.saveBinding(grantId, { uid, clientId: config.clientId, authTime, revoked: false, expiresAt: authTime + 300 });
    assert.equal((await services.getBinding(grantId))?.uid, uid);
    await services.revokeForUser(uid);
    assert.equal((await services.getBinding(grantId))?.revoked, true);
    for (let i = 0; i < 30; i++) await services.checkRateLimit(uid);
    await assert.rejects(services.checkRateLimit(uid), (error) => error instanceof IntegrationError && error.status === 429);
  } finally {
    await profile.delete();
    const bindings = await db.collection(DELEGATIONS_COLLECTION).where("uid", "==", uid).get();
    for (const doc of bindings.docs) await doc.ref.delete();
    await deleteApp(app);
  }
});
