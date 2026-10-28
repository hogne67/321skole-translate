/* global require, __dirname */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),ts=require('typescript');
const {NextResponse}=require('next/server');
function load(rel,admin){
 const module={exports:{}};
 const output=ts.transpileModule(fs.readFileSync(root+'/'+rel,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(output,{module,exports:module.exports,require(name){
  if(name==='server-only')return {};
  if(name==='next/server')return {NextResponse};
  if(name==='@/lib/firebaseAdmin')return {getAdmin:admin};
  if(rel==='lib/spaceJoinPolicy.ts'&&name==='./security/spaceAccess')return load('lib/security/spaceAccess.ts');
  throw Error('Unexpected regression dependency: '+name);
 }},{filename:rel});return module.exports;
}
const policy=load('lib/spaceJoinPolicy.ts');
const pupil=Object.freeze({role:'student',status:'active',participantId:'synthetic-pupil',displayName:'Synthetic pupil'});
test('Spaces: active synthetic guest and account retain the same participant; data unchanged',()=>{
 const before=JSON.stringify(pupil);
 for(const uid of ['synthetic-guest','synthetic-account']){
  const result=policy.evaluatePupilJoin({...pupil,uid},[pupil,{...pupil,uid:'synthetic-other'}]);
  assert.equal(result.participantId,pupil.participantId);assert.equal(result.switchRequired,false);
 }
 assert.equal(JSON.stringify(pupil),before);
});
test('Spaces: different participant still requires switch; revoked membership remains denied',()=>{
 assert.equal(policy.evaluatePupilJoin({...pupil,participantId:'synthetic-different'},[pupil]).switchRequired,true);
 assert.equal(policy.evaluatePupilJoin(null,[{...pupil,status:'disabled'}]).error,'invalid_student_code');
 assert.equal(policy.evaluatePupilJoin({...pupil,status:'disabled'},[pupil]).error,'access_revoked');
 assert.equal(policy.evaluatePupilJoin(null,[pupil,{...pupil,participantId:'synthetic-conflict'}]).error,'identity_conflict');
});
test('Live: quiz, wordwall, image and poll lookup still return their existing response with fake Firestore',async()=>{
 for(const kind of ['quiz','wordwall','image','poll']){
  const reads=[];
  const api=load('app/api/live/by-code/[code]/route.ts',()=>({db:{collection(collection){
   return {where(field,op,code){assert.equal(field,'code');assert.equal(op,'==');assert.equal(code,'ABC123');return {limit(n){assert.equal(n,1);return {async get(){reads.push(collection);return {docs:collection===kind+'Sessions'?[{id:'synthetic-session'}]:[]};}};}};}};
  }}}));
  const response=await api.GET(null,{params:Promise.resolve({code:' abc123 '})});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,type:kind,sessionId:'synthetic-session',code:'ABC123'});
  assert.equal(reads.length,4);
 }
});
test('Live: malformed input still denies before database, missing synthetic session still returns 404',async()=>{
 const noDb=load('app/api/live/by-code/[code]/route.ts',()=>{assert.fail('database must not be initialized');});
 assert.equal((await noDb.GET(null,{params:Promise.resolve({code:'bad'})})).status,400);
 const empty=load('app/api/live/by-code/[code]/route.ts',()=>({db:{collection(){return {where(){return {limit(){return {async get(){return {docs:[]};}};}};}};}}}));
 assert.equal((await empty.GET(null,{params:Promise.resolve({code:'ABC123'})})).status,404);
});
