import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type Transaction } from "firebase-admin/firestore";
import { setLogFunction } from "@google-cloud/firestore";

const app = initializeApp({ projectId: "demo-security-round1" });
const db = getFirestore(app);
const events: Record<string, unknown>[] = [];
const observations: Record<string, unknown>[] = [];
let operation = "setup", serial = 0;
const info = (error: unknown) => ({ code: (error as {code?: unknown})?.code, message: error instanceof Error ? error.message : String(error) });
const request = (uid: string, body: object) => new Request("http://localhost/api/synthetic", {
  method: "POST", headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
});
before(() => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188");
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, "demo-security-round1");
  mock.method(getAuth(app), "verifyIdToken", async (token: string, revoked: boolean) => {
    assert.equal(revoked, true);
    return { uid: token, email: `${token}@synthetic.invalid`, name: "Synthetic teacher", auth_time: 2000 };
  });
  const run = db.runTransaction.bind(db);
  mock.method(db, "runTransaction", (callback: (tx: Transaction) => Promise<unknown>, options?: FirebaseFirestore.ReadWriteTransactionOptions) => {
    const call = ++serial, label = operation; let attempt = 0;
    return run(async tx => {
      const n = ++attempt;
      events.push({ event: "callback-start", call, label, attempt: n });
      try { const result = await callback(tx); events.push({ event: "callback-result", call, label, attempt: n }); return result; }
      catch (error) { events.push({ event: "callback-error", call, label, attempt: n, ...info(error) }); throw error; }
    }, options).then(result => { events.push({ event: "transaction-success", call, label, attempts: attempt }); return result; }, error => {
      events.push({ event: "transaction-error", call, label, attempts: attempt, ...info(error) }); throw error;
    });
  });
  setLogFunction(message => {
    if (message.includes('Firestore.runTransaction') && /Retrying transaction|not eligible|rollback failed/.test(message)) {
      events.push({ event: "sdk-retry-log", label: operation, message });
    }
  });
});
after(async () => {
  const output = process.env.PHASE2_RESULT_DIR;
  assert.ok(output && output.includes("security-licence-local"));
  await writeFile(path.join(output, "diagnostic.json"), JSON.stringify({ observations, events }, null, 2), { flag: "wx" });
  setLogFunction(null); mock.restoreAll(); await deleteApp(app);
});

