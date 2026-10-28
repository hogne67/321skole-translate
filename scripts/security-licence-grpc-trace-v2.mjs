// Observe the concrete generated stub, which captures its grpc requester at load time.
import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8188'||process.env.GOOGLE_CLOUD_PROJECT!=='demo-security-round1'
 ||!process.env.PHASE2_RESULT_DIR?.includes('security-licence-local'))throw new Error('Local gRPC trace boundary');
const require=createRequire(import.meta.url),{GrpcClient}=require('google-gax');
const output=path.join(process.env.PHASE2_RESULT_DIR,'raw-grpc-errors.jsonl');
const log=event=>appendFileSync(output,JSON.stringify({at:new Date().toISOString(),...event})+'\n');
const properties=(method,body)=>({method,transaction:body?.transaction?createHash('sha256').update(body.transaction).digest('hex').slice(0,16):null,newTransaction:!!body?.newTransaction});
log({event:'observer-installed'});
const original=GrpcClient.prototype.createStub;
GrpcClient.prototype.createStub=function(...args){
 return original.apply(this,args).then(stub=>{
  for(const name of ['runQuery','batchGetDocuments']){
   if(typeof stub[name]!=='function')continue;
   const request=stub[name];
   stub[name]=function(body,...options){
    const stream=request.call(this,body,...options);
    stream.on('error',error=>log({event:'raw-stream-error',...properties(name,body),code:error.code,message:error.message}));
    return stream;
   };
  }
  if(typeof stub.commit==='function'){
   const commit=stub.commit;
   stub.commit=function(body,...options){
    const callback=options.at(-1);
    if(typeof callback==='function')options[options.length-1]=function(error,...result){
     if(error)log({event:'raw-commit-error',...properties('commit',body),code:error.code,message:error.message});
     return callback.call(this,error,...result);
    };
    return commit.call(this,body,...options);
   };
  }
  log({event:'stub-instrumented',methods:['runQuery','batchGetDocuments'].filter(name=>typeof stub[name]==='function')});
  return stub;
 });
};
