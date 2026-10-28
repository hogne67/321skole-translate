import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { Transaction } from "firebase-admin/firestore";

const app=initializeApp({projectId:"demo-security-round1"}),db=getFirestore(app);
const schoolId="fault-school",uid="fault-teacher",admin="fault-admin",spaceId="fault-space";
before(async()=>{
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8188");
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT,"demo-security-round1");
  mock.method(getAuth(app),"verifyIdToken",async(token:string,revoked:boolean)=>{
    assert.equal(revoked,true);return{uid:token,email:`${token}@synthetic.invalid`,name:"Synthetic",auth_time:2000};
  });
  await db.doc(`schools/${schoolId}`).set({status:"active",teacherSeatLimit:1});
  await db.doc(`users/${admin}`).set({role:"teacher",schoolId,schoolRole:"school_admin",schoolStatus:"active"});
  await db.doc(`schools/${schoolId}/members/${admin}`).set({uid:admin,role:"school_admin",status:"active"});
  await db.doc(`users/${uid}`).set({role:"teacher",plan:"free",schoolId,schoolRole:"school_teacher",schoolStatus:"disabled"});
  await db.doc(`schools/${schoolId}/members/${uid}`).set({uid,role:"school_teacher",status:"disabled"});
  await db.doc(`schools/${schoolId}/members/existing`).set({uid:"existing",role:"school_teacher",status:"active"});
  await db.doc(`spaces/${spaceId}`).set({ownerId:uid,ownerUid:uid});
  const {hashInviteToken}=await import("../schools/server/tokens");
  await db.doc("schoolInvites/fault-invite").set({schoolId,email:`${uid}@synthetic.invalid`,role:"school_teacher",status:"pending",inviteTokenHash:hashInviteToken("synthetic-fault-invite"),expiresAt:Timestamp.fromMillis(Date.now()+600000)});
  for(let i=0;i<10;i++)await db.doc(`spaceMembers/${spaceId}_synthetic${i}`).set({spaceId,role:"student",participantId:`synthetic${i}`,teacherStudentId:`synthetic${i}`,status:"active",active:true,archived:false});
});
after(async()=>{mock.restoreAll();await deleteApp(app);});
const request=(actor:string,body:object)=>new Request("http://localhost/api/synthetic",{method:"POST",headers:{Authorization:`Bearer ${actor}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
async function invoke(kind:string){
  if(kind==="pupil")return(await import("../server/teacherPupilRoster")).createOrLinkTeacherPupil(request(uid,{displayName:"Synthetic"}),{params:Promise.resolve({spaceId})});
  if(kind==="activate")return(await import("../../app/api/schools/activate-teacher/route")).POST(request(admin,{schoolId,targetUid:uid}));
  if(kind==="invite")return(await import("../../app/api/schools/invite/route")).POST(request(admin,{schoolId,email:"new@synthetic.invalid",sendEmail:false}));
  return(await import("../../app/api/schools/accept-invite/route")).POST(request(uid,{token:"synthetic-fault-invite"}));
}
async function state(){
  const paths=[`schools/${schoolId}`,`users/${uid}`,`schools/${schoolId}/members/${uid}`,"schoolInvites/fault-invite"];
  return JSON.stringify({documents:await Promise.all(paths.map(async p=>(await db.doc(p).get()).data())),pupils:(await db.collection("spaceMembers").where("spaceId","==",spaceId).get()).size,invites:(await db.collection("schoolInvites").get()).size});
}
for(const kind of ["pupil","activate","invite","accept"]){
  test(`${kind}: actual capacity rejection preserves current HTTP contract and data`,async()=>{
    const before=await state(),response=await invoke(kind),body=await response.json();
    assert.equal(response.status,kind==="pupil"?403:400);
    if(kind!=="pupil")assert.equal(body.reason,"seat_limit_reached");
    assert.equal(await state(),before);
  });
  for(const [code,message] of [[3,"Transaction is invalid or closed."],[3,"Unrelated invalid argument"],[10,"Contention exhausted"],[14,"Service unavailable"]] as const){
    test(`${kind}: operational error ${code} (${message}) stays 500 and makes no mutation`,async()=>{
      const before=await state();
      const fault=mock.method(db,"runTransaction",async()=>{throw Object.assign(new Error(message),{code});});
      let response:Response;
      try{response=await invoke(kind);}finally{fault.mock.restore();}
      const body=await response.json();assert.equal(response.status,500);assert.notEqual(body.reason,"seat_limit_reached");
      assert.equal(fault.mock.callCount(),1,"The injected transaction error must actually be reached");
      assert.equal(await state(),before);
    });
  }
}
for(let round=1;round<=3;round++)test(`reserved final seat: accept, invite and reactivate together, round ${round}`,async()=>{
  const id=`reserved-race-${round}`,actor=`admin-${id}`,accepted=`accepted-${id}`,former=`former-${id}`;
  await db.doc(`schools/${id}`).set({status:"active",teacherSeatLimit:2});
  await db.doc(`schools/${id}/members/existing`).set({uid:"existing",role:"school_teacher",status:"active"});
  await db.doc(`schools/${id}/members/${actor}`).set({uid:actor,role:"school_admin",status:"active"});
  await db.doc(`users/${actor}`).set({role:"teacher",schoolId:id,schoolRole:"school_admin",schoolStatus:"active"});
  await db.doc(`schools/${id}/members/${former}`).set({uid:former,role:"school_teacher",status:"disabled"});
  await db.doc(`users/${former}`).set({role:"teacher",schoolId:id,schoolRole:"school_teacher",schoolStatus:"disabled"});
  const {createSchoolInvites}=await import("../schools/server/createSchoolInvite");
  const created=await createSchoolInvites({schoolId:id,invitedBy:actor,recipients:[{email:`${accepted}@synthetic.invalid`}]});
  assert.equal(created.ok,true);const invitation=created.invites![0];
  const accept=await import("../../app/api/schools/accept-invite/route"),invite=await import("../../app/api/schools/invite/route"),activate=await import("../../app/api/schools/activate-teacher/route");
  const results=await Promise.all([
    accept.POST(request(accepted,{token:invitation.token})),
    invite.POST(request(actor,{schoolId:id,email:`new-${id}@synthetic.invalid`,sendEmail:false})),
    activate.POST(request(actor,{schoolId:id,targetUid:former})),
  ]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,400,400]);
  const active=await db.collection(`schools/${id}/members`).where("role","==","school_teacher").where("status","==","active").get();
  assert.equal(active.size,2);
  assert.equal((await db.collection("schoolInvites").where("schoolId","==",id).where("status","==","pending").get()).size,0);
  assert.equal((await db.doc(`schoolInvites/${invitation.inviteId}`).get()).get("status"),"accepted");
  assert.equal((await db.doc(`users/${accepted}`).get()).get("schoolStatus"),"active");
  assert.equal((await db.doc(`users/${former}`).get()).get("schoolStatus"),"disabled");
  assert.equal((await db.doc(`schools/${id}/members/${actor}`).get()).get("role"),"school_admin");
});
for(const kind of ["pupil","activate","invite","accept"]){
  for(const persistent of [false,true])test(`${kind}: ${persistent?"persistent closed reads stay 500":"one closed read rechecks actual capacity"}`,async()=>{
    const before=await state(),native=db.runTransaction.bind(db);let freshCalls=0;
    const closed=Object.assign(new Error("3 INVALID_ARGUMENT: Transaction is invalid or closed."),{code:3,details:"Transaction is invalid or closed."});
    const transaction={get:async()=>{throw closed;},getAll:async()=>{throw closed;}} as unknown as Transaction;
    const fault=mock.method(db,"runTransaction",async(callback:(tx:Transaction)=>Promise<unknown>)=>{
      freshCalls++;
      if(persistent||freshCalls===1)return callback(transaction);
      return native(callback);
    });
    let response:Response;
    try{response=await invoke(kind);}finally{fault.mock.restore();}
    const body=await response.json();
    if(persistent){assert.equal(response.status,500);assert.notEqual(body.reason,"seat_limit_reached");assert.equal(freshCalls,3);}
    else{assert.equal(response.status,kind==="pupil"?403:400);if(kind!=="pupil")assert.equal(body.reason,"seat_limit_reached");assert.equal(freshCalls,2);}
    assert.equal(await state(),before);
  });
}
