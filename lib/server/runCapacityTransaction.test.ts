import assert from "node:assert/strict";
import { test } from "node:test";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { runCapacityTransaction } from "./runCapacityTransaction";

const closed=()=>Object.assign(new Error("3 INVALID_ARGUMENT: Transaction is invalid or closed."),{code:3,details:"Transaction is invalid or closed."});
type FakeTransaction={get:()=>Promise<unknown>;getAll:()=>Promise<unknown>;set:()=>FakeTransaction;create:()=>FakeTransaction;update:()=>FakeTransaction;delete:()=>FakeTransaction};
function harness(read:(call:number)=>Promise<unknown>,commitError?:unknown){
  let runs=0,reads=0,writes=0;
  const db={runTransaction:async(callback:(tx:Transaction)=>Promise<unknown>)=>{
    runs++;
    const tx:FakeTransaction={get:async()=>{reads++;return read(reads);},getAll:async()=>{reads++;return read(reads);},set:()=>{writes++;return tx;},create:()=>{writes++;return tx;},update:()=>{writes++;return tx;},delete:()=>{writes++;return tx;}};
    const result=await callback(tx as unknown as Transaction);
    if(commitError)throw commitError;
    return result;
  }} as unknown as Pick<Firestore,"runTransaction">;
  return{db,counts:()=>({runs,reads,writes})};
}
const read=(tx:Transaction)=>tx.get({} as FirebaseFirestore.DocumentReference);
for(const method of ["get","getAll"] as const)test(`${method}: closed pre-write read starts a fresh complete transaction`,async()=>{
  const h=harness(async call=>{if(call===1)throw closed();return{capacity:1};});
  let callbacks=0;
  const result=await runCapacityTransaction(h.db,async tx=>{
    callbacks++;if(method==="get")await read(tx);else await tx.getAll({} as FirebaseFirestore.DocumentReference);
    tx.set({} as FirebaseFirestore.DocumentReference,{synthetic:true});return"ok";
  });
  assert.equal(result,"ok");assert.equal(callbacks,2);assert.deepEqual(h.counts(),{runs:2,reads:2,writes:1});
});
test("fresh callback sees exhausted capacity and does not turn transport failure directly into capacity",async()=>{
  const h=harness(async call=>{if(call===1)throw closed();return{capacity:0};});
  const result=await runCapacityTransaction(h.db,async tx=>{const state=await read(tx) as unknown as {capacity:number};return{ok:state.capacity>0,reason:state.capacity===0?"seat_limit_reached":undefined};});
  assert.deepEqual(result,{ok:false,reason:"seat_limit_reached"});assert.deepEqual(h.counts(),{runs:2,reads:2,writes:0});
});
test("persistent closed reads stop after three fresh transactions and retain original error",async()=>{
  const errors:Error[]=[];const h=harness(async()=>{const error=closed();errors.push(error);throw error;});
  await assert.rejects(runCapacityTransaction(h.db,read),error=>error===errors[2]);
  assert.deepEqual(h.counts(),{runs:3,reads:3,writes:0});
});
for(const error of [Object.assign(new Error("Unrelated invalid argument"),{code:3}),Object.assign(new Error("Service unavailable"),{code:14}),Object.assign(new Error("Aborted"),{code:10}),Object.assign(new Error("Transaction is invalid or closed."),{code:13}),new Error("Transaction is invalid or closed.")])test(`other read error stays native: ${String((error as {code?:number}).code)} ${error.message}`,async()=>{
  const h=harness(async()=>{throw error;});await assert.rejects(runCapacityTransaction(h.db,read),value=>value===error);
  assert.deepEqual(h.counts(),{runs:1,reads:1,writes:0});
});
test("callback capacity exception is never retried or replaced",async()=>{
  const error=Object.assign(new Error("Full"),{status:403}),h=harness(async()=>({}));
  await assert.rejects(runCapacityTransaction(h.db,async tx=>{await read(tx);throw error;}),value=>value===error);
  assert.equal(h.counts().runs,1);
});
for(const method of ["set","create","update","delete"] as const)test(`${method} before a closed read forbids fresh retry`,async()=>{
  const error=closed(),h=harness(async()=>{throw error;});
  await assert.rejects(runCapacityTransaction(h.db,async tx=>{
    const fake=tx as unknown as FakeTransaction;fake[method]();return read(tx);
  }),value=>value===error);assert.deepEqual(h.counts(),{runs:1,reads:1,writes:1});
});
test("a write scheduled after a caught closed read also forbids retry",async()=>{
  const error=closed(),h=harness(async()=>{throw error;});
  await assert.rejects(runCapacityTransaction(h.db,async tx=>{
    try{return await read(tx);}catch(caught){tx.set({} as FirebaseFirestore.DocumentReference,{});throw caught;}
  }),value=>value===error);assert.equal(h.counts().runs,1);
});
for(const error of [closed(),Object.assign(new Error("Commit unavailable"),{code:14})])test(`commit error ${error.code} is never retried by the wrapper`,async()=>{
  const h=harness(async()=>({}),error);
  await assert.rejects(runCapacityTransaction(h.db,async tx=>{await read(tx);tx.set({} as FirebaseFirestore.DocumentReference,{});return"ok";}),value=>value===error);
  assert.deepEqual(h.counts(),{runs:1,reads:1,writes:1});
});
test("closed read-shaped callback error without a failing SDK read is not retried",async()=>{
  const error=closed(),h=harness(async()=>({}));
  await assert.rejects(runCapacityTransaction(h.db,async()=>{throw error;}),value=>value===error);assert.equal(h.counts().runs,1);
});
test("write chaining keeps interception active",async()=>{
  const h=harness(async()=>({}));
  await runCapacityTransaction(h.db,async tx=>{tx.set({} as FirebaseFirestore.DocumentReference,{}).update({} as FirebaseFirestore.DocumentReference,{});return true;});
  assert.deepEqual(h.counts(),{runs:1,reads:0,writes:2});
});
test("a previous native SDK callback that scheduled writes forbids a fresh transaction",async()=>{
  const error=closed();let runs=0,callbacks=0;
  const tx=(fail:boolean)=>({get:async()=>{if(fail)throw error;return{};},set:function(){return this;}} as unknown as Transaction);
  const db={runTransaction:async(update:(tx:Transaction)=>Promise<unknown>)=>{
    runs++;callbacks++;await update(tx(false));
    // Model a native retry after an uncertain commit: a fresh wrapper retry must not repeat it.
    callbacks++;return update(tx(true));
  }} as unknown as Pick<Firestore,"runTransaction">;
  await assert.rejects(runCapacityTransaction(db,async transaction=>{
    await read(transaction);transaction.set({} as FirebaseFirestore.DocumentReference,{});return true;
  }),value=>value===error);
  assert.equal(runs,1);assert.equal(callbacks,2);
});
