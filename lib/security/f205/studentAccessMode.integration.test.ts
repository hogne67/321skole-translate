import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { initializeApp as initializeClient, deleteApp as deleteClient } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithCredential, signInWithEmailAndPassword, linkWithCredential, createUserWithEmailAndPassword, EmailAuthProvider, OAuthProvider } from "firebase/auth";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { POST as changeAccessMode } from "../../../app/api/student/access-mode/route";
import { getStudentAccessMode, getEffectiveStudentModeForToken } from "../../studentAccessMode";
import { getEffectiveStudentModeForAccount } from "../../studentAccessMode.server";
import { getFeatureDecisionFromProfile } from "../../featureAccess";

const projectId = "demo-feide-boundary";
const nonce = randomUUID().slice(0, 8);
const app = initializeApp({ projectId });
const admin = getFirestore(app);
const authApp = initializeClient({ apiKey: "synthetic-api-key", projectId, authDomain: `${projectId}.invalid` }, "f205-access-mode");
const auth = getAuth(authApp);
let env: RulesTestEnvironment;

function oidc(subject: string) {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return new OAuthProvider("oidc.feide").credential({ idToken: `${part({ alg: "none", typ: "JWT" })}.${part({ iss: "https://synthetic-idp.invalid", aud: "synthetic", sub: subject, email: `${subject}@synthetic.invalid`, email_verified: true })}.` });
}

async function accessRequest(token: string, studentAccessMode: string) {
  return changeAccessMode(new Request("http://127.0.0.1/api/student/access-mode", { method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ studentAccessMode }),
  }) as never);
}

function client(uid: string, provider: "oidc.feide" | "password", identities: Record<string, unknown> = {}) {
  return env.authenticatedContext(uid, {
    firebase: { sign_in_provider: provider as never, identities },
  }).firestore();
}

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  env = await initializeTestEnvironment({ projectId, firestore: {
    host: "127.0.0.1", port: 8080, rules: await readFile("firestore.rules", "utf8"),
  } });
  await env.clearFirestore();
  for (const uid of ["feide", "linked", "school", "private", "legacy"]) {
    await admin.doc(`users/${uid}`).set({ role: "student", studentAccessMode: "space_only" });
  }
  await admin.doc("users/school").update({ schoolId: "schoolA", schoolStatus: "active" });
  await admin.doc("users/legacy").update({ studentAccessMode: "self_study" });
});

after(async () => { await env?.cleanup(); await deleteClient(authApp); await deleteApp(app); });

test("Feide login cannot activate self-study via Firestore", async () => {
  const db = client("feide", "oidc.feide", { "oidc.feide": ["synthetic"] });
  await assertFails(updateDoc(doc(db, "users/feide"), { studentAccessMode: "self_study" }));
  await assertSucceeds(updateDoc(doc(db, "users/feide"), { locale: "nb" }));
});

test("linked Feide identity cannot bypass with password sign-in", async () => {
  const db = client("linked", "password", { email: ["synthetic@example.invalid"], "oidc.feide": ["synthetic"] });
  await assertFails(updateDoc(doc(db, "users/linked"), { studentAccessMode: "self_study" }));
});

test("active school student cannot activate self-study", async () => {
  const db = client("school", "password", { email: ["synthetic@example.invalid"] });
  await assertFails(updateDoc(doc(db, "users/school"), { studentAccessMode: "self_study" }));
});

test("individual student uses server API rather than direct Firestore writes for self-study", async () => {
  const db = client("private", "password", { email: ["synthetic@example.invalid"] });
  await assertFails(updateDoc(doc(db, "users/private"), { studentAccessMode: "self_study" }));
});

test("individual student can create a space-only profile", async () => {
  const db = client("new-private", "password", { email: ["synthetic@example.invalid"] });
  await assertFails(setDoc(doc(db, "users/new-private"), { role: "student", studentAccessMode: "self_study" }));
  await assertSucceeds(setDoc(doc(db, "users/new-private"), { role: "student", studentAccessMode: "space_only" }));
});

test("Feide cannot create self-study profile but can create space-only profile", async () => {
  const db = client("new-feide", "oidc.feide", { "oidc.feide": ["synthetic"] });
  await assertFails(setDoc(doc(db, "users/new-feide"), { role: "student", studentAccessMode: "self_study" }));
  await assertSucceeds(setDoc(doc(db, "users/new-feide"), { role: "student", studentAccessMode: "space_only" }));
});

test("legacy self-study Feide profile still permits unrelated profile changes", async () => {
  const db = client("legacy", "oidc.feide", { "oidc.feide": ["synthetic"] });
  await assertSucceeds(updateDoc(doc(db, "users/legacy"), { locale: "nb" }));
  assert.equal((await admin.doc("users/legacy").get()).get("studentAccessMode"), "self_study");
});

