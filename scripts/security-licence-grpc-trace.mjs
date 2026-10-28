// Last diagnostic: observe the raw error before google-gax retries the stream.
import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8188'||process.env.GOOGLE_CLOUD_PROJECT!=='demo-security-round1'
 ||!process.env.PHASE2_RESULT_DIR?.includes('security-licence-local'))throw new Error('Local gRPC trace boundary');
const require=createRequire(import.meta.url),gaxRequire=createRequire(require.resolve('google-gax'));
const prototypes=new Set([require('@grpc/grpc-js').Client.prototype,gaxRequire('@grpc/grpc-js').Client.prototype]);
const output=path.join(process.env.PHASE2_RESULT_DIR,'raw-grpc-errors.jsonl');
for(const prototype of prototypes){
 const original=prototype.makeServerStreamRequest;
 prototype.makeServerStreamRequest=function(method,serialize,deserialize,body,...args){
  const stream=original.call(this,method,serialize,deserialize,body,...args);
  stream.on('error',error=>appendFileSync(output,JSON.stringify({at:new Date().toISOString(),method,
   transaction:body?.transaction?createHash('sha256').update(body.transaction).digest('hex').slice(0,16):null,
   newTransaction:!!body?.newTransaction,code:error.code,message:error.message})+'\n'));
  return stream;
 };
}
