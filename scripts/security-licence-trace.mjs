// Local diagnostic observer only. Never used by application runtime.
import { Firestore } from '@google-cloud/firestore';
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8188'
  || process.env.GOOGLE_CLOUD_PROJECT !== 'demo-security-round1'
  || !process.env.PHASE2_RESULT_DIR?.includes('security-licence-local')) throw new Error('Local transaction trace boundary');
const output=path.join(process.env.PHASE2_RESULT_DIR,'transaction-rpc.jsonl');
const hash=value=>value ? createHash('sha256').update(value).digest('hex').slice(0,16) : null;
const log=value=>appendFileSync(output,JSON.stringify({at:new Date().toISOString(),...value})+'\n');
const stream=Firestore.prototype.requestStream,request=Firestore.prototype.request;
Firestore.prototype.requestStream=function(method,body,tag,...args){
  const base={method,tag,transaction:hash(body.transaction),retryTransaction:hash(body.newTransaction?.readWrite?.retryTransaction),newTransaction:!!body.newTransaction};
  log({event:'stream-request',...base});
  return stream.call(this,method,body,tag,...args).then(result=>{
    // Observe only errors: a data listener would start flowing before the SDK is ready.
    result.on('error',error=>log({event:'stream-error',...base,code:error.code,message:error.message}));
    return result;
  },error=>{log({event:'stream-start-error',...base,code:error.code,message:error.message});throw error;});
};
Firestore.prototype.request=function(method,body,tag,...args){
  if(!['commit','rollback','beginTransaction'].includes(method))return request.call(this,method,body,tag,...args);
  const base={method,tag,transaction:hash(body.transaction)};
  log({event:'request',...base});
  return request.call(this,method,body,tag,...args).then(result=>{log({event:'request-success',...base});return result;},error=>{
    log({event:'request-error',...base,code:error.code,message:error.message});throw error;
  });
};