test("effective client mode keeps legacy Feide and school students in Spaces", () => {
  assert.equal(getStudentAccessMode({ role: "student", studentAccessMode: "self_study" }, { isFeideLinked: true }), "space_only");
  assert.equal(getStudentAccessMode({ role: "student", studentAccessMode: "self_study", schoolId: "schoolA", schoolStatus: "active" }), "space_only");
  assert.equal(getStudentAccessMode({ role: "student", studentAccessMode: "self_study" }), "self_study");
});

test("server feature mode overrides legacy values from verified identity", () => {
  const legacy = { role: "student", studentAccessMode: "self_study" };
  assert.equal(getEffectiveStudentModeForToken(legacy, { firebase: {
    sign_in_provider: "password", identities: { "oidc.feide": ["synthetic"] },
  } }), "space_only");
  assert.equal(getEffectiveStudentModeForToken({ ...legacy, schoolId: "schoolA", schoolStatus: "active" }, null), "space_only");
  assert.equal(getEffectiveStudentModeForToken(legacy, { firebase: {
    sign_in_provider: "password", identities: { email: ["synthetic@example.invalid"] },
  } }), "self_study");
  assert.equal(getFeatureDecisionFromProfile({ ...legacy, schoolId: "schoolA", schoolStatus: "active",
    plan: "free", feature: "producer_create_lesson" }).allowed, false);
});

test("activation API rejects Feide account and preserves its mode", async () => {
  const user = (await signInWithCredential(auth, oidc(`api-feide-${nonce}`))).user;
  await admin.doc(`users/${user.uid}`).set({ role: "student", studentAccessMode: "space_only" });
  const response = await accessRequest(await user.getIdToken(), "self_study");
  assert.equal(response.status, 403);
  assert.equal((await admin.doc(`users/${user.uid}`).get()).get("studentAccessMode"), "space_only");
});

test("activation API permits separate individual account", async () => {
  const user = (await createUserWithEmailAndPassword(auth, `individual-${nonce}@synthetic.invalid`, "Synthetic-Test-Password-11!")).user;
  await getAdminAuth(app).updateUser(user.uid, { emailVerified: true });
  await admin.doc(`users/${user.uid}`).set({ role: "student", studentAccessMode: "space_only" });
  const response = await accessRequest(await user.getIdToken(true), "self_study");
  assert.equal(response.status, 200);
  assert.equal((await admin.doc(`users/${user.uid}`).get()).get("studentAccessMode"), "self_study");
});

test("activation API rejects an active school student", async () => {
  const user = (await createUserWithEmailAndPassword(auth, `school-student-${nonce}@synthetic.invalid`, "Synthetic-Test-Password-13!")).user;
  await getAdminAuth(app).updateUser(user.uid, { emailVerified: true });
  await admin.doc(`users/${user.uid}`).set({ role: "student", studentAccessMode: "space_only", schoolId: "schoolA", schoolStatus: "active" });
  const response = await accessRequest(await user.getIdToken(true), "self_study");
  assert.equal(response.status, 403);
  assert.equal((await admin.doc(`users/${user.uid}`).get()).get("studentAccessMode"), "space_only");
});

test("real emulator token retains linked Feide identity after password sign-in", async () => {
  const user = (await signInWithCredential(auth, oidc(`linked-password-${nonce}`))).user;
  const passwordEmail = `linked-password-login-${nonce}@synthetic.invalid`;
  await linkWithCredential(user, EmailAuthProvider.credential(passwordEmail, "Synthetic-Test-Password-12!"));
  const passwordUser = (await signInWithEmailAndPassword(auth, passwordEmail, "Synthetic-Test-Password-12!")).user;
  const decoded = await getAdminAuth(app).verifyIdToken(await passwordUser.getIdToken(true));
  assert.equal(decoded.firebase.sign_in_provider, "password");
  assert.ok(Object.hasOwn(decoded.firebase.identities, "oidc.feide"));
  await admin.doc(`users/${passwordUser.uid}`).set({ role: "student", studentAccessMode: "space_only" });
  const response = await accessRequest(await passwordUser.getIdToken(), "self_study");
  assert.equal(response.status, 403);
});

test("server checks live Auth when a token predates Feide linking", async () => {
  const user = (await createUserWithEmailAndPassword(auth, `prelink-${nonce}@synthetic.invalid`, "Synthetic-Test-Password-14!")).user;
  const oldToken = await getAdminAuth(app).verifyIdToken(await user.getIdToken());
  assert.equal(getEffectiveStudentModeForToken({ role: "student", studentAccessMode: "self_study" }, oldToken), "self_study");
  await linkWithCredential(user, oidc(`prelink-${nonce}`));
  assert.equal(await getEffectiveStudentModeForAccount({ role: "student", studentAccessMode: "self_study" }, oldToken), "space_only");
});
