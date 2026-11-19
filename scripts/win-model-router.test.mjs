import test from 'node:test';
import assert from 'node:assert/strict';
import {categorize,optionsFromArgs,buildCodexArgs,workspaceCheck,runRouter,selectVerifiedModel,isChatGPTLogin,hasChatGPTCliAuth,discoverCodexModels,codexAuthCommand,validateCodexRateLimits} from './win-model-router.mjs';
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
  assert.match(launcher,/--model \$plan\.reviewModel/);
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

test('authenticated app-server model list discovers approved model IDs only',async()=>{
  const {EventEmitter}=await import('node:events');
  const {PassThrough}=await import('node:stream');
  const requested=[];
  const fakeSpawn=(cmd,args)=>{
    assert.equal(cmd,'codex');assert.deepEqual(args,['app-server']);
    const child=new EventEmitter();child.stdout=new PassThrough();child.kill=()=>{};
    child.stdin={write(data){
      const message=JSON.parse(data.toString().trim());requested.push(message.method);
      if(message.method==='initialize')queueMicrotask(()=>child.stdout.write(JSON.stringify({id:1,result:{userAgent:'Codex'}})+'\n'));
      if(message.method==='account/rateLimits/read')queueMicrotask(()=>child.stdout.write(JSON.stringify({id:999,result:{
        rateLimits:{limitId:'codex',primary:{usedPercent:20,windowDurationMins:300,resetsAt:1891234567},secondary:null,rateLimitReachedType:null}
      }})+'\n'));
      if(message.method==='model/list')queueMicrotask(()=>child.stdout.write(JSON.stringify({id:2,result:{
        data:[
          {id:'visible-sol',model:'gpt-6.2-sol',hidden:false,supportedReasoningEfforts:[{reasoningEffort:'high'},{reasoningEffort:'medium'},{reasoningEffort:'low'}]},
          {id:'hidden-astra',model:'gpt-6.2-astra',hidden:true,supportedReasoningEfforts:[{reasoningEffort:'high'}]},
          {id:'unapproved',model:'some-other-model',hidden:false,supportedReasoningEfforts:[{reasoningEffort:'high'}]}
        ],nextCursor:null}})+'\n'));
    }};
    return child;
  };
  const evidence=await discoverCodexModels({spawnFn:fakeSpawn,platform:'linux',now:new Date('2026-11-18T15:30:00Z'),timeoutMs:1000});
  assert.equal(evidence.models.length,1);
  assert.equal(evidence.models[0].id,'gpt-6.2-sol');
  assert.deepEqual(evidence.models[0].supportedEfforts,['high','medium','low']);
  assert.deepEqual(requested,['initialize','initialized','model/list','account/rateLimits/read']);
  assert.equal(selectVerifiedModel('standard',evidence,new Date('2026-11-18T15:30:00Z')).model,'gpt-6.2-sol');
});
test('live account discovery verifies model selection without launching Codex',async()=>{
  let launches=0;
  const selected=await runRouter(['--verify-only','--live-models','--task','Implement worker'],{
    spawnSyncFn:(cmd)=>cmd==='codex'?{status:0,stdout:'Logged in using ChatGPT'}:{status:0,stdout:'/repo\n'},
    now:new Date('2026-11-18T15:30:00Z'),
    discoverModelsFn:async()=>validEvidence,invokeFn:()=>{launches++;throw Error('unexpected');}
  });
  assert.equal(selected.model,'gpt-6.2-sol');assert.equal(launches,0);
  assert.equal(selected.verified,true);
});
test('live discovery does not accept unsupported reasoning effort',()=>{
 const evidence={...validEvidence,models:[{id:'gpt-6.2-sol',allowed:true,available:true,supportedEfforts:['low']}]};
 assert.throws(()=>selectVerifiedModel('complex',evidence,new Date('2026-11-18T15:30:00Z')),/NO_VERIFIED_MODEL/);
});

test('Windows account checks use the existing Codex cmd shim safely',()=>{
 const win=codexAuthCommand('win32');
 assert.equal(win.command,'cmd.exe');
 assert.deepEqual(win.args,['/d','/s','/c','codex login status']);
 const linux=codexAuthCommand('linux');
 assert.equal(linux.command,'codex');
 assert.deepEqual(linux.args,['login','status']);
});
test('PowerShell launcher supports live model discovery and reviewer preflight',async()=>{
 const {readFileSync}=await import('node:fs');
 const {fileURLToPath}=await import('node:url');
 const {join,dirname}=await import('node:path');
 const script=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'Start-WINAutoModels.ps1'),'utf8');
 assert.match(script,/\[switch\]\$UseLiveModels/);
 assert.match(script,/\$verifiedArgs \+= '--live-models'/);
 assert.match(script,/\$reviewArgs \+= '--live-models'/);
 assert.match(script,/if \(\$ReviewAfter\) \{ \$verifiedArgs \+= '--review-after' \}/);
 assert.match(script,/\(\?i\)\^Logged in/);
});