function rendezvous() {
  let arrivals = 0, release: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  return async () => {
    if (++arrivals === 2) release();
    let timer: ReturnType<typeof setTimeout>;
    try { await Promise.race([wait, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Diagnostic barrier timeout")), 5000); })]); }
    finally { clearTimeout(timer!); }
  };
}

for (const mode of ["serial", "concurrent", "synchronised"] as const) test(`raw SDK transactions: ${mode}, one shared lock and query`, async () => {
  operation = `raw-${mode}`;
  const lock = db.doc(`diagnosticLocks/${mode}`), rows = db.collection(`diagnosticRows-${mode}`);
  await lock.set({ revision: 0 });
  const gate = rendezvous();
  const run = (candidate: string) => {
    let attempt = 0;
    return db.runTransaction(async tx => {
      await tx.get(lock);
      if (mode === "synchronised" && ++attempt === 1) await gate();
      const snapshot = await tx.get(rows);
      if (snapshot.size >= 1) return 403;
      tx.update(lock, { revision: 1 }); tx.create(rows.doc(candidate), { synthetic: true });
      return 200;
    }).then(status => ({ status }), error => ({ status: 500, ...info(error) }));
  };
  const results = mode === "serial" ? [await run("one"), await run("two")] : await Promise.all([run("one"), run("two")]);
  const count = (await rows.get()).size;
  observations.push({ operation, results, activeCount: count, limit: 1 });
  assert.equal(count, 1); assert.equal(results.filter(r => r.status === 200).length, 1);
  if (mode === "serial") assert.deepEqual(results.map(r => r.status), [200,403]);
});

for (let round = 1; round <= 3; round++) test(`original pupil quota request shape, round ${round}`, async () => {
  operation = `pupil-${round}`;
  const uid = `quota-teacher-${round}`, spaceId = `quota-space-${round}`;
  await db.doc(`users/${uid}`).set({ role: "teacher", plan: "free" });
  await db.doc(`spaces/${spaceId}`).set({ ownerId: uid, ownerUid: uid });
  const { createOrLinkTeacherPupil } = await import("../server/teacherPupilRoster");
  const roster = (name: string) => createOrLinkTeacherPupil(request(uid, { displayName: name }), { params: Promise.resolve({ spaceId }) });
  for (let i = 0; i < 9; i++) assert.equal((await roster(`Synthetic ${i}`)).status, 200);
  const results = await Promise.all([roster("Last A"),roster("Last B")]);
  const count = (await db.collection("spaceMembers").where("spaceId","==",spaceId).where("role","==","student").get()).size;
  observations.push({ operation, statuses: results.map(r=>r.status).sort(), activeCount: count, limit: 10 });
  assert.equal(count,10); assert.equal(results.filter(r=>r.status===200).length,1);
  assert.ok(results.every(r=>[200,403,500].includes(r.status)));
});

for (let round = 1; round <= 3; round++) for (const kind of ["activate", "invite", "mixed", "accept"] as const) test(`school last seat: ${kind}, round ${round}`, async () => {
  operation = `school-${kind}-${round}`;
  const schoolId=operation, admin=`admin-${schoolId}`, candidates=[`a-${schoolId}`,`b-${schoolId}`];
  await db.doc(`schools/${schoolId}`).set({ status:"active", teacherSeatLimit:1 });
  await db.doc(`users/${admin}`).set({ role:"teacher", schoolId, schoolRole:"school_admin", schoolStatus:"active" });
  await db.doc(`schools/${schoolId}/members/${admin}`).set({ uid:admin, role:"school_admin", status:"active" });
  for(const uid of candidates){
    await db.doc(`users/${uid}`).set({ role:"teacher", schoolId, schoolRole:"school_teacher", schoolStatus:"disabled" });
    await db.doc(`schools/${schoolId}/members/${uid}`).set({ uid, role:"school_teacher", status:"disabled" });
  }
  const activation=await import("../../app/api/schools/activate-teacher/route");
  const invitation=await import("../../app/api/schools/invite/route");
  const acceptance=await import("../../app/api/schools/accept-invite/route");
  const activate=(uid:string)=>activation.POST(request(admin,{schoolId,targetUid:uid}));
  const invite=(uid:string)=>invitation.POST(request(admin,{schoolId,email:`${uid}@synthetic.invalid`,sendEmail:false}));
  let jobs: Promise<Response>[];
  if(kind==="accept"){
    // Deliberately over-reserved legacy fixture: two old invitations, one current place.
    const {hashInviteToken}=await import("../schools/server/tokens");
    for(const uid of candidates) await db.doc(`schoolInvites/${uid}`).set({schoolId,email:`${uid}@synthetic.invalid`,role:"school_teacher",status:"pending",inviteTokenHash:hashInviteToken(uid),expiresAt:Timestamp.fromMillis(Date.now()+60000),invitedByUid:admin});
    jobs=candidates.map(uid=>acceptance.POST(request(uid,{token:uid})));
  }else jobs=kind==="activate"?candidates.map(activate):kind==="invite"?candidates.map(invite):[activate(candidates[0]),invite(candidates[1])];
  const results=await Promise.all(jobs), statuses=results.map(r=>r.status).sort();
  const bodies=await Promise.all(results.map(r=>r.json()));
  const active=(await db.collection(`schools/${schoolId}/members`).where("role","==","school_teacher").where("status","==","active").get()).size;
  const pending=(await db.collection("schoolInvites").where("schoolId","==",schoolId).where("status","==","pending").get()).size;
  observations.push({operation,statuses,reasons:bodies.map(b=>b.reason??b.error??"ok"),activeCount:active,pending,limit:1});
  assert.ok(active<=1); if(kind!=="accept")assert.ok(active+pending<=1);
  assert.equal(statuses.filter(s=>s===200).length,1);
  // Diagnostic baseline preserves existing 400 school-route contract; records all errors.
  assert.ok(statuses.every(s=>[200,400,500].includes(s)));
});
