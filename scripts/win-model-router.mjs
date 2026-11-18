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
  const out={run:false,verifyOnly:false,reviewAfter:false,help:false,task:'',category:null,cwd:process.cwd(),verifiedModels:null,liveModels:false};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--run')out.run=true;
    else if(a==='--verify-only')out.verifyOnly=true;
    else if(a==='--live-models')out.liveModels=true;
    else if(a==='--review-after')out.reviewAfter=true;
    else if(a==='--help')out.help=true;
    else if(['--task','--category','--cwd','--verified-models'].includes(a)){
      if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('MISSING_ARGUMENT');
      out[a==='--verified-models'?'verifiedModels':a.slice(2)]=argv[++i];
    }else throw Error('UNKNOWN_ARGUMENT');
  }
  if(out.run&&out.verifyOnly)throw Error('VERIFY_ONLY_CONFLICT');
  if(out.liveModels&&out.verifiedModels)throw Error('MODEL_SOURCE_CONFLICT');
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
export function codexAuthCommand(platform=process.platform){
  return platform==='win32'?{command:'cmd.exe',args:['/d','/s','/c','codex login status']}
    :{command:'codex',args:['login','status']};
}
export function isChatGPTLogin(status){
  return typeof status==='string'&&/^\s*Logged in (?:using|via) ChatGPT(?:\b|[.!])/i.test(status.trim());
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
  // Version numbers change; only signed-in catalog-listed Terra/Sol/Astra
  // families may substitute. Preserve the original departmental model preferences.
  const catalogFamily=model=>{
    const match=/^gpt-\d+(?:\.\d+)?-(terra|sol|astra)$/.exec(model);
    return match?.[1]||null;
  };
  const ranked=(family,effort)=>allowed
    .filter(m=>catalogFamily(m.id)===family
      &&(!Array.isArray(m.supportedEfforts)||m.supportedEfforts.includes(effort)))
    .sort((a,b)=>b.id.localeCompare(a.id,undefined,{numeric:true}))[0]?.id||null;
  const candidates=category==='simple'
    ?[{...MODEL_PLAN.simple},{model:MODEL_PLAN.standard.model,effort:'low'}]
    :category==='standard'
      ?[{...MODEL_PLAN.standard},{model:MODEL_PLAN.simple.model,effort:'medium'}]
      :category==='complex'
        ?[{...MODEL_PLAN.complex},{model:MODEL_PLAN.review.model,effort:'high'}]
        :[{...MODEL_PLAN.review},{model:MODEL_PLAN.standard.model,effort:'high'}];
  for(const candidate of candidates){
    if(allowed.some(m=>m.id===candidate.model
      &&(!Array.isArray(m.supportedEfforts)||m.supportedEfforts.includes(candidate.effort))))return candidate;
    const family=catalogFamily(candidate.model);
    const resolved=family&&ranked(family,candidate.effort);
    if(resolved)return {model:resolved,effort:candidate.effort};
  }
  throw Error('NO_VERIFIED_MODEL_FOR_TASK');
}


/** Query the current ChatGPT-authenticated Codex app-server, without starting a model turn. */
export function discoverCodexModels({spawnFn=spawn,timeoutMs=12000,now=new Date(),platform=process.platform}={}){
  return new Promise((resolveResult,rejectResult)=>{
    const windows=platform==='win32';
    const command=windows?'cmd.exe':'codex';
    const args=windows?['/d','/s','/c','codex app-server']:['app-server'];
    let child;
    try{child=spawnFn(command,args,{shell:false,windowsHide:true,stdio:['pipe','pipe','ignore']});}
    catch{rejectResult(Error('CODEX_MODEL_DISCOVERY_UNAVAILABLE'));return;}
    let closed=false,buffer='',models=[],cursor=null,pages=0;
    const finish=(err,value)=>{
      if(closed)return;closed=true;clearTimeout(timeout);
      try{child.kill();}catch{}
      if(err)rejectResult(Error(err));else resolveResult(value);
    };
    const timeout=setTimeout(()=>finish('CODEX_MODEL_DISCOVERY_TIMEOUT'),timeoutMs);
    const send=obj=>{
      try{child.stdin.write(JSON.stringify(obj)+'\n');}
      catch{finish('CODEX_MODEL_DISCOVERY_PROTOCOL');}
    };
    const ask=()=>{
      const params={limit:100,includeHidden:false};
      if(cursor)params.cursor=cursor;
      send({method:'model/list',id:2+pages,params});
    };
    child.once('error',()=>finish('CODEX_MODEL_DISCOVERY_UNAVAILABLE'));
    child.stdin?.on?.('error',()=>finish('CODEX_MODEL_DISCOVERY_PROTOCOL'));
    child.stdout?.on?.('error',()=>finish('CODEX_MODEL_DISCOVERY_PROTOCOL'));
    child.once('exit',()=>finish('CODEX_MODEL_DISCOVERY_INTERRUPTED'));
    child.stdout.on('data',data=>{
      if(closed)return;
      buffer+=data.toString('utf8');
      if(buffer.length>1048576)return finish('CODEX_MODEL_DISCOVERY_OVERSIZE');
      while(buffer.includes('\n')&&!closed){
        const at=buffer.indexOf('\n');const line=buffer.slice(0,at).trim();buffer=buffer.slice(at+1);
        if(!line)continue;
        let msg;try{msg=JSON.parse(line);}catch{return finish('CODEX_MODEL_DISCOVERY_PROTOCOL');}
        if(msg.id===1){
          if(msg.error||!msg.result)return finish('CODEX_MODEL_DISCOVERY_AUTH');
          send({method:'initialized',params:{}});ask();
        }else if(msg.id===2+pages){
          if(msg.error||!Array.isArray(msg.result?.data))return finish('CODEX_MODEL_DISCOVERY_FAILED');
          models.push(...msg.result.data);
          if(models.length>500)return finish('CODEX_MODEL_DISCOVERY_OVERSIZE');
          cursor=msg.result.nextCursor;
          if(cursor){if(++pages>=8)return finish('CODEX_MODEL_DISCOVERY_PAGINATION');ask();}
          else{
            const approved=models.filter(v=>v&&v.hidden!==true&&typeof (v.model||v.id)==='string'
             &&/^gpt-\d+(?:\.\d+)?-(terra|sol|astra)$/.test(v.model||v.id)).map(v=>({
              id:v.model||v.id,available:true,allowed:true,
              supportedEfforts:Array.isArray(v.supportedReasoningEfforts)
                ?v.supportedReasoningEfforts.map(x=>x.reasoningEffort).filter(x=>typeof x==='string'):[]
            }));
            const start=now.toISOString();
            finish(null,{source:'codex-app-server:model/list',verifiedAt:start,
              expiresAt:new Date(now.getTime()+3600000).toISOString(),models:approved});
          }
        }
      }
    });
    send({method:'initialize',id:1,params:{clientInfo:{name:'win_codex_router',title:'WIN Codex Router',version:'1.0.0'}}});
  });
}

