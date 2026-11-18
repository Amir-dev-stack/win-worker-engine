/** WIN Codex model router: dry-run by default, no API keys or billing.
 * node scripts/win-model-router.mjs --task "Implement worker" [--run] [--review-after]
 */
import { spawn, spawnSync } from 'node:child_process';
import { realpathSync, readFileSync } from 'node:fs';
import { resolve, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MODEL_PLAN=Object.freeze({
  simple:{model:'gpt-6.1-terra',effort:'low'},
  standard:{model:'gpt-6.2-sol',effort:'medium'},
  complex:{model:'gpt-6.2-sol',effort:'high'},
  review:{model:'gpt-6.2-astra',effort:'high'}
});
const CATEGORIES=new Set(Object.keys(MODEL_PLAN));
export function categorize(task){
  if (/\b(security audit|architecture review|final review|milestone review)\b/i.test(task)) return 'review';
  if (/\b(race condition|deadlock|concurrency|data corruption|critical bug|deep debug|hard to reproduce)\b/i.test(task)) return 'complex';
  if (/\b(readme|documentation|typo|format|rename|comment only|small text)\b/i.test(task)) return 'simple';
  return 'standard';
}
export function optionsFromArgs(argv){
  const out={run:false,verifyOnly:false,reviewAfter:false,help:false,task:'',category:null,cwd:process.cwd(),verifiedModels:null};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--run')out.run=true;
    else if(a==='--verify-only')out.verifyOnly=true;
    else if(a==='--review-after')out.reviewAfter=true;
    else if(a==='--help')out.help=true;
    else if(['--task','--category','--cwd','--verified-models'].includes(a)){
      if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('MISSING_ARGUMENT');
      out[a==='--verified-models'?'verifiedModels':a.slice(2)]=argv[++i];
    }else throw Error('UNKNOWN_ARGUMENT');
  }
  if(out.run&&out.verifyOnly)throw Error('VERIFY_ONLY_CONFLICT');
  if(!out.help && (!out.task.trim()||out.task.length>12000))throw Error('INVALID_TASK');
  if(out.category&&!CATEGORIES.has(out.category))throw Error('UNSUPPORTED_CATEGORY');
  return out;
}
export function buildCodexArgs({category,task,cwd,selection=null}){
  if(!CATEGORIES.has(category))throw Error('UNSUPPORTED_CATEGORY');
  if(typeof task!=='string'||!task.trim()||task.length>12000)throw Error('INVALID_TASK');
  const {model,effort}=selection||MODEL_PLAN[category];
  if(!/^[a-z0-9][a-z0-9.\\-]{2,79}$/.test(model)||!['low','medium','high'].includes(effort))throw Error('INVALID_MODEL_SELECTION');
  return ['exec','-C',cwd,'--model',model,'--config',`model_reasoning_effort="${effort}"`,
    '--sandbox',category==='review'?'read-only':'workspace-write',task];
}
export function workspaceCheck(root,gitRoot){
  if(normalize(root).toLowerCase()!==normalize(gitRoot).toLowerCase())throw Error('WORKSPACE_MUST_BE_GIT_ROOT');
  if(/([\\/])pr36([\\/]|$)|pr36-review|pr36-safety/i.test(root))throw Error('FROZEN_PR36_WORKSPACE');
  return root;
}
export async function invokeCodex(args,{command='codex',timeoutMs=1200000,spawnFn=spawn}={}){
  return new Promise((done,fail)=>{
    let settled=false;
    const child=spawnFn(command,args,{shell:false,windowsHide:true,stdio:['ignore','inherit','inherit']});
    const timeout=setTimeout(()=>{if(!settled){settled=true;child.kill();fail(Error('CODEX_TASK_TIMEOUT'));}},timeoutMs);
    child.once('error',e=>{if(!settled){settled=true;clearTimeout(timeout);fail(Error(e.code==='ENOENT'?'CODEX_CLI_NOT_INSTALLED':'CODEX_PROCESS_ERROR'));}});
    child.once('exit',(code)=>{if(!settled){settled=true;clearTimeout(timeout);done({success:code===0,code});}});
  });
}

/**
 * Evidence for a model's availability is local, expiring and owner-supplied.
 * CLI cannot safely infer entitlement from a model name or a successful unrelated session.
 * This only selects the model BEFORE dispatch; never replays a potentially-mutating task.
 */
