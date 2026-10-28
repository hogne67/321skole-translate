import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const app=initializeApp({projectId:"demo-security-round1"}),db=getFirestore(app),observations:object[]=[];
before(()=>{
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8188");
  mock.method(getAuth(app),"verifyIdToken",async(uid:string,revoked:boolean)=>{assert.equal(revoked,true);return{uid};});
});
after(async()=>{
  assert.ok(process.env.PHASE2_RESULT_DIR?.includes("security-licence-local"));
  await writeFile(path.join(process.env.PHASE2_RESULT_DIR!,"query-shape.json"),JSON.stringify(observations,null,2),{flag:"wx"});
  mock.restoreAll();await deleteApp(app);
});
for(let round=1;round<=3;round++)for(const count of [1,2])for(const kind of ["raw","api"]){
  test(`${kind}: ${count} owned rooms with an in-query, round ${round}`,async()=>{
    const owner=`shape-${kind}-${count}-${round}`,spaces=Array.from({length:count},(_,i)=>`${owner}-room-${i}`);
    await db.doc(`users/${owner}`).set({role:"teacher",plan:"free"});
    for(const id of spaces)await db.doc(`spaces/${id}`).set({ownerId:owner,ownerUid:owner});
    const lock=db.doc(`teacherRosterLocks/${owner}`);
    await lock.set({synthetic:true});
    for(let i=0;i<9;i++)await db.doc(`spaceMembers/${owner}-pupil-${i}`).set({spaceId:spaces[0],participantId:`pupil-${i}`,teacherStudentId:`pupil-${i}`,role:"student",status:"active",active:true,archived:false});
    const rows=db.collection("spaceMembers").where("spaceId","in",spaces);
    const invoke=async(candidate:string)=>{
      if(kind==="api"){
        const {createOrLinkTeacherPupil}=await import("../server/teacherPupilRoster");
        const response=await createOrLinkTeacherPupil(new Request("http://localhost/synthetic",{method:"POST",headers:{Authorization:`Bearer ${owner}`,"Content-Type":"application/json"},body:JSON.stringify({displayName:candidate})}),{params:Promise.resolve({spaceId:spaces[0]})});
        return{status:response.status};
      }
      return db.runTransaction(async tx=>{
        await tx.get(lock);await tx.get(db.doc(`spaces/${spaces[0]}`));await tx.get(db.doc(`spaceMembers/${spaces[0]}_${owner}`));
        const current=await tx.get(rows);
        if(current.size>=10)return 403;
        tx.set(lock,{synthetic:true,revision:1});
        tx.create(db.doc(`spaceMembers/${owner}-${candidate}`),{spaceId:spaces[0],role:"student",synthetic:true});
        return 200;
      }).then(status=>({status}),error=>({status:500,code:error.code,message:error.message}));
    };
    const results=await Promise.all([invoke("one"),invoke("two")]),actual=(await rows.get()).size;
    observations.push({kind,roomCount:count,round,results,actual,limit:10});
    assert.equal(actual,10,"Never exceed capacity even if transaction transport fails");
    assert.deepEqual(results.map(r=>r.status).sort(),[200,403]);
  });
}