export async function runRouter(argv,deps={}){
  const opts=optionsFromArgs(argv);
  if(opts.help)return {help:true};
  const category=opts.category||categorize(opts.task);
  const cwd=resolve(opts.cwd);
  const requested=MODEL_PLAN[category];
  if(!opts.run&&!opts.verifyOnly)return {dryRun:true,category,model:requested.model,effort:requested.effort,cwd,reviewAfter:opts.reviewAfter,modelAvailability:'unverified'};
  if(!opts.verifiedModels&&!opts.liveModels)throw Error('VERIFIED_MODELS_REQUIRED');
  let evidence;
  if(opts.liveModels){
    const {command, args}=codexAuthCommand(deps.platform||process.platform);
    const auth=(deps.spawnSyncFn||spawnSync)(command,args,{encoding:'utf8',timeout:8000,windowsHide:true});
    if(auth.status!==0||!isChatGPTLogin(auth.stdout))throw Error('CODEX_CHATGPT_AUTH_REQUIRED');
    evidence=await (deps.discoverModelsFn||discoverCodexModels)({now:deps.now||new Date()});
  }else{
    const read=deps.readFileSyncFn||readFileSync;
    try{evidence=JSON.parse(read(resolve(opts.verifiedModels),'utf8'));}
    catch{throw Error('MODEL_EVIDENCE_UNREADABLE');}
  }
  const selected=selectVerifiedModel(category,evidence,deps.now||new Date());
  // Prevalidate optional reviewer BEFORE a writable implementation starts.
  const reviewModel=opts.reviewAfter&&category!=='review'
    ?selectVerifiedModel('review',evidence,deps.now||new Date()):null;
  const plan={category,model:selected.model,effort:selected.effort,cwd,reviewAfter:opts.reviewAfter,reviewModel:reviewModel?.model||null,modelAvailability:'owner-verified',fallbackBeforeDispatch:selected.model!==requested.model};
  if(opts.verifyOnly)return {verified:true,...plan};
  // ChatGPT subscription authentication only: API-key sessions may incur usage-based charges.
  const {command, args}=codexAuthCommand(deps.platform||process.platform);
    const auth=(deps.spawnSyncFn||spawnSync)(command,args,{encoding:'utf8',timeout:8000,windowsHide:true});
  if(auth.status!==0||!isChatGPTLogin(auth.stdout))throw Error('CODEX_CHATGPT_AUTH_REQUIRED');
  const git=(deps.spawnSyncFn||spawnSync)('git',['-C',cwd,'rev-parse','--show-toplevel'],{encoding:'utf8',timeout:5000,windowsHide:true});
  if(git.status!==0||!git.stdout?.trim())throw Error('NOT_A_GIT_WORKTREE');
  const real=deps.realpathSyncFn||realpathSync;
  const dir=workspaceCheck(real(cwd),real(git.stdout.trim()));
  // Direct Node spawn of npm's Windows .cmd shim is unreliable; use the reviewed PowerShell launcher.
  if((deps.platform||process.platform)==='win32'&&!deps.invokeFn)throw Error('USE_WINDOWS_POWERSHELL_LAUNCHER');
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