test('standard and complex tasks switch only to eligible model before task begins',()=>{
 const now=new Date('2026-11-18T15:30:00Z');
 const evidence={...validEvidence,models:[
   {id:'gpt-6.1-terra',available:true,allowed:true,supportedEfforts:['medium']},
   {id:'gpt-6.2-astra',available:true,allowed:true,supportedEfforts:['high']}
 ]};
 const standard=selectVerifiedModel('standard',evidence,now);
 assert.deepEqual(standard,{model:'gpt-6.1-terra',effort:'medium'});
 const complex=selectVerifiedModel('complex',evidence,now);
 assert.deepEqual(complex,{model:'gpt-6.2-astra',effort:'high'});
 assert.throws(()=>selectVerifiedModel('review',{...evidence,models:[]},now),/NO_VERIFIED_MODEL/);
});

test('direct Node dispatch on Windows requires PowerShell rather than unsafe cmd spawning',async()=>{
 const evidence=JSON.stringify(validEvidence);
 await assert.rejects(runRouter(['--run','--verified-models','/catalog.json','--task','Implement worker','--cwd','/repo'],{
   platform:'win32',readFileSyncFn:()=>evidence,now:new Date('2026-11-18T15:30:00Z'),
   spawnSyncFn:(cmd)=>cmd==='cmd.exe'?{status:0,stdout:'Logged in using ChatGPT'}:{status:0,stdout:'/repo\n'},
   realpathSyncFn:x=>x
 }),/USE_WINDOWS_POWERSHELL_LAUNCHER/);
});

test('Codex model discovery fails closed on auth errors and timeouts',async()=>{
 const {EventEmitter}=await import('node:events');
 const {PassThrough}=await import('node:stream');
 const createChild=mode=>{
   const child=new EventEmitter();child.stdout=new PassThrough();child.kill=()=>{};
   child.stdin={write(data){
     const req=JSON.parse(data.toString().trim());
     if(req.method==='initialize'&&mode==='auth-error')queueMicrotask(()=>
       child.stdout.write(JSON.stringify({id:1,error:{code:-32001,message:'untrusted details'}})+'\n'));
   }};
   return child;
 };
 await assert.rejects(discoverCodexModels({spawnFn:()=>createChild('auth-error'),platform:'linux',timeoutMs:80}),/CODEX_MODEL_DISCOVERY_AUTH/);
 await assert.rejects(discoverCodexModels({spawnFn:()=>createChild('timeout'),platform:'linux',timeoutMs:20}),/CODEX_MODEL_DISCOVERY_TIMEOUT/);
});

test('model family switching resolves version changes only from approved visible catalog',()=>{
  const now=new Date('2026-11-18T15:30:00Z');
  const evidence={...validEvidence,models:[
    {id:'gpt-6.1-sol',available:true,allowed:true,supportedEfforts:['low','medium','high']},
    {id:'gpt-6.1-terra',available:true,allowed:true,supportedEfforts:['low','medium']},
    {id:'gpt-6.1-astra',available:true,allowed:true,supportedEfforts:['high']}
  ]};
  assert.equal(selectVerifiedModel('standard',evidence,now).model,'gpt-6.1-sol');
  assert.equal(selectVerifiedModel('complex',evidence,now).model,'gpt-6.1-sol');
  assert.equal(selectVerifiedModel('review',evidence,now).model,'gpt-6.1-astra');
  assert.equal(selectVerifiedModel('simple',evidence,now).model,'gpt-6.1-terra');
  const upgrades={...evidence,models:[...evidence.models,{id:'gpt-6.3-sol',available:true,allowed:true,supportedEfforts:['low','medium','high']}]};
  assert.equal(selectVerifiedModel('standard',upgrades,now).model,'gpt-6.3-sol');
  const notAllowed={...evidence,models:[{id:'gpt-6.3-sol',available:true,allowed:false,supportedEfforts:['medium']}]};
  assert.throws(()=>selectVerifiedModel('standard',notAllowed,now),/NO_VERIFIED_MODEL/);
  const badFamily={...evidence,models:[{id:'gpt-6.3-unknown',available:true,allowed:true,supportedEfforts:['medium']}]};
  assert.throws(()=>selectVerifiedModel('standard',badFamily,now),/NO_VERIFIED_MODEL/);
});

test('account quota check blocks exhausted or unknown windows without dispatch',()=>{
 const ok={rateLimits:{limitId:'codex',primary:{usedPercent:75,windowDurationMins:300,resetsAt:1891234567},secondary:null,rateLimitReachedType:null}};
 assert.equal(validateCodexRateLimits(ok),true);
 assert.throws(()=>validateCodexRateLimits({rateLimits:{...ok.rateLimits,primary:{...ok.rateLimits.primary,usedPercent:100}}}),/CODEX_LIMIT_REACHED/);
 assert.throws(()=>validateCodexRateLimits({rateLimits:{...ok.rateLimits,rateLimitReachedType:'primary'}}),/CODEX_LIMIT_REACHED/);
 assert.throws(()=>validateCodexRateLimits({rateLimits:{...ok.rateLimits,primary:{usedPercent:'unknown'}}}),/CODEX_RATE_LIMIT_UNKNOWN/);
 assert.throws(()=>validateCodexRateLimits({}),/CODEX_RATE_LIMIT_UNKNOWN/);
 assert.throws(()=>validateCodexRateLimits({rateLimitsByLimitId:{codex:ok.rateLimits,other:{primary:{usedPercent:100}}}}),/CODEX_LIMIT_REACHED/);
});

