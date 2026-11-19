import test from "node:test";
import assert from "node:assert/strict";
import {createContinuousCheckpointAdapter} from "./win-continuous-learning-checkpoints.mjs";
function fake() {
  const map=new Map();let seq=0;
  return {map,
    async read(k){return map.has(k)?structuredClone(map.get(k)):null},
    async create(k,v){if(map.has(k))return false;map.set(k,{version:String(++seq),value:structuredClone(v)});return true},
    async replace(k,version,v){if(map.get(k)?.version!==version)return false;map.set(k,{version:String(++seq),value:structuredClone(v)});return true}
  };
}
const job="odds-ingestion",now=Date.parse("2026-11-08T19:00:00.000Z");
const id1="lease-abc-12345",id2="lease-def-67890";
test("initialization is idempotent without deletion",async()=>{
  const a=createContinuousCheckpointAdapter(fake());
  assert.equal((await a.initialize(job)).created,true);
  assert.equal((await a.initialize(job)).created,false);
});
test("exactly one concurrent claimant wins",async()=>{
  const a=createContinuousCheckpointAdapter(fake());await a.initialize(job);
  const x=await Promise.all([a.claim(job,id1,now,30000,0),a.claim(job,id2,now,30000,0)]);
  assert.equal(x.filter(v=>v.status==="claimed").length,1);
});
test("lease overlap is blocked and stale owner cannot complete",async()=>{
  const a=createContinuousCheckpointAdapter(fake());await a.initialize(job);
  const one=await a.claim(job,id1,now,30000,0);
  assert.equal((await a.claim(job,id2,now+100,30000,0)).status,"leased");
  const two=await a.claim(job,id2,now+30001,30000,0);
  assert.equal(two.status,"claimed");
  assert.equal((await a.complete(job,id1,one.checkpoint.generation,now+30002)).status,"stale_or_expired_lease");
  assert.equal((await a.complete(job,id2,two.checkpoint.generation,now+30003)).status,"completed");
});
test("successful completion imposes due interval",async()=>{
  const a=createContinuousCheckpointAdapter(fake());await a.initialize(job);
  const c=await a.claim(job,id1,now,30000,300000);
  assert.equal((await a.complete(job,id1,c.checkpoint.generation,now+1)).status,"completed");
  assert.equal((await a.claim(job,id2,now+2,30000,300000)).status,"not_due");
});
test("repeated expired leases eventually block further attempts",async()=>{
  const a=createContinuousCheckpointAdapter(fake());await a.initialize(job);
  for(let i=0;i<3;i++) assert.equal((await a.claim(job,id1+i,now+i*40000,30000,0)).status,"claimed");
  assert.equal((await a.claim(job,id2,now+130000,30000,0)).status,"blocked_retry_limit");
});
test("unknown jobs never create state",async()=>{
  const d=fake(),a=createContinuousCheckpointAdapter(d);
  await assert.rejects(a.initialize("../unsafe"),/unknown_job/);
  assert.equal(d.map.size,0);
});
test("uninitialized task cannot be claimed",async()=>{
  const a=createContinuousCheckpointAdapter(fake());
  assert.equal((await a.claim(job,id1,now,30000,0)).status,"not_initialized");
});
test("atomic driver and unambiguous compare-and-swap required",async()=>{
  assert.throws(()=>createContinuousCheckpointAdapter({}),/atomic_driver_required/);
  const d=fake(),a=createContinuousCheckpointAdapter({...d,replace:async()=>undefined});
  await a.initialize(job);
  await assert.rejects(a.claim(job,id1,now,30000,0),/non_atomic_replace_result/);
});
test("rejects weak lease identifiers",async()=>{
  const a=createContinuousCheckpointAdapter(fake());await a.initialize(job);
  await assert.rejects(a.claim(job,"x",now,30000,0),/invalid_lease_id/);
});
