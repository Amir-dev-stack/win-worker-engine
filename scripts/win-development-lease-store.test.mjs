import test from 'node:test';
import assert from 'node:assert/strict';
import { LEASE_SQL, createFencedLeaseStore } from './win-development-lease-store.mjs';

function fakeDB(rows=null) {
  const calls=[];
  return {
    calls,
    db:{async query(sql,params) {
      calls.push({sql,params});
      const op=sql.includes("checkpoint_commit_sha = $4") ? 'checkpoint' :
        sql.includes("status = 'completed'") ? 'complete' :
        sql.includes("status = 'blocked_uncertain'") ? 'quarantine' :
        sql.includes("SET expires_at") ? 'renew' : 'claim';
      const generated={
        task_id:params[0], fence:op==='claim'?5:op==='quarantine'?6:params[2],
        source_commit_sha:'a'.repeat(40),task_type:'read_only_review',
        expires_at:new Date('2030-01-01T00:00:00Z'),
        checkpoint_commit_sha:op==='checkpoint'?params[3]:null,
        status:op==='complete'?'completed':'blocked_uncertain'
      };
      const resultRows=rows===null?[generated]:rows;
      return {rowCount:resultRows.length,rows:resultRows};
    }}
  };
}
test('claim is a single parameterized CAS update, only preapproved queued tasks',async()=>{
  const {db,calls}=fakeDB();
  const store=createFencedLeaseStore(db);
  const claim=await store.claim('win-lease-1','codex-primary',120);
  assert.equal(claim.fence,5);
  assert.deepEqual(calls[0].params,['win-lease-1','codex-primary',120]);
  assert.match(calls[0].sql,/UPDATE win_dev_lease_tasks/);
  assert.match(calls[0].sql,/approved = true/);
  assert.match(calls[0].sql,/status = 'queued'/);
  assert.match(calls[0].sql,/owner_id IS NULL/);
  assert.match(calls[0].sql,/fence = fence \+ 1/);
  assert.match(calls[0].sql,/RETURNING task_id/);
  assert.ok(!calls[0].sql.includes('INSERT INTO'));
});

test('expired running task is quarantined and fencing generation advances',async()=>{
  const {db,calls}=fakeDB();
  await createFencedLeaseStore(db).quarantineExpired('win-lease-1');
  const sql=calls[0].sql;
  assert.match(sql,/status = 'blocked_uncertain'/);
  assert.match(sql,/fence = fence \+ 1/);
  assert.match(sql,/expires_at <= clock_timestamp\(\)/);
  assert.match(sql,/status = 'running'/);
  assert.doesNotMatch(sql,/status = 'queued'/);
  assert.deepEqual(calls[0].params,['win-lease-1']);
});

test('all mutations after claim require exact owner + fencing epoch and unexpired lease',()=>{
  for(const name of ['renew','checkpoint','complete']) {
    assert.match(LEASE_SQL[name],/owner_id = \$2/);
    assert.match(LEASE_SQL[name],/fence = \$3/);
    assert.match(LEASE_SQL[name],/status = 'running'/);
    assert.match(LEASE_SQL[name],/expires_at > clock_timestamp\(\)/);
  }
  assert.match(LEASE_SQL.checkpoint,/checkpoint_commit_sha = \$4/);
  assert.match(LEASE_SQL.checkpoint,/\$4 ~/);
});

test('revoked task approval prevents lease renewal, checkpoint and completion',()=>{
  for(const mutation of ['renew','checkpoint','complete']) {
    const sql=LEASE_SQL[mutation];
    assert.match(sql,/AND approved = true/,`${mutation} must require continuing approval`);
    assert.match(sql,/AND owner_id = \$2 AND fence = \$3/);
  }
  // Quarantine must remain possible after approval revocation to fence
  // an expired, potentially still-running worker.
  assert.doesNotMatch(LEASE_SQL.quarantineExpired,/approved = true/);
});

test('store returns no ownership when database CAS updates zero rows',async()=>{
  const {db}=fakeDB([]);
  const store=createFencedLeaseStore(db);
  assert.equal(await store.claim('win-lease-1','codex-primary',60),null);
  assert.equal(await store.renew('win-lease-1','codex-primary',1,60),null);
  assert.equal(await store.checkpoint('win-lease-1','codex-primary',1,'a'.repeat(40)),null);
  assert.equal(await store.complete('win-lease-1','codex-primary',1),null);
  assert.equal(await store.quarantineExpired('win-lease-1'),null);
});

test('rejects untrusted parameters before any DB work',async()=>{
  const {db,calls}=fakeDB();
  const s=createFencedLeaseStore(db);
  await assert.rejects(s.claim('bad/../task','actor',60),/INVALID_LEASE_PARAMETER/);
  await assert.rejects(s.claim('task','actor',0),/INVALID_LEASE_PARAMETER/);
  await assert.rejects(s.claim('task','actor',901),/INVALID_LEASE_PARAMETER/);
  await assert.rejects(s.claim('task','bad owner',60),/INVALID_LEASE_PARAMETER/);
  await assert.rejects(s.renew('task','actor',0,30),/INVALID_LEASE_PARAMETER/);
  await assert.rejects(s.checkpoint('task','actor',1,'not-a-commit'),/INVALID_LEASE_PARAMETER/);
  await assert.rejects(s.complete('task','actor',Number.MAX_SAFE_INTEGER+1),/INVALID_LEASE_PARAMETER/);
  await assert.rejects(s.quarantineExpired('bad/task'),/INVALID_LEASE_PARAMETER/);
  assert.equal(calls.length,0);
});
test('rejects malformed results rather than inferring lease success',async()=>{
  const db={query:async()=>({rowCount:2,rows:[{},{}]})};
  await assert.rejects(createFencedLeaseStore(db).claim('task','actor',60),/INVALID_DATABASE_RESULT/);
  assert.throws(()=>createFencedLeaseStore(null),/TRUSTED_DB_REQUIRED/);
});