export function selectVerifiedModel(category, evidence, now=new Date()){
  if(!CATEGORIES.has(category))throw Error('UNSUPPORTED_CATEGORY');
  if(!evidence||evidence.source!=='codex-app-server:model/list'||!Array.isArray(evidence.models)
      ||typeof evidence.verifiedAt!=='string'||typeof evidence.expiresAt!=='string')throw Error('MODEL_EVIDENCE_INVALID');
  const start=Date.parse(evidence.verifiedAt),expiry=Date.parse(evidence.expiresAt),current=now.getTime();
  if(!Number.isFinite(start)||!Number.isFinite(expiry)||start>current||expiry<=current
     ||expiry-start>86400000)throw Error('MODEL_EVIDENCE_STALE');
  const allowed=(evidence.models||[]).filter(m=>m&&typeof m.id==='string'&&m.available===true
     &&m.allowed===true&&(!m.cooldownUntil||(Number.isFinite(Date.parse(m.cooldownUntil))&&Date.parse(m.cooldownUntil)<=current)));
  const candidates=category==='simple'
    ?[{model:MODEL_PLAN.simple.model,effort:'low'},{model:MODEL_PLAN.standard.model,effort:'low'}]
    :category==='review'
      ?[{...MODEL_PLAN.review},{model:MODEL_PLAN.standard.model,effort:'high'}]
      :[{...MODEL_PLAN[category]}];
  for(const candidate of candidates)if(allowed.some(m=>m.id===candidate.model))return candidate;
  throw Error('NO_VERIFIED_MODEL_FOR_TASK');
}

export async function runRouter(argv,deps={}){
  const opts=optionsFromArgs(argv);
  if(opts.help)return {help:true};
  const category=opts.category||categorize(opts.task);
  const cwd=resolve(opts.cwd);
  const requested=MODEL_PLAN[category];
  if(!opts.run&&!opts.verifyOnly)return {dryRun:true,category,model:requested.model,effort:requested.effort,cwd,reviewAfter:opts.reviewAfter,modelAvailability:'unverified'};
  if(!opts.verifiedModels)throw Error('VERIFIED_MODELS_REQUIRED');
  const read=deps.readFileSyncFn||readFileSync;
  let evidence;
  try{evidence=JSON.parse(read(resolve(opts.verifiedModels),'utf8'));}
  catch{throw Error('MODEL_EVIDENCE_UNREADABLE');}
  const selected=selectVerifiedModel(category,evidence,deps.now||new Date());
  // Prevalidate optional reviewer BEFORE a writable implementation starts.
  const reviewModel=opts.reviewAfter&&category!=='review'
    ?selectVerifiedModel('review',evidence,deps.now||new Date()):null;
  const plan={category,model:selected.model,effort:selected.effort,cwd,reviewAfter:opts.reviewAfter,reviewModel:reviewModel?.model||null,modelAvailability:'owner-verified',fallbackBeforeDispatch:selected.model!==requested.model};
  if(opts.verifyOnly)return {verified:true,...plan};
  const git=(deps.spawnSyncFn||spawnSync)('git',['-C',cwd,'rev-parse','--show-toplevel'],{encoding:'utf8',timeout:5000,windowsHide:true});
  if(git.status!==0||!git.stdout?.trim())throw Error('NOT_A_GIT_WORKTREE');
  const real=deps.realpathSyncFn||realpathSync;
  const dir=workspaceCheck(real(cwd),real(git.stdout.trim()));
  const invoke=deps.invokeFn||invokeCodex;
  const result=await invoke(buildCodexArgs({category,task:opts.task,cwd:dir,selection:selected}));
  if(!result.success)return {success:false,stage:'implementation',exitCode:result.code,...plan};
  if(!opts.reviewAfter||category==='review')return {success:true,stage:'implementation',...plan};
  const prompt=`Review ONLY current uncommitted changes in this worktree for correctness, security and regressions. Do not modify files, deploy, or access secrets. Provide severity-ranked findings. Goal: ${opts.task}`;
  const review=await invoke(buildCodexArgs({category:'review',task:prompt,cwd:dir,selection:reviewModel}));
  return {success:review.success,stage:'review',reviewExitCode:review.code,...plan};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runRouter(process.argv.slice(2)).then(r=>{
    console.log(r.help?'Usage: --task "..." [--category simple|standard|complex|review] [--cwd PATH] [--run] [--review-after]':JSON.stringify(r,null,2));
    if(r.success===false)process.exitCode=1;
  }).catch(e=>{console.error('WIN_ROUTER_ERROR:',e.message);process.exitCode=1;});
}
