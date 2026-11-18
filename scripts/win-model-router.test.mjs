import test from 'node:test';
import assert from 'node:assert/strict';
import {categorize,optionsFromArgs,buildCodexArgs,workspaceCheck,runRouter} from './win-model-router.mjs';
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
  const r=await runRouter(['--run','--review-after','--task','Implement worker','--cwd','/repo'],{
    spawnSyncFn:()=>({status:0,stdout:'/repo\n'}),realpathSyncFn:x=>x,
    invokeFn:async x=>{args.push(x);return {success:true,code:0};}});
  assert.equal(r.stage,'review');assert.equal(args.length,2);
  assert.ok(args[0].includes('gpt-6.2-sol'));
  assert.ok(args[1].includes('gpt-6.2-astra'));
});
test('failed implementation never invokes Astra',async()=>{
  let count=0;
  const r=await runRouter(['--run','--review-after','--task','Implement worker','--cwd','/repo'],{
    spawnSyncFn:()=>({status:0,stdout:'/repo\n'}),realpathSyncFn:x=>x,
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
