import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

// Deliberately require a local emulator; these tests must never contact production.
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
let env: RulesTestEnvironment;
before(async () => {
  assert.ok(emulator, "Set FIRESTORE_EMULATOR_HOST to a running local Firestore emulator.");
  const [host, port] = emulator.split(":");
  assert.ok(["localhost", "127.0.0.1"].includes(host), "Only a local emulator is allowed.");
  env = await initializeTestEnvironment({
    projectId: "demo-lesson-domain", firestore: { host, port: Number(port), rules: await readFile("firestore.rules", "utf8") },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", "alice"), { role: "teacher" }),
      setDoc(doc(db, "users", "bob"), { role: "teacher" }),
      setDoc(doc(db, "users", "admin"), { role: "admin" }),
      setDoc(doc(db, "lessons", "private"), { ownerId: "alice", title: "Private", status: "draft" }),
      setDoc(doc(db, "lessons", "legacy-private"), { ownerId: "alice", title: "Legacy" }),
      setDoc(doc(db, "lessons", "published-private"), { ownerId: "alice", status: "published", publishVisibility: "private" }),
      setDoc(doc(db, "lessons", "active-private"), { ownerId: "alice", isActive: true, visibility: "private" }),
      setDoc(doc(db, "lessons", "nested-private"), { ownerId: "alice", status: "published", publish: { visibility: "private" } }),
      setDoc(doc(db, "lessons", "published"), { ownerId: "alice", status: "published" }),
      setDoc(doc(db, "lessons", "unlisted"), { ownerId: "alice", status: "unlisted" }),
      setDoc(doc(db, "lessons", "legacy-active"), { ownerId: "alice", isActive: true }),
      setDoc(doc(db, "published_lessons", "public"), { ownerId: "alice", isActive: true }),
    ]);
  });
});
after(async () => { await env?.cleanup(); });

test("known document ID does not grant access to another user's private draft", async () => {
  const owner = env.authenticatedContext("alice").firestore();
  const other = env.authenticatedContext("bob").firestore();
  const admin = env.authenticatedContext("admin").firestore();
  const anonymous = env.unauthenticatedContext().firestore();
  for (const id of ["private", "legacy-private", "published-private", "active-private", "nested-private"]) {
    await assertSucceeds(getDoc(doc(owner, "lessons", id)));
    await assertSucceeds(getDoc(doc(admin, "lessons", id)));
    await assertFails(getDoc(doc(other, "lessons", id)));
    await assertFails(getDoc(doc(anonymous, "lessons", id)));
  }
});

test("My Content owner queries work and other-owner draft queries fail", async () => {
  const db = env.authenticatedContext("alice").firestore();
  await assertSucceeds(getDocs(query(collection(db, "lessons"), where("ownerId", "==", "alice"))));
  await assertFails(getDocs(query(collection(db, "lessons"), where("ownerId", "==", "bob"))));
});

test("published, unlisted, legacy-active and Library read behavior is preserved", async () => {
  const db = env.authenticatedContext("bob").firestore();
  for (const id of ["published", "unlisted", "legacy-active"]) {
    await assertSucceeds(getDoc(doc(db, "lessons", id)));
  }
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), "published_lessons", "public")));
});

test("owner can edit while ownership transfers, removal, replacement and foreign writes fail", async () => {
  const db = env.authenticatedContext("alice").firestore();
  const ref = doc(db, "lessons", "private");
  await assertSucceeds(updateDoc(ref, { title: "Edited", ownerId: "alice" }));
  await assertFails(updateDoc(ref, { ownerId: "bob" }));
  await assertFails(updateDoc(ref, { ownerId: deleteField() }));
  await assertFails(setDoc(ref, { title: "Replace without owner" }));
  await assertFails(updateDoc(doc(env.authenticatedContext("bob").firestore(), "lessons", "private"), { title: "Foreign edit" }));
  await assertFails(setDoc(doc(db, "lessons", "client-created"), { ownerId: "alice", status: "draft" }));
  assert.equal((await getDoc(ref)).data()?.ownerId, "alice");
});
