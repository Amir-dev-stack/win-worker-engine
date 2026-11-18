import test from 'node:test';
import assert from 'node:assert/strict';
import {categorize,optionsFromArgs,buildCodexArgs,workspaceCheck,runRouter,selectVerifiedModel,isChatGPTLogin} from './win-model-router.mjs';
const validEvidence={source:'codex-app-server:model/list',verifiedAt:'2026-11-18T15:00:00Z',expiresAt:'2026-11-18T18:00:00Z',models:[{id:'gpt-6.1-terra',available:true,allowed:true},{id:'gpt-6.2-sol',available:true,allowed:true},{id:'gpt-6.2-astra',available:true,allowed:true}]};
test('routes routine, complex and review',()=>{
  assert.equal(categorize('Update README documentation'),'simple');
  assert.equal(categorize('Implement worker service'),'standard');
  assert.equal(categorize('Debug database concurrency'),'complex');
  assert.equal(categorize('Final review'),'review');
});
test('dry-run launches no subprocesses',async()=>{
  const r=await runRouter(['--task','Implement worker','--cwd','/repo'],{
    spawnSyncFn(){throw Error('unexpected');},invokeFn(){throw Error('unexpected');}});
  assert.equal(r.dryRun,true);assert.equal(r.model,'gpt-6.2-sol');
});
test('rejects invalid args and category',()=>{
  assert.throws(()=>optionsFromArgs([]),/INVALID_TASK/);
  assert.throws(()=>optionsFromArgs(['--task','x','--extra']),/UNKNOWN_ARGUMENT/);
  assert.throws(()=>optionsFromArgs(['--task','x','--category','invalid']),/UNSUPPORTED_CATEGORY/);
});
test('review is read-only, implementation is writable',()=>{
  const r=buildCodexArgs({category:'review',task:'Review patch',cwd:'/repo'});
  const w=buildCodexArgs({category:'standard',task:'Implement patch',cwd:'/repo'});
  assert.ok(r.includes('read-only'));assert.ok(w.includes('workspace-write'));
});
test('cannot run in frozen PR36 or subdirectory',()=>{
  assert.throws(()=>workspaceCheck('C:\\Users\\PC\\.codex\\worktrees\\pr36\\WIN','C:\\Users\\PC\\.codex\\worktrees\\pr36\\WIN'),/FROZEN_PR36/);
  assert.throws(()=>workspaceCheck('/repo/sub','/repo'),/WORKSPACE_MUST/);
});
test('one successful implementation invokes at most one Astra review',async()=>{
  const args=[];
  const r=await runRouter(['--run','--review-after','--verified-models','/catalog.json','--task','Implement worker','--cwd','/repo'],{
    spawnSyncFn:(cmd)=>cmd==='codex'?{status:0,stdout:'Logged in using ChatGPT'}:{status:0,stdout:'/repo\n'},realpathSyncFn:x=>x,
    readFileSyncFn:()=>JSON.stringify(validEvidence), now:new Date('2026-11-18T15:30:00Z'),
    invokeFn:async x=>{args.push(x);return {success:true,code:0};}});
  assert.equal(r.stage,'review');assert.equal(args.length,2);
  assert.ok(args[0].includes('gpt-6.2-sol'));
  assert.ok(args[1].includes('gpt-6.2-astra'));
});
test('failed implementation never invokes Astra',async()=>{
  let count=0;
  const r=await runRouter(['--run','--review-after','--verified-models','/catalog.json','--task','Implement worker','--cwd','/repo'],{
    spawnSyncFn:(cmd)=>cmd==='codex'?{status:0,stdout:'Logged in using ChatGPT'}:{status:0,stdout:'/repo\n'},realpathSyncFn:x=>x,
    readFileSyncFn:()=>JSON.stringify(validEvidence), now:new Date('2026-11-18T15:30:00Z'),
    invokeFn:async()=>{count++;return {success:false,code:1};}});
  assert.equal(count,1);assert.equal(r.stage,'implementation');
});

// Guard against the Windows launcher silently diverging from the single JS model plan.
test('PowerShell launcher shares router model choices and uses current worktree by default',async()=>{
  const {readFileSync}=await import('node:fs');
  const {fileURLToPath}=await import('node:url');
  const {join,dirname}=await import('node:path');
  const launcher=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'Start-WINAutoModels.ps1'),'utf8');
  assert.match(launcher,/\$Worktree\s*=\s*\(Get-Location\)\.Path/);
  assert.match(launcher,/--category', 'review'/);
  assert.match(launcher,/--model \$reviewPlan\.model/);
  assert.doesNotMatch(launcher,/pr49-safety-hardening|--model 'gpt-6\.2-astra'/);
});

test('review task does not spawn an additional review process',async()=>{
  const launched=[];
  const result=await runRouter(['--run','--review-after','--verified-models','/catalog.json','--task','Final review','--cwd','/repo'],{
    spawnSyncFn:(cmd)=>cmd==='codex'?{status:0,stdout:'Logged in using ChatGPT'}:{status:0,stdout:'/repo\n'},realpathSyncFn:x=>x,
    readFileSyncFn:()=>JSON.stringify(validEvidence), now:new Date('2026-11-18T15:30:00Z'),
    invokeFn:async args=>{launched.push(args);return {success:true,code:0};}
  });
  assert.equal(launched.length,1);
  assert.equal(result.category,'review');
  assert.ok(launched[0].includes('read-only'));
  assert.equal(result.success,true);
});