test('schema draft forbids paid/production work and has a DB-level owner consistency constraint',async()=>{
 const {readFileSync}=await import('node:fs');
 const {dirname,join}=await import('node:path');
 const {fileURLToPath}=await import('node:url');
 const file=join(dirname(fileURLToPath(import.meta.url)),'../db/draft_win_dev_fenced_lease.sql');
 const sql=readFileSync(file,'utf8');
 assert.match(sql,/production_write_allowed\s+boolean\s+NOT NULL DEFAULT false/);
 assert.match(sql,/paid_spend_allowed\s+boolean\s+NOT NULL DEFAULT false/);
 assert.match(sql,/blocked_uncertain/);
 assert.match(sql,/win_lease_owner_consistency/);
 assert.match(sql,/REVOKE ALL ON win_dev_lease_tasks FROM PUBLIC/);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM/);
});

test('rejects wrong task, wrong fence, invalid SHA, missing expiry and wrong status responses',async()=>{
 const good={task_id:'task-1',fence:'5',source_commit_sha:'a'.repeat(40),
   task_type:'read_only_review',expires_at:new Date('2030-01-01T00:00:00Z'),
   checkpoint_commit_sha:null};
 const cases=[
   ['claim',{...good,task_id:'wrong-task'},s=>s.claim('task-1','worker',60)],
   ['claim',{...good,source_commit_sha:'not-a-sha'},s=>s.claim('task-1','worker',60)],
   ['claim',{...good,expires_at:null},s=>s.claim('task-1','worker',60)],
   ['claim',{...good,task_type:'production_deploy'},s=>s.claim('task-1','worker',60)],
   ['claim',{...good,fence:Number.MAX_SAFE_INTEGER+1},s=>s.claim('task-1','worker',60)],
   ['renew',{...good,fence:'6'},s=>s.renew('task-1','worker',5,60)],
   ['checkpoint',{...good,checkpoint_commit_sha:'b'.repeat(40)},s=>s.checkpoint('task-1','worker',5,'a'.repeat(40))],
   ['complete',{...good,status:'running'},s=>s.complete('task-1','worker',5)],
   ['quarantine',{...good,status:'running'},s=>s.quarantineExpired('task-1')]
 ];
 for(const [operation,row,invoke] of cases) {
   const store=createFencedLeaseStore({query:async()=>({rowCount:1,rows:[row]})});
   await assert.rejects(invoke(store),/INVALID_DATABASE_RESULT/,operation);
 }
});

test('accepts PostgreSQL BIGINT fence strings and valid operation-specific rows',async()=>{
 const claim={task_id:'task-1',source_commit_sha:'a'.repeat(40),
   task_type:'draft_only_development',fence:'5',
   expires_at:'2030-01-01T00:00:00Z',checkpoint_commit_sha:null};
 const s=createFencedLeaseStore({query:async(sql,params)=>{
   const row=sql.includes("checkpoint_commit_sha = $4")
    ? {task_id:'task-1',fence:'5',checkpoint_commit_sha:params[3]}
    : sql.includes("status = 'completed'")
      ? {task_id:'task-1',fence:'5',status:'completed'}
      : sql.includes("status = 'blocked_uncertain'")
        ? {task_id:'task-1',fence:'6',status:'blocked_uncertain'}
        : sql.includes('SET expires_at')
          ? {task_id:'task-1',fence:'5',expires_at:new Date('2030-01-01T00:00:00Z')}
          : claim;
   return {rowCount:1,rows:[row]};
 }});
 assert.equal((await s.claim('task-1','worker',120)).fence,'5');
 assert.equal((await s.renew('task-1','worker',5,60)).fence,'5');
 assert.equal((await s.checkpoint('task-1','worker',5,'b'.repeat(40))).checkpoint_commit_sha,'b'.repeat(40));
 assert.equal((await s.complete('task-1','worker',5)).status,'completed');
 assert.equal((await s.quarantineExpired('task-1')).status,'blocked_uncertain');
});

test('fence wraparound cannot violate JavaScript safe integer range',async()=>{
 const {readFileSync}=await import('node:fs');
 const {dirname,join}=await import('node:path');
 const {fileURLToPath}=await import('node:url');
 const schema=readFileSync(join(dirname(fileURLToPath(import.meta.url)),
   '../db/draft_win_dev_fenced_lease.sql'),'utf8');
 assert.match(schema,/fence <= 9007199254740991/);
 assert.match(LEASE_SQL.claim,/fence < 9007199254740991/);
 assert.match(LEASE_SQL.quarantineExpired,/fence < 9007199254740991/);
});