test('review preflight remembers both approved model and effort',async()=>{
  const p=await runRouter(['--verify-only','--verified-models','/catalog.json','--review-after','--task','Implement worker','--cwd','/repo'],{
    readFileSyncFn:()=>JSON.stringify(validEvidence),
    now:new Date('2026-11-18T15:30:00Z')
  });
  assert.equal(p.reviewModel,'gpt-6.2-astra');
  assert.equal(p.reviewEffort,'high');
  const {readFileSync}=await import('node:fs');
  const {fileURLToPath}=await import('node:url');
  const {join,dirname}=await import('node:path');
  const launcher=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'Start-WINAutoModels.ps1'),'utf8');
  assert.match(launcher,/\$reviewPlan\.model -ne \$plan\.reviewModel/);
  assert.match(launcher,/\$reviewPlan\.effort -ne \$plan\.reviewEffort/);
  assert.match(launcher,/--model \$plan\.reviewModel/);
});

test('PowerShell read-only account smoke check exits before actual Codex dispatch',async()=>{
  const {readFileSync}=await import('node:fs');
  const {fileURLToPath}=await import('node:url');
  const {join,dirname}=await import('node:path');
  const script=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'Start-WINAutoModels.ps1'),'utf8');
  assert.match(script,/\[switch\]\$VerifyModelsOnly/);
  assert.match(script,/\$Run -and \$VerifyModelsOnly/);
  assert.match(script,/\$VerifyModelsOnly\) \{[\s\S]*?return/);
  const preflight=script.indexOf('if ($VerifyModelsOnly) {',script.indexOf('Verified selection:'));
  const invoke=script.indexOf('& codex exec');
  assert.ok(preflight>0 && invoke>preflight);
});

test('Windows model-only validation does not mislabel offline evidence as live quota check',async()=>{
  const {readFileSync}=await import('node:fs');
  const {fileURLToPath}=await import('node:url');
  const {join,dirname}=await import('node:path');
  const launcher=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'Start-WINAutoModels.ps1'),'utf8');
  assert.match(launcher,/if \(\$UseLiveModels\) \{/);
  assert.match(launcher,/Live Codex account model and quota preflight passed/);
  assert.match(launcher,/Account quota was NOT queried/);
  assert.match(launcher,/if \(\$VerifyModelsOnly\) \{/);
});

test('Codex Windows login status may be emitted on stderr on successful exit',async()=>{
  assert.equal(hasChatGPTCliAuth({status:0,stdout:'',stderr:'Logged in using ChatGPT\n'}),true);
  assert.equal(hasChatGPTCliAuth({status:0,stdout:'Logged in using ChatGPT\n',stderr:''}),true);
  assert.equal(hasChatGPTCliAuth({status:1,stdout:'Logged in using ChatGPT',stderr:''}),false);
  assert.equal(hasChatGPTCliAuth({status:0,stdout:'',stderr:'Logged in using an API key'}),false);
  assert.equal(hasChatGPTCliAuth({status:0,stdout:'',stderr:'Not logged in using ChatGPT'}),false);
  let invocations=0;
  const result=await runRouter(['--run','--verified-models','/catalog.json','--task','Implement worker','--cwd','/repo'],{
    readFileSyncFn:()=>JSON.stringify(validEvidence),
    now:new Date('2026-11-18T15:30:00Z'),realpathSyncFn:x=>x,
    spawnSyncFn:cmd=>cmd==='codex'
      ?{status:0,stdout:'',stderr:'Logged in using ChatGPT\n'}
      :{status:0,stdout:'/repo\n'},
    invokeFn:async()=>{invocations++;return {success:true,code:0};}
  });
  assert.equal(invocations,1);
  assert.equal(result.success,true);
});

test('Windows read-only smoke requires verified live account and never permits optional write review',async()=>{
  const {readFileSync}=await import('node:fs');
  const {fileURLToPath}=await import('node:url');
  const {join,dirname}=await import('node:path');
  const launcher=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'Start-WINAutoModels.ps1'),'utf8');
  assert.match(launcher,/\[switch\]\$ReadOnlySmoke/);
  assert.match(launcher,/\$ReadOnlySmoke -and \(-not \$Run -or \$VerifyModelsOnly -or \$ReviewAfter -or -not \$UseLiveModels\)/);
  assert.match(launcher,/if \(\$ReadOnlySmoke -or \$plan\.category -eq 'review'\) \{ 'read-only' \}/);
  assert.match(launcher,/Safe execution smoke: forcing read-only sandbox/);
  const readOnlyIndex=launcher.indexOf('$mode = if ($ReadOnlySmoke');
  const dispatchIndex=launcher.indexOf('& codex exec');
  assert.ok(readOnlyIndex>0 && dispatchIndex>readOnlyIndex);
});