test('live dispatch fails closed without fresh verified catalog',async()=>{
  await assert.rejects(runRouter(['--run','--task','Implement worker']),/VERIFIED_MODELS_REQUIRED/);
  await assert.rejects(runRouter(['--verify-only','--verified-models','/catalog.json','--task','Implement worker'],{
    readFileSyncFn:()=>JSON.stringify({...validEvidence,expiresAt:'2026-11-18T15:00:00Z'}),
    now:new Date('2026-11-18T15:30:00Z')}),/MODEL_EVIDENCE_STALE/);
});
test('verified plan selects a pre-dispatch fallback without executing',async()=>{
 const evidence={...validEvidence,models:[{id:'gpt-6.2-sol',available:true,allowed:true}]};
 const plan=await runRouter(['--verify-only','--verified-models','/catalog.json','--task','Update README'],{
  readFileSyncFn:()=>JSON.stringify(evidence),now:new Date('2026-11-18T15:30:00Z'),
  invokeFn:()=>{throw Error('must not execute');}});
 assert.equal(plan.verified,true);assert.equal(plan.model,'gpt-6.2-sol');
 assert.equal(plan.fallbackBeforeDispatch,true);assert.equal(plan.effort,'low');
});
test('unapproved models and expired evidence fail closed',()=>{
 const now=new Date('2026-11-18T15:30:00Z');
 assert.throws(()=>selectVerifiedModel('complex',{...validEvidence,models:[{id:'gpt-6.2-sol',available:true,allowed:false}]},now),/NO_VERIFIED_MODEL/);
 assert.throws(()=>selectVerifiedModel('standard',{...validEvidence,verifiedAt:'2026-11-15T15:00:00Z'},now),/MODEL_EVIDENCE_STALE/);
 assert.throws(()=>selectVerifiedModel('simple',{...validEvidence,source:'guessed'},now),/MODEL_EVIDENCE_INVALID/);
});
test('cooldown blocks selection and does not replay failed tasks',async()=>{
 const now=new Date('2026-11-18T15:30:00Z');
 assert.throws(()=>selectVerifiedModel('standard',{...validEvidence,models:[{id:'gpt-6.2-sol',allowed:true,available:true,cooldownUntil:'2026-11-18T16:00:00Z'}]},now),/NO_VERIFIED_MODEL/);
 let invocations=0;
 const result=await runRouter(['--run','--verified-models','/catalog.json','--task','Implement worker','--cwd','/repo'],{
  readFileSyncFn:()=>JSON.stringify(validEvidence),now,
  spawnSyncFn:(cmd)=>cmd==='codex'?{status:0,stdout:'Logged in using ChatGPT'}:{status:0,stdout:'/repo\n'},realpathSyncFn:x=>x,
  invokeFn:async()=>{invocations++;return {success:false,code:1};}
 });
 assert.equal(invocations,1);assert.equal(result.success,false);
});

test('review entitlement is checked before implementation starts',async()=>{
 let called=0;
 await assert.rejects(runRouter(['--run','--review-after','--verified-models','/catalog.json','--task','Update README','--cwd','/repo'],{
   readFileSyncFn:()=>JSON.stringify({...validEvidence,models:[{id:'gpt-6.1-terra',available:true,allowed:true}]}),
   now:new Date('2026-11-18T15:30:00Z'),
   spawnSyncFn:(cmd)=>cmd==='codex'?{status:0,stdout:'Logged in using ChatGPT'}:{status:0,stdout:'/repo\n'},realpathSyncFn:x=>x,
   invokeFn:async()=>{called++;return {success:true,code:0};}
 }),/NO_VERIFIED_MODEL_FOR_TASK/);
 assert.equal(called,0);
});
test('invalid cooldown cannot be used to bypass model unavailability',()=>{
 const evidence={...validEvidence,models:[{id:'gpt-6.2-sol',available:true,allowed:true,cooldownUntil:'not-a-date'}]};
 assert.throws(()=>selectVerifiedModel('standard',evidence,new Date('2026-11-18T15:30:00Z')),/NO_VERIFIED_MODEL_FOR_TASK/);
});

test('API-key or unauthenticated CLI cannot start a Codex task',async()=>{
  assert.equal(isChatGPTLogin('Logged in using ChatGPT'),true);
  assert.equal(isChatGPTLogin('Logged in using an API key'),false);
  assert.equal(isChatGPTLogin('Not logged in using ChatGPT'),false);
  assert.equal(isChatGPTLogin('Failed: logged in using ChatGPT'),false);
  let invokes=0;
  await assert.rejects(runRouter(['--run','--verified-models','/catalog.json','--task','Implement worker','--cwd','/repo'],{
    readFileSyncFn:()=>JSON.stringify(validEvidence),now:new Date('2026-11-18T15:30:00Z'),
    spawnSyncFn:(cmd)=>cmd==='codex'?{status:0,stdout:'Logged in using an API key'}:{status:0,stdout:'/repo\n'},
    invokeFn:()=>{invokes++;return {success:true,code:0};}
  }),/CODEX_CHATGPT_AUTH_REQUIRED/);
  assert.equal(invokes,0);
});
