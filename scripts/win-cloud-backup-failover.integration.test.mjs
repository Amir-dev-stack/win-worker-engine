import test from "node:test";
import assert from "node:assert/strict";
import { proposeDevelopmentFailover } from "./win-development-failover-policy.mjs";
import { prepareCloudBackupReview, requestCloudBackupReview } from "./win-cloud-backup-review-worker.mjs";
import { createWorkersAiFreeAdapter } from "./win-cloudflare-free-adapter.mjs";

// End-to-end OFFLINE contract test across the EXISTING PR #35/#36 modules.
// This is a deterministic scenario, NOT a trusted clock, real atomic lease,
// Cloudflare entitlement, model inference, scheduler, GitHub writer or PC-off proof.
const NOW=Date.parse("2026-11-19T08:00:00Z");
const utc=ms=>new Date(ms).toISOString();
const accountId="a".repeat(32);
const dummyToken="synthetic-test-token-only";
function handoff(){
  return {
    task:{id:"win-integration-1",repository:"Amir-dev-stack/win-worker-engine",
      approved:true,productionWriteAllowed:false,paidSpendAllowed:false,
      scope:"draft_only",allowedPaths:["scripts/safe-source.mjs"]},
    primary:{workerId:"codex-primary",leaseId:"trusted-synthetic-lease",status:"failed",
      lastHeartbeatAt:utc(NOW-3600000),leaseExpiresAt:utc(NOW-60000)},
    backup:{kind:"cloud-independent-reviewer",workerId:"cloud-review-1",
      ready:true,isolatedWorkspace:true,permissions:"read_only",capability:"review_and_propose"},
    approval:{authorized:true,taskId:"win-integration-1",
      backupWorkerId:"cloud-review-1",primaryLeaseId:"trusted-synthetic-lease",
      expiresAt:utc(NOW+600000)}
  };
}
function input(){
  return {handoff:handoff(),assignment:{type:"draft_patch_proposal",
    taskId:"win-integration-1",paidSpendAllowed:false},
    files:[{path:"scripts/safe-source.mjs",content:"export const value = 1;"}]};
}
function adapter(fetchImpl,{freePlanVerified=true,privateCodeTransferApproved=true}={}){
  return createWorkersAiFreeAdapter({
    accountId,token:dummyToken,paidUsageEnabled:false,freePlanVerified,
    privateCodeTransferApproved,fetchImpl
  });
}
function successResponse(message="Proposed test-only change; requires Codex review."){
  return new Response(JSON.stringify({success:true,result:{response:message}}),
    {status:200,headers:{"content-type":"application/json"}});
}

test("trusted-synthetic expiry allows exactly one bounded review proposal, never code writes",async()=>{
  const x=input();
  assert.equal(proposeDevelopmentFailover(x.handoff,NOW).action,"propose_read_only_handoff");
  const prepared=prepareCloudBackupReview(x,NOW);
  assert.equal(prepared.status,"prepared");
  assert.deepEqual(JSON.parse(prepared.prompt).files.map(f=>f.path),
    ["scripts/safe-source.mjs"]);
  let networkCalls=0;
  const provider=adapter(async (_url,options)=>{
    networkCalls++;
    const payload=JSON.parse(options.body);
    assert.equal(payload.stream,false);
    assert.equal(payload.max_tokens,512);
    assert.equal(payload.tools,undefined);
    assert.match(payload.messages[0].content,/No tools/);
    return successResponse();
  });
  const result=await requestCloudBackupReview(prepared,provider);
  assert.equal(networkCalls,1);
  assert.equal(result.status,"proposal_only");
  assert.equal(result.verified,false);
  assert.equal(result.requiresIndependentReview,true);
  assert.equal(result.writeOperations,0);
  assert.match(result.review,/Codex review/);
});

test("healthy Codex or unexpired primary lease blocks before Cloudflare is called",async()=>{
  for(const change of [
    x=>{x.handoff.primary.status="active";x.handoff.primary.lastHeartbeatAt=utc(NOW-1000);
      x.handoff.primary.leaseExpiresAt=utc(NOW+120000);},
    x=>{x.handoff.primary.leaseExpiresAt=utc(NOW+120000);},
    x=>{x.handoff.primary.status="completed";},
  ]){
    const x=input();change(x);
    const prepared=prepareCloudBackupReview(x,NOW);
    assert.equal(prepared.status,"hold");
    let calls=0;
    const result=await requestCloudBackupReview(prepared,adapter(async()=>{
      calls++;return successResponse();
    }));
    assert.equal(result.status,"hold");
    assert.equal(calls,0);
  }
});

test("expired lease alone cannot authorize takeover without matching handoff",()=>{
  for(const change of [
    x=>{x.handoff.approval.authorized=false;},
    x=>{x.handoff.approval.primaryLeaseId="wrong-lease";},
    x=>{x.handoff.approval.backupWorkerId="different-backup";},
    x=>{x.handoff.approval.expiresAt=utc(NOW-1000);},
    x=>{x.handoff.task.paidSpendAllowed=true;},
    x=>{x.handoff.backup.permissions="write_all";},
    x=>{x.handoff.backup.kind="local-opencode-ollama";x.handoff.backup.pcOnline=false;},
    x=>{x.files[0].path=".env";},
    x=>{x.files[0].path="scripts/../private.mjs";},
  ]){
    const x=input();change(x);
    assert.equal(prepareCloudBackupReview(x,NOW).status,"hold");
  }
});

test("Cloudflare fail-closed billing/consent checks reject before any network I/O",()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return successResponse();};
  for(const overrides of [
    {freePlanVerified:false},{privateCodeTransferApproved:false}
  ]){
    assert.throws(()=>adapter(fetchImpl,overrides),/verified externally/);
  }
  assert.equal(calls,0);
});

test("Cloudflare quota exhaustion remains a hold with exactly one request; never paid fallback",async()=>{
  let calls=0;
  const prepared=prepareCloudBackupReview(input(),NOW);
  const provider=adapter(async()=>{
    calls++;
    return new Response(JSON.stringify({success:false,errors:[{code:429,message:"test quota exhausted"}]}),
      {status:429});
  });
  const result=await requestCloudBackupReview(prepared,provider);
  assert.equal(calls,1);
  assert.equal(result.status,"hold");
  assert.equal(result.reason,"provider_failed");
  assert.equal(result.writeOperations,0);
  assert.ok(!("review" in result));
});

test("malformed Cloudflare success response never becomes an approved code change",async()=>{
  const prepared=prepareCloudBackupReview(input(),NOW);
  const provider=adapter(async()=>new Response(JSON.stringify({
    success:true,result:{response:null}
  }),{status:200}));
  const result=await requestCloudBackupReview(prepared,provider);
  assert.equal(result.status,"hold");
  assert.equal(result.writeOperations,0);
  assert.equal(result.reason,"provider_failed");
});
