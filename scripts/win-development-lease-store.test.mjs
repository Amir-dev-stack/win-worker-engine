import test from 'node:test';
import assert from 'node:assert/strict';
import { LEASE_SQL, createFencedLeaseStore } from './win-development-lease-store.mjs';

function fakeDB(rows=[{task_id:'win-lease-1',fence:5}]) {
  const calls=[];
  return {
    calls,
    db:{async query(sql,params) {
      calls.push({sql,params});
      return {rowCount:rows.length,rows};
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
