import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { POST } from "../../app/api/usage/log/route";
import { getBucketLimit } from "../featureAccess";

let env: RulesTestEnvironment;
const projectId = "demo-security-round1";
const app = initializeApp({ projectId });
const db = getFirestore(app);
let token: string;
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9098");
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, projectId);
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  env = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 8188, rules: await readFile("firestore.rules", "utf8") } });
  for (const role of ["student", "teacher", "admin", "disabled"]) await db.doc(`users/ga01-${role}`).set({ role: role === "disabled" ? "admin" : role, disabled: role === "disabled", plan: "free" });
  await db.doc("analyticsEvents/ga01-historical").create({ event: "historical-fixture", createdAt: "synthetic-old" });
  await getAuth(app).createUser({ uid: "ga01-teacher" });
  const custom = await getAuth(app).createCustomToken("ga01-teacher");
  const response = await fetch("http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }) });
  assert.equal(response.status, 200);
  token = (await response.json()).idToken;
  assert.equal((await getAuth(app).verifyIdToken(token, true)).uid, "ga01-teacher");
});
after(async () => { await env?.cleanup(); await deleteApp(app); });

for (const role of ["anonymous", "student", "teacher", "admin"]) test(`${role} cannot create product events directly`, async () => {
  const own = role === "anonymous" ? env.unauthenticatedContext().firestore() : env.authenticatedContext(`ga01-${role}`).firestore();
  await assertFails(setDoc(doc(own, "analyticsEvents", `ga01-new-${role}`), { event: "page_view" }));
});

test("historical admin reads remain, and nobody can rewrite or delete history", async () => {
  const admin = env.authenticatedContext("ga01-admin").firestore();
  assert.equal((await assertSucceeds(getDoc(doc(admin, "analyticsEvents/ga01-historical")))).data()?.event, "historical-fixture");
  await assertSucceeds(getDocs(collection(admin, "analyticsEvents")));
  await assertFails(updateDoc(doc(admin, "analyticsEvents/ga01-historical"), { event: "changed" }));
  await assertFails(deleteDoc(doc(admin, "analyticsEvents/ga01-historical")));
  for (const role of ["student", "teacher", "disabled"]) await assertFails(getDoc(doc(env.authenticatedContext(`ga01-${role}`).firestore(), "analyticsEvents/ga01-historical")));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "analyticsEvents/ga01-historical")));
});

function request(auth = true) { return new Request("http://127.0.0.1/api/usage/log", { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ feature: "ai_generate_text", contentId: "DO-NOT-STORE", contentType: "lesson", source: "producer", path: "/private-navigation" }) }); }

test("real authenticated quota transaction works and writes only the operational ledger", async () => {
  assert.equal((await POST(request(false))).status, 401);
  const response = await POST(request());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.amount, 3);
  assert.equal(result.used, 3);
  const usage = (await db.doc(`users/ga01-teacher/usage/${result.monthId}`).get()).data();
  assert.equal(usage?.premium_generators, 3);
  const events = await db.collection("usageEvents").where("uid", "==", "ga01-teacher").get();
  assert.equal(events.size, 1);
  assert.deepEqual(Object.keys(events.docs[0].data()).sort(), ["uid", "feature", "bucket", "amount", "monthId", "createdAt"].sort());
  const limit = getBucketLimit("teacher", "free", "premium_generators");
  await db.doc(`users/ga01-teacher/usage/${result.monthId}`).update({ premium_generators: limit });
  assert.equal((await POST(request())).status, 429);
  assert.equal((await db.collection("usageEvents").where("uid", "==", "ga01-teacher").get()).size, 1);
  assert.equal((await db.collection("analyticsEvents").get()).size, 1);
  assert.equal((await db.doc("analyticsEvents/ga01-historical").get()).data()?.event, "historical-fixture");
});
